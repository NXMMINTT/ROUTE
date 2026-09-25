import { useRef, useState } from "react";

/**
 * ช่อง Optimal ในตาราง: กดเพื่อกรอก/แก้ค่า optimal (best known solution) — เว้นว่างแล้วบันทึก = ลบค่าที่กรอกไว้
 * กลับไปใช้ค่าในไฟล์ (ถ้ามี)
 */
export default function OptimalCell({ instance, onSave, disabled = false }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  // ออกจากโหมดแก้ไขแล้ว (Enter/Esc/blur): บางเบราว์เซอร์ยิง blur ตอน input ถูกถอดออก กันไม่ให้บันทึกซ้ำหรือบันทึกตอนกด Esc
  const closedRef = useRef(false);

  if (!editing) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setValue(instance.optimal ?? "");
          closedRef.current = false;
          setEditing(true);
        }}
        title={instance.optimal_source === "manual" ? "ค่าที่กรอกเอง — กดเพื่อแก้" : "กดเพื่อกรอกค่า optimal / best known solution"}
        className="underline decoration-gray-300 decoration-dotted underline-offset-4 hover:decoration-gray-900 disabled:no-underline"
      >
        {instance.optimal ?? <span className="text-gray-500">+ ใส่ค่า</span>}
        {instance.optimal_source === "manual" && <span className="ml-1 text-[10px] text-gray-400">กรอกเอง</span>}
      </button>
    );
  }

  function close() {
    closedRef.current = true;
    setEditing(false);
  }

  function commit() {
    if (closedRef.current) return;
    close();
    const text = String(value).trim();
    const next = text === "" ? null : Number(text);
    if (next === (instance.optimal_source === "manual" ? instance.optimal : null)) return; // ไม่ได้เปลี่ยน
    if (next !== null && !(next > 0)) return; // ค่าใช้ไม่ได้: ทิ้งไป
    onSave(next);
  }

  return (
    <form
      className="inline-flex justify-end"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        type="number"
        step="any"
        min="0"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Escape" && close()}
        placeholder="เช่น 784"
        aria-label={`ค่า optimal ของ ${instance.name}`}
        className="w-24 rounded-md border border-gray-300 px-2 py-0.5 text-right text-sm tabular-nums focus:border-gray-900 focus:outline-none"
      />
    </form>
  );
}
