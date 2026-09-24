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
      sindoor: () => new THREE.MeshStandardMaterial({ color: "#d9480f", roughness: 0.55 }),
      saffronWall: () => mat(TEX.plaster(), { color: "#f0a060" }),
      marble: () => new THREE.MeshStandardMaterial({ color: "#f7f3ea", roughness: 0.35 }),
      cream: () => mat(TEX.plaster(), { color: "#f4e3a8" }),
      green: () => new THREE.MeshStandardMaterial({ color: "#15803d", roughness: 0.8, side: THREE.DoubleSide }),
      flagS: () => new THREE.MeshStandardMaterial({ color: "#ff9933", roughness: 0.8, side: THREE.DoubleSide }),
      flagW: () => new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8, side: THREE.DoubleSide }),
      flagG: () => new THREE.MeshStandardMaterial({ color: "#138808", roughness: 0.8, side: THREE.DoubleSide }),
      navy: () => new THREE.MeshStandardMaterial({ color: "#1e3a8a", roughness: 0.6 }),
      board: () => new THREE.MeshStandardMaterial({ color: "#1f2d24", roughness: 0.9 }),
      diya: () => new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: new THREE.Color("#ffb347"), emissiveIntensity: 3 }),
      marigold: () => new THREE.MeshStandardMaterial({ color: "#f59e0b", roughness: 0.8 }),
    };
    for (const s of structures) {
      if (s.kind === "house") this.house(s, M);
      else if (s.kind === "stall") this.stall(s, M);
      else if (s.kind === "temple") this.temple(s, M);
      else if (s.kind === "well") this.well(s, M);
      else if (s.kind === "hay") this.hay(s, M);
      else if (s.kind === "hanuman") this.hanuman(s, M);
      else if (s.kind === "school") this.school(s, M);
      else if (s.kind === "pir") this.pir(s, M);
      else if (s.kind === "tank") this.tank(s, M);
      else if (s.kind === "statue") this.statue(s, M);
      else if (s.kind === "plate") this.plate(s);
      else if (s.kind === "wada") this.wada(s, M);
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
    // the sanctum: walls with an open doorway facing south, onto the chowk
    this.shrineWalls(M, "whiteStone", cx, cz, y + 0.4, 5, 5, 3, "S", 1.5);
    this.box("gold", M.gold, 1.7, 0.14, 0.14, cx, y + 2.65, cz + 2.56);
    // the door leaves, swung open
    this.box("wood", M.wood, 0.08, 2.1, 0.75, cx - 0.78, y + 1.45, cz + 2.9);
    this.box("wood", M.wood, 0.08, 2.1, 0.75, cx + 0.78, y + 1.45, cz + 2.9);
    // inside: Sant Sevalal Maharaj on a marble pedestal — white dhoti and angarkha, white pheta, a staff
    this.box("marble", M.marble, 1.4, 0.7, 1.0, cx, y + 0.75, cz - 1.2);
    this.idol(M, cx, y + 1.1, cz - 1.2, "sevalal");
    for (const dx of [-0.5, 0.5]) this.put("diya", M.diya, new THREE.SphereGeometry(0.06, 8, 6), new THREE.Matrix4().makeTranslation(cx + dx, y + 1.13, cz - 0.62));
    this.lamps.push(new THREE.Vector3(cx, y + 1.5, cz - 0.4));
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

  /** Four walls with an open doorway on one side (N/S/E/W), for shrines you can look into. */
  private shrineWalls(M: Record<string, () => THREE.Material>, key: string, cx: number, cz: number, y: number, w: number, d: number, h: number, door: "N" | "S" | "E" | "W", doorW: number) {
    const t = 0.25;
    const side = (sx: number, sz: number, len: number, along: "x" | "z", hasDoor: boolean) => {
      if (!hasDoor) return this.box(key, M[key], along === "x" ? len : t, h, along === "x" ? t : len, sx, y + h / 2, sz);
      const part = (len - doorW) / 2;
      for (const k of [-1, 1]) {
        const off = k * (doorW / 2 + part / 2);
        this.box(key, M[key], along === "x" ? part : t, h, along === "x" ? t : part, sx + (along === "x" ? off : 0), y + h / 2, sz + (along === "z" ? off : 0));
      }
      this.box(key, M[key], along === "x" ? doorW : t, h - 2.1, along === "x" ? t : doorW, sx, y + 2.1 + (h - 2.1) / 2, sz); // the lintel
    };
    side(cx, cz - d / 2, w, "x", door === "N");
    side(cx, cz + d / 2, w, "x", door === "S");
    side(cx - w / 2, cz, d, "z", door === "W");
    side(cx + w / 2, cz, d, "z", door === "E");
    this.box("stone", M.stone, w - 0.1, 0.06, d - 0.1, cx, y + 0.03, cz); // floor
  }

  /** A small idol: Sevalal Maharaj in white with a pheta and staff, or Hanuman in sindoor with his gada. */
  private idol(M: Record<string, () => THREE.Material>, x: number, y: number, z: number, who: "sevalal" | "hanuman", faceX = false) {
    const at = (dx: number, dy: number, dz: number) => new THREE.Matrix4().makeTranslation(x + (faceX ? dz : dx), y + dy, z + (faceX ? dx : dz));
    if (who === "sevalal") {
      this.put("marble", M.marble, new THREE.CylinderGeometry(0.22, 0.3, 0.7, 12), at(0, 0.35, 0)); // robe
      this.put("marble", M.marble, new THREE.CylinderGeometry(0.16, 0.2, 0.35, 12), at(0, 0.85, 0)); // chest
      this.put("gold", M.gold, new THREE.SphereGeometry(0.13, 12, 10), at(0, 1.13, 0)); // face (gilt, as shrine idols often are)
      this.put("marble", M.marble, new THREE.TorusGeometry(0.11, 0.06, 6, 12).rotateX(Math.PI / 2), at(0, 1.25, 0)); // white pheta
      this.put("marble", M.marble, new THREE.SphereGeometry(0.1, 10, 8), at(0, 1.3, 0));
      this.put("wood", M.wood, new THREE.CylinderGeometry(0.02, 0.02, 1.2, 6), at(0.3, 0.6, 0.05)); // his staff
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        this.put("marigold", M.marigold, new THREE.SphereGeometry(0.04, 6, 5), at(Math.cos(a) * 0.18, 0.95 - Math.abs(Math.sin(a)) * 0.15, Math.sin(a) * 0.1 + 0.12));
      }
    } else {
      this.put("sindoor", M.sindoor, new THREE.CylinderGeometry(0.2, 0.26, 0.6, 12), at(0, 0.3, 0)); // legs
      this.put("sindoor", M.sindoor, new THREE.SphereGeometry(0.24, 12, 10).scale(1, 1.2, 0.9), at(0, 0.8, 0)); // the broad chest
      this.put("sindoor", M.sindoor, new THREE.SphereGeometry(0.15, 12, 10), at(0, 1.15, 0.02)); // head
      this.put("gold", M.gold, new THREE.ConeGeometry(0.1, 0.22, 10), at(0, 1.35, 0)); // mukut
      this.put("gold", M.gold, new THREE.SphereGeometry(0.13, 10, 8), at(0.33, 1.02, 0.05)); // the gada's head
      this.put("gold", M.gold, new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), at(0.33, 0.7, 0.05));
      this.put("marigold", M.marigold, new THREE.TorusGeometry(0.2, 0.035, 5, 14).rotateX(Math.PI / 2.4), at(0, 0.9, 0.08));
    }
  }

  private hanuman(s: Extract<Structure, { kind: "hanuman" }>, M: Record<string, () => THREE.Material>) {
    const cx = s.x0 + 2.5, cz = s.z0 + 2.5, y = s.y;
    this.box("stone", M.stone, 6, 0.4, 6, cx, y - 0.2, cz);
    this.shrineWalls(M, "saffronWall", cx, cz, y, 4.6, 4.6, 2.8, "W", 1.4);
    this.box("wood", M.wood, 0.7, 2.0, 0.07, cx - 2.6, y + 1.0, cz - 1.05); // door leaves, open
    this.box("wood", M.wood, 0.7, 2.0, 0.07, cx - 2.6, y + 1.0, cz + 1.05);
    this.box("stone", M.stone, 1.0, 0.5, 1.2, cx + 1.1, y + 0.25, cz);
    this.idol(M, cx + 1.1, y + 0.5, cz, "hanuman", true);
    this.put("diya", M.diya, new THREE.SphereGeometry(0.06, 8, 6), new THREE.Matrix4().makeTranslation(cx + 0.45, y + 0.55, cz));
    this.lamps.push(new THREE.Vector3(cx, y + 1.4, cz));
    // a small shikhara and the saffron flag
    const tower = new THREE.ConeGeometry(2.0, 2.6, 8);
    this.put("saffronWall", M.saffronWall, tower, new THREE.Matrix4().makeTranslation(cx, y + 4.1, cz));
    this.put("gold", M.gold, new THREE.SphereGeometry(0.16, 10, 8), new THREE.Matrix4().makeTranslation(cx, y + 5.5, cz));
    this.box("wood", M.wood, 0.05, 1.6, 0.05, cx, y + 6.2, cz);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 6, 2), M.saffron());
    f.geometry.translate(0.4, 0, 0);
    f.position.set(cx + 0.03, y + 6.75, cz);
    this.group.add(f);
    this.flagCloth.push(f);
  }

  private school(s: Extract<Structure, { kind: "school" }>, M: Record<string, () => THREE.Material>) {
    const { x0, z0, w, d, y } = s;
    const cx = x0 + w / 2, cz = z0 + d / 2, H = 3;
    this.box("stone", M.stone, w + 0.4, 0.35, d + 0.4, cx, y + 0.12, cz);
    this.box("cream", M.cream, w, H, d, cx, y + 0.3 + H / 2, cz);
    this.box("navy", M.navy, w + 0.02, 0.4, d + 0.02, cx, y + 0.55, cz); // the blue dado band
    // classroom doors and barred windows on the verandah side (west)
    for (let i = 0; i < 3; i++) {
      const z = z0 + 1 + i * 2;
      this.box("navy", M.navy, 0.08, 2.0, 0.9, x0 - 0.02, y + 1.3, z);
      this.box("dark", M.dark, 0.1, 1.9, 0.75, x0 - 0.04, y + 1.25, z);
      this.box("navy", M.navy, 0.08, 0.9, 0.8, x0 - 0.02, y + 1.8, z + 1);
    }
    const roof = new THREE.BoxGeometry(w + 2.6, 0.18, d + 1.2);
    this.put("tiles", M.tiles, roof, new THREE.Matrix4().makeTranslation(cx - 0.7, y + 0.3 + H + 0.1, cz));
    for (let i = 0; i < 4; i++) this.box("cream", M.cream, 0.25, H, 0.25, x0 - 1.8, y + 0.3 + H / 2, z0 + 0.4 + i * ((d - 0.8) / 3)); // verandah pillars
    // the blackboard-green name band on the wall, and the tricolour on its pole in the yard
    this.box("board", M.board, 0.06, 0.55, d - 0.6, x0 - 0.05, y + 2.9, cz);
    const px = x0 - 3.2, pz = z0 + d + 1.5;
    this.box("stone", M.stone, 0.9, 0.3, 0.9, px, y + 0.15, pz);
    this.box("marble", M.marble, 0.06, 5, 0.06, px, y + 2.8, pz);
    ["flagS", "flagW", "flagG"].forEach((k, i) => {
      const band = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.24, 6, 1), M[k]());
      band.geometry.translate(0.55, 0, 0);
      band.position.set(px + 0.03, y + 5.05 - i * 0.24, pz);
      this.group.add(band);
      this.flagCloth.push(band);
    });
    // a low compound wall with a gate on the west
    for (const [x, z, lw, ld] of [[cx - 0.5, z0 - 1.6, w + 4, 0.25], [cx - 0.5, z0 + d + 2.6, w + 4, 0.25], [x0 + w + 1.4, cz + 0.5, 0.25, d + 4.2]] as const) this.box("cream", M.cream, lw, 0.9, ld, x, y + 0.45, z);
  }

  private pir(s: Extract<Structure, { kind: "pir" }>, M: Record<string, () => THREE.Material>) {
    const { x, z, y } = s;
    const cx = x + 0.5, cz = z + 0.5;
    this.box("stone", M.stone, 5, 0.4, 5, cx, y - 0.2, cz);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) this.box("marble", M.marble, 0.3, 2.8, 0.3, cx + dx, y + 1.4, cz + dz);
    // a flat roof with a little dome, open on all four sides
    this.box("marble", M.marble, 5.2, 0.25, 5.2, cx, y + 2.9, cz);
    this.put("marble", M.marble, new THREE.SphereGeometry(0.8, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, y + 3.0, cz));
    this.put("gold", M.gold, new THREE.ConeGeometry(0.08, 0.4, 8), new THREE.Matrix4().makeTranslation(cx, y + 3.95, cz));
    // the mazar under it, covered in a green chadar with a gold edge, and a few flowers
    this.box("marble", M.marble, 1.1, 0.4, 2.0, cx, y + 0.2, cz);
    const chadar = new THREE.CylinderGeometry(0.5, 0.5, 1.9, 12, 1, false, 0, Math.PI);
    chadar.rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
    this.put("green", M.green, chadar, new THREE.Matrix4().makeTranslation(cx, y + 0.4, cz));
    this.box("gold", M.gold, 1.02, 0.04, 1.92, cx, y + 0.42, cz);
    for (let i = 0; i < 6; i++) this.put("marigold", M.marigold, new THREE.SphereGeometry(0.05, 6, 5), new THREE.Matrix4().makeTranslation(cx + (i % 2 ? 0.15 : -0.15), y + 0.9, cz - 0.6 + i * 0.25));
    // a green flag on a tall pole
    this.box("wood", M.wood, 0.05, 3.4, 0.05, cx + 2.4, y + 1.7, cz - 2.4);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5, 6, 2), M.green());
    f.geometry.translate(0.4, 0, 0);
    f.position.set(cx + 2.43, y + 3.1, cz - 2.4);
    this.group.add(f);
    this.flagCloth.push(f);
    this.lamps.push(new THREE.Vector3(cx, y + 2.5, cz));
  }

  /** Vasantrao Naik in bronze on a stone pedestal, with his name plaque and a marigold garland. */
  private statue(s: Extract<Structure, { kind: "statue" }>, M: Record<string, () => THREE.Material>) {
    const cx = s.x + 0.5, cz = s.z + 0.5, y = s.y - 1;
    const bronze = () => new THREE.MeshStandardMaterial({ color: "#7a5a32", metalness: 0.75, roughness: 0.38 });
    const pedestal = () => new THREE.MeshStandardMaterial({ color: "#d9d2c2", roughness: 0.6 });
    this.box("ped", pedestal, 2.4, 0.4, 2.4, cx, y + 0.2, cz);
    this.box("ped", pedestal, 1.6, 1.4, 1.6, cx, y + 1.1, cz);
    this.box("ped", pedestal, 1.8, 0.14, 1.8, cx, y + 1.86, cz);
    // the figure: a man in dhoti, kurta and a sleeveless jacket, spectacles, one hand raised in greeting
    const at = (x: number, yy: number, z: number) => new THREE.Matrix4().makeTranslation(cx + x, y + 1.93 + yy, cz + z);
    const B = (g: THREE.BufferGeometry, x: number, yy: number, z: number) => this.put("bronze", bronze, g, at(x, yy, z));
    B(new THREE.CylinderGeometry(0.19, 0.25, 0.85, 18), 0, 0.43, 0); // dhoti
    B(new THREE.CylinderGeometry(0.19, 0.2, 0.62, 18), 0, 1.1, 0); // kurta
    // the sleeveless jacket: a thin shell over the chest, open at the front
    B(new THREE.CylinderGeometry(0.212, 0.222, 0.5, 18, 1, true, Math.PI * 0.62, Math.PI * 1.76), 0, 1.16, 0);
    for (let i = 0; i < 3; i++) B(new THREE.SphereGeometry(0.014, 6, 4), 0.05, 1.3 - i * 0.1, 0.2); // buttons
    B(new THREE.CylinderGeometry(0.075, 0.09, 0.08, 12), 0, 1.44, 0); // collar
    B(new THREE.CylinderGeometry(0.058, 0.066, 0.08, 10), 0, 1.5, 0); // neck
    B(new THREE.SphereGeometry(0.12, 18, 14).scale(0.9, 1.1, 0.98), 0, 1.64, 0); // head
    B(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.45).scale(0.92, 0.9, 1.02), 0, 1.66, -0.01); // hair, combed back
    B(new THREE.SphereGeometry(0.028, 8, 6).scale(0.8, 1, 1.2), 0, 1.62, 0.12); // nose
    for (const sx of [-1, 1]) {
      B(new THREE.SphereGeometry(0.026, 8, 6), sx * 0.112, 1.64, 0); // ears
      B(new THREE.TorusGeometry(0.032, 0.007, 6, 14), sx * 0.043, 1.665, 0.112); // spectacles
    }
    B(new THREE.BoxGeometry(0.03, 0.007, 0.01), 0, 1.668, 0.115); // their bridge
    B(new THREE.CapsuleGeometry(0.055, 0.42, 4, 8).rotateZ(0.1), -0.27, 1.06, 0); // left arm at his side
    B(new THREE.CapsuleGeometry(0.055, 0.26, 4, 8).rotateZ(-0.5), 0.3, 1.26, 0.03); // right arm, raised in greeting
    B(new THREE.CapsuleGeometry(0.05, 0.24, 4, 8).rotateZ(0.15), 0.41, 1.52, 0.06);
    B(new THREE.SphereGeometry(0.055, 8, 6).scale(0.7, 1.2, 0.5), 0.43, 1.7, 0.07); // the open palm
    // a fresh marigold garland round his neck (people garland him on Krushi Din, 1 July)
    for (let i = 0; i < 22; i++) {
      const t = i / 21, a = Math.PI * (1.05 + t * 0.9);
      this.put("marigold", M.marigold, new THREE.SphereGeometry(0.036, 6, 5), at(Math.cos(a) * -0.19, 1.42 - Math.sin(t * Math.PI) * 0.26, -Math.sin(a) * 0.14 + 0.06));
    }
    // the plaque on the pedestal, facing the chowk
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 320;
    const g = c.getContext("2d")!;
    g.fillStyle = "#2c2418";
    g.fillRect(0, 0, 512, 320);
    g.strokeStyle = "#c9a040";
    g.lineWidth = 8;
    g.strokeRect(10, 10, 492, 300);
    g.textAlign = "center";
    g.fillStyle = "#e8c874";
    g.font = "800 46px 'Noto Sans Devanagari', 'Kohinoor Devanagari', system-ui";
    g.fillText("वसंतराव नाईक", 256, 82);
    g.font = "600 30px 'Noto Sans Devanagari', system-ui";
    g.fillText("हरितक्रांतीचे प्रणेते", 256, 132);
    g.font = "700 30px system-ui";
    g.fillText("Vasantrao Naik", 256, 196);
    g.font = "500 22px system-ui";
    g.fillText("1913 – 1979 · Chief Minister of Maharashtra", 256, 238);
    g.fillText("1963 – 1975 · Father of the Green Revolution", 256, 272);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.81), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.2 }));
    const f = s.facing;
    plaque.position.set(cx + Math.sin(f) * 0.81, y + 1.1, cz + Math.cos(f) * 0.81);
    plaque.rotation.y = f;
    this.group.add(plaque);
  }

  /** The overhead water tank: a concrete bowl on eight columns with a ladder, "Ukhali Tanda" painted round it. */
  private tank(s: Extract<Structure, { kind: "tank" }>, M: Record<string, () => THREE.Material>) {
    const cx = s.x + 0.5, cz = s.z + 0.5, y = s.y - 1;
    const concrete = () => new THREE.MeshStandardMaterial({ color: "#d9d4c7", roughness: 0.9 });
    this.box("stone", M.stone, 7, 0.4, 7, cx, y + 0.2, cz);
    const H = 11;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.put("tankC", concrete, new THREE.CylinderGeometry(0.22, 0.26, H, 8), new THREE.Matrix4().makeTranslation(cx + Math.cos(a) * 2.5, y + H / 2, cz + Math.sin(a) * 2.5));
    }
    for (const hy of [H * 0.35, H * 0.7]) {
      const ring = new THREE.TorusGeometry(2.5, 0.12, 4, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8);
      this.put("tankC", concrete, ring, new THREE.Matrix4().makeTranslation(cx, y + hy, cz));
    }
    // the bowl: a cone underneath, a painted drum, and a domed lid
    this.put("tankC", concrete, new THREE.CylinderGeometry(3.4, 1.8, 1.6, 24), new THREE.Matrix4().makeTranslation(cx, y + H + 0.8, cz));
    const c = document.createElement("canvas");
    c.width = 2048;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#e9e4d6";
    g.fillRect(0, 0, 2048, 256);
    g.fillStyle = "#1d4ed8";
    g.fillRect(0, 0, 2048, 26);
    g.fillRect(0, 230, 2048, 26);
    g.textAlign = "center";
    // the name four times round, so it reads from every side of the village — each fitted to its panel
    for (let i = 0; i < 4; i++) {
      const en = i % 2 === 1;
      const text = en ? "UKHALI TANDA" : "उखळी तांडा";
      let size = en ? 70 : 84;
      const face = (px: number) => (en ? `800 ${px}px system-ui` : `800 ${px}px 'Noto Sans Devanagari', 'Kohinoor Devanagari', system-ui`);
      g.font = face(size);
      while (g.measureText(text).width > 400 && size > 30) g.font = face(--size);
      g.fillStyle = en ? "#1d4ed8" : "#b91c1c";
      g.fillText(text, 256 + i * 512, 150);
      g.fillStyle = "#1d4ed8"; // a small dot between the names
      g.beginPath();
      g.arc(512 * (i + 1) % 2048, 128, 9, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const lidMat = new THREE.MeshStandardMaterial({ color: "#d9d4c7", roughness: 0.9 });
    const top = y + H + 1.6, dh = 2.8;
    // a closed drum: painted side, solid concrete top and bottom
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, dh, 48, 1, false), [new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }), lidMat, lidMat]);
    drum.position.set(cx, top + dh / 2, cz);
    drum.castShadow = true;
    this.group.add(drum);
    // a shallow domed roof sitting on the rim, with a small inspection hatch and vent
    const dome = new THREE.SphereGeometry(3.6, 32, 10, 0, Math.PI * 2, 0, Math.PI / 6);
    dome.translate(0, -3.6 * Math.cos(Math.PI / 6), 0);
    this.put("tankC", concrete, dome, new THREE.Matrix4().makeTranslation(cx, top + dh + 0.02, cz));
    this.box("tankC", concrete, 0.7, 0.3, 0.7, cx + 1.2, top + dh + 0.4, cz);
    this.put("dark", M.dark, new THREE.CylinderGeometry(0.08, 0.08, 0.6, 8), new THREE.Matrix4().makeTranslation(cx - 0.6, top + dh + 0.7, cz + 0.4));
    // the ladder up one column, and a railing on posts round the rim
    for (let k = 0; k < H + 1.6; k += 0.5) this.box("dark", M.dark, 0.5, 0.04, 0.04, cx + 2.8, y + k, cz);
    for (const dz of [-0.25, 0.25]) this.box("dark", M.dark, 0.04, H + 1.6, 0.04, cx + 2.8, y + (H + 1.6) / 2, cz + dz);
    const rail = new THREE.TorusGeometry(3.3, 0.035, 4, 48).rotateX(Math.PI / 2);
    this.put("dark", M.dark, rail, new THREE.Matrix4().makeTranslation(cx, top + dh + 0.75, cz));
    for (let i = 0; i < 16; i++) {
      const ang = (i / 16) * Math.PI * 2;
      this.box("dark", M.dark, 0.04, 0.75, 0.04, cx + Math.cos(ang) * 3.3, top + dh + 0.38, cz + Math.sin(ang) * 3.3);
    }
    this.lamps.push(new THREE.Vector3(cx, y + H + 5.5, cz));
  }

  /** A painted name board on two posts (Devanagari over English). */
  /**
   * Rathod Bhuvan: an old two-storey wooden wada, three homes in one long building. Downstairs, a deep
   * verandah on pale posts with a wooden front wall and a door for each home; a painted scalloped
   * frieze between the floors; upstairs, a balcony of carved green posts and cusped arches over
   * wooden railings with cast-iron lattice panels; a low roof of corrugated metal sheets (patra).
   */
  private wada(s: Extract<Structure, { kind: "wada" }>, M: Record<string, () => THREE.Material>) {
    const { x0, z0, w, d, y } = s;
    const cz = z0 + d / 2, fx = x0 + w; // the front (east) edge
    const g0 = y + 0.3, H1 = 2.85, slab = 0.25, g1 = g0 + H1 + slab, H2 = 2.55, top = g1 + H2;
    const inner = x0 + 4; // the rooms' front wall downstairs
    const solid = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => () => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
    Object.assign(M, {
      post: solid("#e4d6dc"),
      carved: solid("#3e8c7c", { side: THREE.DoubleSide }),
      cream2: solid("#f1e2b8", { side: THREE.DoubleSide }),
      pink: solid("#e39ab4", { side: THREE.DoubleSide }),
      teal: solid("#2f8f96", { side: THREE.DoubleSide }),
      lav: solid("#b7a3d6", { side: THREE.DoubleSide }),
      oldWood: () => mat(TEX.wood(), { color: "#c89468" }),
      sheet: () => new THREE.MeshStandardMaterial({ map: corrugated(), color: "#b8c2c8", metalness: 0.55, roughness: 0.45, side: THREE.DoubleSide }),
      lattice: () => new THREE.MeshStandardMaterial({ map: lattice(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }),
    });
    // plinth and verandah floor
    this.box("stone", M.stone, w + 0.5, 0.35, d + 0.5, x0 + w / 2, y + 0.12, cz);
    // plastered back and end walls, both floors
    this.box("plaster", M.plaster, 0.3, H1 + slab + H2, d, x0 + 0.15, g0 + (H1 + slab + H2) / 2, cz);
    for (const ez of [z0 + 0.15, z0 + d - 0.15]) {
      this.box("plaster", M.plaster, inner - x0, H1, 0.3, (x0 + inner) / 2, g0 + H1 / 2, ez);
      this.box("plaster", M.plaster, w, H2, 0.3, x0 + w / 2, g1 + H2 / 2, ez);
    }
    // downstairs: the wooden front wall, a door and two small windows for each of the three homes
    this.box("oldWood", M.oldWood, 0.18, H1, d - 0.3, inner - 0.09, g0 + H1 / 2, cz);
    const unit = d / 3;
    for (let i = 0; i < 3; i++) {
      const uz = z0 + unit * i + unit / 2;
      this.box("dark", M.dark, 0.06, 2.1, 1.05, inner + 0.01, g0 + 1.05, uz);
      this.box("wood", M.wood, 0.1, 2.25, 0.12, inner + 0.03, g0 + 1.12, uz - 0.58);
      this.box("wood", M.wood, 0.1, 2.25, 0.12, inner + 0.03, g0 + 1.12, uz + 0.58);
      this.box("wood", M.wood, 0.12, 0.14, 1.3, inner + 0.03, g0 + 2.25, uz);
      for (const k of [-1, 1]) {
        this.box("dark", M.dark, 0.05, 0.8, 0.7, inner + 0.01, g0 + 1.45, uz + k * 1.55);
        this.put("lattice", M.lattice, new THREE.PlaneGeometry(0.7, 0.8).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(inner + 0.05, g0 + 1.45, uz + k * 1.55));
      }
      // a toran over each door, and the bulb
      this.box("toran", M.toran, 0.1, 0.2, 1.2, inner + 0.08, g0 + 2.45, uz);
      this.bulb(inner + 0.7, g0 + 2.5, uz);
    }
    // the wedding painting by the middle door (शुभविवाह, Ganesh, a kalash)
    this.box("cream2", M.cream2, 0.04, 0.9, 1.0, inner + 0.03, g0 + 1.0, cz + 1.25);
    this.box("sindoor", M.sindoor, 0.05, 0.12, 0.5, inner + 0.04, g0 + 1.25, cz + 1.25);
    this.box("marigold", M.marigold, 0.05, 0.3, 0.2, inner + 0.04, g0 + 0.8, cz + 1.25);
    // verandah posts, and the wooden stair up to the balcony at the north end
    const bays = 6, bay = (d - 0.4) / bays;
    const posts = Array.from({ length: bays + 1 }, (_, i) => z0 + 0.2 + i * bay);
    for (const pz of posts) {
      this.box("post", M.post, 0.22, H1, 0.22, fx - 0.25, g0 + H1 / 2, pz);
      this.box("post", M.post, 0.34, 0.16, 0.34, fx - 0.25, g0 + 0.08, pz);
    }
    for (const k of [0, 1]) {
      const rail = new THREE.BoxGeometry(0.08, 0.08, 3.9);
      const at = new THREE.Matrix4().makeRotationX(-0.83).setPosition(inner + 0.35 + k * 0.7, g0 + H1 / 2, z0 + 0.35 + 1.3);
      this.put("wood", M.wood, rail, at);
    }
    for (let i = 1; i < 11; i++) this.box("wood", M.wood, 0.78, 0.06, 0.22, inner + 0.7, g0 + i * (H1 / 11), z0 + 0.35 + 2.75 - i * (2.6 / 11));
    // the floor between, with the painted frieze of scallops along its edge
    this.box("oldWood", M.oldWood, w + 0.3, slab, d, x0 + w / 2 + 0.15, g0 + H1 + slab / 2, cz);
    this.box("teal", M.teal, 0.06, 0.5, d, fx + 0.18, g0 + H1 - 0.05, cz);
    const colours = ["pink", "cream2", "teal", "lav", "cream2"];
    for (let i = 0, zz = z0 + 0.25; zz < z0 + d - 0.2; i++, zz += 0.5) {
      const k = colours[i % colours.length];
      this.put(k, M[k], new THREE.CircleGeometry(0.24, 12, Math.PI, Math.PI).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(fx + 0.22, g0 + H1 + 0.12, zz));
    }
    this.box("cream2", M.cream2, 0.05, 0.08, d, fx + 0.22, g0 + H1 + 0.17, cz);
    // upstairs: wooden walls with lattice windows, set back behind the balcony
    this.box("oldWood", M.oldWood, 0.16, H2, d - 0.3, inner + 0.3, g1 + H2 / 2, cz);
    for (let i = 0; i < 3; i++) {
      const uz = z0 + unit * i + unit / 2;
      this.box("wood", M.wood, 0.06, 2.0, 1.0, inner + 0.4, g1 + 1.0, uz - 0.9);
      this.box("dark", M.dark, 0.05, 1.1, 1.0, inner + 0.4, g1 + 1.35, uz + 0.8);
      this.put("lattice", M.lattice, new THREE.PlaneGeometry(1.0, 1.1).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(inner + 0.44, g1 + 1.35, uz + 0.8));
    }
    // the balcony: carved green posts, railings with lattice panels, and cusped arches between the posts
    for (const pz of posts) {
      this.box("carved", M.carved, 0.2, H2, 0.2, fx - 0.1, g1 + H2 / 2, pz);
      this.box("carved", M.carved, 0.3, 0.12, 0.3, fx - 0.1, g1 + 1.05, pz);
      this.box("cream2", M.cream2, 0.3, 0.14, 0.3, fx - 0.1, top - 0.95, pz);
    }
    this.box("wood", M.wood, 0.14, 0.1, d, fx - 0.1, g1 + 1.0, cz);
    this.box("wood", M.wood, 0.14, 0.1, d, fx - 0.1, g1 + 0.08, cz);
    for (let i = 0; i < bays; i++) {
      const mz = posts[i] + bay / 2, pw = bay - 0.3;
      if (i % 2 === 0) this.put("lattice", M.lattice, new THREE.PlaneGeometry(pw, 0.86).rotateY(Math.PI / 2), new THREE.Matrix4().makeTranslation(fx - 0.1, g1 + 0.55, mz));
      else for (let b = -pw / 2 + 0.1; b <= pw / 2 - 0.05; b += 0.16) this.box("cream2", M.cream2, 0.04, 0.86, 0.05, fx - 0.1, g1 + 0.55, mz + b);
      const arch = new THREE.Shape();
      const hw = bay / 2 - 0.1, ah = 0.95;
      arch.moveTo(-hw, 0);
      arch.lineTo(-hw, ah);
      arch.lineTo(hw, ah);
      arch.lineTo(hw, 0);
      // a cusped arch: three little lobes along the curve
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, a = t * Math.PI, lobe = 0.06 * Math.abs(Math.sin(t * Math.PI * 3));
        arch.lineTo(Math.cos(a) * (hw - lobe), Math.sin(a) * (ah * 0.72 - lobe));
      }
      const geo = new THREE.ShapeGeometry(arch).rotateY(Math.PI / 2);
      this.put("carved", M.carved, geo, new THREE.Matrix4().makeTranslation(fx - 0.02, top - ah - 0.05, mz));
    }
    this.box("oldWood", M.oldWood, 0.2, 0.18, d + 0.2, fx - 0.1, top - 0.02, cz);
    // the roof: corrugated sheets on a low ridge, overhanging front and back
    const ridgeX = x0 + w * 0.45, rise = 0.75;
    for (const [a, b] of [[x0 - 0.45, ridgeX], [ridgeX, fx + 0.6]]) {
      const run = b - a, len = Math.hypot(run, rise), tilt = Math.atan2(rise, run) * (a < ridgeX ? 1 : -1);
      const sheet = new THREE.BoxGeometry(len, 0.04, d + 0.6);
      this.put("sheet", M.sheet, sheet, new THREE.Matrix4().makeRotationZ(tilt).setPosition((a + b) / 2, top + 0.1 + rise / 2, cz));
    }
    for (const ez of [z0 + 0.15, z0 + d - 0.15]) {
      const tri = new THREE.Shape([new THREE.Vector2(x0, 0), new THREE.Vector2(fx, 0), new THREE.Vector2(ridgeX, rise)]);
      this.put("plaster", M.plaster, new THREE.ShapeGeometry(tri), new THREE.Matrix4().makeTranslation(0, top + 0.05, ez));
    }
    // the name board over the frieze: राठोड भुवन · Rathod Bhuvan
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128;
    const g = c.getContext("2d")!;
    g.fillStyle = "#7a1f1f";
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = "#f1d58a";
    g.lineWidth = 6;
    g.strokeRect(7, 7, 498, 114);
    g.fillStyle = "#fff4d6";
    g.textAlign = "center";
    g.font = "700 50px 'Noto Sans Devanagari', 'Kohinoor Devanagari', system-ui";
    g.fillText("राठोड भुवन", 256, 62);
    g.font = "600 28px Georgia, serif";
    g.fillText("RATHOD BHUVAN", 256, 104);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
    board.rotation.y = Math.PI / 2;
    board.position.set(fx + 0.36, g0 + H1 + 0.02, cz);
    this.group.add(board);
    // the aangan: a tulsi vrindavan in front of the house
    const tx = fx + 3, tz = cz;
    this.box("cream", M.cream, 0.7, 0.9, 0.7, tx, y + 0.45, tz);
    this.box("sindoor", M.sindoor, 0.72, 0.1, 0.72, tx, y + 0.85, tz);
    for (let i = 0; i < 7; i++) this.put("sprouts", M.sprouts, new THREE.SphereGeometry(0.14, 8, 6), new THREE.Matrix4().makeTranslation(tx + Math.cos(i * 0.9) * 0.14, y + 1.05 + (i % 3) * 0.12, tz + Math.sin(i * 0.9) * 0.14));
  }

  private plate(s: Extract<Structure, { kind: "plate" }>) {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 128 + (s.lines.length - 2) * 48;
    const g = c.getContext("2d")!;
    g.fillStyle = s.color ?? "#1e3a8a";
    g.fillRect(0, 0, c.width, c.height);
    g.strokeStyle = "#f5e6c8";
    g.lineWidth = 6;
    g.strokeRect(8, 8, c.width - 16, c.height - 16);
    g.fillStyle = "#fff8e6";
    g.textAlign = "center";
    s.lines.forEach((l, i) => {
      g.font = i === 0 ? "700 44px 'Noto Sans Devanagari', 'Kohinoor Devanagari', system-ui" : "600 30px system-ui";
      g.fillText(l, c.width / 2, i === 0 ? 60 : 60 + i * 44);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const w = 2.2, h = (w * c.height) / c.width;
    const grp = new THREE.Group();
    const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    const edge = new THREE.MeshStandardMaterial({ color: "#3a2a1a" });
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), [edge, edge, edge, edge, face, face]);
    board.position.y = 1.5 + h / 2;
    board.castShadow = true;
    grp.add(board);
    for (const px of [-w / 2 + 0.1, w / 2 - 0.1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5 + h, 0.08), edge);
      post.position.set(px, (1.5 + h) / 2, -0.06);
      grp.add(post);
    }
    grp.position.set(s.x, s.y, s.z);
    grp.rotation.y = s.facing;
    this.group.add(grp);
  }

  private well(s: Extract<Structure, { kind: "well" }>, M: Record<string, () => THREE.Material>) {
    const { x, z, y } = s; // y = the ground around the well
    const cx = x + 0.5, cz = z + 0.5;
    // the stone parapet standing above the ground, open at the top
    this.put("stone", M.stone, new THREE.CylinderGeometry(1.35, 1.45, 0.85, 22, 1, true), new THREE.Matrix4().makeTranslation(cx, y + 0.42, cz));
    const lip = new THREE.TorusGeometry(1.15, 0.22, 6, 26);
    lip.rotateX(Math.PI / 2);
    this.put("stone", M.stone, lip, new THREE.Matrix4().makeTranslation(cx, y + 0.86, cz));
    // looking in: dark, damp stone going down, and the water shining at the bottom
    const shaft = new THREE.CylinderGeometry(0.97, 0.97, 0.8, 22, 1, true);
    shaft.scale(-1, 1, 1);
    this.put("wellShaft", () => new THREE.MeshStandardMaterial({ color: "#3b352d", roughness: 1 }), shaft, new THREE.Matrix4().makeTranslation(cx, y + 0.45, cz));
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.96, 28), new THREE.MeshStandardMaterial({ color: "#2c5f66", roughness: 0.12, metalness: 0.35, emissive: new THREE.Color("#0c2428"), emissiveIntensity: 0.6 }));
    water.rotation.x = -Math.PI / 2;
    water.position.set(cx, y + 0.12, cz);
    this.group.add(water);
    // the frame, the beam and the pulley, a rope down to a brass pot resting on the rim
    for (const s2 of [-1, 1]) this.box("wood", M.wood, 0.16, 2.5, 0.16, cx + s2 * 1.3, y + 1.25, cz);
    this.box("wood", M.wood, 2.9, 0.14, 0.14, cx, y + 2.45, cz);
    const pulley = new THREE.CylinderGeometry(0.22, 0.22, 0.12, 14);
    pulley.rotateX(Math.PI / 2);
    this.put("wood", M.wood, pulley, new THREE.Matrix4().makeTranslation(cx, y + 2.25, cz));
    this.box("rope", M.rope, 0.03, 1.9, 0.03, cx + 0.2, y + 1.3, cz);
    this.put("gold", M.gold, new THREE.CylinderGeometry(0.16, 0.12, 0.25, 10), new THREE.Matrix4().makeTranslation(cx + 1.1, y + 1.0, cz + 0.2));
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

