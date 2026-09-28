"""
endpoint ของหน้า Solver / 3D
  POST /api/solve           อัปโหลดไฟล์ → แก้ CVRP → ผลลัพธ์
  GET  /api/samples/{name}  เนื้อหาไฟล์ตัวอย่าง CVRPLIB
"""

from typing import Annotated

from fastapi import APIRouter, Form, HTTPException, UploadFile

from app.core.config import MAX_UPLOAD_BYTES, TIME_LIMIT_DEFAULT, TIME_LIMIT_MAX, TIME_LIMIT_MIN
from app.routers.common import load_vrp, solve_and_format, store_call
from app.services import instance_store
from app.services.solver import VrpFormatError
from app.services.table_import import read_upload

router = APIRouter(prefix="/api")


@router.post("/solve")
def solve_vrp(
    file: UploadFile,
    time_limit: Annotated[int, Form(ge=TIME_LIMIT_MIN, le=TIME_LIMIT_MAX)] = TIME_LIMIT_DEFAULT,
):
    """รับไฟล์ .vrp / .txt / .csv / .xlsx → แก้ CVRP ด้วย OR-Tools → ส่ง routes, ระยะทาง, gap และพิกัดไว้วาดแผนที่"""
    raw = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"ไฟล์ใหญ่เกิน {MAX_UPLOAD_BYTES // 1_000_000} MB")
    try:
        text = read_upload(file.filename, raw)
    except VrpFormatError as e:
        raise HTTPException(400, str(e))
    return solve_and_format(load_vrp(text), time_limit)


@router.get("/samples/{name}")
def get_sample(name: str):
    """ไฟล์ตัวอย่าง CVRPLIB ให้ปุ่ม "ลองด้วยข้อมูลตัวอย่าง" ในหน้า Solver/3D (ผู้ใช้ที่ยังไม่มีไฟล์ .vrp)"""
    return {"name": name, "text": store_call(instance_store.read_sample, name)}
