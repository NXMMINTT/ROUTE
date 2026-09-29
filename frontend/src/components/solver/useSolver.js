import { useEffect, useRef, useState } from "react";
import { requestJson } from "../../lib/api";
import { loadLast, saveLast } from "../../lib/lastResult";

const SAMPLE = "A-n32-k5"; // ไฟล์ตัวอย่างใน backend/samples/ (31 ลูกค้า, 5 คัน)

/** อัปโหลด .vrp ไปที่ POST /api/solve แล้วเก็บผล (ใช้ร่วมกันทั้งหน้า Solver และหน้า 3D) */
export function useSolver() {
  const [file, setFile] = useState(null);
  const [timeLimit, setTimeLimit] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(loadLast);
  const controllerRef = useRef(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  async function solve(f) {
    if (!f) return;
    // มีไฟล์ใหม่มาระหว่างรอ: ทิ้ง request เก่า ผลของไฟล์เก่าจะได้ไม่มาทับผลของไฟล์ใหม่
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setFile(f);
    setLoading(true);
    setError("");
    const body = new FormData();
    body.append("file", f);
    body.append("time_limit", String(timeLimit));
    try {
      const json = await requestJson("/api/solve", { method: "POST", body, signal: controller.signal });
      setResult(json);
      saveLast(json);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      if (controllerRef.current === controller) setLoading(false);
    }
  }

  /** ผู้ใช้ที่ยังไม่มีไฟล์ .vrp: โหลดไฟล์ตัวอย่างจาก backend แล้วคำนวณเหมือนอัปโหลดเอง ("คำนวณใหม่" จึงใช้ได้ต่อ) */
  async function solveSample() {
    setError("");
    try {
      const { name, text } = await requestJson(`/api/samples/${SAMPLE}`);
      await solve(new File([text], `${name}.vrp`));
    } catch (e) {
      setError(e.message);
    }
  }

  return { file, timeLimit, setTimeLimit, loading, error, result, solve, solveSample };
}
