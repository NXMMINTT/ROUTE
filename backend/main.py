import logging
from typing import Annotated

from fastapi import FastAPI, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

import instance_store
from solver import VrpFormatError, parse_vrp, solve_ortools

app = FastAPI(title="Route Optimization API")
log = logging.getLogger(__name__)
# ไม่ต้องตั้ง CORS: frontend เรียกผ่าน Vite proxy (/api → :8010 ดู vite.config.js) จึงเป็น same-origin

MAX_UPLOAD_BYTES = 1_000_000  # ไฟล์ CVRPLIB ขนาดใหญ่สุดยังไม่ถึง 100 KB
# เวลาค้นหาต่อ request (วินาที) — จำกัดไว้เพราะแต่ละ request ถือ worker thread ไว้ตลอดเวลาที่คำนวณ
TIME_LIMIT_MIN, TIME_LIMIT_MAX, TIME_LIMIT_DEFAULT = 1, 60, 10


class HealthResponse(BaseModel):
    status: str
    message: str


@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """Endpoint พื้นฐานไว้เช็คว่า backend ทำงานอยู่และ frontend เชื่อมต่อได้"""
    return HealthResponse(status="ok", message="Route Optimization API is running")


def load_vrp(text: str) -> dict:
    """parse_vrp + แปลงข้อผิดพลาดของไฟล์เป็น 400 พร้อมข้อความที่ผู้ใช้อ่านเข้าใจ"""
    try:
        return parse_vrp(text)
    except VrpFormatError as e:
        raise HTTPException(400, str(e))
    except ValueError:
        raise HTTPException(400, "อ่านไฟล์ .vrp ไม่ได้ ตรวจสอบรูปแบบไฟล์")


@app.post("/api/solve")
def solve_vrp(
    file: UploadFile,
    time_limit: Annotated[int, Form(ge=TIME_LIMIT_MIN, le=TIME_LIMIT_MAX)] = TIME_LIMIT_DEFAULT,
):
    """รับไฟล์ .vrp → แก้ CVRP ด้วย OR-Tools → ส่ง routes, ระยะทาง, gap และพิกัดไว้วาดแผนที่"""
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"ไฟล์ใหญ่เกิน {MAX_UPLOAD_BYTES // 1_000_000} MB")
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(400, "ไฟล์ .vrp ต้องเป็นไฟล์ข้อความ (UTF-8)")
    return solve_and_format(load_vrp(text), time_limit)


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


# ── Benchmark: คลัง instance ของผู้ใช้ (เริ่มต้นว่าง) ดู instance_store.py ──
MAX_FILES_PER_UPLOAD = 50


def store_call(fn, *args):
    try:
        return fn(*args)
    except instance_store.StoreError as e:
        raise HTTPException(e.status, str(e))


def load_instance(name: str) -> dict:
    try:
        return store_call(instance_store.load, name)
    except VrpFormatError as e:
        raise HTTPException(400, str(e))
    except ValueError:
        raise HTTPException(400, f"ไฟล์ของ instance {name} เสีย อ่านไม่ได้")


@app.get("/api/benchmark/instances")
def list_instances():
    """รายชื่อ instance ในคลัง พร้อมขนาดและค่า optimal / samples = จำนวนไฟล์ในชุดตัวอย่างที่เพิ่มเข้าคลังได้"""
    items = []
    for name in instance_store.list_names():
        try:
            items.append(instance_store.summary(name, instance_store.load(name)))
        except (ValueError, OSError, instance_store.StoreError):
            # ไฟล์เสียไฟล์เดียวไม่ควรทำให้ทั้งหน้า Benchmark ใช้ไม่ได้
            log.warning("ข้าม instance ที่อ่านไม่ได้: %s", name, exc_info=True)
    return {"instances": items, "samples": len(instance_store.sample_names())}


@app.post("/api/benchmark/instances")
def upload_instances(files: list[UploadFile]):
    """เพิ่ม instance จากไฟล์ .vrp (หลายไฟล์ได้) ไฟล์ที่ใช้ไม่ได้จะรายงานใน errors ส่วนไฟล์อื่นยังบันทึกตามปกติ
    ชื่อซ้ำกับไฟล์ที่เคยอัปโหลด = แทนที่ของเดิม"""
    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(400, f"อัปโหลดได้ครั้งละไม่เกิน {MAX_FILES_PER_UPLOAD} ไฟล์")
    added, errors = [], []
    for f in files:
        raw = f.file.read(MAX_UPLOAD_BYTES + 1)
        try:
            if len(raw) > MAX_UPLOAD_BYTES:
                raise instance_store.StoreError(f"ไฟล์ใหญ่เกิน {MAX_UPLOAD_BYTES // 1_000_000} MB")
            name, replaced = instance_store.add(f.filename, raw.decode("utf-8"))
            added.append({"file": f.filename, "name": name, "replaced": replaced})
        except UnicodeDecodeError:
            errors.append({"file": f.filename, "error": "ต้องเป็นไฟล์ข้อความ (UTF-8)"})
        except (VrpFormatError, instance_store.StoreError) as e:
            errors.append({"file": f.filename, "error": str(e)})
        except ValueError:
            errors.append({"file": f.filename, "error": "อ่านไฟล์ .vrp ไม่ได้ ตรวจสอบรูปแบบไฟล์"})
    return {"added": added, "errors": errors}


@app.post("/api/benchmark/samples")
def add_samples():
    """เพิ่มชุดตัวอย่าง CVRPLIB (backend/instances/) เข้าคลัง ชื่อซ้ำ = แทนที่ของเดิม"""
    added = store_call(instance_store.add_samples)
    return {"added": [{"file": f"{n}.vrp", "name": n, "replaced": r} for n, r in added], "errors": []}


@app.delete("/api/benchmark/instances/{name}", status_code=204)
def delete_instance(name: str):
    """ลบ instance ออกจากคลัง"""
    store_call(instance_store.remove, name)


class OptimalBody(BaseModel):
    optimal: float | None = Field(default=None, gt=0)


@app.put("/api/benchmark/instances/{name}/optimal")
def set_optimal(name: str, body: OptimalBody):
    """กำหนดค่า optimal (best known solution) เอง / null = ลบค่าที่กรอกไว้ กลับไปใช้ค่าในไฟล์"""
    store_call(instance_store.set_optimal, name, body.optimal)
    return instance_store.summary(name, load_instance(name))


@app.post("/api/benchmark/instances/{name}/run")
def run_instance(
    name: str,
    time_limit: Annotated[int, Query(ge=TIME_LIMIT_MIN, le=TIME_LIMIT_MAX)] = TIME_LIMIT_DEFAULT,
):
    """รัน instance เดียว (หน้าเว็บเรียกทีละตัวเพื่อแสดงความคืบหน้า)"""
    return solve_and_format(load_instance(name), time_limit)


if __name__ == "__main__":
    import uvicorn

    # 127.0.0.1: dev server (reload=True) ไม่ควรเปิดให้เครื่องอื่นในวง LAN เข้าถึง
    uvicorn.run("main:app", host="127.0.0.1", port=8010, reload=True)
