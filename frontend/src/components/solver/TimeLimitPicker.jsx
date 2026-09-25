import { TIME_LIMITS } from "../../lib/api";

const STYLES = {
  // กลุ่มปุ่มเล็กในแถบนำทาง (หน้า 3D / Benchmark)
  compact: {
    group: "flex gap-1 rounded-full border border-gray-200 p-1",
    button: "rounded-full px-3 py-1 text-xs disabled:cursor-not-allowed",
    on: "bg-gray-900 text-white",
    off: "text-gray-600 hover:text-gray-900",
  },
  // ปุ่มเต็มความกว้างในแผงอัปโหลดของหน้า Solver
  full: {
    group: "flex gap-2",
    button: "flex-1 rounded-full border px-3 py-1.5 text-sm disabled:cursor-not-allowed",
    on: "border-gray-900 bg-gray-900 text-white",
    off: "border-gray-300 text-gray-700 hover:border-gray-500",
  },
};

/** เลือกเวลาค้นหาของ solver ล็อกไว้ระหว่างคำนวณ ค่าที่แสดงจึงตรงกับ request ที่กำลังรันเสมอ */
export default function TimeLimitPicker({ value, onChange, disabled = false, variant = "compact" }) {
  const s = STYLES[variant];
  return (
    <div className={s.group} role="group" aria-label="เวลาค้นหา">
      {TIME_LIMITS.map((t) => (
        <button
          key={t}
          type="button"
          disabled={disabled}
          aria-pressed={value === t}
          onClick={() => onChange(t)}
          className={`${s.button} ${value === t ? s.on : s.off}`}
        >
          {t} s
        </button>
      ))}
    </div>
  );
}
