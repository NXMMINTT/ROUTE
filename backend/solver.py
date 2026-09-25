"""
===================================================
  Generalized CVRP Solver v2 — OR-Tools Edition
  AI Hackathon Route Optimization 2026
  BU × SCG-CPAC
===================================================
  ใช้ Google OR-Tools เป็น Core Optimizer
  รับเนื้อหาไฟล์ .vrp → คืน Routes, Distance, Gap
  (สคริปต์รันจาก command line + วาดกราฟ อยู่ใน cli.py)
===================================================
"""

import math
import re
import time

from ortools.constraint_solver import pywrapcp, routing_enums_pb2

# กันไฟล์ใหญ่ผิดปกติ: distance matrix ใช้หน่วยความจำ O(n²)
MAX_NODES = 2000
# ระยะแบบ float ต้องคูณ SCALE ก่อนส่ง OR-Tools (รับเฉพาะ integer)
FLOAT_SCALE = 1000
# EUC_2D = ปัดระยะทีละเส้นแบบ TSPLIB (ค่า optimal ของ CVRPLIB ใช้เกณฑ์นี้), ไม่ระบุ/EXACT_2D = float
SUPPORTED_EDGE_TYPES = {"EUC_2D", "EXACT_2D", ""}


class VrpFormatError(ValueError):
    """ไฟล์ .vrp อ่านได้ แต่เนื้อหาใช้แก้โจทย์ไม่ได้ ข้อความแสดงให้ผู้ใช้เห็นได้เลย"""


# ════════════════════════════════════════════
# 1. PARSER
# ════════════════════════════════════════════
def parse_vrp(text: str) -> dict:
    """แปลงเนื้อหาไฟล์ .vrp (รูปแบบ CVRPLIB) เป็น dict
    ไฟล์ผิดรูปแบบ → ValueError (VrpFormatError เมื่อรู้สาเหตุชัดเจน)"""
    data = {
        'name': '', 'capacity': 0, 'coords': {}, 'demands': {}, 'depot': 1,
        'optimal': None, 'trucks': None, 'edge_type': '',
    }
    section = None
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        if ':' in line:
            key, val = (s.strip() for s in line.split(':', 1))
            if key == 'NAME':
                data['name'] = val
            elif key == 'COMMENT':
                if m := re.search(r'Optimal value:\s*(\d+)', val):
                    data['optimal'] = int(m.group(1))
                if m := re.search(r'No of trucks:\s*(\d+)', val):
                    data['trucks'] = int(m.group(1))
            elif key == 'CAPACITY':
                data['capacity'] = int(val)
            elif key == 'EDGE_WEIGHT_TYPE':
                data['edge_type'] = val
            continue

        if line in ('NODE_COORD_SECTION', 'DEMAND_SECTION', 'DEPOT_SECTION'):
            section = line
            continue
        if line == 'EOF':
            break

        parts = line.split()
        if section == 'NODE_COORD_SECTION' and len(parts) >= 3:
            x, y = float(parts[1]), float(parts[2])
            if not (math.isfinite(x) and math.isfinite(y)):
                raise VrpFormatError(f"พิกัดของโหนด {parts[0]} ไม่ใช่ตัวเลขที่ใช้ได้")
            data['coords'][int(parts[0])] = (x, y)
        elif section == 'DEMAND_SECTION' and len(parts) >= 2:
            data['demands'][int(parts[0])] = int(parts[1])
        elif section == 'DEPOT_SECTION' and (v := int(parts[0])) > 0:
            data['depot'] = v

    validate(data)
    return data


