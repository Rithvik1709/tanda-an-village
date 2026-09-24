import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mulberry32 } from "../../shared/rng";
import type { Plot, Structure } from "../../shared/world";
import { mat, TEX } from "./textures";

/*
 * The village, modelled: whitewashed and brick houses with Mangalore-tile or thatch hip roofs,
 * verandah posts and blue doors; market stalls with cloth awnings and produce; the temple with its
 * shikhara and flag; the stone well with its pulley; haystacks; and split-rail fences around every
 * plot. Geometry is merged per material, so the whole village is a few dozen draw calls.
 */
type Bucket = { mat: THREE.Material; geos: THREE.BufferGeometry[] };

export class Village {
  readonly group = new THREE.Group();
  private buckets = new Map<string, Bucket>();
  private flagCloth: THREE.Mesh[] = [];
  private t = 0;
  /** Where the small tungsten bulbs hang (over doors and stall counters), for night lighting. */
  readonly lamps: THREE.Vector3[] = [];
  private bulbMat = new THREE.MeshStandardMaterial({ color: "#fff1d0", emissive: new THREE.Color("#ffb05a"), emissiveIntensity: 0, roughness: 0.3 });

  /** A bare bulb on a short flex, the way village verandahs are lit. */
  private bulb(x: number, y: number, z: number) {
    this.box("dark", () => new THREE.MeshStandardMaterial({ color: "#2a2018" }), 0.015, 0.25, 0.015, x, y + 0.2, z);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), this.bulbMat);
    b.scale.set(1, 1.25, 1);
    b.position.set(x, y, z);
    this.group.add(b);
    this.lamps.push(new THREE.Vector3(x, y - 0.05, z));
  }

  /** 0 by day, 1 at night: the bulbs glow. */
  setNight(k: number) {
    this.bulbMat.emissiveIntensity = k * 4.5;
  }

  private put(key: string, m: () => THREE.Material, g: THREE.BufferGeometry, at?: THREE.Matrix4) {
    if (!this.buckets.has(key)) this.buckets.set(key, { mat: m(), geos: [] });
    const geo = g.index ? g.toNonIndexed() : g.clone();
    if (at) geo.applyMatrix4(at);
    for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
    if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
    this.buckets.get(key)!.geos.push(geo);
  }

  private box(key: string, m: () => THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, uvScale = 1) {
    const g = new THREE.BoxGeometry(w, h, d);
    // world-sized UVs so textures keep their scale on long walls
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const p = g.getAttribute("position") as THREE.BufferAttribute, n = g.getAttribute("normal") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const u = ax > 0.5 ? p.getZ(i) : p.getX(i), v = ay > 0.5 ? p.getZ(i) : p.getY(i);
      uv.setXY(i, (u + w) * 0.33 * uvScale, (v + h / 2) * 0.33 * uvScale);
    }
    this.put(key, m, g, new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
  }

  constructor(structures: Structure[], plots: Plot[], groundAt: (x: number, z: number) => number) {
    const M = {
      plaster: () => mat(TEX.plaster()),
      brick: () => mat(TEX.brick()),
      tiles: () => mat(TEX.tiles(), { roughness: 0.8 }),
      thatch: () => mat(TEX.thatch(), { roughness: 1 }),
      wood: () => mat(TEX.wood()),
      stone: () => mat(TEX.stone()),
      blue: () => new THREE.MeshStandardMaterial({ color: "#2f6a9a", roughness: 0.7 }),
      dark: () => new THREE.MeshStandardMaterial({ color: "#2a2018", roughness: 1 }),
      saffron: () => mat(TEX.cloth("#e07a26", "#f2a24a"), { side: THREE.DoubleSide }),
      blueCloth: () => mat(TEX.cloth("#2f6aa6", "#5b93c8"), { side: THREE.DoubleSide }),
      whiteStone: () => new THREE.MeshStandardMaterial({ color: "#efe8da", roughness: 0.85 }),
      gold: () => new THREE.MeshStandardMaterial({ color: "#d4a24a", roughness: 0.35, metalness: 0.7 }),
      straw: () => mat(TEX.thatch(), { color: "#e8cf8a", roughness: 1 }),
      onion: () => new THREE.MeshStandardMaterial({ color: "#b8506a", roughness: 0.5 }),
      grain: () => new THREE.MeshStandardMaterial({ color: "#d9b36a", roughness: 0.9 }),
      sack: () => new THREE.MeshStandardMaterial({ color: "#c8b48a", roughness: 1 }),
      cane: () => new THREE.MeshStandardMaterial({ color: "#a8b84a", roughness: 0.7 }),
      rope: () => new THREE.MeshStandardMaterial({ color: "#a08a60", roughness: 1 }),
      toran: () => mat(TEX.mirrorWork(), { roughness: 0.6 }),
      tasselA: () => new THREE.MeshStandardMaterial({ color: "#d8342a", roughness: 0.9 }),
      tasselB: () => new THREE.MeshStandardMaterial({ color: "#e8b830", roughness: 0.9 }),
      whiteFlag: () => new THREE.MeshStandardMaterial({ color: "#f6f4ec", roughness: 0.9, side: THREE.DoubleSide }),
      basket: () => mat(TEX.thatch(), { color: "#c09050", roughness: 1 }),
      sprouts: () => new THREE.MeshStandardMaterial({ color: "#8cc84a", roughness: 0.8 }),
    };
    for (const s of structures) {
      if (s.kind === "house") this.house(s, M);
      else if (s.kind === "stall") this.stall(s, M);
      else if (s.kind === "temple") this.temple(s, M);
      else if (s.kind === "well") this.well(s, M);
      else if (s.kind === "hay") this.hay(s, M);
    }
    for (const p of plots) this.fence(p, M, groundAt);
    for (const b of this.buckets.values()) {
      const merged = mergeGeometries(b.geos);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  private house(s: Extract<Structure, { kind: "house" }>, M: Record<string, () => THREE.Material>) {
    const { x0, z0, w, d, y } = s;
    const cx = x0 + w / 2, cz = z0 + d / 2, H = 2.9;
    const wall = s.walls === "brick" ? "brick" : "plaster";
    // a stone plinth, then the walls
    this.box("stone", M.stone, w + 0.3, 0.35, d + 0.3, cx, y + 0.12, cz);
    this.box(wall, M[wall], w, H, d, cx, y + 0.3 + H / 2, cz);
    // a painted band at the base, like lime-washed village houses often have
    if (wall === "plaster") this.box("blue", M.blue, w + 0.02, 0.35, d + 0.02, cx, y + 0.5, cz);
    // the door on its side, with a blue frame; windows with shutters on the others
    const side = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[s.door];
    const face = (sx: number, sz: number, along: number, up: number, ww: number, hh: number, key: string, depth = 0.06) => {
      const fx = cx + sx * (w / 2 + depth / 2) + (sx ? 0 : along), fz = cz + sz * (d / 2 + depth / 2) + (sz ? 0 : along);
      this.box(key, M[key], sx ? depth : ww, hh, sx ? ww : depth, fx, y + 0.3 + up, fz);
    };
    face(side[0], side[1], 0, 1.05, 1.25, 2.1, "blue", 0.08);
    face(side[0], side[1], 0, 1.0, 0.95, 1.95, "wood", 0.1);
    // a Banjara toran over the door: an embroidered, mirror-studded hanging with little tassels
    face(side[0], side[1], 0, 2.25, 1.35, 0.22, "toran", 0.12);
    for (let i = -2; i <= 2; i++) face(side[0], side[1], i * 0.28, 2.02, 0.07, 0.22, i % 2 ? "tasselA" : "tasselB", 0.13);
    // and the bulb under the verandah
    this.bulb(cx + side[0] * (w / 2 + 0.55), y + 0.3 + 2.25, cz + side[1] * (d / 2 + 0.55));
    for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (sx === side[0] && sz === side[1]) continue;
      const span = sx ? d : w;
      for (const off of span > 5 ? [-span / 4, span / 4] : [0]) {
        face(sx, sz, off, 1.6, 0.95, 0.9, "blue", 0.07);
        face(sx, sz, off, 1.6, 0.7, 0.66, "dark", 0.09);
      }
    }
    // hip roof with deep eaves
    const roofKey = s.roof === "thatch" ? "thatch" : "tiles";
    const over = s.roof === "thatch" ? 0.75 : 0.6;
    const rw = w + over * 2, rd = d + over * 2, rh = s.roof === "thatch" ? Math.min(rw, rd) * 0.5 : Math.min(rw, rd) * 0.36;
    const roof = hipRoof(rw, rd, rh, s.roof === "thatch" ? 0.35 : 0.12);
    this.put(roofKey, M[roofKey], roof, new THREE.Matrix4().makeTranslation(cx, y + 0.3 + H, cz));
    // a verandah on the door side: two posts and a lean-to
    const vx = cx + side[0] * (w / 2 + 1.1), vz = cz + side[1] * (d / 2 + 1.1);
    const along = side[0] ? [0, 1] : [1, 0];
    const span = (side[0] ? d : w) * 0.4;
    for (const k of [-1, 1]) this.box("wood", M.wood, 0.16, 2.35, 0.16, vx + along[0] * span * k, y + 0.3 + 1.17, vz + along[1] * span * k);
    const lean = new THREE.BoxGeometry(side[0] ? 2.4 : span * 2 + 0.8, 0.1, side[0] ? span * 2 + 0.8 : 2.4);
    const tilt = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(along[0], 0, along[1]), (side[0] + side[1]) * -0.18 * (side[0] ? -1 : 1));
    this.put(roofKey, M[roofKey], lean, tilt.setPosition(vx - side[0] * 0.2, y + 0.3 + 2.45, vz - side[1] * 0.2));
  }

  private stall(s: Extract<Structure, { kind: "stall" }>, M: Record<string, () => THREE.Material>) {
    const { x0, z0, w, d, y } = s;
    const cx = x0 + w / 2, cz = z0 + d / 2;
    for (const [px, pz] of [[x0 + 0.3, z0 + 0.3], [x0 + w - 0.3, z0 + 0.3], [x0 + 0.3, z0 + d - 0.3], [x0 + w - 0.3, z0 + d - 0.3]])
      this.box("wood", M.wood, 0.18, pz < cz ? 3.1 : 2.6, 0.18, px, y + (pz < cz ? 1.55 : 1.3), pz);
    // the awning slopes down toward the customer (the +z front), with a scalloped edge
    const cloth = s.awning === "saffron" ? "toranCloth" : "blueCloth";
    if (!M.toranCloth) M.toranCloth = () => mat(TEX.mirrorWork(), { side: THREE.DoubleSide, roughness: 0.7 });
    const aw = new THREE.PlaneGeometry(w + 0.6, d + 0.9, 8, 1);
    aw.rotateX(-Math.PI / 2 + 0.2);
    this.put(cloth, M[cloth], aw, new THREE.Matrix4().makeTranslation(cx, y + 2.85, cz + 0.2));
    for (let i = 0; i < w + 1; i++) {
      const fl = new THREE.CircleGeometry(0.3, 10, Math.PI, Math.PI);
      this.put(cloth, M[cloth], fl, new THREE.Matrix4().makeTranslation(x0 - 0.3 + i + 0.4, y + 2.55, cz + (d + 0.9) / 2 * Math.cos(0.2) + 0.2));
    }
    // the counter, and what's for sale on it
    this.box("wood", M.wood, w - 0.4, 0.9, 0.7, cx, y + 0.45, z0 + d - 0.6);
    this.bulb(cx, y + 2.35, cz + 0.4);
    const r = mulberry32(x0 * 31 + z0);
    for (let i = 0; i < 6; i++) {
      const sx = x0 + 0.6 + (i % 3) * ((w - 1.2) / 2), sz = z0 + d - 0.6 + (i < 3 ? -0.15 : 0.15);
      const k = Math.floor(r() * 3);
      const pile = new THREE.SphereGeometry(0.22, 10, 7, 0, Math.PI * 2, 0, Math.PI / 2);
      this.put(["onion", "grain", "cane"][k], M[["onion", "grain", "cane"][k]], pile, new THREE.Matrix4().makeTranslation(sx, y + 0.9, sz));
    }
    for (let i = 0; i < 3; i++) this.box("sack", M.sack, 0.5, 0.6, 0.45, x0 + 0.6 + i * 0.7, y + 0.3, z0 + 0.7, r() * 0.5);
  }

  private temple(s: Extract<Structure, { kind: "temple" }>, M: Record<string, () => THREE.Material>) {
    const cx = s.x0 + 4.5, cz = s.z0 + 4.5, y = s.y;
    this.box("stone", M.stone, 9, 0.5, 9, cx, y - 0.25, cz);
    this.box("stone", M.stone, 7.4, 0.4, 7.4, cx, y + 0.2, cz);
    this.box("whiteStone", M.whiteStone, 5, 3, 5, cx, y + 1.9, cz);
    // the sanctum door facing south, onto the square
    this.box("dark", M.dark, 1.2, 2, 0.1, cx, y + 1.4, cz + 2.52);
    this.box("gold", M.gold, 1.5, 0.12, 0.12, cx, y + 2.45, cz + 2.56);
    // the shikhara: a ribbed, curving tower
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      prof.push(new THREE.Vector2(2.4 * Math.pow(1 - t, 0.75) + 0.05, t * 5.2));
    }
    const tower = new THREE.LatheGeometry(prof, 16);
    const p = tower.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const rib = 1 + 0.07 * Math.cos(a * 8); // the vertical ribs
      p.setX(i, p.getX(i) * rib);
      p.setZ(i, p.getZ(i) * rib);
      p.setY(i, p.getY(i) + Math.floor(p.getY(i) / 0.65) * 0.0);
    }
    tower.computeVertexNormals();
    this.put("whiteStone", M.whiteStone, tower, new THREE.Matrix4().makeTranslation(cx, y + 3.4, cz));
    // the amalaka ring and the gold kalash
    const am = new THREE.TorusGeometry(0.42, 0.16, 8, 16);
    am.rotateX(Math.PI / 2);
    this.put("whiteStone", M.whiteStone, am, new THREE.Matrix4().makeTranslation(cx, y + 8.6, cz));
    this.put("gold", M.gold, new THREE.SphereGeometry(0.25, 12, 10), new THREE.Matrix4().makeTranslation(cx, y + 8.95, cz));
    this.put("gold", M.gold, new THREE.ConeGeometry(0.1, 0.4, 8), new THREE.Matrix4().makeTranslation(cx, y + 9.3, cz));
    // the flag on its pole
    this.box("wood", M.wood, 0.06, 2.2, 0.06, cx + 0.4, y + 9.4, cz);
    // Sevalal Maharaj's shrine flies white flags
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7, 8, 2), M.whiteFlag());
    flag.geometry.translate(0.6, 0, 0);
    flag.position.set(cx + 0.42, y + 10.1, cz);
    this.group.add(flag);
    this.flagCloth.push(flag);
    // more white flags on poles at the corners of the plinth
    for (const [fx, fz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      this.box("wood", M.wood, 0.05, 3.2, 0.05, cx + fx, y + 1.4, cz + fz);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.45, 6, 2), M.whiteFlag());
      f.geometry.translate(0.35, 0, 0);
      f.position.set(cx + fx + 0.03, y + 2.75, cz + fz);
      this.group.add(f);
      this.flagCloth.push(f);
    }
    // Teej: baskets of sprouting wheat that the girls of the tanda tend for the festival
    for (let i = 0; i < 5; i++) {
      const bx = cx - 1.6 + i * 0.8, bz = cz + 3.4;
      this.put("basket", M.basket, new THREE.CylinderGeometry(0.24, 0.16, 0.22, 12), new THREE.Matrix4().makeTranslation(bx, y + 0.5, bz));
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4, r = 0.05 + (k % 4) * 0.045;
        const sp = new THREE.ConeGeometry(0.012, 0.28 + (k % 3) * 0.06, 4);
        this.put("sprouts", M.sprouts, sp, new THREE.Matrix4().makeTranslation(bx + Math.cos(a) * r, y + 0.74, bz + Math.sin(a) * r));
      }
    }
    this.bulb(cx, y + 2.8, cz + 2.9);
    // a bell by the door
    this.box("wood", M.wood, 0.06, 0.6, 0.06, cx + 1.2, y + 2.9, cz + 2.7);
    this.put("gold", M.gold, new THREE.ConeGeometry(0.15, 0.25, 10, 1, true), new THREE.Matrix4().makeTranslation(cx + 1.2, y + 2.5, cz + 2.7));
  }

  private well(s: Extract<Structure, { kind: "well" }>, M: Record<string, () => THREE.Material>) {
    const { x, z, y } = s;
    const cx = x + 0.5, cz = z + 0.5;
    const ring = new THREE.CylinderGeometry(1.35, 1.45, 0.9, 20, 1, true);
    this.put("stone", M.stone, ring, new THREE.Matrix4().makeTranslation(cx, y + 0.45 - 1, cz));
    const inner = new THREE.CylinderGeometry(0.95, 0.95, 0.9, 20, 1, true);
    inner.scale(-1, 1, 1);
    this.put("stone", M.stone, inner, new THREE.Matrix4().makeTranslation(cx, y + 0.45 - 1, cz));
    const lip = new THREE.TorusGeometry(1.15, 0.22, 6, 24);
    lip.rotateX(Math.PI / 2);
    this.put("stone", M.stone, lip, new THREE.Matrix4().makeTranslation(cx, y - 0.1, cz));
    for (const s2 of [-1, 1]) this.box("wood", M.wood, 0.16, 2.4, 0.16, cx + s2 * 1.25, y + 0.6, cz);
    this.box("wood", M.wood, 2.8, 0.14, 0.14, cx, y + 1.8, cz);
    const pulley = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14);
    pulley.rotateX(Math.PI / 2);
    this.put("wood", M.wood, pulley, new THREE.Matrix4().makeTranslation(cx, y + 1.62, cz));
    this.box("rope", M.rope, 0.03, 1.3, 0.03, cx + 0.2, y + 0.95, cz);
    this.put("gold", M.gold, new THREE.CylinderGeometry(0.16, 0.12, 0.25, 10), new THREE.Matrix4().makeTranslation(cx + 0.2, y + 0.25, cz)); // a brass pot
  }

  private hay(s: Extract<Structure, { kind: "hay" }>, M: Record<string, () => THREE.Material>) {
    const g = new THREE.SphereGeometry(0.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.8);
    g.scale(1, 1.25, 1);
    this.put("straw", M.straw, g, new THREE.Matrix4().makeTranslation(s.x + 0.5, s.y - 0.15, s.z + 0.5));
  }

  /** Split-rail fence around a plot: posts every 2 m, two rails, a gap at the gate, stout corner posts. */
  private fence(p: Plot, M: Record<string, () => THREE.Material>, groundAt: (x: number, z: number) => number) {
    const g = p.gate!;
    const x0 = p.x0 + 0.5, x1 = p.x1 + 0.5, z0 = p.z0 + 0.5, z1 = p.z1 + 0.5;
    const sides: [number, number, number, number, string][] = [
      [x0, z0, x1, z0, "N"], [x1, z0, x1, z1, "E"], [x1, z1, x0, z1, "S"], [x0, z1, x0, z0, "W"],
    ];
    for (const [ax, az, bx, bz, side] of sides) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        const px = ax + (bx - ax) * t0, pz = az + (bz - az) * t0, qx = ax + (bx - ax) * t1, qz = az + (bz - az) * t1;
        const mx = (px + qx) / 2, mz = (pz + qz) / 2;
        const gap = side === g.side && Math.hypot(mx - (g.x + 0.5), mz - (g.z + 0.5)) < 1.6;
        const gy = groundAt(px, pz);
        this.box("wood", M.wood, 0.14, 1.15, 0.14, px, gy + 0.55, pz, 0, 1);
        if (gap) continue;
        const ang = Math.atan2(qx - px, qz - pz);
        const segLen = Math.hypot(qx - px, qz - pz);
        const my = groundAt(mx, mz);
        for (const h of [0.45, 0.9]) this.box("wood", M.wood, 0.07, 0.09, segLen, mx, my + h, mz, ang, 1);
      }
    }
    for (const [cx, cz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this.box("wood", M.wood, 0.24, 1.5, 0.24, cx, groundAt(cx, cz) + 0.7, cz);
  }

  /** Flutter the temple flag. */
  update(dt: number) {
    this.t += dt;
    for (const f of this.flagCloth) {
      const pos = f.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        pos.setZ(i, Math.sin(this.t * 5 + x * 4) * 0.12 * x);
      }
      pos.needsUpdate = true;
    }
  }
}

