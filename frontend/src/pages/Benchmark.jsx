import { useCallback, useEffect, useRef, useState } from "react";
import AppNav from "../components/AppNav";
import GapChart from "../components/benchmark/GapChart";
import InstanceUploader from "../components/benchmark/InstanceUploader";
import OptimalCell from "../components/benchmark/OptimalCell";
import { downloadCsv } from "../components/benchmark/csv";
import Stat from "../components/solver/Stat";
import TimeLimitPicker from "../components/solver/TimeLimitPicker";
import { GAP_THRESHOLD as THRESHOLD, requestJson } from "../lib/api";
import { extraVehicles, fmt } from "../lib/format";
import { saveLast } from "../lib/lastResult";

const KEY = "route-benchmark:last";
const API = "/api/benchmark/instances";
const instanceUrl = (name) => `${API}/${encodeURIComponent(name)}`;

function loadRows() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY)) ?? {};
    // แถวที่ค้างสถานะ "running" มาจากรอบที่ออกจากหน้าไประหว่างรัน (รอบนั้นถูกยกเลิกแล้ว) ถือว่ายังไม่ได้รัน
    return Object.fromEntries(Object.entries(saved).filter(([, row]) => row?.status !== "running"));
  } catch {
    return {};
  }
}

function saveRows(rows) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(rows));
  } catch {
    // ไม่จำผลข้ามหน้าก็ได้
  }
}

/** gap คิดจากค่า optimal ปัจจุบันของ instance (ผู้ใช้แก้ค่า optimal หลังรันแล้ว gap ต้องเปลี่ยนตาม ไม่ต้องรันใหม่) */
function gapOf(instance, result) {
  if (!result || !instance.optimal) return null;
  return ((result.distance - instance.optimal) / instance.optimal) * 100;
}

function Status({ row, gap }) {
  if (!row) return <span className="text-gray-400">—</span>;
  if (row.status === "running") return <span className="text-gray-500">กำลังรัน…</span>;
  if (row.status === "error") return <span className="text-red-700" title={row.error}>✕ ผิดพลาด</span>;
  const r = row.result;
  return (
    <span className="flex flex-col">
      <GapStatus feasible={r.feasible} gap={gap} />
      {extraVehicles(r) > 0 && (
        <span className="text-[11px] text-amber-700" title="จำนวนรถที่ไฟล์ระบุส่งของได้ไม่หมด จึงต้องใช้รถเพิ่ม">
          ใช้รถ {r.routes.length} คัน (ไฟล์ระบุ {r.vehicles_stated})
        </span>
      )}
    </span>
  );
}

function GapStatus({ feasible, gap }) {
  if (!feasible) return <span className="text-red-700">✕ เกินความจุ</span>;
  if (gap == null) return <span className="text-gray-500">ไม่มี optimal</span>;
  return gap < THRESHOLD ? <span className="text-green-700">✓ ผ่าน</span> : <span className="text-amber-700">△ เกิน {THRESHOLD} %</span>;
}

const linkBtn = "underline underline-offset-4 hover:text-gray-500 disabled:cursor-not-allowed disabled:text-gray-300 disabled:no-underline";