/** Corrugated metal: bright and dark ribs, weathered in patches. */
function corrugated() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  for (let x = 0; x < 256; x++) {
    const v = 150 + Math.round(70 * Math.sin((x / 256) * Math.PI * 2 * 20));
    g.fillStyle = `rgb(${v},${v + 6},${v + 12})`;
    g.fillRect(x, 0, 1, 64);
  }
  g.fillStyle = "rgba(140,90,50,0.18)";
  for (let i = 0; i < 12; i++) g.fillRect((i * 53) % 256, (i * 29) % 64, 30, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.rotation = Math.PI / 2; // ribs run down the slope
  return t;
}

/** A cast-iron grill of circles and scrolls, see-through between the bars. */
function lattice() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.strokeStyle = "#6b4a30";
  g.lineWidth = 5;
  g.strokeRect(2, 2, 124, 124);
  g.lineWidth = 3;
  for (let y = 16; y < 128; y += 32)
    for (let x = 16; x < 128; x += 32) {
      g.beginPath();
      g.arc(x, y, 12, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "#f4efe6";
      g.beginPath();
      g.arc(x, y, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  g.beginPath();
  for (let k = 32; k < 128; k += 32) {
    g.moveTo(k, 0);
    g.lineTo(k, 128);
    g.moveTo(0, k);
    g.lineTo(128, k);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
