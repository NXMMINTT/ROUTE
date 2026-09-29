const BACKEND_DOWN = "เชื่อมต่อ backend ไม่ได้ — เปิด backend ก่อน: cd backend แล้วรัน python -m app.main";
export const GAP_THRESHOLD = 5; // เกณฑ์ gap ของการแข่งขัน (%)
export const TIME_LIMITS = [5, 10, 30];
// นามสกุลที่อัปโหลดได้: CVRPLIB (.vrp/.txt) หรือตารางลูกค้า (.csv/.xlsx — backend/table_import.py แปลงให้)
export const ACCEPT = ".vrp,.txt,.csv,.xlsx";

// FastAPI ตอบ validation error (422) เป็น detail แบบ array ของ { msg, ... }
function detailMessage(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(", ");
  return null;
}

/** fetch แล้วคืน JSON ข้อผิดพลาดทุกแบบกลายเป็น Error ที่มีข้อความให้ผู้ใช้อ่านได้ (ยกเว้น AbortError ส่งต่อตามเดิม) */
export async function requestJson(url, opts) {
  let res;
  try {
    res = await fetch(url, opts);
  } catch (e) {
    if (e.name === "AbortError") throw e;
    // network error: แต่ละเบราว์เซอร์ใช้ข้อความต่างกัน จึงไม่เทียบข้อความ
    throw new Error(BACKEND_DOWN);
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return json;
  const detail = detailMessage(json?.detail);
  if (detail) throw new Error(detail);
  // 502-504 ที่ไม่มี detail = Vite proxy ต่อ backend ไม่ได้ (backend ปิดอยู่)
  if (res.status >= 502) throw new Error(BACKEND_DOWN);
  throw new Error(`เซิร์ฟเวอร์ผิดพลาด (${res.status})`);
}
