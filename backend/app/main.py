"""
FastAPI server (http://127.0.0.1:8010) — frontend เรียกผ่าน Vite proxy /api
รัน: cd backend แล้ว python -m app.main

endpoint แยกไฟล์ตามหน้าเว็บ:
  routers/solve.py      หน้า Solver / 3D   (/api/solve, /api/samples)
  routers/benchmark.py  หน้า Benchmark     (/api/benchmark/...)
"""

from fastapi import FastAPI

from app.routers import benchmark, solve
from app.schemas.health import HealthResponse

app = FastAPI(title="Route Optimization API")
# ไม่ต้องตั้ง CORS: frontend เรียกผ่าน Vite proxy (/api → :8010 ดู vite.config.js) จึงเป็น same-origin
app.include_router(solve.router)
app.include_router(benchmark.router)


@app.get("/api/health", response_model=HealthResponse)
def health_check():
    """Endpoint พื้นฐานไว้เช็คว่า backend ทำงานอยู่และ frontend เชื่อมต่อได้"""
    return HealthResponse(status="ok", message="Route Optimization API is running")


if __name__ == "__main__":
    import uvicorn

    # 127.0.0.1: dev server (reload=True) ไม่ควรเปิดให้เครื่องอื่นในวง LAN เข้าถึง
    uvicorn.run("app.main:app", host="127.0.0.1", port=8010, reload=True)