export default function Benchmark() {
  const [instances, setInstances] = useState([]);
  const [samples, setSamples] = useState(0); // จำนวนไฟล์ในชุดตัวอย่างที่ backend มีให้เพิ่ม
  const [loaded, setLoaded] = useState(false); // โหลดรายชื่อครั้งแรกเสร็จแล้ว (กันสถานะว่างแวบขึ้นก่อนข้อมูลมา)
  const [rows, setRows] = useState(loadRows);
  const [timeLimit, setTimeLimit] = useState(10);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } ของรอบที่กำลังรัน
  const [error, setError] = useState("");
  const runRef = useRef(null); // AbortController ของรอบที่กำลังรัน

  const reload = useCallback(async (signal) => {
    const j = await requestJson(API, { signal });
    setInstances(j.instances);
    setSamples(j.samples ?? 0);
    setLoaded(true);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    const controller = new AbortController();
    reload(controller.signal).catch((e) => e.name !== "AbortError" && setError(e.message));
    // ออกจากหน้า: หยุดทั้งการโหลดรายชื่อและรอบที่กำลังรัน ไม่ให้ backend คำนวณต่อโดยไม่มีใครดู
    return () => {
      controller.abort();
      runRef.current?.abort();
    };
  }, [reload]);

  function updateRows(fn) {
    setRows((prev) => {
      const next = fn(prev);
      saveRows(next);
      return next;
    });
  }
  const setRow = (name, row) =>
    updateRows((prev) => {
      const next = { ...prev };
      if (row) next[name] = row;
      else delete next[name];
      return next;
    });

  /** รันทีละตัวตามลำดับ ให้เห็นความคืบหน้า และไม่แย่ง CPU กันเอง */
  async function run(names) {
    const controller = new AbortController();
    runRef.current = controller;
    setRunning(true);
    setError("");
    const limit = timeLimit;
    for (const [i, name] of names.entries()) {
      setProgress({ done: i, total: names.length });
      const previous = rows[name];
      setRow(name, { status: "running", timeLimit: limit });
      try {
        const result = await requestJson(`${instanceUrl(name)}/run?time_limit=${limit}`, { method: "POST", signal: controller.signal });
        // กดหยุดตอนกำลังอ่าน body: requestJson ไม่ throw แต่ได้ผลว่าง ถือเป็นการหยุดเหมือนกัน
        if (controller.signal.aborted) throw new DOMException("aborted", "AbortError");
        setRow(name, { status: "done", result, timeLimit: limit });
      } catch (e) {
        if (e.name === "AbortError") {
          setRow(name, previous); // กดหยุด: แถวที่รันค้างอยู่กลับไปเป็นผลเดิม
          break;
        }
        setRow(name, { status: "error", error: e.message, timeLimit: limit });
      }
    }
    if (runRef.current === controller) {
      setRunning(false);
      setProgress(null);
    }
  }

  function stop() {
    runRef.current?.abort();
    setRunning(false);
    setProgress(null);
  }

  async function act(fn) {
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }

  const removeInstance = (it) =>
    act(async () => {
      if (!window.confirm(`ลบ instance ${it.name}? (ลบไฟล์ออกจากคลังพร้อมผลการรันของไฟล์นี้)`)) return;
      await requestJson(instanceUrl(it.name), { method: "DELETE" });
      setRow(it.name, null);
      await reload();
    });

  const saveOptimal = (it, optimal) =>
    act(async () => {
      const updated = await requestJson(`${instanceUrl(it.name)}/optimal`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optimal }),
      });
      setInstances((list) => list.map((x) => (x.name === it.name ? updated : x)));
    });

  function onUploaded(added) {
    // ไฟล์ที่แทนที่ของเดิม: ผลการรันเก่าไม่ตรงกับไฟล์ใหม่แล้ว
    updateRows((prev) => {
      const next = { ...prev };
      added.forEach((a) => a.replaced && delete next[a.name]);
      return next;
    });
    act(() => reload());
  }

  function openIn(it, result, hash) {
    const gap = gapOf(it, result);
    saveLast({ ...result, optimal: it.optimal ?? null, gap });
    window.location.hash = hash;
  }

  // ── ตัวเลขสรุป (นับเฉพาะ instance ที่ยังอยู่ในคลัง) ──
  const records = instances
    .filter((it) => rows[it.name]?.status === "done")
    .map((it) => ({ instance: it, row: rows[it.name], gap: gapOf(it, rows[it.name].result) }));
  const withGap = records.filter((r) => r.gap != null);
  const gaps = withGap.map((r) => r.gap);
  const passed = withGap.filter((r) => r.row.result.feasible && r.gap < THRESHOLD).length;
  const noOptimal = instances.filter((it) => !it.optimal).length;
  const limitsUsed = [...new Set(records.map((r) => r.row.timeLimit).filter(Boolean))].sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <AppNav current="#/benchmark">
        <TimeLimitPicker value={timeLimit} onChange={setTimeLimit} disabled={running} />
        {running ? (
          <button type="button" onClick={stop} className="rounded-full border border-gray-900 px-4 py-2 text-sm font-medium hover:bg-gray-50">
            หยุด ({progress ? `${progress.done}/${progress.total}` : "…"})
          </button>
        ) : (
          <button
            type="button"
            onClick={() => run(instances.map((it) => it.name))}
            disabled={!instances.length}
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:bg-gray-400"
          >
            รันทั้งหมด ({instances.length})
          </button>
        )}
      </AppNav>

      <section className="px-[8vw] pb-24 pt-12">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-3 text-xs tracking-[0.3em] text-gray-500">BENCHMARK</p>
            <h2 className="font-['Archivo'] text-3xl font-bold uppercase leading-tight [font-stretch:125%] md:text-4xl">
              Every instance.
              <br />
              Under {THRESHOLD} % gap.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-relaxed text-gray-500">
            เพิ่มไฟล์ .vrp ของคุณเข้าคลัง แล้วรันทุกไฟล์ด้วยเวลาค้นหาเท่ากัน เทียบระยะทางกับค่า optimal
            (ไฟล์ที่ไม่มีค่า optimal กรอก best known solution เองได้ในตาราง) เกณฑ์ผ่านคือ gap ต่ำกว่า {THRESHOLD} % และไม่เกินความจุรถ
          </p>
        </div>

        {error && (
          <p role="alert" className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat
            label={`ผ่านเกณฑ์ gap < ${THRESHOLD} %`}
            value={withGap.length ? `${passed} / ${withGap.length}` : "—"}
            note={`รันแล้ว ${records.length} / ${instances.length}${noOptimal ? ` · ไม่มี optimal ${noOptimal}` : ""}`}
          />
          <Stat label="Gap เฉลี่ย" value={gaps.length ? `${fmt(gaps.reduce((a, b) => a + b, 0) / gaps.length)} %` : "—"} />
          <Stat label="Gap สูงสุด" value={gaps.length ? `${fmt(Math.max(...gaps))} %` : "—"} />
          <Stat
            label="เวลารวม"
            value={records.length ? `${fmt(records.reduce((a, r) => a + r.row.result.elapsed, 0), 1)} s` : "—"}
            note={
              !limitsUsed.length ? undefined : limitsUsed.length === 1 ? `จำกัด ${limitsUsed[0]} s / instance` : `จำกัด ${limitsUsed.join(", ")} s (ผสมกัน)`
            }
          />
        </div>

        <div className="mb-6">
          <InstanceUploader onUploaded={onUploaded} samples={samples} disabled={running} />
        </div>

        {loaded && !instances.length ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-6 text-center">
            <div className="text-sm font-medium">ยังไม่มี instance ในคลัง</div>
            <p className="max-w-md text-xs leading-relaxed text-gray-500">
              ลากไฟล์ .vrp มาวางในช่องด้านบนเพื่อเริ่ม
              {samples > 0 && " หรือกด “เพิ่มชุดตัวอย่าง CVRPLIB” เพื่อลองกับชุดทดสอบมาตรฐานที่รู้ค่า optimal อยู่แล้ว"}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {withGap.length ? (
              <GapChart items={withGap.map((r) => ({ name: r.instance.name, gap: r.gap }))} />
            ) : (
              <div className="flex min-h-[6rem] items-center justify-center rounded-2xl border border-gray-200 bg-gray-50 px-6 text-center text-sm text-gray-500">
                กด “รันทั้งหมด” ด้านบน หรือ “รัน” รายตัวในตาราง แล้วกราฟ gap จะแสดงตรงนี้
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-gray-200">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-gray-500">
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-2 font-normal">
                      Instance <span className="text-gray-400">({instances.length})</span>
                    </th>
                    <th className="px-4 py-2 text-right font-normal">ลูกค้า</th>
                    <th className="px-4 py-2 text-right font-normal">ระยะทาง</th>
                    <th className="px-4 py-2 text-right font-normal">Optimal</th>
                    <th className="px-4 py-2 text-right font-normal">Gap</th>
                    <th className="px-4 py-2 text-right font-normal">เวลา / จำกัด</th>
                    <th className="px-4 py-2 font-normal">สถานะ</th>
                    <th className="px-4 py-2 text-right font-normal">
                      {records.length > 0 && (
                        <button type="button" onClick={() => downloadCsv(records)} className={linkBtn}>
                          Export CSV
                        </button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {instances.map((it) => {
                    const row = rows[it.name];
                    const r = row?.status === "done" ? row.result : null;
                    const gap = gapOf(it, r);
                    return (
                      <tr key={it.name} className="border-b border-gray-100 last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium">
                          {it.name}
                        </td>
                        <td className="px-4 py-2.5 text-right">{it.customers}</td>
                        <td className="px-4 py-2.5 text-right">{r ? fmt(r.distance) : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <OptimalCell instance={it} onSave={(v) => saveOptimal(it, v)} disabled={running} />
                        </td>
                        <td className="px-4 py-2.5 text-right">{gap != null ? `${fmt(gap)} %` : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">{r ? `${fmt(r.elapsed, 1)} / ${row.timeLimit ?? "?"} s` : "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <Status row={row} gap={gap} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-right">
                          <span className="flex justify-end gap-3 text-xs">
                            <button type="button" disabled={running} onClick={() => run([it.name])} className={linkBtn}>
                              รัน
                            </button>
                            {r && (
                              <>
                                <button type="button" onClick={() => openIn(it, r, "#/solve")} className={linkBtn}>
                                  แผนที่
                                </button>
                                <button type="button" onClick={() => openIn(it, r, "#/3d")} className={linkBtn}>
                                  3D
                                </button>
                              </>
                            )}
                            <button type="button" disabled={running} onClick={() => removeInstance(it)} className={`${linkBtn} text-red-700`}>
                              ลบ
                            </button>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
