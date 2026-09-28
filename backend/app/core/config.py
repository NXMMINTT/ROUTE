"""ค่าตั้งค่าทั้งหมดของ backend: path ของไฟล์ และค่าจำกัดของ API"""

import os

# ── Path ──
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend/
SAMPLES_DIR = os.path.join(BASE_DIR, "samples")  # ชุดตัวอย่าง CVRPLIB (อยู่ใน git)
# ไฟล์ที่ผู้ใช้อัปโหลด ตั้ง ROUTE_DATA_DIR เพื่อเก็บไว้ที่อื่น (เช่น volume ของ server ตอน deploy)
DATA_DIR = os.environ.get("ROUTE_DATA_DIR") or os.path.join(BASE_DIR, "data")

# ── ค่าจำกัดของ API ──
MAX_UPLOAD_BYTES = 1_000_000  # ไฟล์ CVRPLIB ขนาดใหญ่สุดยังไม่ถึง 100 KB
MAX_FILES_PER_UPLOAD = 50
# เวลาค้นหาต่อ request (วินาที) — จำกัดไว้เพราะแต่ละ request ถือ worker thread ไว้ตลอดเวลาที่คำนวณ
TIME_LIMIT_MIN, TIME_LIMIT_MAX, TIME_LIMIT_DEFAULT = 1, 60, 10
