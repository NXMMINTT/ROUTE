import { useRef, useState } from "react";
import { useFileDrop } from "../solver/useFileDrop";
import { requestJson } from "../../lib/api";

/**
 * เพิ่ม instance เข้าคลัง: ลากไฟล์ .vrp มาวางหรือเลือกไฟล์ (หลายไฟล์ได้) แล้วแสดงผลรายไฟล์
 * samples = จำนวนไฟล์ในชุดตัวอย่าง CVRPLIB ที่ backend มีให้ (มี = แสดงปุ่มเพิ่มชุดตัวอย่าง)
 */
export default function InstanceUploader({ onUploaded, samples = 0, disabled = false }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null); // { added, errors } ของการอัปโหลดครั้งล่าสุด

  async function upload(files) {
    if (!files.length) return;
    const body = new FormData();
    files.forEach((f) => body.append("files", f));
    await send("/api/benchmark/instances", { method: "POST", body });
  }

  async function send(url, opts) {
    setBusy(true);
    setReport(null);
    try {
      const json = await requestJson(url, opts);
      setReport(json);
      if (json.added.length) onUploaded(json.added);
    } catch (e) {
      setReport({ added: [], errors: [{ file: "", error: e.message }] });
    } finally {
      setBusy(false);
    }
  }

  const locked = disabled || busy;
  const { dragging, dropProps } = useFileDrop(upload, locked, { multiple: true });
  const replaced = report?.added.filter((a) => a.replaced).length ?? 0;

  return (
    <div className="flex flex-col gap-2">
      <div
        {...dropProps}
        className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed px-5 py-4 transition-colors ${
          dragging ? "border-gray-900 bg-gray-50" : "border-gray-300"
        } ${locked ? "opacity-60" : ""}`}
      >
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0 text-gray-500" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="text-sm font-medium">{busy ? "กำลังอัปโหลด…" : dragging ? "ปล่อยไฟล์ตรงนี้" : "เพิ่ม instance ของคุณ — ลากไฟล์ .vrp มาวาง (หลายไฟล์ได้)"}</div>
            <div className="text-xs text-gray-500">
              รูปแบบ CVRPLIB (EUC_2D) · ชื่อ instance มาจาก NAME ในไฟล์ · ชื่อซ้ำกับที่เคยอัปโหลด = แทนที่ของเดิม
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {samples > 0 && (
            <button
              type="button"
              disabled={locked}
              onClick={() => send("/api/benchmark/samples", { method: "POST" })}
              title="เพิ่มไฟล์ตัวอย่างจากชุดทดสอบมาตรฐาน CVRPLIB (มีค่า optimal ในไฟล์) — ลบออกได้ภายหลัง"
              className="text-xs text-gray-600 underline underline-offset-4 hover:text-gray-900 disabled:cursor-not-allowed"
            >
              เพิ่มชุดตัวอย่าง CVRPLIB ({samples})
            </button>
          )}
          <button
            type="button"
            disabled={locked}
            onClick={() => inputRef.current?.click()}
            className="rounded-full border border-gray-300 px-4 py-1.5 text-sm hover:border-gray-500 disabled:cursor-not-allowed"
          >
            เลือกไฟล์
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".vrp"
          multiple
          className="hidden"
          onChange={(e) => {
            upload([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      {report?.added.length > 0 && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          เพิ่ม {report.added.length} instance{replaced > 0 && ` (แทนที่ของเดิม ${replaced})`}: {report.added.map((a) => a.name).join(", ")}
        </p>
      )}
      {report?.errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <div className="mb-1 font-medium">เพิ่มไม่ได้ {report.errors.length} ไฟล์</div>
          <ul className="list-inside list-disc text-xs">
            {report.errors.map((e, i) => (
              <li key={i}>
                {e.file && <span className="font-medium">{e.file}: </span>}
                {e.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
