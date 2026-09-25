/** จำนวนรถที่ใช้เกินจากที่ไฟล์ระบุ (ไฟล์ระบุน้อยเกินกว่าจะส่งของได้หมด) 0 = ไม่เกิน / ไฟล์ไม่ได้ระบุ */
export function extraVehicles(result) {
  return result.vehicles_stated ? Math.max(0, result.routes.length - result.vehicles_stated) : 0;
}

/** ข้อความหมายเหตุใต้จำนวนรถ: ใช้รถเกินที่ไฟล์ระบุต้องบอกผู้ใช้ ไม่งั้นแสดงความจุต่อคัน */
export function vehicleNote(result) {
  return extraVehicles(result) > 0 ? `ไฟล์ระบุ ${result.vehicles_stated} คัน · ใช้เพิ่ม ${extraVehicles(result)}` : `ความจุ ${result.capacity} / คัน`;
}

export function fmt(n, digits = 2) {
  return n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
