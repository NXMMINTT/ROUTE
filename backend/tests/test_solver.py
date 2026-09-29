"""รันด้วย: cd backend แล้ว python -m pytest"""
import os

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.solver import VrpFormatError, parse_vrp, solve_ortools

SAMPLES = os.path.join(os.path.dirname(__file__), "..", "samples")
client = TestClient(app)

SMALL = """NAME : tiny-k2
COMMENT : (test, Optimal value: 20)
EDGE_WEIGHT_TYPE : EUC_2D
CAPACITY : 10
NODE_COORD_SECTION
1 0 0
2 3 4
3 -3 -4
DEMAND_SECTION
1 0
2 6
3 6
DEPOT_SECTION
1
-1
EOF
"""


def read(name):
    with open(os.path.join(SAMPLES, f"{name}.vrp"), encoding="utf-8") as f:
        return f.read()


def test_parse_header_and_sections():
    data = parse_vrp(read("A-n32-k5"))
    assert data["name"] == "A-n32-k5"
    assert data["optimal"] == 784
    assert data["trucks"] == 5
    assert data["capacity"] == 100
    assert data["edge_type"] == "EUC_2D"
    assert len(data["coords"]) == 32
    assert data["depot"] == 1


@pytest.mark.parametrize("text", [
    SMALL.replace("EUC_2D", "GEO"),                    # edge type ที่ไม่รองรับ
    SMALL.replace("CAPACITY : 10", "CAPACITY : 0"),    # ไม่มีความจุ
    SMALL.replace("2 3 4", "2 inf 4"),                 # พิกัดไม่ใช่ตัวเลขจำกัด
    SMALL.replace("2 6", "2 60"),                      # demand เกินความจุ
    SMALL.replace("2 6", "2 -6"),                      # demand ติดลบ
    SMALL.replace("3 6", "3 6\n9 5"),                  # demand ของจุดที่ไม่มีพิกัด
])
def test_parse_rejects_bad_files(text):
    with pytest.raises(VrpFormatError):
        parse_vrp(text)


def test_small_instance_is_solved_exactly():
    # ระยะ depot→(3,4) = 5 ไปกลับ 10, สองคันรวม 20 (demand 6+6 เกินความจุ 10 จึงต้องแยกคัน)
    result = solve_ortools(parse_vrp(SMALL), time_limit_sec=1)
    assert sorted(result["routes"]) == [[2], [3]]
    assert result["distance"] == 20
    assert result["gap"] == 0
    assert result["feasible"]


@pytest.mark.parametrize("name", ["A-n32-k5", "B-n31-k5", "P-n40-k5"])
def test_benchmark_gap_under_threshold(name):
    data = parse_vrp(read(name))
    result = solve_ortools(data, time_limit_sec=2)
    assert result["feasible"]
    # ระยะแบบทศนิยมเต็มของเส้นทางใดๆ ไม่ต่ำกว่าค่า optimal ของ CVRPLIB (คิดแบบปัดทีละเส้น) ในชุดนี้ → gap ต้องไม่ติดลบ
    assert 0 <= result["gap"] < 5


def test_api_rejects_oversized_upload():
    res = client.post("/api/solve", files={"file": ("big.vrp", b"x" * 1_000_001)})
    assert res.status_code == 413


def test_api_rejects_bad_time_limit():
    res = client.post("/api/solve", files={"file": ("t.vrp", SMALL.encode())}, data={"time_limit": "999"})
    assert res.status_code == 422


def test_api_rejects_malformed_file():
    res = client.post("/api/solve", files={"file": ("t.vrp", SMALL.replace("2 3 4", "2 1e999 4").encode())})
    assert res.status_code == 400


def test_api_solve_small_file():
    res = client.post("/api/solve", files={"file": ("t.vrp", SMALL.encode())}, data={"time_limit": "1"})
    assert res.status_code == 200
    body = res.json()
    assert body["distance"] == 20
    assert [n["id"] for n in body["nodes"]] == [1, 2, 3]


