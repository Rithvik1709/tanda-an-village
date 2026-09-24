import * as THREE from "three";

/*
 * A villager, modelled rather than built from blocks: kurta, dhoti, pheta or topi, moustache.
 * One rig for the farmer and everyone in the village; `animate` swings limbs from a walk phase.
 * Faces +z, feet at the origin, about 1.7 m tall.
 */
export type Look = { kurta: string; dhoti: string; hat: string; hatStyle: "pheta" | "topi"; skin: string; tail?: string };
export const FARMER: Look = { kurta: "#f1ead9", dhoti: "#e9e1cd", hat: "#e0762a", hatStyle: "pheta", skin: "#9b6541", tail: "#e0762a" };

const mats = new Map<string, THREE.MeshStandardMaterial>();
const mat = (c: string, rough = 0.85) => {
  const k = c + rough;
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0 }));
  return mats.get(k)!;
};
function part(geo: THREE.BufferGeometry, color: string, parent: THREE.Object3D, x = 0, y = 0, z = 0, rough?: number) {
  const m = new THREE.Mesh(geo, mat(color, rough));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
const lathe = (pts: [number, number][], seg = 18) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

export class Figure {
  readonly root = new THREE.Group();
  private body = new THREE.Group();
  private hips: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private shoulders: THREE.Group[] = [];
  private elbows: THREE.Group[] = [];
  private head = new THREE.Group();
  private t = Math.random() * 10;

  constructor(look: Look) {
    const r = this.root;
    r.add(this.body);
    const b = this.body;
    // legs: a loose white dhoti over the thighs, bare shins, chappals
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0.92, 0);
      b.add(hip);
      part(lathe([[0.001, 0], [0.13, -0.02], [0.125, -0.25], [0.1, -0.46], [0.001, -0.47]]), look.dhoti, hip);
      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      hip.add(knee);
      part(new THREE.CylinderGeometry(0.052, 0.042, 0.42, 10), look.skin, knee, 0, -0.21, 0);
      part(new THREE.BoxGeometry(0.1, 0.035, 0.24), "#3b2a1e", knee, 0, -0.44, 0.05);
      this.hips.push(hip);
      this.knees.push(knee);
    }
    // the kurta: a long shirt flaring to the thigh
    part(lathe([[0.001, 0.62], [0.2, 0.64], [0.2, 0.8], [0.185, 1.05], [0.2, 1.3], [0.17, 1.4], [0.06, 1.45], [0.001, 1.45]], 22), look.kurta, b);
    part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), look.skin, b, 0, 1.48, 0); // neck
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.22, 1.36, 0);
      b.add(sh);
      part(new THREE.CapsuleGeometry(0.058, 0.26, 4, 10), look.kurta, sh, 0, -0.15, 0);
      const el = new THREE.Group();
      el.position.set(0, -0.32, 0);
      sh.add(el);
      part(new THREE.CapsuleGeometry(0.043, 0.22, 4, 10), look.skin, el, 0, -0.13, 0);
      part(new THREE.SphereGeometry(0.05, 10, 8), look.skin, el, 0, -0.29, 0.01);
      sh.rotation.z = s * 0.08;
      this.shoulders.push(sh);
      this.elbows.push(el);
    }
    // head
    this.head.position.set(0, 1.53, 0);
    b.add(this.head);
    const h = this.head;
    const skull = part(new THREE.SphereGeometry(0.115, 20, 16), look.skin, h, 0, 0.11, 0);
    skull.scale.set(0.92, 1.05, 1);
    part(new THREE.SphereGeometry(0.03, 10, 8), look.skin, h, 0, 0.1, 0.11); // nose
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.014, 8, 6), "#1c1410", h, s * 0.042, 0.14, 0.102, 0.4);
      const mo = part(new THREE.CapsuleGeometry(0.012, 0.045, 3, 6), "#2a1c14", h, s * 0.03, 0.07, 0.108);
      mo.rotation.z = Math.PI / 2 + s * 0.35;
      part(new THREE.SphereGeometry(0.022, 8, 6), look.skin, h, s * 0.112, 0.11, 0); // ears
    }
    if (look.hatStyle === "pheta") {
      // a wrapped turban: a few fat rings, a crown, and the tail hanging behind
      for (let i = 0; i < 3; i++) {
        const ring = part(new THREE.TorusGeometry(0.105 - i * 0.012, 0.04, 8, 20), look.hat, h, 0, 0.19 + i * 0.045, -0.005);
        ring.rotation.x = Math.PI / 2 + (i % 2 ? 0.12 : -0.08);
      }
      part(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), look.hat, h, 0, 0.25, 0);
      const tail = part(new THREE.BoxGeometry(0.06, 0.28, 0.02), look.tail ?? look.hat, h, 0.04, 0.05, -0.13);
      tail.rotation.x = 0.15;
    } else {
      // Gandhi topi: a folded white boat cap
      const cap = part(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 4, 1), look.hat, h, 0, 0.24, 0);
      cap.scale.set(1, 1, 1.35);
      cap.rotation.y = Math.PI / 4;
    }
  }

  /** speed in m/s drives the gait; call every frame. */
  animate(dt: number, speed: number) {
    const walking = Math.min(1, speed / 3.5);
    this.t += dt * (speed > 0.2 ? 1.6 + speed * 1.2 : 1);
    const ph = this.t * (speed > 0.2 ? 4.2 : 0);
    const swing = Math.sin(ph) * 0.55 * walking;
    this.hips[0].rotation.x = swing;
    this.hips[1].rotation.x = -swing;
    this.knees[0].rotation.x = Math.max(0, -Math.sin(ph + 0.9)) * 0.7 * walking;
    this.knees[1].rotation.x = Math.max(0, Math.sin(ph + 0.9)) * 0.7 * walking;
    this.shoulders[0].rotation.x = -swing * 0.8;
    this.shoulders[1].rotation.x = swing * 0.8;
    this.elbows[0].rotation.x = -0.25 - Math.max(0, swing) * 0.4;
    this.elbows[1].rotation.x = -0.25 - Math.max(0, -swing) * 0.4;
    // a walk bob, and slow breathing when still
    this.body.position.y = Math.abs(Math.cos(ph)) * 0.035 * walking + Math.sin(this.t * 1.6) * 0.004;
    this.head.rotation.y = Math.sin(this.t * 0.35) * 0.15 * (1 - walking);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }
}
