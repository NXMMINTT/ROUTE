import { useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

/**
 * ผูก GSAP ScrollTrigger กับ wrapper สูง 1200vh เพื่ออ่าน scroll progress (0..1)
 * ไม่ใช้ pin:true เพราะ .hd-stage เป็น position:sticky อยู่แล้ว (เหมือนเดโม)
 * scrub:true (ไม่ใส่ตัวเลข) = ไม่หน่วงเพิ่ม ให้ engine.step ของ timeline.js
 * เป็นคน smooth เอง เหมือนพฤติกรรม p+(tp-p)*.1 ของเดโม
 */
export function useScrollProgress(triggerRef, progressRef) {
  useEffect(() => {
    const el = triggerRef.current;
    if (!el) return;

    const st = ScrollTrigger.create({
      trigger: el,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate: (self) => {
        progressRef.current = self.progress;
      },
    });

    return () => st.kill();
  }, [triggerRef, progressRef]);
}