def test_api_serves_sample_file():
    body = client.get("/api/samples/A-n32-k5").json()
    assert body["name"] == "A-n32-k5"
    assert body["text"] == read("A-n32-k5")
    assert client.get("/api/samples/nope").status_code == 404
    assert client.get("/api/samples/..%2Fmain").status_code == 404


# ── ไฟล์ตาราง (.csv / .xlsx) และ .txt: แปลงเป็น CVRPLIB ก่อนแก้โจทย์ ──
# โจทย์เดียวกับ SMALL: depot (0,0) ลูกค้า 2 จุดห่าง 5 demand 6+6 เกินความจุ 10 → ต้องแยกคัน ระยะรวม 20
SMALL_CSV = "x,y,demand,capacity,name\n0,0,0,10,tiny-csv\n3,4,6,,\n-3,-4,6,,\n"


def solve_file(filename, content):
    return client.post("/api/solve", files={"file": (filename, content)}, data={"time_limit": "1"})


def test_api_solves_txt_csv_and_xlsx():
    import io
    from openpyxl import Workbook

    wb = Workbook()
    for row in [["id", "x", "y", "demand", "capacity"], [10, 0, 0, 0, 10], [20, 3, 4, 6, None], [30, -3, -4, 6, None]]:
        wb.active.append(row)
    xlsx = io.BytesIO()
    wb.save(xlsx)

    for filename, content, name, ids in [
        ("t.txt", SMALL.encode(), "tiny-k2", [1, 2, 3]),
        ("t.csv", ("﻿" + SMALL_CSV).encode(), "tiny-csv", [1, 2, 3]),  # BOM จาก Excel ต้องอ่านได้
        ("my-sites.xlsx", xlsx.getvalue(), "my-sites", [10, 20, 30]),  # ไม่มีคอลัมน์ name = ใช้ชื่อไฟล์
    ]:
        res = solve_file(filename, content)
        assert res.status_code == 200, (filename, res.json())
        body = res.json()
        assert (body["name"], body["distance"], [n["id"] for n in body["nodes"]]) == (name, 20, ids)
        assert body["feasible"]


@pytest.mark.parametrize("csv_text, message", [
    ("x,y,demand\n0,0,0\n3,4,6\n", "capacity"),
    ("x,y,demand,capacity\n0,0,0,10\n3,abc,6,\n", "แถว 3: คอลัมน์ y"),
    ("x,y,demand,capacity\n0,0,0,10\n", "อย่างน้อย 1 แถว"),
])
def test_api_reports_bad_csv(csv_text, message):
    res = solve_file("bad.csv", csv_text.encode())
    assert res.status_code == 400
    assert message in res.json()["detail"]


def test_api_rejects_broken_xlsx():
    res = solve_file("bad.xlsx", b"not an excel file")
    assert res.status_code == 400
    assert "Excel" in res.json()["detail"]


def test_benchmark_accepts_csv(store):
    body = upload(("sites.csv", SMALL_CSV.encode())).json()
    assert [a["name"] for a in body["added"]] == ["tiny-csv"]
    assert client.post("/api/benchmark/instances/tiny-csv/run?time_limit=1").json()["distance"] == 20


def test_benchmark_rejects_path_traversal():
    assert client.post("/api/benchmark/instances/..%2Fmain/run").status_code == 404
    assert client.delete("/api/benchmark/instances/..%2Fsolver").status_code == 404


