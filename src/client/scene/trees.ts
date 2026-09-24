import { Q } from "../quality";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../../shared/rng";
import type { Tree } from "../../shared/world";
import { NOISE_GLSL } from "./glslNoise";

/*
 * Neem and banyan trees, grown procedurally: a leaning, tapering trunk that forks into a few
 * branches, and a canopy of soft leafy clumps (noise-displaced spheres) shaded from dark inside to
 * sunlit on top. The canopy sways in the same wind as the grass. All trees share two draw calls.
 */
const barkMat = new THREE.MeshStandardMaterial({ color: "#5a4636", roughness: 1 });
function leafMaterial(uniforms: { uTime: { value: number } }) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\n" + NOISE_GLSL)
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
        vec4 wpos = modelMatrix * vec4(transformed, 1.0);
        float g = bgNoise(wpos.xz * 0.045 + vec2(uTime * 0.23, uTime * 0.11));
        float sway = (g - 0.35) * 0.35 + sin(uTime * 1.7 + wpos.x * 0.3 + wpos.z * 0.2) * 0.05;
        transformed.x += sway * color.a * 1.0;
        transformed.z += sway * color.a * 0.45;`,
      );
  };
  return m;
}

/** A tapered tube along a list of points (a trunk or a branch). */
function tube(points: THREE.Vector3[], r0: number, r1: number) {
  const curve = new THREE.CatmullRomCurve3(points);
  const g = new THREE.TubeGeometry(curve, 8, 1, 7, false);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const n = g.getAttribute("normal") as THREE.BufferAttribute;
  // TubeGeometry has a fixed radius; taper it by pulling vertices toward the curve
  const segs = 8, rad = 7;
  for (let i = 0; i <= segs; i++) {
    const c = curve.getPointAt(i / segs);
    const r = r0 + (r1 - r0) * (i / segs);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      p.setXYZ(k, c.x + n.getX(k) * r, c.y + n.getY(k) * r, c.z + n.getZ(k) * r);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** One leafy clump: a lumpy sphere, darker underneath, with a sway weight in vertex alpha. */
function clump(center: THREE.Vector3, radius: number, rnd: () => number, base: THREE.Color, sway: number) {
  const g = new THREE.IcosahedronGeometry(radius, Q.treeDetail);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  const cols = new Float32Array(p.count * 4);
  const nrm = new Float32Array(p.count * 3);
  const tmp = new THREE.Color();
  const seed = rnd() * 100;
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i);
    const d = v.clone().normalize();
    const bump = 1 + 0.16 * Math.sin(d.x * 5.1 + seed) * Math.sin(d.y * 4.3 + seed * 0.7) * Math.sin(d.z * 5.7 + seed * 1.3) + 0.05 * Math.sin(d.x * 17 + d.z * 13 + seed);
    v.multiplyScalar(bump);
    v.y *= 0.78; // a little flattened, like a real canopy
    p.setXYZ(i, v.x + center.x, v.y + center.y, v.z + center.z);
    // soft, rounded shading: normals point out from the clump's centre, not per facet
    nrm.set([d.x, d.y * 1.2, d.z], i * 3);
    const up = d.y * 0.5 + 0.5;
    tmp.copy(base).multiplyScalar(0.5 + 0.7 * up).offsetHSL(0.015 * Math.sin(d.x * 9 + seed), 0, 0.05 * Math.sin(d.y * 11 + d.z * 7 + seed));
    cols.set([tmp.r, tmp.g, tmp.b, sway * (0.4 + 0.6 * up)], i * 4);
  }
  g.setAttribute("color", new THREE.BufferAttribute(cols, 4));
  g.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  g.normalizeNormals();
  return g;
}

export class Trees {
  readonly group = new THREE.Group();
  readonly uniforms = { uTime: { value: 0 } };

  constructor(trees: Tree[], groundAt: (x: number, z: number) => number) {
    const barks: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const neemGreen = new THREE.Color("#4f7a2e"), banyanGreen = new THREE.Color("#3f6b2a");
    for (const t of trees) {
      const rnd = mulberry32(Math.floor(t.x * 131 + t.z * 7));
      const y0 = groundAt(t.x, t.z) - 0.2;
      const big = t.kind === "banyan";
      const H = big ? 5.6 : t.h * 0.95 + 0.6;
      const lean = new THREE.Vector3((rnd() - 0.5) * 0.9, 0, (rnd() - 0.5) * 0.9);
      const top = new THREE.Vector3(t.x, y0 + H, t.z).add(lean);
      const trunk = [new THREE.Vector3(t.x, y0, t.z), new THREE.Vector3(t.x + lean.x * 0.3, y0 + H * 0.45, t.z + lean.z * 0.3), top];
      barks.push(tube(trunk, big ? 0.75 : 0.26, big ? 0.45 : 0.14));
      // branches fanning out to hold the canopy
      const nb = big ? 7 : 3 + Math.floor(rnd() * 2);
      const tips: THREE.Vector3[] = [];
      for (let i = 0; i < nb; i++) {
        const a = (i / nb) * Math.PI * 2 + rnd();
        const reach = (big ? t.r * 0.7 : t.r * 0.7) * (0.6 + rnd() * 0.4);
        const tip = top.clone().add(new THREE.Vector3(Math.cos(a) * reach, (big ? 0.6 : 0.9) + rnd() * 0.8, Math.sin(a) * reach));
        const mid = top.clone().lerp(tip, 0.5).add(new THREE.Vector3(0, 0.4, 0));
        barks.push(tube([top.clone().add(new THREE.Vector3(0, -0.3, 0)), mid, tip], big ? 0.3 : 0.12, 0.05));
        tips.push(tip);
      }
      if (big) {
        // aerial roots dropping from the branches, the banyan's signature
        for (const tip of tips.slice(0, 5)) {
          const foot = new THREE.Vector3(tip.x * 0.8 + t.x * 0.2, 0, tip.z * 0.8 + t.z * 0.2);
          foot.y = groundAt(foot.x, foot.z) - 0.1;
          barks.push(tube([tip.clone().add(new THREE.Vector3(0, -0.4, 0)), foot.clone().lerp(tip, 0.5), foot], 0.09, 0.14));
        }
      }
      // the canopy: clumps around the branch tips and over the crown
      const green = (big ? banyanGreen : neemGreen).clone().offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06);
      const sway = big ? 0.25 : 0.6;
      for (const tip of tips) leaves.push(clump(tip.clone().add(new THREE.Vector3(0, 0.5, 0)), (big ? 2.6 : t.r * 0.62) * (0.8 + rnd() * 0.4), rnd, green, sway));
      leaves.push(clump(top.clone().add(new THREE.Vector3(0, big ? 1.8 : 1.4, 0)), big ? 3.8 : t.r * 0.85, rnd, green, sway));
      if (big) for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2, d = rnd() * t.r * 0.8;
        leaves.push(clump(top.clone().add(new THREE.Vector3(Math.cos(a) * d, 1 + rnd() * 1.4, Math.sin(a) * d)), 2.4 + rnd(), rnd, green, sway));
      }
    }
    for (const [geos, mat] of [[barks, barkMat], [leaves, leafMaterial(this.uniforms)]] as const) {
      const clean = geos.map((g) => {
        const q = g.index ? g.toNonIndexed() : g;
        for (const k of Object.keys(q.attributes)) if (!["position", "normal", "color"].includes(k)) q.deleteAttribute(k);
        if (!q.getAttribute("color")) {
          const c = new Float32Array(q.getAttribute("position").count * 4).fill(1);
          q.setAttribute("color", new THREE.BufferAttribute(c, 4));
        }
        return q;
      });
      const merged = mergeGeometries(clean);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  update(t: number) {
    this.uniforms.uTime.value = t;
  }
}
