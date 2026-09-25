import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line, OrbitControls, OrthographicCamera, useEnvironment } from "@react-three/drei";
import { routeColor } from "../solver/colors";
import { useCarModel } from "../hero/useCarModel";
import { BUILDING_FOOTPRINT, useBuildingModels } from "./useBuildingModel";

const SIZE = 20; // ด้านที่ยาวที่สุดของพื้นที่ลูกค้า (หน่วยโลก)
const PAD = 2.5;
const INK = "#14171c";
const TRUCK_SPEED = 3.5; // หน่วยโลก/วินาที
const CAR_LENGTH = 1.1; // ความยาวรถ (หน่วยโลก) ย่อจาก car.glb ให้พอดีกับฉาก
const DEPOT_SCALE = 1.5; // depot ใหญ่กว่าตึกลูกค้ากี่เท่า
// ความสูงตึกลูกค้า (หน่วยโลก) ตาม demand ยืดทุกแบบให้สูงเท่ากันที่ demand เท่ากัน ไม่งั้นสูงต่ำตามแบบตึกแทนที่จะเป็น demand
const MIN_BUILDING_H = 0.5;
const MAX_BUILDING_H = 1.6;
// จุดที่อยู่ชิดกัน: ย่อฐานตึกเหลือ FOOT_FIT เท่าของระยะถึงจุดที่ใกล้ที่สุด (ไม่ซ้อนกัน) แต่ไม่เล็กกว่า MIN_FOOTPRINT
const FOOT_FIT = 0.8;
const MIN_FOOTPRINT = 0.36;
const fitFootprint = (nearest, natural) => Math.min(natural, Math.max(MIN_FOOTPRINT, FOOT_FIT * nearest));

/** แปลงพิกัด x,y ของ .vrp เป็นตำแหน่งบนพื้น (x → X, y → -Z ให้ทิศเหนืออยู่ด้านหลังฉาก) */
function useLayout(result) {
  return useMemo(() => {
    const xs = result.nodes.map((n) => n.x);
    const ys = result.nodes.map((n) => n.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const s = SIZE / Math.max(x1 - x0, y1 - y0, 1);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const pos = {};
    for (const n of result.nodes) pos[n.id] = [(n.x - cx) * s, -(n.y - cy) * s];
    const maxDemand = Math.max(1, ...result.nodes.map((n) => n.demand));
    const routeOf = {};
    result.routes.forEach((r, i) => r.stops.forEach((id) => (routeOf[id] = i)));
    // ระยะถึงจุดที่ใกล้ที่สุดของแต่ละจุด (ใช้ย่อตึกไม่ให้ซ้อนกัน)
    const nearest = {};
    for (const a of result.nodes) {
      let m = Infinity;
      for (const b of result.nodes) if (a.id !== b.id) m = Math.min(m, Math.hypot(pos[a.id][0] - pos[b.id][0], pos[a.id][1] - pos[b.id][1]));
      nearest[a.id] = m;
    }
    return { pos, nearest, maxDemand, routeOf, w: (x1 - x0) * s + PAD * 2, d: (y1 - y0) * s + PAD * 2 };
  }, [result]);
}

function Camera({ w, d }) {
  const { size } = useThree();
  // มุมมอง isometric: ความกว้างที่เห็นของพื้น ≈ (w + d) * cos45
  const zoom = Math.min(size.width / ((w + d) * 0.78), size.height / ((w + d) * 0.5));
  return <OrthographicCamera makeDefault position={[30, 26, 30]} zoom={zoom} near={-200} far={400} />;
}

/** รถ car.glb คันเล็กวิ่งวนตามเส้นทาง ตัวถังย้อมสีตามเส้นทาง ล้อหมุนตามระยะที่วิ่ง */
function Truck({ points, color, dim }) {
  const ref = useRef();
  const envMap = useEnvironment({ preset: "city" });
  const { model, length, wheels, wheelRadius } = useCarModel("/models/car.glb");
  const scale = CAR_LENGTH / length;

  // โคลนวัสดุต่อคัน (วัสดุใน useGLTF แคชร่วมกับหน้า hero ห้ามแก้ตัวต้นฉบับ)
  // วัสดุรถเป็นโลหะ ต้องมี envMap ไม่งั้นดำสนิท ใส่เฉพาะวัสดุรถเพื่อไม่ให้แท่ง/พื้นในฉากเปลี่ยนความสว่าง
  // layout effect: ใส่วัสดุก่อนเฟรมแรกถูกวาด (ไม่เห็นรถสีขาวแวบหนึ่ง) และคืนวัสดุเดิม + dispose ตัวที่โคลนเมื่อเลิกใช้
  useLayoutEffect(() => {
    const originals = new Map();
    model.traverse((node) => {
      if (!node.isMesh) return;
      const mat = node.material.clone();
      mat.envMap = envMap;
      mat.envMapIntensity = 0.9;
      if (/carpaint/i.test(node.parent?.name) && mat.color.getHex() === 0xffffff) mat.color.set(color);
      originals.set(node, node.material);
      node.material = mat;
    });
    return () =>
      originals.forEach((original, node) => {
        node.material.dispose();
        node.material = original;
      });
  }, [model, envMap, color]);

  const { segs, total } = useMemo(() => {
    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [a, b] = [points[i], points[i + 1]];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      segs.push({ a, b, start: total, len });
      total += len;
    }
    return { segs, total };
  }, [points]);

  useFrame(({ clock }) => {
    if (!ref.current || total === 0) return;
    const t = (clock.elapsedTime * TRUCK_SPEED) % total;
    const sg = segs.find((g) => t <= g.start + g.len) ?? segs[segs.length - 1];
    const k = sg.len ? (t - sg.start) / sg.len : 0;
    ref.current.position.set(sg.a[0] + (sg.b[0] - sg.a[0]) * k, 0.01, sg.a[2] + (sg.b[2] - sg.a[2]) * k);
    ref.current.rotation.y = Math.atan2(-(sg.b[2] - sg.a[2]), sg.b[0] - sg.a[0]);
    const spin = t / (wheelRadius * scale); // มุม = ระยะที่วิ่ง / รัศมีล้อ (หน่วยโลก)
    for (const wheel of wheels) wheel.rotation.x = spin;
  });

  return (
    <group ref={ref} visible={!dim}>
      <group scale={scale}>
        <primitive object={model} />
      </group>
    </group>
  );
}

