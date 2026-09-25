import { useEffect, useRef, useState } from "react";
import RouteMap from "./RouteMap";
import RouteCard from "./RouteCard";
import Stat from "./Stat";
import TimeLimitPicker from "./TimeLimitPicker";
import { useFileDrop } from "./useFileDrop";
import { useSolver } from "./useSolver";
import { GAP_THRESHOLD } from "../../lib/api";
import { fmt, vehicleNote } from "../../lib/format";

export default function SolverSection() {
  const inputRef = useRef(null);
  const { file, timeLimit, setTimeLimit, loading, error, result, solve } = useSolver();
  const { dragging, dropProps } = useFileDrop(solve, loading);
  const [active, setActive] = useState(null); // index ของเส้นทางที่ชี้อยู่ (ไฮไลต์)

  useEffect(() => {
    setActive(null);
  }, [result]);

  const gapOk = result?.gap != null && result.gap < GAP_THRESHOLD;

  return (
    <section className="bg-white px-[8vw] pb-24 pt-12 text-gray-900">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-3 text-xs tracking-[0.3em] text-gray-500">ROUTE SOLVER</p>
          <h2 className="font-['Archivo'] text-3xl font-bold uppercase leading-tight [font-stretch:125%] md:text-4xl">
            Drop a .vrp file.
            <br />
            Get the route.
          </h2>
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-gray-500">
          อัปโหลดไฟล์ CVRP (รูปแบบ CVRPLIB) ระบบจะหาเส้นทางด้วย Google OR-Tools แล้วแสดงระยะทาง
          ค่า gap เทียบ optimal และแผนที่เส้นทางของรถแต่ละคัน
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        {/* ── ฝั่งอัปโหลด ── */}
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            {...dropProps}
            disabled={loading}
            className={`flex min-h-[12rem] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragging ? "border-gray-900 bg-gray-50" : "border-gray-300 hover:border-gray-500"
            } ${loading ? "cursor-wait opacity-60" : ""}`}
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-medium">{dragging ? "ปล่อยไฟล์ตรงนี้" : "ลากไฟล์ .vrp มาวาง หรือคลิกเพื่อเลือก"}</span>
            {file && <span className="text-xs text-gray-500">{file.name}</span>}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".vrp"
            className="hidden"
            onChange={(e) => {
              solve(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          <div>
            <div className="mb-2 text-xs text-gray-500">เวลาค้นหา (ยิ่งนาน gap ยิ่งต่ำ)</div>
            <TimeLimitPicker value={timeLimit} onChange={setTimeLimit} disabled={loading} variant="full" />
          </div>

          <button
            type="button"
            onClick={() => (file ? solve(file) : inputRef.current?.click())}
            disabled={loading}
            className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {loading ? `กำลังคำนวณ… (สูงสุด ${timeLimit} s)` : file ? "คำนวณใหม่" : "เลือกไฟล์แล้วคำนวณ"}
          </button>

          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        {/* ── ตัวเลขสรุป ── */}
        {result ? (
          <div className={`grid min-w-0 auto-rows-fr grid-cols-2 gap-3 sm:grid-cols-3 ${loading ? "opacity-50" : ""}`}>
            <Stat label="Instance" value={result.name} note={`${result.nodes.length - 1} ลูกค้า`} />
            <Stat label="ระยะทางรวม" value={fmt(result.distance)} />
            <Stat label="Optimal" value={result.optimal ?? "—"} />
            <Stat
              label="Gap"
              value={result.gap == null ? "—" : `${fmt(result.gap)} %`}
              note={result.gap == null ? "ไม่มีค่า optimal" : gapOk ? `ต่ำกว่า ${GAP_THRESHOLD} %` : `△ สูงกว่า ${GAP_THRESHOLD} %`}
            />
            <Stat label="จำนวนรถ" value={result.routes.length} note={vehicleNote(result)} />
            <Stat
              label="เวลาคำนวณ"
              value={`${fmt(result.elapsed, 1)} s`}
              note={result.feasible ? "Feasible" : "✕ เกินความจุ"}
            />
          </div>
        ) : (
          <div className="flex min-h-[16rem] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-6 text-center text-sm text-gray-500">
            {loading ? "กำลังคำนวณเส้นทาง…" : "ผลลัพธ์และแผนที่เส้นทางจะแสดงตรงนี้"}
          </div>
        )}
      </div>

      {/* ── แผนที่เต็มความกว้าง แล้วการ์ดรถรายคันเรียงด้านล่าง ── */}
      {result && (
        <div className={`mt-6 flex flex-col gap-4 ${loading ? "opacity-50" : ""}`}>
          <RouteMap result={result} active={active} onActive={setActive} />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {result.routes.map((r, i) => (
              <RouteCard key={i} route={r} index={i} capacity={result.capacity} active={active === i} onActive={setActive} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
