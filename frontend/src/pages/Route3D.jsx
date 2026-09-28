import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import RouteScene, { EmptyScene } from "../components/route3d/RouteScene";
import AppNav from "../components/AppNav";
import CanvasErrorBoundary from "../components/CanvasErrorBoundary";
import LoadingScreen from "../components/LoadingScreen";
import { SceneReady, useSceneLoading } from "../components/useSceneLoading";
import RouteCard from "../components/solver/RouteCard";
import Stat from "../components/solver/Stat";
import TimeLimitPicker from "../components/solver/TimeLimitPicker";
import { routeColor } from "../components/solver/colors";
import { useFileDrop } from "../components/solver/useFileDrop";
import { useSolver } from "../components/solver/useSolver";
import { ACCEPT, GAP_THRESHOLD } from "../lib/api";
import { fmt, gapNote, vehicleNote } from "../lib/format";

/**
 * ฉาก 3D: ยังไม่มีผลลัพธ์ = เกาะเปล่ารอข้อมูล (ไม่มีโมเดลให้โหลด จึงไม่มีหน้ารอโหลด)
 * มีผลลัพธ์ = ตึก/รถ พร้อมหน้ารอโหลดโมเดล — ผู้เรียกใส่ key ตามโหมด ให้หน้ารอโหลดเริ่มนับใหม่ตอนมีผลลัพธ์ครั้งแรก
 */
function RouteCanvas({ result, active, onActive }) {
  const loading = useSceneLoading();
  return (
    <>
      <CanvasErrorBoundary fallback={<p className="p-6 text-sm text-gray-500">เบราว์เซอร์นี้แสดงภาพ 3D ไม่ได้</p>} onError={loading.markReady}>
        <Canvas dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
          <Suspense fallback={null}>
            {result ? <RouteScene result={result} active={active} onActive={onActive} /> : <EmptyScene />}
            <SceneReady onReady={loading.markReady} />
          </Suspense>
        </Canvas>
      </CanvasErrorBoundary>
      {result && <LoadingScreen inline progress={loading.progress} label="กำลังโหลดโมเดล 3D" done={loading.done} />}
    </>
  );
}

/** การ์ดด้านล่างฉากตอนยังไม่มีผลลัพธ์: บอกว่าต้องอัปโหลด / กำลังคำนวณ (ไม่บังกลางเกาะ และรอบการ์ดยังลากหมุนฉากได้) */
function EmptyPrompt({ loading, timeLimit }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-6">
      <div className="pointer-events-auto max-w-sm rounded-2xl border border-gray-200 bg-white/90 px-6 py-5 text-center shadow-sm backdrop-blur">
        {loading ? (
          <>
            <div className="text-sm font-medium">กำลังคำนวณเส้นทาง…</div>
            <div className="mt-1 text-xs text-gray-500">OR-Tools ค้นหาได้นานสุด {timeLimit} วินาที แล้วตึกและรถจะขึ้นบนเกาะนี้</div>
          </>
        ) : (
          <>
            <div className="text-sm font-medium">ยังไม่มีเส้นทางให้แสดง</div>
            <div className="mt-1 text-xs leading-relaxed text-gray-500">กดปุ่ม UPLOAD FILE ด้านบน หรือลากไฟล์มาวางบนเกาะ</div>
          </>
        )}
      </div>
    </div>
  );
}

