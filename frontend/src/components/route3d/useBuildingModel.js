import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// ด้านที่ยาวที่สุดของตึก (รวมแผ่นพื้น) หลังปรับสเกล หน่วยโลก ต้องเล็กกว่าระยะห่างระหว่างจุดลูกค้า
export const BUILDING_FOOTPRINT = 0.9;
// ตึกลูกค้าคละกันตามลำดับ id ส่วน depot ใช้โมเดลแยก (ต่ำ/กว้าง ยืดตามความสูงไม่ได้ จึงไม่เอาไปเป็นลูกค้า)
const CUSTOMER_MODELS = ["/models/office-1.glb", "/models/office-2.glb", "/models/office-3.glb"];
const DEPOT_MODEL = "/models/depot.glb";
const ALL_MODELS = [...CUSTOMER_MODELS, DEPOT_MODEL];

const baked = new WeakMap();

/**
 * โมเดลตึกมี 26–56 mesh ต่อหลัง วาดทีละ mesh ต่อจุดลูกค้าจะหนัก จึงรวม geometry ตามวัสดุให้เหลือ 6–12 mesh
 * (ใช้ geometry ร่วมกันทุกหลัง) พร้อมย่อให้ยาว BUILDING_FOOTPRINT วางกึ่งกลาง x/z และฐานอยู่ที่ y = 0
 * คืน parts: [{ geometry, material, isBase }] (isBase = แผ่นพื้นใต้ตึก ใช้ย้อมสีตามเส้นทาง) และ height หลังปรับสเกล
 */
function bake(scene) {
  scene.updateMatrixWorld(true);
  const byMaterial = new Map();
  scene.traverse((node) => {
    if (!node.isMesh) return;
    // โมเดลไม่มี texture จึงไม่ต้องใช้ UV เก็บแค่ตำแหน่ง/normal และทำให้เป็น non-indexed เหมือนกันหมด
    // (mesh ในวัสดุเดียวกันบางตัวมี uv1/index บางตัวไม่มี รวมกันตรงๆ ไม่ได้)
    const g = node.geometry.index ? node.geometry.toNonIndexed() : node.geometry.clone();
    Object.keys(g.attributes).forEach((name) => name !== "position" && name !== "normal" && g.deleteAttribute(name));
    g.applyMatrix4(node.matrixWorld);
    if (!byMaterial.has(node.material)) byMaterial.set(node.material, []);
    byMaterial.get(node.material).push(g);
  });

  const parts = [...byMaterial].map(([material, geos]) => ({ geometry: mergeGeometries(geos), material, isBase: false }));

  const box = new THREE.Box3();
  parts.forEach((p) => {
    p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox);
  });
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const s = BUILDING_FOOTPRINT / Math.max(size.x, size.z);
  const partSize = new THREE.Vector3();
  parts.forEach((p) => {
    p.geometry.translate(-center.x, -box.min.y, -center.z);
    p.geometry.scale(s, s, s);
    // แผ่นพื้น = ชิ้นบางที่กว้างเต็มฐาน (ชื่อวัสดุของแต่ละโมเดลไม่เหมือนกัน เช็คจากชื่อไม่ได้)
    p.geometry.computeBoundingBox();
    p.geometry.boundingBox.getSize(partSize);
    p.isBase = partSize.x > BUILDING_FOOTPRINT * 0.99 && partSize.z > BUILDING_FOOTPRINT * 0.99 && partSize.y < BUILDING_FOOTPRINT * 0.1;
  });

  return { parts, height: size.y * s };
}

/** คืน { customers: [ตึกลูกค้า...], depot } แต่ละตัวคือ { parts, height } ที่ bake แล้ว (แคชต่อโมเดล) */
export function useBuildingModels() {
  const gltfs = useGLTF(ALL_MODELS);
  return useMemo(() => {
    const models = gltfs.map(({ scene }) => {
      if (!baked.has(scene)) baked.set(scene, bake(scene));
      return baked.get(scene);
    });
    return { customers: models.slice(0, CUSTOMER_MODELS.length), depot: models[CUSTOMER_MODELS.length] };
  }, [gltfs]);
}

useGLTF.preload(ALL_MODELS);
