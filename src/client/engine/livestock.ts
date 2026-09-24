import * as THREE from "three";
import { TEX } from "../scene/textures";

/*
 * The Khillari bull pair and the bailgaadi, modelled with rounded forms: a deep chest and hump,
 * long swept-back horns painted for Bail Pola, a woven jhool over the back, brass bells, and a
 * wooden cart on two tall spoked wheels. Everything faces +z. `Rig` = the yoked pair (always)
 * plus the cart behind (when hitched).
 */
const cache = new Map<string, THREE.MeshStandardMaterial>();
const M = (c: string, rough = 0.8, metal = 0) => {
  const k = c + rough + metal;
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
  return cache.get(k)!;
};
function add(parent: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
const ellipsoid = (rx: number, ry: number, rz: number) => {
  const g = new THREE.SphereGeometry(1, 20, 14);
  g.scale(rx, ry, rz);
  return g;
};

class Bull {
  readonly group = new THREE.Group();
  jhools: THREE.Mesh[] = [];
  horns: THREE.Mesh[] = [];
  garland = new THREE.Group();
  private legs: THREE.Group[] = [];
  private head = new THREE.Group();
  private tail = new THREE.Group();

  constructor(jhool: string, horn: string) {
    const g = this.group;
    const hide = M("#e4ddd0", 0.9), shade = M("#c9c0b1", 0.9), dark = M("#6d625a", 0.9);
    add(g, ellipsoid(0.42, 0.42, 0.9), hide, 0, 1.12, -0.05); // barrel
    add(g, ellipsoid(0.44, 0.47, 0.42), hide, 0, 1.2, 0.5); // chest
    add(g, ellipsoid(0.24, 0.24, 0.26), shade, 0, 1.58, 0.52); // the hump
    add(g, ellipsoid(0.1, 0.3, 0.3), shade, 0, 0.8, 0.72); // dewlap
    add(g, ellipsoid(0.38, 0.36, 0.34), hide, 0, 1.13, -0.7); // haunch
    // the jhool: a bright woven cloth over the back, edged in gold
    const jh = new THREE.CylinderGeometry(0.47, 0.47, 1.1, 16, 1, true, -Math.PI * 0.62, Math.PI * 1.24);
    jh.rotateX(Math.PI / 2);
    jh.rotateZ(Math.PI / 2);
    jh.rotateY(Math.PI / 2);
    this.jhools.push(add(g, jh, new THREE.MeshStandardMaterial({ color: jhool, roughness: 0.9, side: THREE.DoubleSide }), 0, 1.16, -0.08));
    for (const s of [-1, 1]) add(g, new THREE.BoxGeometry(0.02, 0.06, 1.1), M("#d4a24a", 0.4, 0.6), s * 0.45, 0.83, -0.08);
    for (const [x, z] of [[-0.2, 0.52], [0.2, 0.52], [-0.2, -0.68], [0.2, -0.68]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.92, z);
      add(leg, new THREE.CapsuleGeometry(0.1, 0.35, 4, 10), hide, 0, -0.22, 0);
      add(leg, new THREE.CapsuleGeometry(0.065, 0.36, 4, 10), hide, 0, -0.62, 0);
      add(leg, new THREE.CylinderGeometry(0.075, 0.085, 0.1, 10), dark, 0, -0.87, 0.01); // hoof
      g.add(leg);
      this.legs.push(leg);
    }
    // the head: long face, dark muzzle, and the great horns
    this.head.position.set(0, 1.32, 0.86);
    g.add(this.head);
    const face = ellipsoid(0.16, 0.2, 0.34);
    face.rotateX(0.55);
    add(this.head, face, hide, 0, -0.06, 0.18);
    add(this.head, ellipsoid(0.13, 0.11, 0.12), dark, 0, -0.22, 0.44); // muzzle
    for (const s of [-1, 1]) {
      add(this.head, new THREE.SphereGeometry(0.03, 8, 6), M("#1c1612", 0.3), s * 0.14, 0.02, 0.18); // eyes
      const ear = ellipsoid(0.1, 0.04, 0.06);
      add(this.head, ear, shade, s * 0.2, 0.06, 0.02).rotation.z = s * 0.4;
      // horns: a curving taper sweeping up and back, painted, with brass caps
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(s * 0.1, 0.12, 0), new THREE.Vector3(s * 0.26, 0.34, -0.1), new THREE.Vector3(s * 0.3, 0.6, -0.32), new THREE.Vector3(s * 0.22, 0.78, -0.5)]);
      const hg = new THREE.TubeGeometry(curve, 12, 0.05, 8);
      const p = hg.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) {
        const t = Math.floor(i / 9) / 12;
        const c = curve.getPointAt(Math.min(1, t));
        p.setXYZ(i, c.x + (p.getX(i) - c.x) * (1 - t * 0.7), c.y + (p.getY(i) - c.y) * (1 - t * 0.7), c.z + (p.getZ(i) - c.z) * (1 - t * 0.7));
      }
      hg.computeVertexNormals();
      this.horns.push(add(this.head, hg, new THREE.MeshStandardMaterial({ color: horn, roughness: 0.5 })));
      add(this.head, new THREE.ConeGeometry(0.03, 0.1, 8), M("#d4a24a", 0.3, 0.8), s * 0.22, 0.83, -0.53);
    }
    // brass bells on a red collar
    const collar = new THREE.TorusGeometry(0.3, 0.035, 6, 18);
    collar.rotateX(Math.PI / 2 - 0.5);
    add(g, collar, M("#b8322a", 0.8), 0, 1.22, 0.78);
    for (const s of [-1, 0, 1]) add(g, new THREE.SphereGeometry(0.055, 10, 8), M("#d4a24a", 0.3, 0.8), s * 0.14, 0.98 - Math.abs(s) * 0.05, 0.92);
    // the Pola garland of marigolds round the neck (shown for the champion)
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      add(this.garland, new THREE.SphereGeometry(0.06, 7, 5), M(i % 2 ? "#f2a01e" : "#e8662a", 0.8), Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0);
    }
    this.garland.position.set(0, 1.12, 0.8);
    this.garland.rotation.x = Math.PI / 2 - 0.5;
    this.garland.visible = false;
    g.add(this.garland);
    this.tail.position.set(0, 1.3, -0.98);
    add(this.tail, new THREE.CylinderGeometry(0.025, 0.02, 0.75, 6), shade, 0, -0.37, 0);
    add(this.tail, ellipsoid(0.06, 0.12, 0.06), dark, 0, -0.8, 0);
    g.add(this.tail);
  }

  animate(t: number, gait: number) {
    this.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(t * 6 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.4 * gait));
    this.head.rotation.x = Math.sin(t * (gait ? 6 : 1.2)) * (gait ? 0.04 : 0.07) + (gait ? 0 : 0.1);
    this.head.rotation.y = gait ? 0 : Math.sin(t * 0.4) * 0.15;
    this.tail.rotation.z = Math.sin(t * 2.3) * 0.25;
    this.tail.rotation.x = 0.12 + Math.sin(t * 1.1) * 0.08;
  }
}

