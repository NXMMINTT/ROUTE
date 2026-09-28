"""ตัวช่วยที่ router ทุกไฟล์ใช้ร่วมกัน: แปลงข้อผิดพลาดของ services เป็น HTTP error + จัดรูปผลลัพธ์"""

from fastapi import HTTPException

from app.services import instance_store
from app.services.solver import VrpFormatError, parse_vrp, solve_ortools


def load_vrp(text: str) -> dict:
    """parse_vrp + แปลงข้อผิดพลาดของไฟล์เป็น 400 พร้อมข้อความที่ผู้ใช้อ่านเข้าใจ"""
    try:
        return parse_vrp(text)
    except VrpFormatError as e:
        raise HTTPException(400, str(e))
    except ValueError:
        raise HTTPException(400, "อ่านไฟล์ .vrp ไม่ได้ ตรวจสอบรูปแบบไฟล์")


def store_call(fn, *args):
    """เรียกฟังก์ชันของ instance_store แล้วแปลง StoreError เป็น HTTP error ตาม status ที่แนบมา"""
    try:
        return fn(*args)
    except instance_store.StoreError as e:
        raise HTTPException(e.status, str(e))


def solve_and_format(data: dict, time_limit: int) -> dict:
    """แก้ CVRP แล้วจัดรูปผลเป็น JSON ที่หน้าเว็บใช้ (ใช้ร่วมกันระหว่าง /api/solve กับ /api/benchmark)"""
    result = solve_ortools(data, time_limit_sec=time_limit)
    if not result["routes"]:
        raise HTTPException(422, "OR-Tools หาคำตอบไม่ได้ภายในเวลาที่กำหนด ลองเพิ่มเวลาค้นหา")

    demands = data["demands"]
    return {
        "name": data["name"],
        "capacity": data["capacity"],
        "depot": data["depot"],
        "distance": result["distance"],
        "optimal": data["optimal"],
        "gap": result["gap"],
        "feasible": result["feasible"],
        "elapsed": result["elapsed"],
        "vehicles_stated": result["vehicles_stated"],
        "nodes": [
            {"id": nid, "x": x, "y": y, "demand": demands.get(nid, 0)}
            for nid, (x, y) in sorted(data["coords"].items())
        ],
        "routes": [
            {"stops": r, "load": sum(demands.get(c, 0) for c in r)}
            for r in result["routes"]
        ],
    }
