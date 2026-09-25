import { useCallback, useEffect, useRef, useState } from "react";
import { useProgress } from "@react-three/drei";

// โหลดนานเกินนี้ (เน็ตช้ามาก/โหลด environment จาก CDN ไม่ได้) ให้เลิกบังหน้า ฉากจะโผล่เองเมื่อโหลดเสร็จ
const MAX_WAIT_MS = 25000;

/** วางเป็นลูกตัวสุดท้ายใน <Suspense> เดียวกับฉาก: mount ได้ก็ต่อเมื่อทุกอย่างใน boundary โหลดเสร็จแล้ว */
export function SceneReady({ onReady }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

/**
 * สถานะหน้ารอโหลดของฉาก 3D: done เมื่อ <SceneReady> mount / ฉากพัง (markReady จาก error boundary) / หมดเวลา
 * progress มาจาก LoadingManager ของ three (useProgress) นับเป็นจำนวนไฟล์ (LoadingScreen ประมาณช่วงระหว่างไฟล์ให้เอง)
 * ค่านี้ลดลงได้เมื่อมีไฟล์ใหม่เข้าคิว (เช่นโหลดรถเสร็จแล้วค่อยเริ่ม environment) จึงแสดงค่าสูงสุดที่เคยถึง
 * และค้างไว้ที่ 99% จนกว่าฉากจะพร้อมจริง
 */
export function useSceneLoading() {
  const { progress } = useProgress();
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const maxRef = useRef(0);
  const done = ready || timedOut;

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), MAX_WAIT_MS);
    return () => clearTimeout(t);
  }, []);

  const markReady = useCallback(() => setReady(true), []);
  maxRef.current = Math.max(maxRef.current, Math.min(progress, 99));

  return { done, progress: ready ? 100 : maxRef.current, markReady };
}