class Cart {
  readonly group = new THREE.Group();
  private wheels: THREE.Group[] = [];
  constructor() {
    const g = this.group;
    const wood = M("#8a6440", 0.85), dark = M("#5a3f26", 0.9), iron = M("#3a3530", 0.5, 0.5);
    for (const x of [-0.2, 0.2]) {
      const shaft = new THREE.CylinderGeometry(0.05, 0.06, 2.9, 8);
      shaft.rotateX(Math.PI / 2 - 0.02);
      add(g, shaft, dark, x, 1.12, 1.15);
    }
    add(g, new THREE.BoxGeometry(1.3, 0.08, 2), wood, 0, 1.12, -1); // the bed
    for (const x of [-0.64, 0.64]) {
      add(g, new THREE.BoxGeometry(0.06, 0.06, 2), dark, x, 1.55, -1); // top rail
      for (let z = -1.9; z <= -0.1; z += 0.3) add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.45, 6), wood, x, 1.34, z); // side staves
    }
    add(g, new THREE.BoxGeometry(1.2, 0.14, 0.6), M("#c9a45c", 1), 0, 1.23, -0.45); // straw cushion for the driver
    // an arched canopy of woven matting over the back, like village carts on long trips
    const hood = new THREE.CylinderGeometry(0.66, 0.66, 1.1, 18, 1, true, -Math.PI / 2, Math.PI);
    hood.rotateX(Math.PI / 2);
    hood.rotateZ(Math.PI / 2);
    hood.rotateY(Math.PI / 2);
    add(g, hood, new THREE.MeshStandardMaterial({ color: "#b89a62", roughness: 1, side: THREE.DoubleSide }), 0, 1.55, -1.35);
    for (const x of [-0.85, 0.85]) {
      const w = new THREE.Group();
      w.position.set(x, 0.8, -1);
      const rim = new THREE.TorusGeometry(0.76, 0.06, 8, 28);
      rim.rotateY(Math.PI / 2);
      add(w, rim, dark);
      const tyre = new THREE.TorusGeometry(0.8, 0.025, 6, 28);
      tyre.rotateY(Math.PI / 2);
      add(w, tyre, iron);
      for (let i = 0; i < 12; i++) {
        const sp = new THREE.CylinderGeometry(0.022, 0.03, 0.74, 6);
        sp.translate(0, 0.37, 0);
        sp.rotateX((i / 12) * Math.PI * 2);
        add(w, sp, wood);
      }
      const hub = new THREE.CylinderGeometry(0.13, 0.13, 0.22, 12);
      hub.rotateZ(Math.PI / 2);
      add(w, hub, dark);
      g.add(w);
      this.wheels.push(w);
    }
    const axle = new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8);
    axle.rotateZ(Math.PI / 2);
    add(g, axle, iron, 0, 0.8, -1);
  }
  roll(dist: number) {
    for (const w of this.wheels) w.rotation.x = dist / 0.8;
  }
}

