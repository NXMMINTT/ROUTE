import { useMemo } from "react";
import * as THREE from "three";

// ถนนโค้งในช่วงท้ายของหน้าแรก
// เส้นทาง (curve) ใช้ร่วมกันทั้งพื้นถนน เส้นประ รถ และกล้อง
// หมายเหตุ: three.js เวอร์ชันนี้เปิด ColorManagement อัตโนมัติ (constructor ของ
// THREE.Color แปลง sRGB->linear ให้เองแล้ว) ห้ามเรียก .convertSRGBToLinear() ซ้ำ
// ไม่งั้นสีจะถูกแปลงซ้อนสองรอบแล้วมืดผิดที่ตั้งไว้มาก
const ASPHALT_COLOR = 0x1c1f22; // ถนนสีเข้ม ตัดกับพื้นหลังขาว
const LANE_COLOR = 0x8a9199;

// พิกัด [x, z] หน่วยเป็น "เท่าของความยาวรถ" จุดเริ่มวิ่ง (START) อยู่ที่ 0
// ช่วง [-3..0] คือถนนตรงด้านหลังรถ ต้องคลุมครึ่งจอตอนกล้องเอียง ห้ามสั้นกว่านี้
// จุดเริ่มวิ่งอยู่บนช่วงตรงพอดี (tangent = +x) ภาพจึงต่อจากฉากเดิมได้โดยไม่กระโดด
// โค้งเป็นวงกลมเสี้ยวหนึ่ง รัศมีกลางถนน 1.15 (~1.7 เท่าความกว้างถนนบนเดสก์ท็อป)
// ศูนย์กลาง (4, 1.15) จุดบนโค้งทุก 15° ([3.7,0] และ [5.15,1.45] กันถนนแอ่นตรงรอยต่อ)
// หลังโค้งทุกจุดต้องมี x เท่ากันเป๊ะ (5.15) ไม่งั้นถนนจะเฉียงทีละนิด
const PTS = [
  [-3, 0], [0, 0], [2, 0], [3.7, 0],
  [4, 0], [4.298, 0.039], [4.575, 0.154], [4.813, 0.337], [4.996, 0.575], [5.111, 0.852], [5.15, 1.15],
  [5.15, 1.45], [5.15, 3], [5.15, 8], [5.15, 14], [5.15, 20],
];
const START = PTS[1];
// ถนนสาขาแยกตรงไปทางขวาจากจุด 60° บนโค้ง (ต้องเป็นจุดเดียวกับใน PTS เป๊ะ ถนนสองเส้นถึงจะต่อกันพอดี)
const BRANCH_PTS = [[4.996, 0.575], [10.996, 0.575], [20.996, 0.575]];

const toCurve = (pts, length) =>
  new THREE.CatmullRomCurve3(
    pts.map(([x, z]) => new THREE.Vector3(x * length, 0, z * length)),
    false,
    "centripetal",
    0.5
  );

const UP = new THREE.Vector3(0, 1, 0);
const normalAt = (curve, t) => new THREE.Vector3().crossVectors(UP, curve.getTangentAt(t)).normalize();

// แถบแบนตามเส้นทาง (พื้นถนน/เส้นขอบ) ช่วง t ของเส้นทาง [ta, tb] เยื้องจากกลางถนน offset
function ribbon(curve, width, offset, ta, tb, y, mat) {
  const segments = Math.max(2, Math.ceil(((tb - ta) * curve.getLength()) / 0.25));
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segments; i++) {
    // clamp: ปัดเศษทศนิยมอาจได้ t เกิน 1 นิดเดียว แล้ว getPointAt คืน NaN จนฉากพัง
    const t = Math.min(1, ta + ((tb - ta) * i) / segments);
    const p = curve.getPointAt(t);
    const n = normalAt(curve, t);
    const a = offset - width / 2;
    const b = offset + width / 2;
    pos.push(p.x + n.x * a, y, p.z + n.z * a, p.x + n.x * b, y, p.z + n.z * b);
    if (i < segments) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return new THREE.Mesh(g, mat);
}

// เส้นประตามเส้นทาง หมุนตาม tangent เริ่มนับจากระยะ fromD (หน่วยโลก)
function dashes(curve, offset, len, gap, w, fromD, mat, parent) {
  const total = curve.getLength();
  const g = new THREE.PlaneGeometry(len, w);
  for (let d = fromD + gap / 2; d <= total; d += gap) {
    const t = d / total;
    const p = curve.getPointAt(t);
    const tan = curve.getTangentAt(t);
    const n = normalAt(curve, t);
    const m = new THREE.Mesh(g, mat);
    m.position.set(p.x + n.x * offset, 0.012, p.z + n.z * offset);
    m.rotation.set(-Math.PI / 2, 0, Math.atan2(-tan.z, tan.x));
    m.renderOrder = 1;
    parent.add(m);
  }
}

