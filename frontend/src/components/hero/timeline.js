// พอร์ตตรรกะ 1:1 จาก reference/truck-center-demo.html (เวอร์ชันหลายชุดเนื้อหา)
// T = ช่วงเวลาของไทม์ไลน์เดียว (0..1) ที่คุมทุกฉากในระหว่างสกรอลล์
// ค่าเดิมคิดจาก .hd-drive สูง 1150vh พอเพิ่มเป็น 1500vh ให้ฉากถนนโค้ง จึงคูณ 1150/1500
// ต่อมาลดเป็น 1200vh ให้ช่วงวิ่งถนนโค้งเหลือ ~2 หน้าจอ จึงคูณ 1400/1100 (ระยะสกรอลล์จริง = สูง - 100vh)
// ทุกช่วงก่อน tiltEnd ยาวเท่าเดิมในหน่วย vh ส่วน tiltEnd..1 คือรถวิ่งตามเส้นทางโค้ง
export const T = { follow: 0.0976, rise: 0.1756, tilt: 0.7025, tiltEnd: 0.8196 };
export const TRANS = 0.45; // 45% แรกของแต่ละช่วงชุดคือรถวิ่ง อีก 55% คือจอดให้อ่าน

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// ช่วงเวลาของชุดเนื้อหาที่ i (0-based) จากทั้งหมด n ชุด คำนวณอัตโนมัติจาก n
// เพิ่ม/ลดชุดใน SECTIONS แล้วช่วงเวลาปรับเองโดยไม่ต้อง hardcode ทีละชุด
export const sectionSpan = (n) => (T.tilt - T.rise) / n;
export const sectionInStart = (i, n) => T.rise + i * sectionSpan(n) - (i === 0 ? 0.0195 : 0);
export const sectionInEnd = (i, n) => T.rise + i * sectionSpan(n) + sectionSpan(n) * TRANS;
export const sectionHoldMid = (i, n) => sectionInEnd(i, n) + (sectionSpan(n) * (1 - TRANS)) / 2;

/**
 * สร้าง engine ที่เก็บ state ข้ามเฟรม (p ที่ smooth แล้ว, ระยะล้อล่าสุด, ความเร็ว)
 * เรียก step(targetP, layout) ทุกเฟรมเพื่อได้ค่าตำแหน่ง/opacity ทั้งหมดของฉากนั้น
 * layout.N = จำนวนชุดเนื้อหา (SECTIONS.length)
 */
export function createFrameEngine() {
  let p = null;
  let lastWheelD = null;
  let spd = 0;

  return function step(targetP, { visW, off0, ppu, G0, G1, N, routeLen, reduce }) {
    p = p === null || reduce ? targetP : p + (targetP - p) * 0.1;

    const D = 0.55 * visW;
    const e1 = easeIO(seg(p, 0, T.follow));
    const truckX = D * e1;
    const camX = D * e1 - off0 * (1 - e1);
    const c = easeIO(seg(p, T.tilt, T.tiltEnd));

    // ระยะทางสมมติ: เพิ่มเฉพาะตอนรถ "วิ่ง" ระหว่างเปลี่ยนชุด (i=1..N-1)
    let virt = 0;
    for (let i = 1; i < N; i++) {
      virt += easeIO(seg(p, sectionInStart(i, N), sectionInEnd(i, N))) * visW * 1.8;
    }
    // ระยะที่วิ่งจริงบนเส้นทางโค้ง (หน่วยโลก) นับจากจุดเริ่มวิ่ง
    const routeD = seg(p, T.tiltEnd, 1) * routeLen;

    const wheelD = truckX + virt + routeD;
    const dd = lastWheelD === null ? 0 : wheelD - lastWheelD;
    lastWheelD = wheelD;

    const r = easeIO(seg(p, T.follow, T.rise));
    const firstInP = easeOut(seg(p, sectionInStart(0, N), sectionInEnd(0, N)));
    // หลังสถิติจางหาย (ชุดแรกไหลเข้าเต็มที่) ให้พื้นดำหดขึ้นอีกนิด กันพื้นที่ว่างด้านล่างแถบ
    const groundRisen = lerp(G0, G1, r);
    const ground = lerp(groundRisen, Math.min(G1 + 0.1, 0.92), firstInP);

    // ส่าย/เด้งของตัวรถ เสริมความรู้สึกวิ่ง (ล้อหมุนแยกใน HeroScene จาก wheelD)
    const sway = reduce ? 0 : Math.sin(wheelD / 6) * 0.06 * Math.min(1, spd / 40);
    const bodyBounce = reduce ? 0 : Math.sin(wheelD * 1.4) * 0.02 * Math.min(1, spd / 30);

    const camPx = (camX + off0) * ppu;
    const worldPx = camPx + virt * ppu;
    const side = 1 - c;

    const ddPx = Math.abs(dd) * ppu;
    spd += (clamp(ddPx * 1.6, 0, 140) - spd) * 0.08;
    if (spd < 0.5) spd = 0;

    return { p, D, truckX, camX, routeD, c, virt, wheelD, ground, sway, bodyBounce, camPx, worldPx, side, r, firstInP, spd };
  };
}
