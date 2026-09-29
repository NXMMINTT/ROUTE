// พาเลตหมวดหมู่ 8 สี (ผ่าน validator: CVD/normal-vision) ใช้ตามลำดับ ไม่วนซ้ำ
// เส้นทางที่ 9 ขึ้นไปเป็นสีเทา แยกด้วยหมายเลขในตาราง/tooltip แทน
const PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const OTHER = "#9198a1";
export const routeColor = (i) => PALETTE[i] ?? OTHER;
