import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

// ชื่อ mesh ของ car.glb เป็น Object_NN จึงเช็คจากชื่อ node แม่ (เช่น ...TrafficTire_Max_...)
const WHEEL_NAME_RE = /wheel|tire|tyre|rim|brakedisc/i;
// ค่าคงที่หลายตัว (ความสูงเส้นประถนน 0.14, แอมพลิจูดเด้งตัวถัง ฯลฯ ใน useRoad/timeline)
// จูนไว้สำหรับรถยาว ~10.2 หน่วย ถ้าโมเดล .glb ที่โหลดมามีสเกลเล็ก/ใหญ่กว่านั้นมาก
// (หน่วยที่ export มาไม่ตรงกับหน่วยของฉาก) ต้องปรับสเกลให้ยาวเท่ากันก่อน ไม่งั้นเส้นประ/ความกว้างถนนจะผิดสัดส่วน
const REFERENCE_LENGTH = 10.2;

// ล้อทั้ง 4 ใน car.glb ถูกรวมเป็น mesh เดียวต่อชิ้นส่วน (ยาง/ล้อแม็ก/จานเบรก) จึงหมุนทีละล้อไม่ได้
// แยกสามเหลี่ยมตามมุมรถ (หน้า/หลัง x ซ้าย/ขวา) ออกเป็น mesh ต่อล้อ แล้วย้ายจุดกำเนิดไปที่กึ่งกลางล้อ
// แกนล้อคือแกน X ของ mesh (ตัวรถยาวตามแกน Z หัวรถอยู่ +Z) หมุนรอบ rotation.x ก็เป็นการกลิ้งไปข้างหน้า
// เรียกผ่านชื่อ method: BufferAttribute กับ InterleavedBufferAttribute มี getX/Y/Z/W ของตัวเองคนละแบบ
const COMPONENT_GETTERS = ["getX", "getY", "getZ", "getW"];

function splitIntoWheels(mesh) {
  const geo = mesh.geometry;
  const { index } = geo;
  const pos = geo.attributes.position;
  if (!index || !mesh.parent) return [];

  geo.computeBoundingBox();
  const mid = geo.boundingBox.getCenter(new THREE.Vector3());
  const groups = [[], [], [], []];
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const cx = (pos.getX(tri[0]) + pos.getX(tri[1]) + pos.getX(tri[2])) / 3;
    const cz = (pos.getZ(tri[0]) + pos.getZ(tri[1]) + pos.getZ(tri[2])) / 3;
    groups[(cx > mid.x ? 1 : 0) + (cz > mid.z ? 2 : 0)].push(...tri);
  }

  const wheels = groups
    .filter((tris) => tris.length)
    .map((tris) => {
      const remap = new Map();
      tris.forEach((v) => remap.has(v) || remap.set(v, remap.size));

      const g = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(geo.attributes)) {
        // อ่านผ่าน getX/Y/Z/W เสมอ ห้ามอ่าน attr.array[i * itemSize] ตรงๆ: ไฟล์ที่ผ่าน optimizer (เช่น gltf-transform)
        // มักเป็น interleaved (หลาย attribute สลับกันใน buffer เดียว) หรือ quantized/normalized แล้วล้อจะเพี้ยนเป็นแผ่นยืด
        // getter คืนค่าจริง (denormalize แล้ว) จึงเก็บลง Float32Array แบบไม่ normalized
        const { itemSize } = attr;
        const arr = new Float32Array(remap.size * itemSize);
        remap.forEach((next, prev) => {
          for (let k = 0; k < itemSize; k++) arr[next * itemSize + k] = attr[COMPONENT_GETTERS[k]](prev);
        });
        g.setAttribute(name, new THREE.BufferAttribute(arr, itemSize));
      }
      const idx = tris.map((v) => remap.get(v));
      g.setIndex(new THREE.BufferAttribute(remap.size > 65535 ? new Uint32Array(idx) : new Uint16Array(idx), 1));

      g.computeBoundingBox();
      const center = g.boundingBox.getCenter(new THREE.Vector3());
      g.translate(-center.x, -center.y, -center.z);

      const wheel = new THREE.Mesh(g, mesh.material);
      wheel.name = mesh.name;
      wheel.userData.isWheel = true; // ให้หาล้อเจอหลัง clone (userData ถูกคัดลอกไปด้วย)
      wheel.position.copy(center);
      mesh.parent.add(wheel);
      return wheel;
    });

  mesh.parent.remove(mesh);
  return wheels;
}

// โมเดลที่แยกล้อ/หมุน/ย่อแล้ว เก็บไว้ต่อ scene ที่โหลดมา (useGLTF แคช scene ร่วมกันทั้งแอป)
// รถหลายคันในหน้า 3D จึงไม่ต้องแยกสามเหลี่ยมล้อซ้ำทุกคัน แค่ clone จากแม่แบบซึ่งใช้ geometry ร่วมกัน
const templates = new WeakMap();

function prepare(scene) {
  const model = scene.clone(true);

  const wheelSources = [];
  model.traverse((node) => {
    if (node.isMesh && node.parent && WHEEL_NAME_RE.test(node.parent.name)) wheelSources.push(node);
  });
  const wheels = wheelSources.flatMap(splitIntoWheels);

  const rawBox = new THREE.Box3().setFromObject(model);
  const rawSize = new THREE.Vector3();
  rawBox.getSize(rawSize);
  if (rawSize.z > rawSize.x) model.rotation.y = Math.PI / 2;

  const rotatedBox = new THREE.Box3().setFromObject(model);
  const rotatedSize = new THREE.Vector3();
  rotatedBox.getSize(rotatedSize);
  model.scale.setScalar(REFERENCE_LENGTH / rotatedSize.x);

  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= box.min.y;
  const groundY = model.position.y;

  // ยางคือชิ้นส่วนที่ใหญ่สุดของล้อ ความสูงในแนวตั้งของ bbox = เส้นผ่านศูนย์กลาง
  const wheelSize = new THREE.Vector3();
  let wheelRadius = 0;
  wheels.forEach((w) => {
    new THREE.Box3().setFromObject(w).getSize(wheelSize);
    wheelRadius = Math.max(wheelRadius, wheelSize.y / 2);
  });

  return { model, length: size.x, groundY, wheelRadius: wheelRadius || 1 };
}

/**
 * โหลด car.glb แล้วปรับสเกลให้ยาวเท่า REFERENCE_LENGTH (แทนที่จะใช้ขนาดดิบจากไฟล์ตรงๆ)
 * และหมุนโมเดลให้จมูกรถหันไปทาง +X (ทิศที่รถวิ่ง)
 * คืน model (สำเนาของผู้เรียกแต่ละราย แก้ตำแหน่งได้อิสระ แต่ geometry/material ใช้ร่วมกัน ห้ามแก้ตรงๆ)
 * wheels (mesh ต่อล้อ ให้หมุน rotation.x) กับ wheelRadius (หน่วยฉาก) สำหรับคิดมุมหมุนจากระยะที่วิ่ง
 */
export function useCarModel(url) {
  const { scene } = useGLTF(url);

  return useMemo(() => {
    if (!templates.has(scene)) templates.set(scene, prepare(scene));
    const { model: template, ...info } = templates.get(scene);
    const model = template.clone(true);
    const wheels = [];
    model.traverse((node) => node.userData.isWheel && wheels.push(node));
    return { model, wheels, ...info };
  }, [scene]);
}

useGLTF.preload("/models/car.glb");
