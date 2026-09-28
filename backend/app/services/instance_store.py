"""
คลัง instance ของหน้า Benchmark — เริ่มต้นว่าง มีเฉพาะไฟล์ที่ผู้ใช้เพิ่มเอง
- instance: <DATA_DIR>/instances/*.vrp — เพิ่ม/แทนที่/ลบได้ทุกไฟล์
- ค่า optimal ที่ผู้ใช้กรอกเอง (ทับค่า "Optimal value" ใน COMMENT หรือใช้กับไฟล์ที่ไม่มีค่า): <DATA_DIR>/optimal.json
- ชุดตัวอย่าง CVRPLIB: backend/samples/*.vrp — ไม่แสดงในคลัง จนกว่าผู้ใช้กดเพิ่ม (add_samples คัดลอกเข้าคลัง)
  DATA_DIR / SAMPLES_DIR ตั้งใน core/config.py
"""

import json
import os
import re
import threading

from app.core.config import DATA_DIR, SAMPLES_DIR
from app.services.solver import parse_vrp

UPLOAD_DIR = os.path.join(DATA_DIR, "instances")
OPTIMAL_FILE = os.path.join(DATA_DIR, "optimal.json")

MAX_UPLOADED = 200  # กันดิสก์เต็มจากการอัปโหลดไม่จำกัด
# ชื่อ instance ใช้เป็นชื่อไฟล์และอยู่ใน URL: จำกัดตัวอักษร กัน path traversal ตั้งแต่ต้นทาง
NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}")

_lock = threading.Lock()  # เขียนไฟล์/optimal.json ทีละ request


class StoreError(Exception):
    """ข้อผิดพลาดที่แสดงให้ผู้ใช้เห็นได้ status = HTTP status ที่ควรตอบ"""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def to_name(candidate: str) -> str | None:
    """แปลงชื่อจากไฟล์ (NAME หรือชื่อไฟล์) ให้เป็นชื่อที่ปลอดภัย ใช้ไม่ได้เลย = None"""
    name = re.sub(r"[^A-Za-z0-9._-]+", "-", candidate.strip())
    name = name.lstrip("._-")[:64].rstrip("._-")
    return name if NAME_RE.fullmatch(name) else None


def _path(folder: str, name: str) -> str:
    return os.path.join(folder, f"{name}.vrp")


def _vrp_names(folder: str) -> list[str]:
    """ชื่อ instance (ไม่รวม .vrp) ในโฟลเดอร์ เฉพาะชื่อที่ผ่าน NAME_RE"""
    if not os.path.isdir(folder):
        return []
    return sorted(f[:-4] for f in os.listdir(folder) if f.endswith(".vrp") and NAME_RE.fullmatch(f[:-4]))


def locate(name: str) -> str:
    """คืน path ของ instance ชื่อนี้ในคลัง หาไม่เจอ = StoreError 404"""
    if NAME_RE.fullmatch(name):
        path = _path(UPLOAD_DIR, name)
        if os.path.isfile(path):
            return path
    raise StoreError(f"ไม่พบ instance {name}", 404)


def _read(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        return f.read()


def _overrides() -> dict:
    """ค่า optimal ที่ผู้ใช้กรอกเอง {name: value} ไฟล์ไม่มี/เสีย = {}"""
    try:
        with open(OPTIMAL_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _write_overrides(data: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    tmp = OPTIMAL_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, OPTIMAL_FILE)  # เขียนไฟล์ใหม่แล้วค่อยสลับ ไฟล์ไม่เสียถ้า process ตายกลางทาง


def load(name: str) -> dict:
    """parse instance แล้วใส่ค่า optimal ที่ผู้ใช้กรอกไว้ (ถ้ามี) — ไฟล์เสีย = ValueError จาก parse_vrp"""
    data = parse_vrp(_read(locate(name)))
    manual = _overrides().get(name)
    data["optimal_source"] = "manual" if manual else ("file" if data["optimal"] else None)
    if manual:
        data["optimal"] = manual
    return data


def summary(name: str, data: dict) -> dict:
    """ข้อมูลย่อของ instance สำหรับตารางหน้า Benchmark"""
    return {
        "name": name,
        "customers": len(data["coords"]) - 1,
        "capacity": data["capacity"],
        "optimal": data["optimal"],
        "optimal_source": data["optimal_source"],
    }


def list_names() -> list[str]:
    return _vrp_names(UPLOAD_DIR)


def add(filename: str, text: str) -> tuple[str, bool]:
    """ตรวจไฟล์แล้วบันทึก ชื่อมาจาก NAME ในไฟล์ (ไม่มีจึงใช้ชื่อไฟล์) คืน (ชื่อ, แทนที่ไฟล์เดิมหรือไม่)"""
    data = parse_vrp(text)  # ไฟล์ใช้ไม่ได้ = ValueError ไม่บันทึกอะไรเลย
    stem = os.path.splitext(os.path.basename(filename or ""))[0]
    name = to_name(data["name"]) or to_name(stem)
    if not name:
        raise StoreError("ตั้งชื่อ instance จาก NAME หรือชื่อไฟล์ไม่ได้ (ใช้ได้เฉพาะ A-Z 0-9 . _ -)")

    with _lock:
        os.makedirs(UPLOAD_DIR, exist_ok=True)
        path = _path(UPLOAD_DIR, name)
        replaced = os.path.isfile(path)
        if not replaced and len(_vrp_names(UPLOAD_DIR)) >= MAX_UPLOADED:
            raise StoreError(f"เก็บ instance ได้สูงสุด {MAX_UPLOADED} ไฟล์ ลบไฟล์เก่าก่อน", 409)
        with open(path, "w", encoding="utf-8", newline="\n") as f:
            f.write(text)
    return name, replaced


def sample_names() -> list[str]:
    return _vrp_names(SAMPLES_DIR)


def read_sample(name: str) -> str:
    """เนื้อหาไฟล์ตัวอย่าง CVRPLIB ชื่อนี้ ไม่มีในชุดตัวอย่าง = StoreError 404"""
    if name not in sample_names():
        raise StoreError(f"ไม่พบไฟล์ตัวอย่าง {name}", 404)
    return _read(_path(SAMPLES_DIR, name))


def add_samples() -> list[tuple[str, bool]]:
    """คัดลอกชุดตัวอย่าง CVRPLIB เข้าคลัง (ชื่อซ้ำ = แทนที่) หลังจากนั้นเป็น instance ธรรมดา ลบ/แก้ได้"""
    return [add(f"{n}.vrp", _read(_path(SAMPLES_DIR, n))) for n in sample_names()]


def remove(name: str) -> None:
    """ลบไฟล์ instance พร้อมค่า optimal ที่กรอกไว้"""
    path = locate(name)
    with _lock:
        os.remove(path)
        overrides = _overrides()
        if overrides.pop(name, None) is not None:
            _write_overrides(overrides)


def set_optimal(name: str, value: float | None) -> None:
    """กำหนดค่า optimal (best known solution) เอง / None = ลบค่าที่กรอกไว้ กลับไปใช้ค่าในไฟล์"""
    locate(name)
    with _lock:
        overrides = _overrides()
        if value is None:
            overrides.pop(name, None)
        else:
            overrides[name] = value
        _write_overrides(overrides)
