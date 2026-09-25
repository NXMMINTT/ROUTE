import { useEffect, useState } from "react";

// เส้นทางในโลโก้โหลด: depot (ซ้ายล่าง) → จุดส่ง 4 จุด ตำแหน่งจุดคำนวณจากความยาวตามเส้นโค้งจริง (สัดส่วน at)
// จุดแต่ละจุดจึงเปลี่ยนเป็นสีเข้มตรงจังหวะที่เส้น/รถวิ่งไปถึงพอดี
const ROUTE = "M12 52 C44 52 56 18 92 18 S142 50 172 44 S214 16 228 20";
const DEPOT = [12, 52];
const STOPS = [
  { at: 0.2, x: 54, y: 32.4 },
  { at: 0.42, x: 102.7, y: 19 },
  { at: 0.66, x: 153.8, y: 43.1 },
  { at: 1, x: 228, y: 20 },
];
const CYCLE = "2.8s";
const DRAW_END = 0.65; // สัดส่วนของรอบที่ลากเส้นจนสุด ที่เหลือค้างไว้แล้วจางหายก่อนเริ่มรอบใหม่
const FADE_MS = 450;
// progress ที่ได้จาก three นับเป็น "จำนวนไฟล์" ไม่ใช่ byte: car.glb ไฟล์เดียว 4 MB จะกระโดด 0% → 99% ทีเดียว
// ระหว่างรอจึงให้แถบค่อยๆ ขยับเข้าหา CREEP_MAX% ตามเวลา (ค่าจริงสูงกว่าเมื่อไรใช้ค่าจริง) ไม่เกิน 99% จนกว่าจะเสร็จจริง
const CREEP_MAX = 90;
const CREEP_TAU_MS = 4000;
const INK = "#14171c";

/** ค่าประมาณความคืบหน้าตามเวลาที่ผ่านไป (อัปเดตทุก 200 ms เฉพาะตอนที่ยังโหลดอยู่) */
function useCreep(enabled) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const start = performance.now();
    const id = setInterval(() => setElapsed(performance.now() - start), 200);
    return () => clearInterval(id);
  }, [enabled]);
  return CREEP_MAX * (1 - Math.exp(-elapsed / CREEP_TAU_MS));
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** แอนิเมชันใช้ SMIL ทั้งหมด (นาฬิกาเดียวกัน) เส้น รถ และจุดส่งจึงไม่เหลื่อมกันแม้วนหลายรอบ */
function RouteMark({ still }) {
  const loop = { dur: CYCLE, repeatCount: "indefinite" };
  return (
    <svg viewBox="0 0 240 64" className="h-auto w-60" aria-hidden="true">
      <path d={ROUTE} fill="none" stroke="#d3d7dc" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
      <path d={ROUTE} fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={still ? 0 : 1}>
        {!still && (
          <>
            <animate attributeName="stroke-dashoffset" values="1;0;0" keyTimes={`0;${DRAW_END};1`} {...loop} />
            <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" {...loop} />
          </>
        )}
      </path>

      {STOPS.map((s) => (
        <circle key={s.at} cx={s.x} cy={s.y} r="3.5" fill={still ? INK : "#ffffff"} stroke={INK} strokeWidth="1.5">
          {!still && (
            <animate
              attributeName="fill"
              values={`#ffffff;#ffffff;${INK};${INK};#ffffff`}
              keyTimes={`0;${(s.at * DRAW_END - 0.001).toFixed(3)};${(s.at * DRAW_END).toFixed(3)};0.85;1`}
              calcMode="discrete"
              {...loop}
            />
          )}
        </circle>
      ))}
      <rect x={DEPOT[0] - 5} y={DEPOT[1] - 5} width="10" height="10" rx="2" fill={INK} />

      {/* รถ: กล่องเล็กวิ่งตามเส้น หันหัวตามโค้ง (rotate=auto) */}
      {!still && (
        <g>
          <rect x="-6" y="-3.5" width="12" height="7" rx="2" fill={INK} />
          <rect x="2.5" y="-2.5" width="2.5" height="5" rx="0.8" fill="#ffffff" opacity="0.85" />
          <animateMotion path={ROUTE} rotate="auto" keyPoints="0;1;1" keyTimes={`0;${DRAW_END};1`} calcMode="linear" {...loop} />
          <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.85;1" {...loop} />
        </g>
      )}
    </svg>
  );
}

/**
 * หน้ารอโหลด
 * - progress: 0..100 แสดงแถบความคืบหน้า / null = ไม่รู้ความคืบหน้า (แถบวิ่งวน)
 * - done: true แล้วจะจางหายเองแล้วเลิก render
 * - delay: รอกี่ ms ก่อนค่อยๆ ปรากฏ (โหลดเร็วจะไม่เห็นหน้านี้แวบขึ้นมา) ไม่ระบุ = ขึ้นทันทีไม่ fade-in
 * - inline: คลุมเฉพาะกล่องแม่ (ต้องเป็น relative) แทนการคลุมทั้งจอ
 */
export default function LoadingScreen({ progress = null, label = "กำลังโหลด…", done = false, delay, inline = false }) {
  const [gone, setGone] = useState(done);
  const [still] = useState(prefersReducedMotion);
  const creep = useCreep(progress != null && !done);

  useEffect(() => {
    if (!done) {
      setGone(false);
      return;
    }
    const t = setTimeout(() => setGone(true), FADE_MS);
    return () => clearTimeout(t);
  }, [done]);

  if (gone) return null;

  const pct = progress == null ? null : progress >= 100 ? 100 : Math.round(Math.min(99, Math.max(progress, creep)));
  const motion = done ? "ld-out" : delay != null ? "ld-in" : "";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!done}
      style={delay != null ? { animationDelay: `${delay}ms` } : undefined}
      className={`${inline ? "absolute" : "fixed"} inset-0 z-50 flex flex-col items-center justify-center gap-7 bg-white px-6 text-gray-900 ${motion}`}
    >
      <div className="font-['Archivo'] text-sm font-bold tracking-[0.35em] [font-stretch:125%]">R O U T E</div>
      <RouteMark still={still} />
      <div className="flex w-60 flex-col items-center gap-2.5">
        <div className="relative h-[2px] w-full overflow-hidden rounded-full bg-gray-200">
          {pct == null ? (
            <div className={`absolute inset-y-0 w-1/3 rounded-full bg-gray-900 ${still ? "left-1/3" : "ld-indeterminate"}`} />
          ) : (
            <div className="h-full rounded-full bg-gray-900 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
          )}
        </div>
        <div className="flex w-full justify-between text-xs text-gray-500">
          <span>{label}</span>
          {pct != null && <span className="tabular-nums">{pct}%</span>}
        </div>
      </div>
    </div>
  );
}
