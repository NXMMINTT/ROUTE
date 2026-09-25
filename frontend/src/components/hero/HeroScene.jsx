import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, OrthographicCamera } from "@react-three/drei";
import * as THREE from "three";
import { useCarModel } from "./useCarModel";
import { useRoad } from "./useRoad";
import { createFrameEngine, clamp, easeIO, easeOut, lerp, seg, sectionInEnd, sectionInStart } from "./timeline";
import { ROUTE_STOPS, SECTIONS } from "./sections";

const MOBILE_QUERY = "(max-width: 700px)";
const N = SECTIONS.length;
// หัวรถของ car.glb ชี้ +X แล้ว (useCarModel หมุนให้) จึงไม่ต้องบวกออฟเซ็ต ถ้าเปลี่ยนโมเดลแล้วหัวรถไม่ตามโค้ง ให้แก้ค่านี้
const HEADING_OFFSET = 0;
// ตอนเลี้ยวกล้องซูมออกให้เห็นทั้งโค้ง (zoom ของกล้อง orthographic: 1 = ปกติ, ยิ่งน้อยยิ่งเห็นกว้าง)
const TURN_ZOOM = 0.45;
// วัดความโค้งจากทิศถนนห่างจากรถไปข้างหน้า/ข้างหลังระยะนี้ (เท่าความยาวรถ) ถ้าต่างกันถึง 45° = ซูมออกสุด
const TURN_WINDOW = 3;
const headingAt = (curve, t) => {
  const tan = curve.getTangentAt(clamp(t, 0, 1));
  return Math.atan2(-tan.z, tan.x);
};

/**
 * เนื้อหาใน <Canvas>: กล้อง orthographic ผ่าน pivot (rig) + รถ + แสง
 * ทุกเฟรมอ่าน progressRef (0..1) แล้วอัปเดตทั้ง 3D object และ DOM overlay
 * ในลูปเดียว เพื่อให้ตรงกับ frame() ของเดโมและเลี่ยง re-render ของ React
 */
