import { Suspense, lazy, useEffect, useState } from "react";
import LoadingScreen from "./components/LoadingScreen";

// แยก bundle ต่อหน้า: หน้า Solver/Benchmark ไม่ต้องโหลด three.js, GSAP และโมเดล .glb ของหน้า Hero/3D
const Home = lazy(() => import("./pages/Home"));
const ROUTES = [
  ["#/solve", lazy(() => import("./pages/Solve"))],
  ["#/3d", lazy(() => import("./pages/Route3D"))],
  ["#/benchmark", lazy(() => import("./pages/Benchmark"))],
];

// hash routing แบบง่าย: #/solve = เครื่องมือคำนวณ, #/3d = หน้า 3D, #/benchmark = รันชุดทดสอบ ที่เหลือเป็นหน้าแรก (anchor อย่าง #next ยังใช้ได้)
function useHash() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

export default function App() {
  const hash = useHash();
  const Page = ROUTES.find(([prefix]) => hash.startsWith(prefix))?.[1] ?? Home;
  return (
    // ระหว่างโหลดโค้ดของหน้า: รอ 200 ms ก่อนค่อยแสดง หน้าที่โหลดเร็ว (มี cache) จะไม่เห็นหน้ารอโหลดแวบขึ้นมา
    <Suspense fallback={<LoadingScreen delay={200} />}>
      <Page />
    </Suspense>
  );
}
