# ROUTE — CVRP Route Optimization

เว็บแอปจัดเส้นทางรถขนส่งหลายคันภายใต้ความจุรถ (Capacitated Vehicle Routing Problem) ใช้ Google OR-Tools
(Guided Local Search) อัปโหลดไฟล์ `.vrp` รูปแบบ CVRPLIB แล้วดูผลเป็นแผนที่ 2D, ฉาก 3D และหน้า Benchmark

- **Solver** — อัปโหลดไฟล์ `.vrp` ได้ระยะทาง, gap เทียบ optimal และเส้นทางของรถแต่ละคัน
- **3D View** — ลูกค้าเป็นตึก (สูงตาม demand) รถวิ่งตามเส้นทางจริง
- **Benchmark** — คลัง instance ของผู้ใช้ (เริ่มต้นว่าง): อัปโหลดหลายไฟล์, กรอก best known solution, รันทั้งชุด, Export CSV

## โครงสร้าง

```
backend/    FastAPI + OR-Tools (main.py = API, solver.py = CVRP solver, instance_store.py = คลัง Benchmark)
frontend/   React + Vite + Tailwind + three.js (React Three Fiber)
reference/  ต้นแบบแอนิเมชันหน้าแรก
```

## วิธีรัน

ต้องมี Python 3.10+ และ Node.js 18+

```bash
# backend (พอร์ต 8010)
cd backend
pip install -r requirements.txt
python main.py

# frontend (พอร์ต 5173, ส่ง /api ต่อไปที่ backend)
cd frontend
npm install
npm run dev
```

เปิด http://localhost:5173

## ทดสอบ

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

## หมายเหตุ

- ไฟล์ `EUC_2D` คิดระยะแบบปัดเป็นจำนวนเต็มทีละเส้นตามมาตรฐาน TSPLIB/CVRPLIB เพื่อให้ gap เทียบกับค่า optimal ได้ถูกต้อง
- instance ที่อัปโหลดในหน้า Benchmark เก็บที่ `backend/data/` (ตั้ง `ROUTE_DATA_DIR` เพื่อย้ายที่เก็บ)
- ชุดตัวอย่าง CVRPLIB (`backend/instances/`) เพิ่มเข้าคลังได้จากปุ่มในหน้า Benchmark
- `python backend/cli.py` รัน solver จาก command line พร้อมบันทึกรูปเส้นทาง
- โมเดลตึกและโรงงาน (Low Poly Office Building 1–3, Small Water Processing Facility) โดย
  [Kendy2008](https://sketchfab.com/Kendy2008) (CC BY 4.0)
