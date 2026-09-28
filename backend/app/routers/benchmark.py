"""
endpoint ของหน้า Benchmark: คลัง instance ของผู้ใช้ (เริ่มต้นว่าง) ดู services/instance_store.py
  GET    /api/benchmark/instances                 รายชื่อ instance ในคลัง
  POST   /api/benchmark/instances                 อัปโหลด instance (หลายไฟล์)
  POST   /api/benchmark/samples                   เพิ่มชุดตัวอย่าง CVRPLIB เข้าคลัง
  DELETE /api/benchmark/instances/{name}          ลบ instance
  PUT    /api/benchmark/instances/{name}/optimal  กรอก/ลบค่า optimal เอง
  POST   /api/benchmark/instances/{name}/run      รัน instance เดียว
"""

import logging
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, UploadFile

from app.core.config import (
    MAX_FILES_PER_UPLOAD, MAX_UPLOAD_BYTES, TIME_LIMIT_DEFAULT, TIME_LIMIT_MAX, TIME_LIMIT_MIN,
)
from app.routers.common import solve_and_format, store_call
from app.schemas.benchmark import OptimalBody
from app.services import instance_store
from app.services.solver import VrpFormatError
from app.services.table_import import read_upload

router = APIRouter(prefix="/api/benchmark")
log = logging.getLogger(__name__)


def load_instance(name: str) -> dict:
    """โหลด instance จากคลัง — ไม่พบ = 404, ไฟล์เสีย = 400"""
    try:
        return store_call(instance_store.load, name)
    except VrpFormatError as e:
        raise HTTPException(400, str(e))
    except ValueError:
        raise HTTPException(400, f"ไฟล์ของ instance {name} เสีย อ่านไม่ได้")


@router.get("/instances")
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


@router.post("/instances")
def upload_instances(files: list[UploadFile]):
    """เพิ่ม instance จากไฟล์ .vrp / .txt / .csv / .xlsx (หลายไฟล์ได้) ไฟล์ที่ใช้ไม่ได้จะรายงานใน errors ส่วนไฟล์อื่นยังบันทึกตามปกติ
    ชื่อซ้ำกับไฟล์ที่เคยอัปโหลด = แทนที่ของเดิม"""
    if len(files) > MAX_FILES_PER_UPLOAD:
        raise HTTPException(400, f"อัปโหลดได้ครั้งละไม่เกิน {MAX_FILES_PER_UPLOAD} ไฟล์")
    added, errors = [], []
    for f in files:
        raw = f.file.read(MAX_UPLOAD_BYTES + 1)
        try:
            if len(raw) > MAX_UPLOAD_BYTES:
                raise instance_store.StoreError(f"ไฟล์ใหญ่เกิน {MAX_UPLOAD_BYTES // 1_000_000} MB")
            name, replaced = instance_store.add(f.filename, read_upload(f.filename, raw))
            added.append({"file": f.filename, "name": name, "replaced": replaced})
        except (VrpFormatError, instance_store.StoreError) as e:
            errors.append({"file": f.filename, "error": str(e)})
        except ValueError:
            errors.append({"file": f.filename, "error": "อ่านไฟล์ .vrp ไม่ได้ ตรวจสอบรูปแบบไฟล์"})
    return {"added": added, "errors": errors}


@router.post("/samples")
def add_samples():
    """เพิ่มชุดตัวอย่าง CVRPLIB (backend/samples/) เข้าคลัง ชื่อซ้ำ = แทนที่ของเดิม"""
    added = store_call(instance_store.add_samples)
    return {"added": [{"file": f"{n}.vrp", "name": n, "replaced": r} for n, r in added], "errors": []}


@router.delete("/instances/{name}", status_code=204)
def delete_instance(name: str):
    """ลบ instance ออกจากคลัง"""
    store_call(instance_store.remove, name)


@router.put("/instances/{name}/optimal")
def set_optimal(name: str, body: OptimalBody):
    """กำหนดค่า optimal (best known solution) เอง / null = ลบค่าที่กรอกไว้ กลับไปใช้ค่าในไฟล์"""
    store_call(instance_store.set_optimal, name, body.optimal)
    return instance_store.summary(name, load_instance(name))


@router.post("/instances/{name}/run")
def run_instance(
    name: str,
    time_limit: Annotated[int, Query(ge=TIME_LIMIT_MIN, le=TIME_LIMIT_MAX)] = TIME_LIMIT_DEFAULT,
):
    """รัน instance เดียว (หน้าเว็บเรียกทีละตัวเพื่อแสดงความคืบหน้า)"""
    return solve_and_format(load_instance(name), time_limit)