// พื้นฉากตามภาพอ้างอิง: เกาะเขียวขอบเหลืองอ่อน ดินน้ำตาลเป็นชั้น วางบนแท่นน้ำสีฟ้ามีกรอบครีม
const ISLAND = {
  grass: "#8bc34a",
  lip: "#c9e265",
  soilTop: "#a06f3c",
  soilLow: "#7c5028",
  water: "#4ec3e8",
  waterSide: "#1e88c8",
  frame: "#ece6da",
  tree: "#2f9e44",
  treeDark: "#23803a",
};
const WATER_MARGIN = 1.2; // น้ำยื่นออกจากขอบเกาะ (หน่วยโลก)
const FRAME_MARGIN = 0.5; // กรอบครีมยื่นออกจากขอบน้ำ
const OUTER = WATER_MARGIN + FRAME_MARGIN;
const TREE_COUNT = 10;

/** แผ่นกล่องแยกสีหน้าบน (top) กับด้านข้าง (side) ลำดับ material ของ boxGeometry: +x -x +y -y +z -z */
function Slab({ size, y, top, side, ...props }) {
  return (
    <mesh position={[0, y, 0]} {...props}>
      <boxGeometry args={size} />
      {[0, 1, 2, 3, 4, 5].map((k) => (
        <meshStandardMaterial key={k} attach={`material-${k}`} color={k === 2 ? top : side} />
      ))}
    </mesh>
  );
}

function Tree({ position, scale }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.16, 0]}>
        <coneGeometry args={[0.2, 0.34, 6]} />
        <meshStandardMaterial color={ISLAND.treeDark} flatShading />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <coneGeometry args={[0.15, 0.3, 6]} />
        <meshStandardMaterial color={ISLAND.tree} flatShading />
      </mesh>
    </group>
  );
}

/** ทุ่นแดงลอยในน้ำ */
function Buoy({ position }) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e5484d" />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <torusGeometry args={[0.17, 0.03, 8, 20]} />
        <meshStandardMaterial color="#ffffff" />
      </mesh>
    </group>
  );
}

