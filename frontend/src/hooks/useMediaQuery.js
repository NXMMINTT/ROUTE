import { useEffect, useState } from "react";

/** ผลของ media query ปัจจุบัน (อัปเดตตามเมื่อหมุนจอ / ย่อหน้าต่าง / เปลี่ยนการตั้งค่าระบบ) */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const onChange = (e) => setMatches(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}