// ระยะตามเส้นทาง (หน่วยโลก) ของจุดบนเส้นที่ใกล้ [x, z] (หน่วยเท่าความยาวรถ ในกรอบที่เลื่อนแล้ว) ที่สุด
function distanceAt(curve, [x, z], length) {
  const target = new THREE.Vector3(x * length, 0, z * length);
  const SAMPLES = 2000;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i <= SAMPLES; i++) {
    const d = curve.getPointAt(i / SAMPLES).distanceToSquared(target);
    if (d < bestD) {
      bestD = d;
      best = i / SAMPLES;
    }
  }
  return best * curve.getLength();
}

/**
 * สร้างเส้นทาง + วัสดุครั้งเดียวต่อความยาวรถ ส่วนพื้นถนน/เส้นประสร้างใหม่ผ่าน build(roadWidth)
 * ทุกครั้งที่ resize เพราะความกว้างถนนอิงกรอบกล้อง
 * พิกัดของ road อยู่ในกรอบที่จุดเริ่มวิ่งเป็น (0,0,0) HeroScene เลื่อนทั้งกลุ่มไปที่ตำแหน่งรถจริง
 */
export function useRoad(length) {
  return useMemo(() => {
    const asphaltMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(ASPHALT_COLOR),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide, // ribbon สร้างหน้าคว่ำลง ไม่ใส่ DoubleSide จะมองจากด้านบนไม่เห็น
    });
    const laneMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(LANE_COLOR),
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });

    const shift = ([x, z]) => [x - START[0], z - START[1]];
    const curve = toCurve(PTS.map(shift), length);
    const branch = toCurve(BRANCH_PTS.map(shift), length);
    const LEN = curve.getLength();
    // ระยะตามเส้นทางของจุดใดๆ ในพิกัดของ PTS (ใช้กับจุดเริ่มวิ่ง สามแยก และจุดข้อความ)
    const distanceOf = (pt) => distanceAt(curve, shift(pt), length);
    const d0 = distanceOf(START);

    // ข้อมูลสามแยก: ระยะบนเส้นหลัก, ฝั่งที่ถนนสาขาแยกออก, มุมระหว่างสองเส้น
    const dJ = distanceOf(BRANCH_PTS[0]);
    const nJ = normalAt(curve, dJ / LEN);
    const bTan = branch.getTangentAt(0);
    const junctionSide = Math.sign(nJ.dot(bTan));
    const junctionSin = Math.max(0.3, Math.abs(new THREE.Vector3().crossVectors(curve.getTangentAt(dJ / LEN), bTan).y));

    const road = new THREE.Group();

    function build(roadWidth) {
      road.children.forEach((c) => c.geometry.dispose());
      road.clear();

      const addAsphalt = (c) => road.add(ribbon(c, roadWidth, 0, 0, 1, 0, asphaltMat));
      addAsphalt(curve);
      addAsphalt(branch);

      // เส้นขอบถนนที่ ±0.46 และหนา 0.012 ของความกว้างถนน (เท่าถนนตรงเดิม)
      // ฝั่งที่ถนนสาขาแยกออกต้องเว้นช่วงปากทาง ไม่งั้นเส้นขอบจะขีดขวางสามแยก
      const edgeW = roadWidth * 0.012;
      const mouth = roadWidth / 2 / junctionSin;
      const addEdge = (c, offset, ta, tb) => {
        const m = ribbon(c, edgeW, offset, ta, tb, 0.01, laneMat);
        m.renderOrder = 1;
        road.add(m);
      };
      [1, -1].forEach((s) => {
        const offset = s * roadWidth * 0.46;
        if (s === junctionSide) {
          addEdge(curve, offset, 0, (dJ - mouth) / LEN);
          addEdge(curve, offset, (dJ + mouth) / LEN, 1);
        } else {
          addEdge(curve, offset, 0, 1);
        }
        addEdge(branch, offset, mouth / branch.getLength(), 1);
      });

      // เส้นประ 2 แถวที่ ±0.17 ของความกว้างถนน ขนาดสัมพันธ์กับความยาวรถ (เท่าถนนตรงเดิม)
      const dashLength = length * 0.18;
      const dashGap = length * 0.5;
      [1, -1].forEach((s) => {
        const offset = s * roadWidth * 0.17;
        dashes(curve, offset, dashLength, dashGap, 0.14, 0, laneMat, road);
        dashes(branch, offset, dashLength, dashGap, 0.14, mouth, laneMat, road);
      });
    }

    return { road, build, curve, LEN, d0, distanceOf, asphaltMat, laneMat };
  }, [length]);
}