/** เกาะ + น้ำ + กรอบ พร้อมต้นไม้สุ่มตำแหน่ง (คงที่ต่อขนาดพื้นที่) หลบจุดลูกค้า/depot */
function Island({ w, d, nodePts, onPointerMove }) {
  const trees = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out = [];
    for (let tries = 0; tries < 300 && out.length < TREE_COUNT; tries++) {
      const x = (rnd() - 0.5) * (w - 0.8);
      const z = (rnd() - 0.5) * (d - 0.8);
      if (nodePts.some(([nx, nz]) => Math.hypot(nx - x, nz - z) < 1.1)) continue;
      out.push({ x, z, s: 0.8 + rnd() * 0.5 });
    }
    return out;
  }, [w, d, nodePts]);

  return (
    <>
      <Slab size={[w + 2 * OUTER, 0.3, d + 2 * OUTER]} y={-0.7} top={ISLAND.frame} side={ISLAND.frame} />
      <Slab size={[w + 2 * WATER_MARGIN, 0.55, d + 2 * WATER_MARGIN]} y={-0.575} top={ISLAND.water} side={ISLAND.waterSide} />
      <Slab size={[w + 0.08, 0.28, d + 0.08]} y={-0.36} top={ISLAND.soilLow} side={ISLAND.soilLow} />
      <Slab size={[w + 0.08, 0.08, d + 0.08]} y={-0.18} top={ISLAND.soilTop} side={ISLAND.soilTop} />
      <Slab size={[w + 0.16, 0.1, d + 0.16]} y={-0.09} top={ISLAND.lip} side={ISLAND.lip} />
      <Slab size={[w, 0.12, d]} y={-0.06} top={ISLAND.grass} side={ISLAND.grass} onPointerMove={onPointerMove} />
      {/* gridHelper สร้างได้แค่จัตุรัส: ยืดแต่ละแกนให้พอดีเกาะสี่เหลี่ยมผืนผ้า ไม่ให้เส้นกริดยื่นออกนอกเกาะ */}
      <gridHelper args={[1, 12, "#7fb540", "#86bb45"]} position={[0, 0.005, 0]} scale={[w, 1, d]} />

      {trees.map((t, k) => (
        <Tree key={k} position={[t.x, 0, t.z]} scale={t.s} />
      ))}
      {[[-1, -1], [1, 1], [-1, 1]].map(([sx, sz], k) => (
        <Buoy key={k} position={[sx * (w / 2 + WATER_MARGIN * 0.55), -0.3, sz * (d / 2 + WATER_MARGIN * 0.55)]} />
      ))}
    </>
  );
}

/** ตึกจากโมเดลที่ bake แล้ว (geometry ร่วมกันทุกหลัง) แผ่นพื้นใต้ตึกย้อมสีตามเส้นทาง scaleY ยืดตามความสูงที่ต้องการ */
function Building({ model, baseColor, dim = false, scale = 1, scaleY = 1 }) {
  const { parts } = model;
  // โคลนวัสดุต่อหลัง (ต้นฉบับแคชร่วมกับทุกหลังและทุกหน้า ห้ามแก้ตรงๆ)
  const materials = useMemo(
    () =>
      parts.map((p) => {
        const m = p.material.clone();
        if (p.isBase) m.color.set(baseColor);
        return m;
      }),
    [parts, baseColor]
  );
  useEffect(() => () => materials.forEach((m) => m.dispose()), [materials]);
  useEffect(() => {
    materials.forEach((m) => {
      m.transparent = dim;
      m.opacity = dim ? 0.2 : 1;
    });
  }, [materials, dim]);

  return (
    <group scale={[scale, scale * scaleY, scale]}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} material={materials[i]} />
      ))}
    </group>
  );
}

// ── ฉากว่างตอนยังไม่มีผลลัพธ์: เกาะเปล่าหมุนช้าๆ + วงแหวนกะพริบตรงกลาง (ตำแหน่ง depot ที่รอข้อมูล) ──
const EMPTY_W = SIZE + PAD * 2;
const EMPTY_D = SIZE * 0.75 + PAD * 2;
const NO_NODES = [[0, 0]]; // เว้นกลางเกาะไว้ให้วงแหวน ต้นไม้จะไม่ขึ้นทับ

function WaitingRing({ still }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (!ref.current || still) return;
    const t = (clock.elapsedTime % 2.4) / 2.4; // ขยายออกแล้วจางหาย วนทุก 2.4 วินาที
    ref.current.scale.setScalar(1 + t * 1.6);
    ref.current.material.opacity = 0.55 * (1 - t);
  });
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.32, 0.42, 48]} />
        <meshBasicMaterial color={INK} />
      </mesh>
      <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.42, 0.5, 48]} />
        <meshBasicMaterial color={INK} transparent opacity={0.3} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** ฉากรอข้อมูล: ไม่โหลดโมเดล .glb ใดๆ จึงขึ้นทันที */
