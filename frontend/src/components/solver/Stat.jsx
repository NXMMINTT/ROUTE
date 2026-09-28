/** การ์ดตัวเลขสรุป: ชื่อ / ค่า / หมายเหตุใต้ค่า (ใช้ทุกหน้า) */
export default function Stat({ label, value, note }) {
  return (
    <div className="flex flex-col justify-between gap-2 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div>
        <div className="text-xl font-semibold tabular-nums text-gray-900">{value}</div>
        {/* เว้นบรรทัดไว้เสมอ ตัวเลขทุกการ์ดในแถวเดียวกันจะอยู่ระดับเดียวกัน */}
        <div className="mt-0.5 text-xs text-gray-500">{note ?? " "}</div>
      </div>
    </div>
  );
}
