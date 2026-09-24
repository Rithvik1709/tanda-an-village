import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { advance, CROP_IDS, type CropId, stageOf } from "../../shared/crops";
import { mulberry32 } from "../../shared/rng";
import type { Save } from "../../shared/save";
import { D, W } from "../../shared/world";
import { NOISE_GLSL } from "./glslNoise";

/*
 * The fields: ploughed furrows on every tilled cell (darker and glossier when watered), and the
 * crops growing on them — jowar, onion and sugarcane in four stages each, modelled from curved
 * leaf ribbons and jointed stalks, instanced, swaying in the wind. A soft square marks the cell
 * you're aiming at.
 */
type Part = THREE.BufferGeometry;
const col = (g: Part, c: THREE.Color | string, sway: number, tipLighten = 0.25) => {
  const cc = new THREE.Color(c);
  const p = g.getAttribute("position") as THREE.BufferAttribute;
  let maxY = 0.001;
  for (let i = 0; i < p.count; i++) maxY = Math.max(maxY, p.getY(i));
  const a = new Float32Array(p.count * 4);
  const t = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const h = Math.max(0, p.getY(i)) / maxY;
    t.copy(cc).multiplyScalar(0.7 + 0.3 * h + tipLighten * h * h);
    a.set([t.r, t.g, t.b, sway], i * 4);
  }
  g.setAttribute("color", new THREE.BufferAttribute(a, 4));
  return g;
};

/** A leaf: a ribbon that rises, arches and droops, tapering to a point. */
function leaf(len: number, width: number, yaw: number, lift: number, droop: number, y0 = 0): Part {
  const seg = 7;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const out = t * len * Math.cos(lift);
    const up = t * len * Math.sin(lift) - droop * t * t * len;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (1 - t * 0.5);
    const cx = Math.sin(yaw) * out, cz = Math.cos(yaw) * out;
    const nx = Math.cos(yaw) * w, nz = -Math.sin(yaw) * w;
    pos.push(cx - nx, y0 + up, cz - nz, cx + nx, y0 + up + w * 0.2, cz + nz);
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}
const stalk = (h: number, r: number, x = 0, z = 0, lean = 0) => {
  const g = new THREE.CylinderGeometry(r * 0.7, r, h, 6, 3);
  g.translate(0, h / 2, 0);
  g.rotateZ(lean);
  g.translate(x, 0, z);
  return g.toNonIndexed();
};

const GREEN = "#5f8f33", DEEP = "#3f6d27", YELLOWING = "#a8a24a";

function jowar(stage: number, r: () => number): Part[] {
  const H = [0.25, 0.7, 1.35, 1.9][stage];
  const parts: Part[] = [];
  const green = stage === 3 ? YELLOWING : GREEN;
  if (stage > 0) parts.push(col(stalk(H, 0.025), stage === 3 ? "#9a9a48" : "#6f9a3a", 1));
  const n = [3, 5, 7, 7][stage];
  for (let i = 0; i < n; i++) {
    const y = stage ? (i / n) * H * 0.8 : 0;
    parts.push(col(leaf(H * (stage ? 0.55 : 1.1), 0.045, r() * 6.28, 0.9 - (i / n) * 0.3, 0.55, y), i % 2 ? green : DEEP, 1));
  }
  if (stage === 3) {
    // the ripe head: a loose oval panicle of tan-and-rust grain
    const head = new THREE.SphereGeometry(0.1, 10, 8);
    head.scale(1, 1.9, 1);
    const p = head.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + 0.25 * Math.sin(i * 1.7)), p.getY(i), p.getZ(i) * (1 + 0.25 * Math.cos(i * 1.3)));
    head.translate(0.02, H + 0.12, 0);
    parts.push(col(head.toNonIndexed(), "#b8864a", 1, 0.1));
  }
  return parts;
}