export class Rig {
  readonly group = new THREE.Group();
  readonly pair = new THREE.Group();
  private bulls: [Bull, Bull];
  private cart = new Cart();
  private t = 0;
  private rolled = 0;
  hitched = false;

  constructor() {
    this.bulls = [new Bull("#c0392b", "#2e86c1"), new Bull("#e67e22", "#16a085")];
    this.bulls[0].group.position.x = -0.55;
    this.bulls[1].group.position.x = 0.55;
    this.pair.add(this.bulls[0].group, this.bulls[1].group);
    const yoke = new THREE.CylinderGeometry(0.07, 0.07, 2.2, 8);
    yoke.rotateZ(Math.PI / 2);
    add(this.pair, yoke, M("#5a3f26", 0.9), 0, 1.5, 0.66);
    this.group.add(this.pair);
    this.cart.group.position.z = -1.4;
    this.cart.group.visible = false;
    this.group.add(this.cart.group);
  }

  private decorKey = "";
  /** Mirror-work jhools (Teej reward), gerua-painted horns (Pola) and the champion's garland. */
  setDecor(d: { jhool: boolean; gerua: boolean; garland: boolean }) {
    const key = JSON.stringify(d);
    if (key === this.decorKey) return;
    this.decorKey = key;
    for (const b of this.bulls) for (const o of [...b.jhools, ...b.horns]) o.userData.base ??= "#" + (o.material as THREE.MeshStandardMaterial).color.getHexString();
    for (const b of this.bulls) {
      for (const j of b.jhools) {
        const m = j.material as THREE.MeshStandardMaterial;
        m.map = d.jhool ? TEX.mirrorWork() : null;
        m.color.set(d.jhool ? "#ffffff" : j.userData.base);
        m.needsUpdate = true;
      }
      for (const h of b.horns) (h.material as THREE.MeshStandardMaterial).color.set(d.gerua ? "#c8502a" : h.userData.base);
      b.garland.visible = d.garland;
    }
  }

  setHitched(on: boolean) {
    this.hitched = on;
    this.cart.group.visible = on;
  }

  update(dt: number, moved: number) {
    this.t += dt;
    const gait = Math.min(1, moved / Math.max(dt, 1e-3) / 2);
    this.bulls.forEach((b, i) => b.animate(this.t + i * 0.37, gait));
    this.rolled += moved;
    this.cart.roll(this.rolled);
  }
}

/** The cart standing alone, tipped forward onto its shafts. */
export function parkedCart(): THREE.Group {
  const c = new Cart();
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.8, -1.0);
  c.group.position.set(0, -0.8, 1.0);
  pivot.rotation.x = 0.33;
  pivot.add(c.group);
  const g = new THREE.Group();
  g.add(pivot);
  return g;
}