/** A hip roof: a rectangle rising to a ridge along its longer side. */
function hipRoof(w: number, d: number, h: number, thick: number) {
  const ridge = Math.max(0, Math.abs(w - d) / 2);
  const along = w >= d;
  const hw = w / 2, hd = d / 2;
  const r1 = along ? new THREE.Vector3(-ridge, h, 0) : new THREE.Vector3(0, h, -ridge);
  const r2 = along ? new THREE.Vector3(ridge, h, 0) : new THREE.Vector3(0, h, ridge);
  const c = [new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw, 0, -hd), new THREE.Vector3(hw, 0, hd), new THREE.Vector3(-hw, 0, hd)];
  const tris: THREE.Vector3[][] = along
    ? [[c[0], r1, r2], [c[0], r2, c[1]], [c[2], r2, r1], [c[2], r1, c[3]], [c[1], r2, c[2]], [c[3], r1, c[0]]]
    : [[c[1], r1, r2], [c[1], r2, c[2]], [c[3], r2, r1], [c[3], r1, c[0]], [c[0], r1, c[1]], [c[2], r2, c[3]]];
  const pos: number[] = [], uv: number[] = [];
  for (const t of tris) for (const v of t) {
    pos.push(v.x, v.y, v.z);
    uv.push((v.x + v.z) * 0.35, v.y * 0.9 + Math.hypot(v.x, v.z) * 0.35);
  }
  // the underside of the eaves, a little lower
  for (const t of tris) for (const v of [...t].reverse()) {
    pos.push(v.x, v.y - thick, v.z);
    uv.push(v.x * 0.3, v.z * 0.3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
