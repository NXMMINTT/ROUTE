import { routeColor } from "./colors";

function Depot() {
  return <span className="rounded bg-gray-900 px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-white">DEPOT</span>;
}

function Arrow() {
  return (
    <svg viewBox="0 0 8 8" className="h-2 w-2 shrink-0 text-gray-400" aria-hidden="true">
      <path d="M2 1l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** การ์ดสรุปรถ 1 คัน: โหลดเทียบความจุ + ลำดับจุดส่ง (ใช้ทั้งหน้า Solver และหน้า 3D) */
export default function RouteCard({ route, index, capacity, active, onActive }) {
  const pct = (route.load / capacity) * 100;
  return (
    <div
      onMouseEnter={() => onActive(index)}
      onMouseLeave={() => onActive(null)}
      className={`rounded-xl border bg-white px-4 py-3 transition-colors ${active ? "border-gray-900" : "border-gray-200"}`}
    >
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 font-medium">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: routeColor(index) }} />
          Route {index + 1}
        </span>
        <span className="tabular-nums text-gray-500">{Math.round(pct)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: routeColor(index) }} />
      </div>
      <div className="mt-2 flex justify-between text-xs text-gray-500">
        <span className="tabular-nums">
          บรรทุก {route.load}/{capacity}
        </span>
        <span>{route.stops.length} จุดส่ง</span>
      </div>
      {/* ลำดับการวิ่ง: ออกจาก depot → จุดส่งตามลำดับ → กลับ depot */}
      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1.5" aria-label={`ลำดับการวิ่ง: depot, ${route.stops.join(", ")}, depot`}>
        <Depot />
        {route.stops.map((id) => (
          <span key={id} className="contents">
            <Arrow />
            <span className="rounded border border-gray-200 px-1.5 py-0.5 text-xs tabular-nums text-gray-700">{id}</span>
          </span>
        ))}
        <Arrow />
        <Depot />
      </div>
    </div>
  );
}