export function EmptyScene() {
  const [still] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  return (
    <>
      <Camera w={EMPTY_W + 2 * OUTER} d={EMPTY_D + 2 * OUTER} />
      <OrbitControls enableDamping autoRotate={!still} autoRotateSpeed={0.35} maxPolarAngle={Math.PI / 2.3} minZoom={5} maxZoom={200} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[12, 25, 8]} intensity={1.6} />
      <Island w={EMPTY_W} d={EMPTY_D} nodePts={NO_NODES} />
      <WaitingRing still={still} />
    </>
  );
}

export default function RouteScene({ result, active, onActive }) {
  const { pos, nearest, maxDemand, routeOf, w, d } = useLayout(result);
  const { customers: buildings, depot: depotModel } = useBuildingModels();
  const [hover, setHover] = useState(null);
  const dim = (i) => active !== null && active !== i;
  const depot = pos[result.depot];
  const nodePts = useMemo(() => Object.values(pos), [pos]);
  const depotScale = fitFootprint(nearest[result.depot], BUILDING_FOOTPRINT * DEPOT_SCALE) / BUILDING_FOOTPRINT;

  const routePts = useMemo(
    () =>
      result.routes.map((r) =>
        [result.depot, ...r.stops, result.depot].map((id) => [pos[id][0], 0.06, pos[id][1]])
      ),
    [result, pos]
  );

  return (
    <>
      <Camera w={w + 2 * OUTER} d={d + 2 * OUTER} />
      <OrbitControls enableDamping maxPolarAngle={Math.PI / 2.3} minZoom={5} maxZoom={200} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[12, 25, 8]} intensity={1.6} />

      <Island w={w} d={d} nodePts={nodePts} onPointerMove={() => hover && setHover(null)} />
      {routePts.map((pts, i) => (
        <group key={i}>
          <Line
            points={pts}
            color={routeColor(i)}
            lineWidth={active === i ? 4 : 2.5}
            transparent
            opacity={dim(i) ? 0.12 : 1}
          />
          <Truck points={pts} color={routeColor(i)} dim={dim(i)} />
        </group>
      ))}

      {result.nodes.map((n) => {
        if (n.id === result.depot) return null;
        const i = routeOf[n.id];
        const building = buildings[Math.abs(Number(n.id) || 0) % buildings.length]; // คละแบบตามเลข id
        const h = MIN_BUILDING_H + (n.demand / maxDemand) * (MAX_BUILDING_H - MIN_BUILDING_H); // ความสูงตึก = demand
        const [x, z] = pos[n.id];
        const foot = fitFootprint(nearest[n.id], BUILDING_FOOTPRINT);
        const s = foot / BUILDING_FOOTPRINT;
        const showLabel = hover?.id === n.id;
        return (
          <group key={n.id} position={[x, 0, z]}>
            {/* ย่อฐาน (s) แต่ความสูงรวมยังต้องเท่า h เพื่อให้ความสูง = demand ยังจริง จึงหาร s ออกจาก scaleY */}
            <Building model={building} baseColor={i == null ? "#9198a1" : routeColor(i)} dim={dim(i)} scale={s} scaleY={h / building.height / s} />
            {/* กล่องโปร่งใสสำหรับรับเมาส์ (ตึกมีหลาย mesh ถ้าผูกอีเวนต์กับแต่ละ mesh จะกระพริบตอนเมาส์ข้ามชิ้น) */}
            <mesh
              position={[0, h / 2, 0]}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHover(n);
                onActive(i ?? null);
              }}
              onPointerOut={() => {
                setHover(null);
                onActive(null);
              }}
            >
              <boxGeometry args={[foot * 0.8, h, foot * 0.8]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} />
            </mesh>
            {showLabel && (
              <Html position={[0, h + 0.4, 0]} center style={{ pointerEvents: "none" }}>
                <div className="whitespace-nowrap rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow">
                  <div className="font-semibold">จุด {n.id}</div>
                  <div className="text-gray-300">demand {n.demand}</div>
                  {i != null && <div className="text-gray-300">Route {i + 1}</div>}
                </div>
              </Html>
            )}
          </group>
        );
      })}

      <group position={[depot[0], 0, depot[1]]}>
        <Building model={depotModel} baseColor={INK} scale={depotScale} />
        <Html position={[0, depotModel.height * depotScale + 0.3, 0]} center style={{ pointerEvents: "none" }}>
          <div className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold tracking-widest text-gray-900 shadow-sm">
            DEPOT
          </div>
        </Html>
      </group>
    </>
  );
}
