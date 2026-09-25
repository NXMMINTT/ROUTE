// เนื้อหาแต่ละชุดของแถบดำ เพิ่ม/ลดชุดได้ด้วยการแก้ array นี้อย่างเดียว (href ไม่ระบุ = เลื่อนลงไปส่วนท้ายหน้า #next)
// ไทม์ไลน์ (timeline.js) คำนวณช่วงเวลาของแต่ละชุดจาก SECTIONS.length อัตโนมัติ
// ข้อความต้องอ้างเฉพาะสิ่งที่ระบบทำได้จริง (CVRP: ความจุรถ + ระยะทาง) — ยังไม่มี time windows / live tracking
export const SECTIONS = [
  {
    head: ["EVERYTHING", "YOUR FLEET"],
    dim: "NEEDS.",
    body: "Upload a CVRPLIB file and get a complete plan — which truck serves which customer, in what order, and how far every vehicle drives.",
    cta: "SEE HOW IT WORKS",
  },
  {
    head: ["HUNDREDS", "OF STOPS"],
    dim: "ONE PATH.",
    body: "Google OR-Tools with Guided Local Search sequences every drop while keeping each truck within its capacity.",
    cta: "SEE THE SOLVER",
    href: "#/solve",
  },
  {
    head: ["EVERY MILE", "ACCOUNTED"],
    dim: "FOR.",
    body: "Every result is scored against the known optimum — distance, gap and feasibility, benchmarked on the standard CVRPLIB set.",
    cta: "SEE THE BENCHMARK",
    href: "#/benchmark",
  },
];

// ข้อความฉากมุมบน (ถนนโค้ง) พอร์ตจาก STOPS ของ reference/truck-curve-demo.html
// at = จุดบนเส้นทางที่ข้อความขึ้นเต็มที่ ใช้พิกัดเดียวกับ PTS ใน useRoad.js (หน่วยเท่าความยาวรถ)
export const ROUTE_STOPS = [
  { at: [2, 0], title: "CAPACITY", sub: "รถทุกคันบรรทุกไม่เกินความจุ ตรวจทุกเส้นทางก่อนส่งผล" },
  { at: [4.996, 0.575], title: "DISTANCE", sub: "ลดระยะทางรวมของทั้งกองรถด้วย Guided Local Search" },
  { at: [5.15, 9], title: "PROOF", sub: "วัดผลเทียบค่า optimal ของชุดทดสอบมาตรฐาน CVRPLIB" },
];