def validate(data: dict) -> None:
    if data['edge_type'] not in SUPPORTED_EDGE_TYPES:
        raise VrpFormatError(f"ยังไม่รองรับ EDGE_WEIGHT_TYPE = {data['edge_type']} (รองรับ EUC_2D)")
    if not data['coords'] or data['capacity'] <= 0 or data['depot'] not in data['coords']:
        raise VrpFormatError("ไฟล์ไม่มี NODE_COORD_SECTION / CAPACITY / DEPOT ที่ใช้ได้")
    if len(data['coords']) > MAX_NODES:
        raise VrpFormatError(f"จำนวนโหนดเกิน {MAX_NODES} จุด")
    over = [nid for nid, d in data['demands'].items() if d > data['capacity']]
    if over:
        raise VrpFormatError(f"demand ของจุด {over[0]} เกินความจุรถ ({data['capacity']}) ไม่มีทางส่งได้")


# ════════════════════════════════════════════
# 2. DISTANCE
# ════════════════════════════════════════════
def uses_rounded_distance(data: dict) -> bool:
    return data['edge_type'] == 'EUC_2D'


def edge_distance(p, q, rounded: bool) -> float:
    """ระยะระหว่างสองจุดตามเกณฑ์ของไฟล์ (EUC_2D ปัดเป็นจำนวนเต็มทีละเส้น)"""
    d = math.dist(p, q)
    return round(d) if rounded else d


def total_distance(routes, data: dict) -> float:
    coords, depot = data['coords'], data['depot']
    rounded = uses_rounded_distance(data)
    return sum(
        edge_distance(coords[a], coords[b], rounded)
        for route in routes
        for a, b in zip([depot, *route], [*route, depot])
    )


# ════════════════════════════════════════════
# 3. OR-TOOLS CVRP SOLVER (CORE)
# ════════════════════════════════════════════
# รถสำรอง: ใช้เฉพาะเมื่อจำนวนรถหลักหาคำตอบแรกไม่ได้เลย (ไฟล์ของผู้ใช้อาจระบุจำนวนรถน้อยเกินไป)
# ไม่ใส่ไว้ตลอดเพราะรถว่างในโมเดลทำให้ GLS หาคำตอบได้แย่ลง (วัดแล้ว: P-n40-k5 จาก 458 เป็น 459 ที่ 5 วินาที)
SPARE_VEHICLES = 3
FEASIBILITY_CHECK_SEC = 1


def stated_vehicles(data: dict) -> int | None:
    """จำนวนรถที่ไฟล์ระบุ: "No of trucks" ใน COMMENT → เลข k ในชื่อ (เช่น A-n32-k5) → ไม่ระบุ = None"""
    if data['trucks']:
        return data['trucks']
    if m := re.search(r'-k(\d+)', data['name']):
        return int(m.group(1))
    return None


def vehicle_count(data: dict) -> int:
    """
    จำนวนรถหลัก = จำนวนที่ไฟล์ระบุ (ไม่ระบุ = ขั้นต่ำ + เผื่อ 1 คัน)
    และไม่ต่ำกว่าขั้นต่ำที่ต้องใช้ขน demand รวม (ceil(demand รวม / capacity)) ไม่งั้นแก้ไม่ได้แน่นอน
    """
    lower = max(1, math.ceil(sum(data['demands'].values()) / data['capacity']))
    stated = stated_vehicles(data)
    return max(stated, lower) if stated else lower + 1


def _build_model(matrix, demand_vec, depot_idx, capacity, base_vehicles, spare):
    num_vehicles = base_vehicles + spare
    manager = pywrapcp.RoutingIndexManager(len(matrix), num_vehicles, depot_idx)
    routing = pywrapcp.RoutingModel(manager)
    # ส่ง matrix/vector ให้ OR-Tools เก็บไว้ฝั่ง C++ ไม่ต้องย้อนมาเรียก Python callback ทุกครั้งที่ค้นหา
    # (เร็วขึ้นมาก → ในเวลาเท่าเดิม GLS สำรวจได้มากขึ้น gap จึงต่ำลง)
    routing.SetArcCostEvaluatorOfAllVehicles(routing.RegisterTransitMatrix(matrix))
    demand_cb = routing.RegisterUnaryTransitVector(demand_vec)
    routing.AddDimensionWithVehicleCapacity(
        demand_cb,
        0,                           # no slack
        [capacity] * num_vehicles,
        True,                        # start cumul at zero
        'Capacity',
    )
    if spare:
        # ค่าปรับต่อคัน > ระยะทางรวมที่เป็นไปได้ทั้งหมด (n เส้น × เส้นที่ยาวที่สุด) จึงใช้รถสำรองให้น้อยคันที่สุด
        spare_cost = len(matrix) * max(map(max, matrix)) + 1
        for v in range(base_vehicles, num_vehicles):
            routing.SetFixedCostOfVehicle(spare_cost, v)
    return manager, routing


