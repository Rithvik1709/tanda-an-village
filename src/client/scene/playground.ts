import * as THREE from "three";
import { hash2 } from "../../shared/rng";
import { COURT, MAIDAN, TALAV, talavOut } from "../../shared/world";
import { Figure } from "./figure";
import { mergeParts } from "../engine/merge";
import { Q } from "../quality";

/*
 * Behind the school: the kabaddi court limed onto the maidan, bunting on bamboo poles, and the talav
 * with its reeds, lily pads and lotus, stones on the bank, and Dagdu mama fishing on the far side.
 * (The water itself is a Water sheet the game makes for the talav; the players are the Kabaddi game's.)
 */
export class Playground {
  readonly group = new THREE.Group();
  private reeds: THREE.InstancedMesh;
  private dagdu: Figure;
  private float: THREE.Mesh;
  private line: THREE.Line;
  private floatAt: THREE.Vector3;
  private t = 0;

  constructor(private ground: (x: number, z: number) => number) {
    // everything that never moves is built into one group and baked into a few meshes at the end
    const g = new THREE.Group();
    this.group.add(g);
    // ---- the court: lime lines a hand wide, laid on the earth ----
    const lime = new THREE.MeshStandardMaterial({ color: "#f3efe4", roughness: 1 });
    const strip = (x0: number, z0: number, x1: number, z1: number, w = 0.08) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(len + w, w), lime);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = -Math.atan2(z1 - z0, x1 - x0);
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      m.position.set(cx, this.ground(cx, cz) + 0.025, cz);
      m.receiveShadow = true;
      g.add(m);
    };
    const { x0, x1, z0, z1, mid } = COURT;
    strip(x0, z0, x1, z0);
    strip(x0, z1, x1, z1);
    strip(x0, z0, x0, z1);
    strip(x1, z0, x1, z1);
    strip(x0, mid, x1, mid, 0.14); // the midline
    for (const s of [-1, 1]) {
      strip(x0, mid + s * KABADDI_LINES.baulk, x1, mid + s * KABADDI_LINES.baulk); // baulk lines
      strip(x0 + 0.5, mid + s * KABADDI_LINES.bonus, x1 - 0.5, mid + s * KABADDI_LINES.bonus, 0.06); // bonus lines
    }
    // bunting on bamboo poles along the maidan's west side, as for a tournament
    const pole = new THREE.MeshStandardMaterial({ color: "#b8955a", roughness: 0.8 });
    const flagCols = ["#e8327a", "#f2a01e", "#1d6ad8", "#15803d", "#f6e04a", "#e8662a"];
    const poles: THREE.Vector3[] = [];
    for (const z of [MAIDAN.z0 + 0.6, (MAIDAN.z0 + MAIDAN.z1) / 2, MAIDAN.z1 + 0.4]) {
      const x = MAIDAN.x0 - 0.1, y = this.ground(x, z);
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), pole);
      p.position.set(x, y + 1.6, z);
      p.castShadow = true;
      g.add(p);
      poles.push(new THREE.Vector3(x, y + 3.05, z));
    }
    // a pennant, faced on both sides (so it merges with everything else)
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.Float32BufferAttribute([-0.13, 0, 0, 0.13, 0, 0, 0, -0.28, 0, 0.13, 0, 0, -0.13, 0, 0, 0, -0.28, 0], 3));
    tri.computeVertexNormals();
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], b = poles[i + 1];
      for (let k = 0; k <= 20; k++) {
        const t = k / 20;
        const f = new THREE.Mesh(tri, new THREE.MeshStandardMaterial({ color: flagCols[(i * 21 + k) % flagCols.length], roughness: 0.9 }));
        f.position.lerpVectors(a, b, t);
        f.position.y -= Math.sin(t * Math.PI) * 0.45; // the string sags
        f.rotation.y = Math.PI / 2;
        g.add(f);
      }
    }

    // ---- the talav ----
    const L = TALAV.level;
    // reeds round the edge (not on the west bund, where people come down to fish)
    const reedGeo = new THREE.ConeGeometry(0.025, 1, 4);
    reedGeo.translate(0, 0.5, 0);
    this.reeds = new THREE.InstancedMesh(reedGeo, new THREE.MeshStandardMaterial({ color: "#6f8a3a", roughness: 0.9 }), 360);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let n = 0;
    const heads: THREE.Vector3[] = [];
    for (let i = 0; i < 900 && n < 360; i++) {
      const a = hash2(i, 1, 77) * Math.PI * 2;
      if (Math.cos(a) < -0.55) continue; // the fishing side
      const r = 0.82 + hash2(i, 2, 77) * 0.3;
      const x = TALAV.x + Math.cos(a) * TALAV.rx * r, z = TALAV.z + Math.sin(a) * TALAV.rz * r;
      const out = talavOut(x, z);
      if (out < -0.7 || out > 0.4) continue;
      const y = Math.max(this.ground(x, z), L - 0.5);
      const h = 0.7 + hash2(i, 3, 77) * 0.9;
      e.set((hash2(i, 4, 77) - 0.5) * 0.4, 0, (hash2(i, 5, 77) - 0.5) * 0.4);
      m4.compose(p.set(x, y, z), q.setFromEuler(e), sc.set(1, h, 1));
      this.reeds.setMatrixAt(n++, m4);
      if (hash2(i, 6, 77) < 0.12) heads.push(new THREE.Vector3(x, y + h * 0.92, z));
    }
    this.reeds.count = n;
    this.reeds.castShadow = true;
    this.group.add(this.reeds);
    // bulrush heads on a few of them
    const headGeo = new THREE.CapsuleGeometry(0.03, 0.12, 3, 6);
    const headMat = new THREE.MeshStandardMaterial({ color: "#6a4526", roughness: 1 });
    for (const h of heads) {
      const m = new THREE.Mesh(headGeo, headMat);
      m.position.copy(h);
      g.add(m);
    }
    // lily pads and lotus on the water
    const padMat = new THREE.MeshStandardMaterial({ color: "#3f6a2c", roughness: 0.7 });
    const petal = new THREE.MeshStandardMaterial({ color: "#f29ab8", roughness: 0.6 });
    for (let i = 0; i < 16; i++) {
      const a = hash2(i, 9, 31) * Math.PI * 2, r = 0.25 + hash2(i, 10, 31) * 0.55;
      const x = TALAV.x + Math.cos(a) * TALAV.rx * r, z = TALAV.z + Math.sin(a) * TALAV.rz * r;
      if (Math.cos(a) < -0.6 && r > 0.4) continue; // keep the water clear in front of the bund
      const pad = new THREE.Mesh(new THREE.CircleGeometry(0.22 + hash2(i, 11, 31) * 0.16, 14, 0.4, Math.PI * 2 - 0.4), padMat);
      pad.rotation.x = -Math.PI / 2;
      pad.rotation.z = hash2(i, 12, 31) * 6.28;
      pad.position.set(x, L + 0.012, z);
      g.add(pad);
      if (i % 4 === 0) {
        // a lotus: two rings of petals round a yellow heart
        const f = new THREE.Group();
        for (let k = 0; k < 10; k++) {
          const pt = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4).scale(0.6, 0.35, 1.6), petal);
          const ang = (k / 10) * Math.PI * 2 + (k % 2) * 0.3;
          pt.position.set(Math.cos(ang) * 0.06, 0.05 + (k % 2) * 0.03, Math.sin(ang) * 0.06);
          pt.rotation.y = -ang;
          pt.rotation.x = k % 2 ? -0.9 : -0.5;
          f.add(pt);
        }
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: "#f2c230", roughness: 0.6 }));
        heart.position.y = 0.06;
        f.add(heart);
        f.position.set(x + 0.08, L + 0.01, z + 0.05);
        g.add(f);
      }
    }
    // stones on the bank, and a flat washing stone where you come down to the water
    const stone = new THREE.MeshStandardMaterial({ color: "#8d877c", roughness: 1 });
    for (let i = 0; i < 14; i++) {
      const a = hash2(i, 20, 5) * Math.PI * 2;
      const x = TALAV.x + Math.cos(a) * (TALAV.rx + 0.6 + hash2(i, 21, 5) * 0.7), z = TALAV.z + Math.sin(a) * (TALAV.rz + 0.6 + hash2(i, 21, 5) * 0.7);
      const r = 0.12 + hash2(i, 22, 5) * 0.2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), stone);
      s.scale.y = 0.6;
      s.position.set(x, this.ground(x, z) + r * 0.25, z);
      s.rotation.set(hash2(i, 23, 5) * 3, hash2(i, 24, 5) * 3, 0);
      s.castShadow = s.receiveShadow = true;
      g.add(s);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 0.6), stone);
    const sx = TALAV.x - TALAV.rx - 0.15, sz = TALAV.z + 1.4;
    slab.position.set(sx, Math.max(this.ground(sx, sz), L) + 0.05, sz);
    slab.rotation.set(0, 0.25, -0.12);
    slab.castShadow = slab.receiveShadow = true;
    g.add(slab);

    // Dagdu mama: an old fisherman on the far bank, as there always is one
    this.dagdu = new Figure({ kurta: "#e9e2cf", dhoti: "#e9e1cd", hat: "#f2f2ee", hatStyle: "pheta", skin: "#8a5636" });
    this.dagdu.hold("rod");
    this.dagdu.action = "sit";
    const dx = TALAV.x + TALAV.rx + 1.05, dz = TALAV.z - 1.2;
    this.dagdu.root.position.set(dx, this.ground(dx, dz) + 0.35, dz);
    this.dagdu.root.rotation.y = -Math.PI / 2 - 0.25; // facing the water
    this.group.add(this.dagdu.root);
    this.float = makeFloat();
    this.floatAt = new THREE.Vector3(TALAV.x + 0.9, L + 0.02, TALAV.z - 1.8);
    this.float.position.copy(this.floatAt);
    this.group.add(this.float);
    this.line = makeLine();
    this.group.add(this.line);
    mergeParts(g);
  }

  /** Where Dagdu sits (people keep clear of him). */
  get dagduAt() {
    return { x: this.dagdu.root.position.x, z: this.dagdu.root.position.z };
  }

  update(dt: number, day: boolean, eye: { x: number; z: number }) {
    this.t += dt;
    const far = Math.hypot(eye.x - this.dagdu.root.position.x, eye.z - this.dagdu.root.position.z);
    this.dagdu.root.visible = this.float.visible = this.line.visible = day && far < 75;
    if (!this.dagdu.root.visible) return;
    this.dagdu.setShadow(Q.shadows && far < Q.peopleShadow);
    this.dagdu.animate(dt, 0);
    this.float.position.y = this.floatAt.y + Math.sin(this.t * 2.1) * 0.012;
    const tip = this.dagdu.rodTip(new THREE.Vector3());
    if (tip) setLine(this.line, tip, this.float.position);
  }
}

/** Where the court's lines are, from the midline (blocks). */
export const KABADDI_LINES = { baulk: 2.8, bonus: 3.8 } as const;

/** A red-and-white float. */
export function makeFloat() {
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: "#d8342a", roughness: 0.5 }));
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#f6f2e8", roughness: 0.5 }));
  top.position.y = 0.03;
  f.add(top);
  return f;
}
/** A fishing line (a sagging curve of a few points). */
export function makeLine() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: "#e8e4da", transparent: true, opacity: 0.7 }));
  l.frustumCulled = false;
  return l;
}
export function setLine(line: THREE.Line, a: THREE.Vector3, b: THREE.Vector3, slack = 0.35) {
  const pos = line.geometry.getAttribute("position") as THREE.BufferAttribute;
  const n = pos.count;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    pos.setXYZ(i, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * slack * Math.min(1, a.distanceTo(b) / 4), a.z + (b.z - a.z) * t);
  }
  pos.needsUpdate = true;
}
