import { useState } from "react";

/**
 * ลากไฟล์มาวางบน element ใดก็ได้: คืน dragging (ไว้แสดงกรอบ) กับ props ที่กระจายใส่ element นั้น
 * ระหว่าง disabled (กำลังคำนวณ) จะไม่รับไฟล์ใหม่
 * multiple = true: onFile ได้ array ของทุกไฟล์ที่วาง แทนไฟล์แรกไฟล์เดียว
 */
export function useFileDrop(onFile, disabled = false, { multiple = false } = {}) {
  const [dragging, setDragging] = useState(false);

  const dropProps = {
    onDragOver(e) {
      e.preventDefault();
      if (!disabled) setDragging(true);
    },
    onDragLeave(e) {
      // dragleave ยิงทุกครั้งที่เมาส์ข้ามเข้า element ลูก นับว่าออกจริงเมื่อไปอยู่นอก element นี้แล้วเท่านั้น
      if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
    },
    onDrop(e) {
      e.preventDefault();
      setDragging(false);
      const files = [...(e.dataTransfer.files ?? [])];
      if (!files.length || disabled) return;
      onFile(multiple ? files : files[0]);
    },
  };

  return { dragging, dropProps };
}
