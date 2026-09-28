import Modal from "../Modal";

/**
 * ป็อปอัพสรุปผลการเพิ่มไฟล์เข้าคลัง: ไฟล์ที่เพิ่มไม่ได้ (พร้อมสาเหตุรายไฟล์) + ไฟล์ที่เพิ่มแล้ว
 * report: { added: [{ file, name, replaced }], errors: [{ file, error }] }
 */
export default function UploadReportModal({ report, onClose }) {
  const { added, errors } = report;
  const replaced = added.filter((a) => a.replaced).length;
  const total = added.length + errors.length;

  // หัวข้อตามผลรวม: สำเร็จหมด / สำเร็จบางส่วน / ไม่สำเร็จเลย
  const title = !errors.length ? "เพิ่มไฟล์สำเร็จ" : !added.length ? "เพิ่มไฟล์ไม่สำเร็จ" : `เพิ่มได้ ${added.length} จาก ${total} ไฟล์`;
  const subtitle = !errors.length
    ? `เพิ่ม ${added.length} ไฟล์เข้าคลังแล้ว${replaced ? ` (แทนที่ของเดิม ${replaced})` : ""}`
    : "ไฟล์ด้านล่างมีปัญหา แก้ไขแล้วอัปโหลดใหม่ได้";

  return (
    <Modal icon={errors.length ? "warning" : "success"} title={title} subtitle={subtitle} onClose={onClose} actions={[{ label: "ตกลง" }]}>
      <div className="flex flex-col gap-5">
        {/* ── ไฟล์ที่เพิ่มไม่ได้: แสดงก่อน เพราะผู้ใช้ต้องแก้ ── */}
        {errors.length > 0 && (
          <ul className="flex flex-col gap-2">
            {errors.map((e, i) => (
              <li key={i} className="rounded-xl bg-red-50 px-4 py-2.5">
                {e.file && <div className="break-all text-sm font-medium text-red-800">{e.file}</div>}
                <div className="text-sm text-gray-600">{e.error}</div>
              </li>
            ))}
          </ul>
        )}

        {/* ── ไฟล์ที่เพิ่มแล้ว: ชื่อ instance เป็นป้าย ── */}
        {added.length > 0 && (
          <div>
            {errors.length > 0 && (
              <div className="mb-2 text-xs font-medium text-gray-500">
                เพิ่มแล้ว {added.length} ไฟล์{replaced > 0 && ` (แทนที่ของเดิม ${replaced})`}
              </div>
            )}
            <ul className={`flex flex-wrap gap-1.5 ${errors.length ? "" : "justify-center"}`}>
              {added.map((a) => (
                <li key={a.name} title={a.file} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-700">
                  {a.name}
                  {a.replaced && <span className="ml-1 text-gray-400">แทนที่</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