function onion(stage: number, r: () => number): Part[] {
  const H = [0.14, 0.3, 0.45, 0.4][stage];
  const parts: Part[] = [];
  const n = [3, 5, 7, 7][stage];
  for (let i = 0; i < n; i++) {
    const g = leaf(H * (0.8 + r() * 0.4), 0.018, r() * 6.28, 1.35 - (stage === 3 ? 0.6 : 0.15) * r(), stage === 3 ? 0.7 : 0.15);
    parts.push(col(g, stage === 3 && i % 2 ? YELLOWING : "#5a9a45", 1, 0.3));
  }
  if (stage >= 2) {
    // the bulb swelling at the soil, pink-purple, half out of the earth when ripe
    const b = new THREE.SphereGeometry(stage === 3 ? 0.09 : 0.055, 12, 9);
    b.scale(1, 0.85, 1);
    b.translate(0, stage === 3 ? 0.04 : 0, 0);
    parts.push(col(b.toNonIndexed(), "#b0506a", 0, 0.2));
  }
  return parts;
}

function sugarcane(stage: number, r: () => number): Part[] {
  const H = [0.35, 0.9, 1.9, 2.6][stage];
  const parts: Part[] = [];
  const canes = [1, 2, 3, 4][stage];
  for (let c = 0; c < canes; c++) {
    const x = (r() - 0.5) * 0.18, z = (r() - 0.5) * 0.18, lean = (r() - 0.5) * 0.12;
    const h = H * (0.8 + r() * 0.2);
    if (stage > 0) {
      parts.push(col(stalk(h * 0.8, 0.035, x, z, lean), stage === 3 ? "#b9ac52" : "#7a9a3c", 0.6, 0));
      // joints
      for (let j = 0.25; j < h * 0.8; j += 0.28) {
        const ring = new THREE.TorusGeometry(0.037, 0.008, 4, 8);
        ring.rotateX(Math.PI / 2);
        ring.translate(x + Math.sin(-lean) * j, j, z);
        parts.push(col(ring.toNonIndexed(), "#556b2a", 0.6, 0));
      }
    }
    for (let i = 0; i < 4; i++) parts.push(col(leaf(h * 0.55, 0.04, r() * 6.28, 1.0 - i * 0.12, 0.6, h * (stage ? 0.55 + i * 0.08 : 0)), stage === 3 && i === 0 ? YELLOWING : i % 2 ? GREEN : DEEP, 1));
  }
  return parts;
}

const BUILD: Record<CropId, (s: number, r: () => number) => Part[]> = { jowar, onion, sugarcane };
const MAX = 3000;

export class Fields {
  readonly group = new THREE.Group();
  private plants = new Map<string, THREE.InstancedMesh>(); // crop:stage
  private furrows: THREE.InstancedMesh;
  private wetFurrows: THREE.InstancedMesh;
  private uniforms = { uTime: { value: 0 } };
  readonly aim: THREE.Mesh;