export default function HeroScene({ progressRef, overlayRefs, reduceMotion }) {
  const { size } = useThree();
  const rigRef = useRef(null);
  const camRef = useRef(null);
  const truckRef = useRef(null);
  const shadowRef = useRef(null);
  const layoutRef = useRef({ visW: 20, visH: 11, ppu: 70, off0: 0, G0: 0.81, G1: 0.44, exitMargin: 30 });
  const shownStopRef = useRef(-1);
  const engineRef = useRef(null);
  const { model, length, groundY, wheels, wheelRadius } = useCarModel("/models/car.glb");
  const { road, build, curve, LEN, d0, distanceOf, asphaltMat, laneMat } = useRoad(length);
  // ตำแหน่งจัดกึ่งกลางที่ useCarModel ตั้งไว้ ต้องเก็บไว้ก่อนเฟรมแรกเขียนทับ (รถหมุนรอบจุดกึ่งกลางนี้)
  const modelBase = useMemo(() => model.position.clone(), [model]);
  const stopDs = useMemo(() => ROUTE_STOPS.map((s) => distanceOf(s.at)), [distanceOf]);

  if (!engineRef.current) engineRef.current = createFrameEngine();

  useEffect(() => {
    function computeLayout() {
      const cam = camRef.current;
      if (!cam) return;
      const w = size.width || 1;
      const h = size.height || 1;
      const aspect = w / h;
      const visW = length / (aspect < 1 ? 0.88 : 0.5);
      const visH = visW / aspect;
      const ppu = w / visW;
      const mobile = window.matchMedia(MOBILE_QUERY).matches;
      const G0 = mobile ? 0.68 : 0.81;
      const G1 = mobile ? 0.34 : 0.44;
      const off0 = (mobile ? 0.03 : 0.07) * visW;
      // ท้ายเส้นทาง กล้องหยุดตามก่อนสุดเส้นระยะเท่านี้ ให้รถวิ่งพ้นจอก่อนถนนหมด
      const exitMargin = Math.hypot(visW, visH) / 2 + length;
      layoutRef.current = { visW, visH, ppu, off0, G0, G1, exitMargin };

      cam.left = -visW / 2;
      cam.right = visW / 2;
      cam.top = visH / 2;
      cam.bottom = -visH / 2;
      cam.near = 0.1;
      cam.far = 500;
      cam.updateProjectionMatrix();

      // ความกว้างถนนจริงต้องอิงกรอบที่กล้อง orthographic มองเห็นตอน zoom = 1
      // ไม่ใช้ค่าคงที่/ค่า clamp คงที่ ไม่งั้นรถคันเล็กจะได้ถนนกว้างเกินจนล้นจอ
      // ไม่หาร cam.zoom เพราะ zoom เปลี่ยนระหว่างเลี้ยว ถ้า resize ตอนนั้นถนนจะกว้างผิด
      const trueVisH = cam.top - cam.bottom;
      const ROAD_WIDTH = trueVisH * 0.55;
      build(ROAD_WIDTH);
    }
    // size จาก useThree เปลี่ยนทุกครั้งที่ canvas ถูก resize อยู่แล้ว effect นี้จึงรันใหม่เอง
    // (ไม่ต้องผูก window resize ซ้ำ ไม่งั้นสร้างถนน/เส้นประใหม่สองรอบต่อการ resize)
    computeLayout();
  }, [size, length, build]);

  useFrame(() => {
    const layout = layoutRef.current;
    const cam = camRef.current;
    const rig = rigRef.current;
    if (!cam || !rig) return;

    const targetP = progressRef.current;
    const f = engineRef.current(targetP, { ...layout, N, routeLen: LEN - d0, reduce: reduceMotion });
    const p = f.p;

    // เส้นทางโค้ง: ก่อน tiltEnd รถอยู่ที่จุดเริ่มวิ่ง (จุดกำเนิดของกลุ่มถนน) ซึ่งวางไว้ที่ x = D
    // = ตำแหน่งรถตอนกล้องเอียงเสร็จพอดี หลังจากนั้นรถและกล้องเลื่อนตามเส้นทางด้วยระยะจริง
    road.position.x = f.D;
    const dTruck = d0 + f.routeD;
    const dCam = Math.min(dTruck, Math.max(d0, LEN - layout.exitMargin));
    const tp = curve.getPointAt(dTruck / LEN);
    const tan = curve.getTangentAt(dTruck / LEN);
    const cp = curve.getPointAt(dCam / LEN);

    // ซูมออกตอนเลี้ยว: คิดจากตำแหน่งรถบนเส้นทาง สกรอลล์ย้อนก็ได้ภาพเดิม ช่วงถนนตรง (รวมตอนเอียงกล้องเสร็จ) zoom = 1
    const w = length * TURN_WINDOW;
    const turn = Math.abs(headingAt(curve, (dTruck + w) / LEN) - headingAt(curve, (dTruck - w) / LEN));
    const zoom = lerp(1, TURN_ZOOM, easeIO(clamp(turn / (Math.PI / 4), 0, 1)));
    if (cam.zoom !== zoom) {
      cam.zoom = zoom;
      cam.updateProjectionMatrix();
    }

    rig.position.set(f.camX + cp.x, 1.2 * f.c, cp.z);
    rig.rotation.x = -f.c * (Math.PI / 2);
    cam.position.set(0, THREE.MathUtils.lerp((f.ground - 0.5) * layout.visH, 0, f.c), 60);

    const truck = truckRef.current;
    if (truck) {
      truck.position.set(f.truckX + tp.x, 0, tp.z);
      truck.rotation.y = Math.atan2(-tan.z, tan.x) + HEADING_OFFSET; // หัวรถตามโค้งถนนเสมอ
    }
    if (model) model.position.set(modelBase.x, groundY + f.bodyBounce, modelBase.z + f.sway);
    // ล้อกลิ้งตามระยะที่รถวิ่งจริง (wheelD) มุม = ระยะ / รัศมี สกรอลล์ย้อนล้อก็หมุนย้อน
    const spin = reduceMotion ? 0 : f.wheelD / wheelRadius;
    for (const wheel of wheels) wheel.rotation.x = spin;
    if (shadowRef.current) {
      shadowRef.current.position.set(0, 0.02, f.sway);
      shadowRef.current.material.opacity = 0.35 * f.c;
    }

    // ถนนทึบขึ้นพร้อมมุมเอียง (c)
    asphaltMat.opacity = f.c;
    laneMat.opacity = f.c;

    // ข้อความฉากมุมบน: ขึ้นตามระยะของรถจากจุดบนเส้นทาง (หน่วยโลก) ไม่ใช่ % การสกรอลล์
    let near = 0;
    stopDs.forEach((d, k) => {
      if (Math.abs(dTruck - d) < Math.abs(dTruck - stopDs[near])) near = k;
    });
    if (near !== shownStopRef.current) {
      shownStopRef.current = near;
      if (overlayRefs.routeTitle.current) overlayRefs.routeTitle.current.textContent = ROUTE_STOPS[near].title;
      if (overlayRefs.routeSub.current) overlayRefs.routeSub.current.textContent = ROUTE_STOPS[near].sub;
    }
    const routeWord = overlayRefs.routeWord.current;
    if (routeWord) {
      const vis = clamp01(1 - Math.abs(dTruck - stopDs[near]) / (length * 2)) * f.c;
      routeWord.style.opacity = vis;
      routeWord.style.transform = `translateY(${(1 - vis) * 26}px)`;
    }

    const stageEl = overlayRefs.stage.current;
    if (stageEl) stageEl.style.setProperty("--hd-ground", (f.ground * 100).toFixed(3) + "%");

    // ghost bar: ไหลตามระยะทางจริง (world px) เท่านั้น จอดแล้วต้องหยุดนิ่ง
    const ghostbar = overlayRefs.ghost.current;
    const ghostSpan = overlayRefs.ghostSpan.current;
    if (ghostbar && ghostSpan) {
      const stripW = ghostSpan.offsetWidth || 1;
      const flow = (((f.worldPx * 0.45) % stripW) + stripW) % stripW;
      ghostbar.style.transform = `translateX(${-flow}px)`;
      ghostbar.style.opacity = f.side * 0.9;
    }

    const ticks = overlayRefs.ticks.current;
    if (ticks) {
      ticks.style.backgroundPositionX = -f.worldPx + "px";
      ticks.style.opacity = 0.45 * f.side;
    }
    const gline = overlayRefs.groundline.current;
    if (gline) gline.style.opacity = 0.35 * f.side;

    const hero = overlayRefs.hero.current;
    if (hero) {
      hero.style.opacity = 1 - f.r;
      hero.style.transform = `translateY(${-f.r * 40}px)`;
    }

    // เนื้อหาแต่ละชุด: ไหลเข้าจากขวา ค้างอ่าน แล้วไหลออกซ้ายตอนชุดถัดไปมาถึง
    let active = 0;
    for (let i = 0; i < N; i++) {
      const inP = easeOut(seg(p, sectionInStart(i, N), sectionInEnd(i, N)));
      const outP = i === N - 1 ? 0 : easeOut(seg(p, sectionInStart(i + 1, N), sectionInEnd(i + 1, N)));
      const vis = inP * (1 - outP);
      if (vis > 0.5) active = i;
      const infoEl = overlayRefs.infos[i]?.current;
      if (infoEl) {
        infoEl.style.transform = `translateX(${(1 - inP) * 70 - outP * 70}vw)`;
        infoEl.style.opacity = vis;
      }
    }

    const dotsWrap = overlayRefs.dotsWrap.current;
    if (dotsWrap) dotsWrap.style.opacity = clamp(f.side * f.r, 0, 1);
    for (let i = 0; i < N; i++) {
      const dotEl = overlayRefs.dots[i]?.current;
      if (dotEl) dotEl.classList.toggle("on", i === active);
    }

    const band = overlayRefs.band.current;
    if (band) band.style.opacity = f.side;

    const speedEl = overlayRefs.speed.current;
    if (speedEl) speedEl.style.opacity = clamp01(1 - f.c * 1.5);
    const kmh = overlayRefs.kmh.current;
    if (kmh) kmh.textContent = String(Math.round(f.spd)).padStart(2, "0");
  });

  return (
    <>
      <group ref={rigRef}>
        <OrthographicCamera ref={camRef} makeDefault position={[0, 0, 60]} />
      </group>
      <Environment preset="city" environmentIntensity={0.9} />
      <ambientLight intensity={0.6} />
      <hemisphereLight args={[0xffffff, 0x3a3f44, 1.6]} />
      <directionalLight position={[4, 12, 10]} intensity={3} />
      <directionalLight position={[-6, 6, -8]} intensity={1.2} />
      <group ref={truckRef}>
        {model && <primitive object={model} />}
        <mesh ref={shadowRef} rotation={[-Math.PI / 2, 0, 0]} renderOrder={2}>
          <planeGeometry args={[length + 0.4, 2.9]} />
          <meshBasicMaterial color={0x000000} transparent opacity={0} />
        </mesh>
      </group>
      <primitive object={road} />
    </>
  );
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}