/** แผงผลลัพธ์แบบว่าง: โครงเดียวกับตอนมีข้อมูล ผู้ใช้เห็นก่อนว่าจะได้ข้อมูลอะไรบ้าง */
function EmptyPanel({ loading }) {
  const pulse = loading ? "motion-safe:animate-pulse" : "";
  return (
    <>
      <div className="mb-3 flex items-baseline justify-between text-xs text-gray-500">
        <span className="font-medium">ผลการคำนวณ</span>
        <span>{loading ? "กำลังคำนวณ…" : "รอไฟล์"}</span>
      </div>
      <div className={`grid grid-cols-2 gap-3 ${pulse}`}>
        <Stat label="ระยะทางรวม" value="—" />
        <Stat label="จำนวนรถ" value="—" />
        <Stat label="Optimal" value="—" note="จุดส่ง —" />
        <Stat label="Gap" value="—" note={`เกณฑ์ < ${GAP_THRESHOLD} %`} />
        <Stat label="สถานะ" value="—" />
        <Stat label="Algorithm" value="GLS" note="Guided Local Search" />
      </div>

      <div className="mb-3 mt-6 text-xs font-medium text-gray-500">เส้นทางรถแต่ละคัน</div>
      <div className={`flex flex-col gap-3 ${pulse}`} aria-hidden="true">
        {[72, 55, 88].map((w, i) => (
          <div key={i} className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3">
            <div className="flex items-center justify-between text-sm text-gray-400">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-200" />
                Route {i + 1}
              </span>
              <span>—</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-gray-200" style={{ width: `${w}%` }} />
            </div>
            <div className="mt-3 flex gap-1.5">
              <span className="h-4 w-11 rounded bg-gray-200" />
              {Array.from({ length: 4 + i }, (_, k) => (
                <span key={k} className="h-4 w-6 rounded bg-gray-100" />
              ))}
              <span className="h-4 w-11 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-gray-400">เส้นทางของรถแต่ละคันจะแสดงตรงนี้</p>
    </>
  );
}

/** หน้า 3D View: แถบนำทาง (อัปโหลด/รันใหม่) + ฉาก 3D (ซ้าย) + แผงผลลัพธ์ (ขวา) */
export default function Route3D() {
  const inputRef = useRef(null);
  const { file, timeLimit, setTimeLimit, loading, error, result, solve } = useSolver();
  const { dragging, dropProps } = useFileDrop(solve, loading);
  const [active, setActive] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    setActive(null);
  }, [result]);

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900 lg:h-screen">
      <AppNav current="#/3d">
        <TimeLimitPicker value={timeLimit} onChange={setTimeLimit} disabled={loading} />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-wait disabled:bg-gray-400"
        >
          {loading ? "SOLVING…" : "UPLOAD FILE"}
        </button>
        {file && !loading && (
          <button type="button" onClick={() => solve(file)} className="rounded-full border border-gray-300 px-4 py-2 text-sm hover:border-gray-500">
            RE-RUN
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            solve(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </AppNav>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ── ฉาก 3D (ลากไฟล์มาวางตรงนี้ได้) + legend มุมซ้ายล่าง ── */}
        <main
          className="relative h-[55vh] min-h-0 sm:h-[65vh] bg-[radial-gradient(ellipse_at_50%_40%,#ffffff,#f1f3f5_75%)] lg:h-auto lg:flex-1"
          {...dropProps}
        >
          <RouteCanvas key={result ? "result" : "empty"} result={result} active={active} onActive={setActive} />
          {!result && <EmptyPrompt loading={loading} timeLimit={timeLimit} />}

          {dragging && (
            <div className="pointer-events-none absolute inset-4 flex items-center justify-center rounded-2xl border-2 border-dashed border-gray-900 bg-white/70 text-sm font-medium">
              ปล่อยไฟล์เพื่อคำนวณ
            </div>
          )}

          {error && (
            <p role="alert" className="absolute left-4 right-4 top-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 lg:right-auto lg:max-w-md">
              {error}
            </p>
          )}

          {result && (
            <div className="absolute bottom-4 left-4 hidden max-w-[calc(100%-2rem)] rounded-xl sm:block border border-gray-200 bg-white/90 px-4 py-3 text-xs text-gray-600 backdrop-blur">
              <div className="mb-2 text-gray-500">เส้นทางรถ</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 sm:flex-col">
                {result.routes.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onMouseLeave={() => setActive(null)}
                    className="flex items-center gap-2 text-gray-900"
                  >
                    <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: routeColor(i) }} />
                    Route {i + 1}
                    <span className="tabular-nums text-gray-500">({Math.round((r.load / result.capacity) * 100)}%)</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-200 pt-2">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[#14171c]" /> Depot
                </span>
                <span>ความสูงตึก = demand</span>
                <span>ลากเพื่อหมุน · สกรอลล์เพื่อซูม</span>
              </div>
            </div>
          )}
        </main>

        {/* ── แผงผลลัพธ์ (ยังไม่มีข้อมูล = โครงว่างรอ) ── */}
        <aside className={`min-h-0 w-full overflow-y-auto border-gray-200 bg-gray-50 p-5 lg:w-[23rem] lg:border-l ${loading && result ? "opacity-50" : ""}`}>
          {!result ? (
            <EmptyPanel loading={loading} />
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between text-xs text-gray-500">
                <span className="font-medium">ผลการคำนวณ</span>
                <span>{result.name} · CVRP + OR-Tools</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="ระยะทางรวม" value={fmt(result.distance)} />
                <Stat label="จำนวนรถ" value={result.routes.length} note={vehicleNote(result)} />
                <Stat label="Optimal" value={result.optimal ?? "—"} note={`${result.nodes.length - 1} จุดส่ง`} />
                <Stat
                  label="Gap"
                  value={result.gap == null ? "—" : `${fmt(result.gap)} %`}
                  note={gapNote(result)}
                />
                <Stat label="สถานะ" value={result.feasible ? "Feasible" : "✕ เกินความจุ"} />
                <Stat label="Algorithm" value={`GLS ${fmt(result.elapsed, 0)} s`} />
              </div>

              <div className="mb-3 mt-6 text-xs font-medium text-gray-500">เส้นทางรถแต่ละคัน</div>
              <div className="flex flex-col gap-3">
                {result.routes.map((r, i) => (
                  <RouteCard key={i} route={r} index={i} capacity={result.capacity} active={active === i} onActive={setActive} />
                ))}
              </div>

              {/* มือถือ: กล่อง legend บนฉากถูกซ่อน ย้ายวิธีใช้มาไว้ท้ายแผงแทน */}
              <p className="mt-6 text-xs leading-relaxed text-gray-500 sm:hidden">ความสูงตึก = demand · ลากนิ้วบนฉากเพื่อหมุน · ถ่างสองนิ้วเพื่อซูม</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
