// จำผลล่าสุดไว้ในแท็บนี้ สลับไปหน้า Solver/3D แล้วยังเห็นผลเดิมโดยไม่ต้องอัปโหลดซ้ำ
const KEY = "route-solver:last";

// ข้อมูลเก่าที่เก็บไว้ก่อนเปลี่ยนรูปแบบผลลัพธ์ไม่ควรทำให้หน้าพัง
const isResult = (r) => Array.isArray(r?.nodes) && Array.isArray(r?.routes) && r.nodes.some((n) => n.id === r.depot);

export function loadLast() {
  try {
    const r = JSON.parse(sessionStorage.getItem(KEY));
    return isResult(r) ? r : null;
  } catch {
    return null;
  }
}

/** เก็บผลไว้เป็น "ผลล่าสุด" (หน้า Benchmark ใช้ส่งผลไปเปิดดูในหน้า Solver/3D) */
export function saveLast(result) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(result));
  } catch {
    // เก็บไม่ได้ (private mode ฯลฯ) ก็แค่ไม่จำผลข้ามหน้า
  }
}
