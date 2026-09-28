import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import HeroScene from "./HeroScene";
import CanvasErrorBoundary from "../CanvasErrorBoundary";
import LoadingScreen from "../LoadingScreen";
import { SceneReady, useSceneLoading } from "../useSceneLoading";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useScrollProgress } from "../../hooks/useScrollProgress";
import { sectionHoldMid } from "./timeline";
import { ROUTE_STOPS, SECTIONS } from "./sections";
import "../../styles/hero.css";

const N = SECTIONS.length;
// ข้อความจางที่วิ่งในแถบพื้นหลัง (ตกแต่ง) ใส่ 2 ชุดต่อกันเพื่อให้เลื่อนวนได้ไม่ขาด
const GHOST_LINE = "ROUTE PLANNING · CAPACITY CONSTRAINTS · OR-TOOLS · FLEET OPTIMISATION · ";

/** เบราว์เซอร์สร้าง WebGL context ได้หรือไม่ (ไม่ได้ = ข้ามฉาก 3D แสดงข้อความแทน) */
function useWebGLSupport() {
  const [supported, setSupported] = useState(true);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      setSupported(!!gl);
      // คืน context ที่เปิดไว้ทดสอบทันที เบราว์เซอร์จำกัดจำนวน WebGL context ที่เปิดพร้อมกัน
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setSupported(false);
    }
  }, []);
  return supported;
}

const NOGL_MESSAGE = "เบราว์เซอร์นี้แสดงภาพ 3D ไม่ได้";

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d="M6 18L18 6M9 6h9v9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * หน้าแรก: section สูง 1200vh ที่มี .hd-stage (sticky) ค้างเต็มจอ
 * สกรอลล์ → progressRef (0..1) → HeroScene อัปเดตฉาก 3D และ DOM overlay ด้านล่างผ่าน overlayRefs ทุกเฟรม
 */
