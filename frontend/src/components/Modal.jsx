import { useEffect, useRef } from "react";

const BUTTON = {
  primary: "bg-gray-900 text-white shadow-sm hover:bg-gray-700",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  secondary: "border border-gray-300 text-gray-700 hover:border-gray-500",
};

// ไอคอนหัวป็อปอัพ: วงกลมสีอ่อน + เส้นสีเข้มโทนเดียวกัน
const ICON = {
  success: { ring: "bg-green-50 text-green-600", path: "M5 12.5l4.5 4.5L19 7.5" },
  warning: { ring: "bg-amber-50 text-amber-600", path: "M12 8v5m0 3.5v.01M10.3 3.9L2.6 17.3A2 2 0 004.3 20.3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" },
  danger: { ring: "bg-red-50 text-red-600", path: "M4 7h16M10 11v6m4-6v6M5 7l1 12a2 2 0 002 2h8a2 2 0 002-2l1-12M9 7V4h6v3" },
};

/**
 * ป็อปอัพกลางจอ (ใช้ <dialog> ของเบราว์เซอร์: พื้นหลังมืด, โฟกัสอยู่ในป็อปอัพ, Esc ปิดได้)
 * - mount = เปิด / ปิดด้วย Esc, คลิกพื้นหลัง หรือกดปุ่มใน actions แล้วเรียก onClose (ผู้เรียก unmount เอง)
 * - icon: "success" | "warning" | "danger" (ไม่ใส่ = ไม่มีไอคอน)
 * - actions: [{ label, variant: "primary" | "danger" | "secondary", onClick? }] กดแล้วรัน onClick แล้วปิด
 *   ปุ่มแรกได้โฟกัส (ป็อปอัพยืนยันจึงควรวาง "ยกเลิก" ไว้แรก กด Enter พลาดจะไม่ลบ)
 */
export default function Modal({ icon, title, subtitle, onClose, actions, children }) {
  const ref = useRef(null);
  const firstActionRef = useRef(null);

  useEffect(() => {
    ref.current?.showModal();
    // โฟกัสปุ่มเอง: ไม่งั้นเบราว์เซอร์โฟกัสส่วนที่เลื่อนได้แทน (มีกรอบดำรอบเนื้อหา)
    firstActionRef.current?.focus();
  }, []);

  const close = () => ref.current?.close();
  const ic = ICON[icon];

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // คลิกพื้นหลังมืด (นอกกล่อง) = ปิด
      onClick={(e) => e.target === ref.current && close()}
      aria-labelledby="modal-title"
      className="w-[min(28rem,calc(100%-2rem))] rounded-3xl p-0 text-gray-900 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      <div className="flex max-h-[85vh] flex-col px-6 pb-6 pt-8 sm:px-8">
        {/* ── หัว: ไอคอน + หัวข้อ + คำอธิบาย (จัดกลาง) ── */}
        <div className="flex flex-col items-center text-center">
          {ic && (
            <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${ic.ring}`}>
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
                <path d={ic.path} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          )}
          <h2 id="modal-title" className="text-xl font-semibold">
            {title}
          </h2>
          {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{subtitle}</p>}
        </div>

        {/* ── เนื้อหา (ยาวเกินจะเลื่อนดูได้) ── */}
        {children && <div className="-mx-1 mt-5 overflow-y-auto px-1">{children}</div>}

        {/* ── ปุ่ม: เต็มความกว้าง แบ่งเท่ากัน ── */}
        <div className="mt-6 flex gap-3">
          {actions.map((a, i) => (
            <button
              key={a.label}
              ref={i === 0 ? firstActionRef : undefined}
              type="button"
              onClick={() => {
                a.onClick?.();
                close();
              }}
              className={`flex-1 rounded-full px-5 py-2.5 text-sm font-medium transition-colors ${BUTTON[a.variant ?? "primary"]}`}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </dialog>
  );
}
