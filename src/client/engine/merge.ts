import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/*
 * Box models (villagers, bulls, the cart) are built from dozens of tiny meshes, one draw call
 * each. This bakes every group's plain-coloured meshes into one vertex-coloured mesh while keeping
 * the groups themselves, so legs, heads and wheels still animate.
 */
const shared = new THREE.MeshLambertMaterial({ vertexColors: true });
const sharedStd = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });

/** The same for the modelled figures: plain-coloured standard-material parts, merged per bone group. */
export function mergeParts(root: THREE.Object3D) {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => groups.push(o));
  for (const g of groups) {
    const meshes = g.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material instanceof THREE.MeshStandardMaterial && !c.material.map && !c.material.vertexColors && c.material.side === THREE.FrontSide,
    );
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      const col = (m.material as THREE.MeshStandardMaterial).color;
      const n = geo.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
      geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
      for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "color"].includes(k)) geo.deleteAttribute(k);
      return geo;
    });
    const merged = mergeGeometries(parts);
    if (!merged) continue;
    for (const m of meshes) g.remove(m);
    const mesh = new THREE.Mesh(merged, sharedStd);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

export function mergeBoxes(root: THREE.Object3D) {
  const groups: THREE.Object3D[] = [];
  root.traverse((o) => groups.push(o));
  for (const g of groups) {
    const meshes = g.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.material instanceof THREE.MeshLambertMaterial && !c.material.map && !c.material.vertexColors,
    );
    if (meshes.length < 2) continue;
    const parts = meshes.map((m) => {
      m.updateMatrix();
      const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone()).applyMatrix4(m.matrix);
      const col = (m.material as THREE.MeshLambertMaterial).color;
      const n = geo.getAttribute("position").count;
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) c.set([col.r, col.g, col.b], i * 3);
      geo.setAttribute("color", new THREE.BufferAttribute(c, 3));
      for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "color"].includes(k)) geo.deleteAttribute(k);
      return geo;
    });
    const merged = mergeGeometries(parts);
    if (!merged) continue;
    for (const m of meshes) {
      g.remove(m);
      m.geometry.dispose();
    }
    g.add(new THREE.Mesh(merged, shared));
  }
}