def _search_params(seconds: float, first_solution_only: bool = False):
    params = pywrapcp.DefaultRoutingSearchParameters()
    # Initial solution: PATH_CHEAPEST_ARC (greedy เร็ว) แล้วปรับต่อด้วย GLS
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    if first_solution_only:
        params.solution_limit = 1
    else:
        params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.FromMilliseconds(max(1000, int(seconds * 1000)))
    return params


def solve_ortools(data: dict, time_limit_sec: int = 30) -> dict:
    """
    แก้ CVRP ด้วย Google OR-Tools
    - GUIDED_LOCAL_SEARCH (GLS) เป็น metaheuristic หลัก
    - ปรับ time_limit_sec เพื่อเพิ่ม/ลดคุณภาพ
    - จำนวนรถหลักหาคำตอบแรกไม่ได้ → เพิ่มรถสำรอง (มีค่าปรับ) แล้วค้นหาต่อด้วยเวลาที่เหลือ
    """
    coords, demands, capacity = data['coords'], data['demands'], data['capacity']
    rounded = uses_rounded_distance(data)
    scale = 1 if rounded else FLOAT_SCALE

    # OR-Tools ใช้ index 0..n-1 จึงเรียง node ID แล้วแปลงกลับตอนอ่านผล
    nodes = sorted(coords)
    matrix = [
        [int(round(edge_distance(coords[a], coords[b], rounded) * scale)) for b in nodes]
        for a in nodes
    ]
    model_args = (matrix, [demands.get(n, 0) for n in nodes], nodes.index(data['depot']), capacity)
    base_vehicles = vehicle_count(data)

    t0 = time.perf_counter()
    spare = 0
    _, probe = _build_model(*model_args, base_vehicles, 0)
    if probe.SolveWithParameters(_search_params(FEASIBILITY_CHECK_SEC, first_solution_only=True)) is None:
        spare = SPARE_VEHICLES
    manager, routing = _build_model(*model_args, base_vehicles, spare)
    num_vehicles = base_vehicles + spare
    solution = routing.SolveWithParameters(_search_params(time_limit_sec - (time.perf_counter() - t0)))
    elapsed = time.perf_counter() - t0

    if not solution:
        return {'routes': [], 'distance': None, 'gap': None, 'feasible': False, 'elapsed': elapsed,
                'vehicle_limit': base_vehicles, 'vehicles_stated': stated_vehicles(data)}

    routes = []
    for v in range(num_vehicles):
        route = []
        idx = solution.Value(routing.NextVar(routing.Start(v)))  # ข้าม depot ต้นทาง
        while not routing.IsEnd(idx):
            route.append(nodes[manager.IndexToNode(idx)])
            idx = solution.Value(routing.NextVar(idx))
        if route:
            routes.append(route)

    distance = total_distance(routes, data)
    optimal = data['optimal']
    return {
        'routes': routes,
        'distance': distance,
        'gap': (distance - optimal) / optimal * 100 if optimal else None,
        'feasible': all(sum(demands.get(c, 0) for c in r) <= capacity for r in routes),
        'elapsed': elapsed,
        'vehicle_limit': base_vehicles,  # จำนวนรถหลัก ถ้า len(routes) มากกว่านี้ = ต้องใช้รถสำรอง
        'vehicles_stated': stated_vehicles(data),  # จำนวนที่ไฟล์ระบุ (None = ไม่ระบุ)
    }