export default function HeroDrive() {
  // ผู้ใช้ตั้งค่า "ลดการเคลื่อนไหว" ในระบบ (อัปเดตตามถ้าเปลี่ยนระหว่างเปิดหน้า)
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const webglOk = useWebGLSupport();
  const loading = useSceneLoading();
  const progressRef = useRef(0);
  const driveRef = useRef(null);
  useScrollProgress(driveRef, progressRef);

  const stageRef = useRef(null);
  const ghostRef = useRef(null);
  const ghostSpanRef = useRef(null);
  const ticksRef = useRef(null);
  const groundlineRef = useRef(null);
  const heroRef = useRef(null);
  const bandRef = useRef(null);
  const speedRef = useRef(null);
  const kmhRef = useRef(null);
  const dotsWrapRef = useRef(null);
  const routeWordRef = useRef(null);
  const routeTitleRef = useRef(null);
  const routeSubRef = useRef(null);
  const infoRefs = useRef(Array.from({ length: N }, () => ({ current: null })));
  const dotRefs = useRef(Array.from({ length: N }, () => ({ current: null })));

  const overlayRefs = {
    stage: stageRef,
    ghost: ghostRef,
    ghostSpan: ghostSpanRef,
    ticks: ticksRef,
    groundline: groundlineRef,
    hero: heroRef,
    band: bandRef,
    speed: speedRef,
    kmh: kmhRef,
    dotsWrap: dotsWrapRef,
    routeWord: routeWordRef,
    routeTitle: routeTitleRef,
    routeSub: routeSubRef,
    infos: infoRefs.current,
    dots: dotRefs.current,
  };

  /** ปุ่มจุดด้านข้าง: เลื่อนไปกลางช่วงค้างอ่านของชุดเนื้อหาที่ i */
  function scrollToSection(i) {
    const el = driveRef.current;
    if (!el) return;
    const scrollable = el.offsetHeight - window.innerHeight;
    const top = el.offsetTop + scrollable * sectionHoldMid(i, N);
    window.scrollTo({ top, behavior: "smooth" });
  }

  return (
    <section className="hd-drive" ref={driveRef}>
      {/* บังจอจนรถ + environment โหลดเสร็จ ไม่ให้เห็นฉากว่างเปล่าแล้วรถโผล่ทีหลัง (ไม่มี WebGL = ไม่มีอะไรให้รอ) */}
      <LoadingScreen progress={loading.progress} label="กำลังเตรียมฉาก 3D" done={!webglOk || loading.done} />
      <div className="hd-stage" ref={stageRef}>
        <div className="hd-mist" aria-hidden="true" />
        <div className="hd-ghostbar" ref={ghostRef} aria-hidden="true">
          <span ref={ghostSpanRef}>{GHOST_LINE}</span>
          <span>{GHOST_LINE}</span>
        </div>
        <div className="hd-ticks" ref={ticksRef} aria-hidden="true" />
        <div className="hd-groundline" ref={groundlineRef} aria-hidden="true" />

        <nav className="hd-nav">
          <a className="hd-nav-logo" href="#top">
            R O U T E
          </a>
          <div className="hd-nav-links">
            <a href="#" aria-current="page">HOME</a>
            <a href="#/solve">SOLVER</a>
            <a href="#/3d">3D VIEW</a>
            <a href="#/benchmark">BENCHMARK</a>
          </div>
          <a className="hd-nav-cta" href="#/solve">
            TRY THE SOLVER
          </a>
        </nav>

        {webglOk ? (
          <CanvasErrorBoundary fallback={<p className="hd-nogl">{NOGL_MESSAGE}</p>} onError={loading.markReady}>
            <Canvas className="hd-gl" gl={{ antialias: true, alpha: true }} dpr={[1, 2]}>
              <Suspense fallback={null}>
                <HeroScene progressRef={progressRef} overlayRefs={overlayRefs} reduceMotion={reduceMotion} />
                <SceneReady onReady={loading.markReady} />
              </Suspense>
            </Canvas>
          </CanvasErrorBoundary>
        ) : (
          <p className="hd-nogl">{NOGL_MESSAGE}</p>
        )}

        <div className="hd-hero" ref={heroRef}>
          <h1>
            OWN THE
            <br />
            SMARTEST
            <br />
            ROUTE.
          </h1>
          <div className="hd-side">
            <p>
              แบ่งจุดส่งให้รถแต่ละคันและจัดลำดับเส้นทางให้อัตโนมัติ
              ทุกคันบรรทุกไม่เกินความจุ และระยะทางรวมสั้นที่สุด
            </p>
            <a className="hd-arrow-link" href="#/solve">
              <span>เริ่มคำนวณเส้นทาง</span>
              <ArrowUpRightIcon />
            </a>
          </div>
        </div>

        <div className="hd-speed" ref={speedRef}>
          <span ref={kmhRef}>00</span> KM/H
        </div>

        <div className="hd-band" ref={bandRef}>
          {SECTIONS.map((sec, i) => (
            <div
              key={i}
              className="hd-info"
              ref={(el) => {
                infoRefs.current[i].current = el;
              }}
            >
              <h2>
                {sec.head[0]}
                <br />
                {sec.head[1]}
                <br />
                <span>{sec.dim}</span>
              </h2>
              <div className="hd-copy">
                <p>{sec.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ข้อความฉากมุมบน HeroScene เปลี่ยนข้อความ/ความทึบตามตำแหน่งรถบนเส้นทาง */}
        <div className="hd-route-word" ref={routeWordRef} aria-live="polite">
          <span ref={routeTitleRef}>{ROUTE_STOPS[0].title}</span>
          <small ref={routeSubRef}>{ROUTE_STOPS[0].sub}</small>
        </div>

        <div className="hd-dots" ref={dotsWrapRef}>
          {SECTIONS.map((sec, i) => (
            <button
              key={i}
              type="button"
              aria-label={sec.head.join(" ")}
              ref={(el) => {
                dotRefs.current[i].current = el;
              }}
              onClick={() => scrollToSection(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