# ── คลัง instance: ใช้โฟลเดอร์ชั่วคราวแทน backend/data จริง ──
@pytest.fixture
def store(tmp_path, monkeypatch):
    from app.services import instance_store
    monkeypatch.setattr(instance_store, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(instance_store, "UPLOAD_DIR", str(tmp_path / "instances"))
    monkeypatch.setattr(instance_store, "OPTIMAL_FILE", str(tmp_path / "optimal.json"))
    return tmp_path


def upload(*files):
    return client.post("/api/benchmark/instances", files=[("files", f) for f in files])


def names():
    return {i["name"]: i for i in client.get("/api/benchmark/instances").json()["instances"]}


def test_library_starts_empty_and_samples_are_opt_in(store):
    body = client.get("/api/benchmark/instances").json()
    assert body == {"instances": [], "samples": 3}

    added = client.post("/api/benchmark/samples").json()["added"]
    assert sorted(a["name"] for a in added) == ["A-n32-k5", "B-n31-k5", "P-n40-k5"]
    items = names()
    assert items["A-n32-k5"]["optimal"] == 784 and items["A-n32-k5"]["optimal_source"] == "file"

    # หลังเพิ่มแล้วเป็น instance ธรรมดา: แก้ optimal และลบได้
    assert client.put("/api/benchmark/instances/A-n32-k5/optimal", json={"optimal": 780}).json()["optimal_source"] == "manual"
    assert client.delete("/api/benchmark/instances/A-n32-k5").status_code == 204
    assert "A-n32-k5" not in names()


def test_upload_run_and_delete(store):
    no_opt = SMALL.replace("COMMENT : (test, Optimal value: 20)\n", "")
    res = upload(("mine.vrp", no_opt.encode()), ("bad.vrp", b"NAME : x\nEOF\n"))
    body = res.json()
    assert [a["name"] for a in body["added"]] == ["tiny-k2"]  # ชื่อมาจาก NAME ในไฟล์
    assert body["errors"][0]["file"] == "bad.vrp"

    item = names()["tiny-k2"]
    assert item["optimal"] is None and item["optimal_source"] is None and item["customers"] == 2

    run = client.post("/api/benchmark/instances/tiny-k2/run?time_limit=1").json()
    assert run["distance"] == 20 and run["gap"] is None

    # กรอก optimal เอง → gap คำนวณได้
    assert client.put("/api/benchmark/instances/tiny-k2/optimal", json={"optimal": 18}).json()["optimal_source"] == "manual"
    run = client.post("/api/benchmark/instances/tiny-k2/run?time_limit=1").json()
    assert run["gap"] == pytest.approx((20 - 18) / 18 * 100)
    assert client.put("/api/benchmark/instances/tiny-k2/optimal", json={"optimal": -1}).status_code == 422

    # อัปโหลดชื่อเดิมซ้ำ = แทนที่
    assert upload(("again.vrp", SMALL.encode())).json()["added"][0]["replaced"] is True

    assert client.delete("/api/benchmark/instances/tiny-k2").status_code == 204
    assert "tiny-k2" not in names()
    assert not (store / "optimal.json").read_text() or "tiny-k2" not in (store / "optimal.json").read_text()


def test_unknown_instance_is_404(store):
    assert client.post("/api/benchmark/instances/nope/run").status_code == 404
    assert client.delete("/api/benchmark/instances/nope").status_code == 404
    assert client.put("/api/benchmark/instances/nope/optimal", json={"optimal": 1}).status_code == 404


def test_unsafe_names_are_sanitized(store):
    evil = SMALL.replace("NAME : tiny-k2", "NAME : ../../etc/passwd")
    added = upload(("x.vrp", evil.encode())).json()["added"][0]["name"]
    assert added == "etc-passwd"
    assert (store / "instances" / "etc-passwd.vrp").is_file()


def test_spare_vehicles_when_stated_fleet_is_too_small():
    # ความจุ 10, ลูกค้า 3 รายสั่งรายละ 6: ขั้นต่ำตาม demand รวม = 2 คัน แต่จริงต้องใช้ 3 คัน (คันละรายเดียว)
    text = """NAME : pack-k2
EDGE_WEIGHT_TYPE : EUC_2D
CAPACITY : 10
NODE_COORD_SECTION
1 0 0
2 10 0
3 0 10
4 -10 0
DEMAND_SECTION
1 0
2 6
3 6
4 6
DEPOT_SECTION
1
-1
EOF
"""
    result = solve_ortools(parse_vrp(text), time_limit_sec=2)
    assert result["vehicle_limit"] == 2
    assert len(result["routes"]) == 3
    assert result["feasible"]
    assert result["distance"] == 60
