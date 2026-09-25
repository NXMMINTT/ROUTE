import { useMemo, useState } from "react";
import { routeColor } from "./colors";

const W = 960;
const PAD = 28;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** แผนที่เส้นทางจากพิกัด x,y ของไฟล์ .vrp (ชี้เส้นทางเพื่อไฮไลต์ ชี้จุดเพื่อดูรายละเอียด) */
export default function RouteMap({ result, active, onActive }) {
  const [tip, setTip] = useState(null);

  const { pos, routeOf, H } = useMemo(() => {
    const xs = result.nodes.map((n) => n.x);
    const ys = result.nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    // ความสูงกรอบตามสัดส่วนข้อมูล ภาพจึงเต็มการ์ดไม่เหลือที่ว่างซ้าย/ขวา (จำกัดไม่ให้แบนหรือสูงเกินไป)
    const H = Math.round(clamp(((y1 - y0) / (x1 - x0 || 1)) * (W - PAD * 2) + PAD * 2, 380, 540));
    // สเกลเท่ากันทั้งสองแกน ระยะบนจอจึงสัดส่วนตรงกับระยะจริง
    const s = Math.min((W - PAD * 2) / (x1 - x0 || 1), (H - PAD * 2) / (y1 - y0 || 1));
    const ox = (W - (x1 - x0) * s) / 2;
    const oy = (H - (y1 - y0) * s) / 2;
    const pos = {};
    for (const n of result.nodes) pos[n.id] = [ox + (n.x - x0) * s, H - oy - (n.y - y0) * s];
    const routeOf = {};
    result.routes.forEach((r, i) => r.stops.forEach((id) => (routeOf[id] = i)));
    return { pos, routeOf, H };
  }, [result]);

  const dim = (i) => active !== null && active !== i;
  const depot = pos[result.depot];

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-[#fcfcfb]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <span className="text-sm font-medium text-gray-900">แผนที่เส้นทาง</span>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`แผนที่เส้นทาง ${result.name}`}>
          {result.routes.map((r, i) => {
            const pts = [result.depot, ...r.stops, result.depot].map((id) => pos[id].join(",")).join(" ");
            return (
              <g key={i} onMouseEnter={() => onActive(i)} onMouseLeave={() => onActive(null)} style={{ opacity: dim(i) ? 0.15 : 1 }}>
                {/* เส้นหนาโปร่งใสเป็นพื้นที่ชี้ ให้ชี้ง่ายกว่าเส้นจริง */}
                <polyline points={pts} fill="none" stroke="transparent" strokeWidth="12" />
                <polyline points={pts} fill="none" stroke={routeColor(i)} strokeWidth={active === i ? 3 : 2} strokeLinejoin="round" />
              </g>
            );
          })}
          {result.nodes.map((n) => {
            if (n.id === result.depot) return null;
            const i = routeOf[n.id];
            const [x, y] = pos[n.id];
            return (
              <circle
                key={n.id}
                cx={x}
                cy={y}
                r="4.5"
                fill={i == null ? "#9198a1" : routeColor(i)}
                stroke="#fcfcfb"
                strokeWidth="2"
                style={{ opacity: dim(i) ? 0.15 : 1 }}
                onMouseEnter={() => {
                  onActive(i ?? null);
                  setTip({ x, y, n, i });
                }}
                onMouseLeave={() => {
                  onActive(null);
                  setTip(null);
                }}
              />
            );
          })}
          <rect x={depot[0] - 7} y={depot[1] - 7} width="14" height="14" rx="3" fill="#14171c" stroke="#fcfcfb" strokeWidth="2" />
          <text
            x={depot[0] + 11}
            y={depot[1] + 4}
            fontSize="11"
            fill="#14171c"
            fontWeight="600"
            stroke="#fcfcfb"
            strokeWidth="4"
            strokeLinejoin="round"
            paintOrder="stroke"
          >
            Depot
          </text>
        </svg>

        {tip && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow"
            style={{ left: `${(tip.x / W) * 100}%`, top: `calc(${(tip.y / H) * 100}% - 10px)` }}
          >
            <div className="font-semibold">จุด {tip.n.id}</div>
            <div className="text-gray-300">demand {tip.n.demand}</div>
            {tip.i != null && <div className="text-gray-300">Route {tip.i + 1}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
