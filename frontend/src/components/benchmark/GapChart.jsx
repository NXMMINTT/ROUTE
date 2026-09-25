import { GAP_THRESHOLD } from "../../lib/api";
import { fmt } from "../../lib/format";

const NAME_COL = "9rem"; // ความกว้างคอลัมน์ชื่อ (ต้องตรงกับ grid-cols ด้านล่าง ใช้คำนวณตำแหน่งเส้นเกณฑ์)
const GAP_X = "0.75rem";

/**
 * กราฟแท่งแนวนอน: gap ของแต่ละ instance เทียบเส้นเกณฑ์
 * ทำด้วย HTML แทน SVG viewBox: ตัวอักษรขนาดคงที่ทุกความกว้างจอ และรองรับกี่ instance ก็ได้ (เกินความสูงจะเลื่อนดูได้)
 * items: [{ name, gap }] — gap ติดลบได้ (ค่า optimal ที่กรอกไม่ตรงเกณฑ์ระยะ) แกนจึงเริ่มจากค่าที่น้อยกว่าระหว่าง 0 กับ gap ต่ำสุด
 */
export default function GapChart({ items }) {
  const gaps = items.map((it) => it.gap);
  const lo = Math.min(0, ...gaps.map((g) => g * 1.15));
  const hi = Math.max(GAP_THRESHOLD * 1.2, ...gaps.map((g) => g * 1.15));
  // เผื่อที่ขวาสุด 15% ให้ตัวเลขท้ายแท่งไม่ล้นกรอบ
  const pct = (v) => ((v - lo) / (hi - lo)) * 85;
  const barsLeft = (p) => `calc(${NAME_COL} + ${GAP_X} + (100% - ${NAME_COL} - ${GAP_X}) * ${p / 100})`;
  const passed = gaps.filter((g) => g < GAP_THRESHOLD).length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium">Gap เทียบ optimal</span>
        <span className="text-xs text-gray-500">
          ผ่าน {passed} / {items.length} · เส้นประ = เกณฑ์ {GAP_THRESHOLD} %
        </span>
      </div>
      <div className="max-h-[26rem] overflow-y-auto pr-1">
        <div
          className="relative grid items-center gap-y-2 py-1"
          style={{ gridTemplateColumns: `${NAME_COL} minmax(0, 1fr)`, columnGap: GAP_X }}
          role="img"
          aria-label={`กราฟ gap ของ ${items.length} instance เทียบเกณฑ์ ${GAP_THRESHOLD}%`}
        >
          {/* เส้นเกณฑ์และแกน 0 ลากยาวตลอดทุกแถว */}
          <div className="pointer-events-none absolute inset-y-0 border-l border-dashed border-gray-400" style={{ left: barsLeft(pct(GAP_THRESHOLD)) }} />
          <div className="pointer-events-none absolute inset-y-0 border-l border-gray-300" style={{ left: barsLeft(pct(0)) }} />

          {items.map(({ name, gap }) => {
            const [a, b] = [pct(Math.min(0, gap)), pct(Math.max(0, gap))];
            return (
              <div key={name} className="contents" title={`${name}: gap ${fmt(gap)} %`}>
                <span className="truncate text-right text-xs text-gray-600">{name}</span>
                <div className="relative h-5">
                  <div
                    className={`absolute inset-y-0.5 rounded ${gap < GAP_THRESHOLD ? "bg-[#2a78d6]" : "bg-[#eda100]"}`}
                    style={{ left: `${a}%`, width: `max(2px, ${b - a}%)` }}
                  />
                  <span className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap pl-1.5 text-xs font-semibold tabular-nums" style={{ left: `${b}%` }}>
                    {fmt(gap)} %
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