  constructor() {
    const plantMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    plantMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\n" + NOISE_GLSL)
        .replace(
          "#include <begin_vertex>",
          /* glsl */ `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float g = bgNoise(ip.xz * 0.045 + vec2(uTime * 0.23, uTime * 0.11));
          float k = color.a * max(transformed.y, 0.0) * max(transformed.y, 0.0);
          transformed.x += ((g - 0.3) * 0.22 + sin(uTime * 2.3 + ip.x + ip.z) * 0.04) * k;
          transformed.z += (sin(uTime * 1.7 + ip.z * 0.8) * 0.05) * k;`,
        );
    };
    for (const crop of CROP_IDS)
      for (let st = 0; st < 4; st++) {
        // three variants per stage, merged into one geometry with its own sway colours
        const parts = BUILD[crop](st, mulberry32(crop.length * 97 + st * 13));
        const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => {
          for (const k of Object.keys(p.attributes)) if (!["position", "normal", "color"].includes(k)) p.deleteAttribute(k);
          return p;
        }))!;
        const m = new THREE.InstancedMesh(g, plantMat, MAX);
        m.count = 0;
        m.castShadow = true;
        m.receiveShadow = true;
        m.frustumCulled = false;
        this.group.add(m);
        this.plants.set(`${crop}:${st}`, m);
      }
    // a tilled cell: two soft ridges with a furrow between, raised a hair above the ground
    const furrow = new THREE.PlaneGeometry(1.02, 1.02, 4, 16);
    furrow.rotateX(-Math.PI / 2);
    const p = furrow.getAttribute("position") as THREE.BufferAttribute;
    const fc = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const ridge = Math.abs(Math.sin((p.getZ(i) + 0.5) * Math.PI * 2)); // two ridges per cell
      const edge = Math.min(1, (0.51 - Math.max(Math.abs(p.getX(i)), Math.abs(p.getZ(i)))) * 12); // slope down into the ground at the edges
      p.setY(i, (0.02 + 0.11 * ridge) * Math.max(0, edge));
      const k = 0.62 + 0.5 * ridge;
      fc.set([k, k, k], i * 3);
    }
    furrow.setAttribute("color", new THREE.BufferAttribute(fc, 3));
    furrow.computeVertexNormals();
    const dry = new THREE.MeshStandardMaterial({ color: "#6a4d36", roughness: 1, vertexColors: true });
    const wet = new THREE.MeshStandardMaterial({ color: "#3e2c20", roughness: 0.6, vertexColors: true });
    this.furrows = new THREE.InstancedMesh(furrow, dry, MAX);
    this.wetFurrows = new THREE.InstancedMesh(furrow, wet, MAX);
    for (const f of [this.furrows, this.wetFurrows]) {
      f.count = 0;
      f.receiveShadow = true;
      f.frustumCulled = false;
      this.group.add(f);
    }
    // the aim marker: a soft glowing square outline
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g2 = c.getContext("2d")!;
    g2.strokeStyle = "rgba(255,244,210,0.95)";
    g2.lineWidth = 5;
    g2.shadowColor = "rgba(255,230,160,1)";
    g2.shadowBlur = 8;
    g2.strokeRect(6, 6, 52, 52);
    const tex = new THREE.CanvasTexture(c);
    const ag = new THREE.PlaneGeometry(1, 1);
    ag.rotateX(-Math.PI / 2);
    this.aim = new THREE.Mesh(ag, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    this.aim.renderOrder = 4;
    this.aim.visible = false;
    this.group.add(this.aim);
  }

  /** Rebuild instances from the save (called when it changes, and twice a second as crops grow). */
  sync(save: Save, now: number, groundY: (x: number, z: number) => number) {
    const counts = new Map<string, number>();
    for (const m of this.plants.values()) m.count = 0;
    this.furrows.count = 0;
    this.wetFurrows.count = 0;
    let dry = 0, wet = 0;
    const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
    for (const [k, cell] of Object.entries(save.farm)) {
      const i = Number(k), x = i % W, z = Math.floor(i / W) % D;
      const y = groundY(x + 0.5, z + 0.5);
      const f = cell.wetUntil > now ? this.wetFurrows : this.furrows;
      mtx.makeTranslation(x + 0.5, y, z + 0.5);
      if (f.count < MAX) f.setMatrixAt(f.count++, mtx);
      if (cell.wetUntil > now) wet++;
      else dry++;
      if (!cell.plant) continue;
      const pl = advance(cell.plant, cell.wetUntil, now);
      const st = stageOf(pl.progress);
      const key = `${pl.crop}:${st}`;
      const m = this.plants.get(key)!;
      const n = counts.get(key) ?? 0;
      if (n >= MAX) continue;
      // each plant a little different: turned, sized and nudged by its cell
      const h = Math.sin(i * 12.9898) * 43758.5453;
      const rnd = h - Math.floor(h);
      const grow = st === 3 ? 1 : 0.75 + 0.35 * ((pl.progress - [0, 0.2, 0.5, 1][st]) / ([0.2, 0.3, 0.5, 1][st] || 1));
      q.setFromAxisAngle(v.set(0, 1, 0), rnd * Math.PI * 2);
      s.setScalar((0.9 + rnd * 0.2) * Math.min(1.15, grow));
      mtx.compose(v.set(x + 0.5 + (rnd - 0.5) * 0.15, y + 0.05, z + 0.5 + (rnd * 7 % 1 - 0.5) * 0.15), q, s);
      m.setMatrixAt(n, mtx);
      counts.set(key, n + 1);
    }
    for (const [key, m] of this.plants) {
      m.count = counts.get(key) ?? 0;
      m.instanceMatrix.needsUpdate = true;
    }
    this.furrows.instanceMatrix.needsUpdate = true;
    this.wetFurrows.instanceMatrix.needsUpdate = true;
    void dry;
    void wet;
  }

  setAim(cell: { x: number; z: number } | null, y = 0) {
    this.aim.visible = !!cell;
    if (cell) this.aim.position.set(cell.x + 0.5, y + 0.14, cell.z + 0.5);
  }

  update(t: number) {
    this.uniforms.uTime.value = t;
  }
}
