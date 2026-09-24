import * as THREE from "three";
import { mergeParts } from "../engine/merge";

/*
 * A villager, modelled rather than built from blocks: kurta, dhoti, pheta or topi, moustache.
 * One rig for the farmer and everyone in the village; `animate` swings limbs from a walk phase.
 * Faces +z, feet at the origin, about 1.7 m tall.
 */
export type Look = { kurta: string; dhoti: string; hat: string; hatStyle: "pheta" | "topi" | "odhni" | "none"; skin: string; tail?: string; woman?: boolean; modern?: boolean };

/** A Banjara woman: mirror-work ghaghra, embroidered kanchali, a coin-edged odhni over the head, arms stacked with bangles. */
export const banjaraWoman = (skirt: string, odhni: string): Look => ({ kurta: "#1f5a52", dhoti: skirt, hat: odhni, hatStyle: "odhni", skin: "#9a6240", woman: true });

/** A checked shirt fabric. */
function checkTex(base: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.28)";
  for (let i = 0; i < 64; i += 16) {
    g.fillRect(i, 0, 5, 64);
    g.fillRect(0, i, 64, 5);
  }
  g.fillStyle = "rgba(0,0,0,0.25)";
  for (let i = 8; i < 64; i += 16) {
    g.fillRect(i, 0, 2, 64);
    g.fillRect(0, i, 64, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 3);
  return t;
}

/** The embroidery: bands of colour, zigzags, and little round mirrors that catch the light. */
function mirrorWork(base: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  const bands = ["#e8b830", "#1b1b1b", "#2e8a4a", "#d8342a", "#f2f0e6", "#1f4fa0"];
  for (let i = 0; i < 6; i++) {
    const y = 150 + i * 17;
    g.fillStyle = bands[i];
    g.fillRect(0, y, 256, 11);
    g.strokeStyle = bands[(i + 3) % 6];
    g.lineWidth = 2;
    g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + (x % 16 ? 1 : 10));
    g.stroke();
  }
  for (let row = 0; row < 3; row++)
    for (let x = 6; x < 256; x += 16) {
      const y = 60 + row * 30 + (x % 32 ? 0 : 8);
      g.fillStyle = "#e8b830";
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#e8eef4"; // the mirror
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(3, 1);
  return t;
}
/** The hero: back from the city — a checked shirt over a tee, jeans, white sneakers, a watch, a backpack. */
export const FARMER: Look = { kurta: "#2f5f9e", dhoti: "#2c3e5c", hat: "#1a1210", hatStyle: "none", skin: "#9b6541", modern: true };

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
    if (look.woman) {
      this.woman(look);
      mergeParts(this.root);
      return;
    }
    if (look.modern) {
      this.modern(look);
      mergeParts(this.root);
      return;
    }
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
    mergeParts(this.root);
  }

  private modern(look: Look) {
    const b = this.body;
    // jeans all the way down, white sneakers
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, 0.92, 0);
      b.add(hip);
      part(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10), look.dhoti, hip, 0, -0.23, 0);
      const knee = new THREE.Group();
      knee.position.set(0, -0.46, 0);
      hip.add(knee);
      part(new THREE.CapsuleGeometry(0.062, 0.34, 4, 10), look.dhoti, knee, 0, -0.2, 0);
      part(new THREE.BoxGeometry(0.11, 0.07, 0.27), "#f4f4f2", knee, 0, -0.44, 0.04, 0.5); // sneakers
      part(new THREE.BoxGeometry(0.115, 0.02, 0.28), "#b8392b", knee, 0, -0.47, 0.04); // red soles
      this.hips.push(hip);
      this.knees.push(knee);
    }
    part(new THREE.CylinderGeometry(0.19, 0.19, 0.06, 18), "#2a1f18", b, 0, 0.93, 0); // a belt
    // a white tee under an open checked shirt
    part(lathe([[0.001, 0.9], [0.195, 0.9], [0.19, 1.05], [0.2, 1.3], [0.17, 1.4], [0.06, 1.45], [0.001, 1.45]], 22), "#f2f0ea", b);
    const check = new THREE.Mesh(
      new THREE.CylinderGeometry(0.205, 0.215, 0.55, 22, 1, true, Math.PI * 0.12, Math.PI * 1.76),
      new THREE.MeshStandardMaterial({ map: checkTex(look.kurta), roughness: 0.8, side: THREE.DoubleSide }),
    );
    check.position.set(0, 1.17, 0);
    check.castShadow = true;
    b.add(check);
    part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), look.skin, b, 0, 1.48, 0);
    // a backpack from the city
    part(new THREE.BoxGeometry(0.3, 0.38, 0.14), "#3a3f46", b, 0, 1.18, -0.24, 0.7);
    for (const s of [-1, 1]) part(new THREE.BoxGeometry(0.04, 0.4, 0.03), "#2a2e33", b, s * 0.11, 1.2, -0.16);
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.22, 1.36, 0);
      b.add(sh);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.062, 0.24, 4, 10), new THREE.MeshStandardMaterial({ map: checkTex(look.kurta), roughness: 0.8 }));
      sleeve.position.y = -0.14;
      sleeve.castShadow = true;
      sh.add(sleeve);
      const el = new THREE.Group();
      el.position.set(0, -0.32, 0);
      sh.add(el);
      part(new THREE.CapsuleGeometry(0.043, 0.22, 4, 10), look.skin, el, 0, -0.13, 0);
      part(new THREE.SphereGeometry(0.05, 10, 8), look.skin, el, 0, -0.29, 0.01);
      if (s < 0) part(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), "#1c1c1c", el, 0, -0.22, 0, 0.3); // a watch
      sh.rotation.z = s * 0.08;
      this.shoulders.push(sh);
      this.elbows.push(el);
    }
    this.head.position.set(0, 1.53, 0);
    b.add(this.head);
    const h = this.head;
    part(new THREE.SphereGeometry(0.115, 20, 16), look.skin, h, 0, 0.11, 0).scale.set(0.92, 1.05, 1);
    part(new THREE.SphereGeometry(0.03, 10, 8), look.skin, h, 0, 0.1, 0.11);
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.014, 8, 6), "#1c1410", h, s * 0.042, 0.14, 0.102, 0.4);
      part(new THREE.SphereGeometry(0.022, 8, 6), look.skin, h, s * 0.112, 0.11, 0);
    }
    // a short modern cut: fuller on top, faded sides, and a trimmed beard line
    const hair = part(new THREE.SphereGeometry(0.122, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), look.hat, h, 0, 0.14, -0.01);
    hair.scale.set(1, 0.9, 1.05);
    part(new THREE.SphereGeometry(0.07, 12, 8), look.hat, h, 0.02, 0.24, 0.05).scale.set(1.3, 0.55, 1);
    part(new THREE.TorusGeometry(0.085, 0.018, 6, 16, Math.PI), "#1f1712", h, 0, 0.075, 0.03).rotation.z = Math.PI;
  }

  private woman(look: Look) {
    const b = this.body;
    // legs under the skirt still swing a little, so walking reads
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.08, 0.86, 0);
      b.add(hip);
      const knee = new THREE.Group();
      knee.position.set(0, -0.44, 0);
      hip.add(knee);
      part(new THREE.CylinderGeometry(0.04, 0.035, 0.4, 8), look.skin, knee, 0, -0.2, 0);
      part(new THREE.BoxGeometry(0.09, 0.03, 0.22), "#3b2a1e", knee, 0, -0.41, 0.04);
      for (let i = 0; i < 3; i++) part(new THREE.TorusGeometry(0.045, 0.012, 5, 10), "#d8d8d0", knee, 0, -0.34 - i * 0.02, 0, 0.3).rotation.x = Math.PI / 2; // silver anklets
      this.hips.push(hip);
      this.knees.push(knee);
    }
    // the ghaghra: a full skirt, embroidered at the hem
    const skirt = new THREE.Mesh(lathe([[0.001, 0.06], [0.38, 0.06], [0.37, 0.1], [0.3, 0.45], [0.22, 0.8], [0.17, 0.98], [0.001, 0.98]], 26), new THREE.MeshStandardMaterial({ map: mirrorWork(look.dhoti), roughness: 0.75 }));
    skirt.castShadow = true;
    b.add(skirt);
    // the kanchali (backless embroidered blouse) and bare midriff
    part(lathe([[0.001, 0.98], [0.16, 0.98], [0.155, 1.12], [0.001, 1.12]], 18), look.skin, b);
    const top = new THREE.Mesh(lathe([[0.001, 1.12], [0.17, 1.12], [0.18, 1.3], [0.15, 1.42], [0.05, 1.46], [0.001, 1.46]], 20), new THREE.MeshStandardMaterial({ map: mirrorWork(look.kurta), roughness: 0.7 }));
    top.castShadow = true;
    b.add(top);
    part(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), look.skin, b, 0, 1.49, 0);
    for (const s of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(s * 0.2, 1.36, 0);
      b.add(sh);
      part(new THREE.CapsuleGeometry(0.045, 0.26, 4, 10), look.skin, sh, 0, -0.15, 0);
      // Banjara women wear stacks of bangles up the arm
      for (let i = 0; i < 6; i++) part(new THREE.TorusGeometry(0.055, 0.013, 5, 12), i % 2 ? "#f2eee2" : "#c8392b", sh, 0, -0.08 - i * 0.04, 0, 0.4).rotation.x = Math.PI / 2;
      const el = new THREE.Group();
      el.position.set(0, -0.32, 0);
      sh.add(el);
      part(new THREE.CapsuleGeometry(0.038, 0.22, 4, 10), look.skin, el, 0, -0.13, 0);
      for (let i = 0; i < 5; i++) part(new THREE.TorusGeometry(0.047, 0.012, 5, 12), "#f2eee2", el, 0, -0.08 - i * 0.035, 0, 0.4).rotation.x = Math.PI / 2;
      sh.rotation.z = s * 0.1;
      this.shoulders.push(sh);
      this.elbows.push(el);
    }
    this.head.position.set(0, 1.53, 0);
    b.add(this.head);
    const h = this.head;
    part(new THREE.SphereGeometry(0.11, 20, 16), look.skin, h, 0, 0.11, 0).scale.set(0.9, 1.05, 0.95);
    part(new THREE.SphereGeometry(0.024, 10, 8), look.skin, h, 0, 0.1, 0.105);
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.013, 8, 6), "#1c1410", h, s * 0.04, 0.14, 0.098, 0.4);
      part(new THREE.SphereGeometry(0.03, 8, 6), "#d8d8d0", h, s * 0.11, 0.05, 0, 0.3); // heavy silver earrings
    }
    part(new THREE.SphereGeometry(0.115, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), "#1a1210", h, 0, 0.14, -0.01); // hair
    // the odhni: a long veil over the head and down the back, edged with coins
    const veil = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.3, 0.95, 18, 1, true, Math.PI * 0.35, Math.PI * 1.3),
      new THREE.MeshStandardMaterial({ map: mirrorWork(look.hat), roughness: 0.8, side: THREE.DoubleSide }),
    );
    veil.position.set(0, -0.2, -0.03);
    veil.castShadow = true;
    h.add(veil);
    const cap = part(new THREE.SphereGeometry(0.135, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2.2), look.hat, h, 0, 0.14, -0.01);
    cap.scale.set(1, 0.9, 1.05);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.15 + i * 0.087) - Math.PI / 2;
      part(new THREE.CylinderGeometry(0.016, 0.016, 0.005, 10), "#d9c07a", h, Math.cos(a) * 0.125, 0.16, Math.sin(-a) * 0.125 + 0.02, 0.3).rotation.x = Math.PI / 2; // coins on the brow
    }
  }

  /** speed in m/s drives the gait; call every frame. */
  /** What a villager is doing: the arms and body pose on top of the walk. */
  action: "none" | "hoe" | "bend" | "carry" | "sit" | "draw" = "none";
  private props = new Map<string, THREE.Object3D>();

  /** Give the figure something to hold: a hoe (kudal) in the hands, or a clay pot (matka) on the head. */
  hold(kind: "hoe" | "pot" | "none") {
    for (const [k, o] of this.props) o.visible = k === kind;
    if (kind === "none" || this.props.has(kind)) return;
    const g = new THREE.Group();
    if (kind === "hoe") {
      part(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 6), "#7a5a3c", g, 0, -0.1, 0);
      const blade = part(new THREE.BoxGeometry(0.16, 0.02, 0.2), "#7c7f84", g, 0, 0.4, 0.1, 0.4);
      blade.rotation.x = 0.5;
      g.position.set(0, -0.3, 0.05);
      g.rotation.x = Math.PI / 2;
      this.elbows[1].add(g);
    } else {
      part(lathe([[0.001, 0], [0.1, 0.02], [0.15, 0.1], [0.14, 0.2], [0.06, 0.28], [0.07, 0.32], [0.001, 0.32]], 16), "#a8542e", g, 0, 0, 0, 0.7);
      const ring = part(new THREE.TorusGeometry(0.08, 0.025, 6, 12), "#c9a45c", g, 0, -0.01, 0); // the chumbal, a cloth ring under the pot
      ring.rotation.x = Math.PI / 2;
      g.position.set(0, 0.25, 0);
      this.head.add(g);
    }
    this.props.set(kind, g);
  }

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
    this.body.rotation.x = 0;
    if (this.action === "hoe") {
      // raise the hoe overhead and bring it down into the soil, about once a second
      const c = (this.t * 1.1) % 1;
      const lift = c < 0.55 ? c / 0.55 : 1 - (c - 0.55) / 0.45;
      const arm = -0.2 - 2.4 * Math.pow(lift, 1.4);
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = arm;
      this.elbows[0].rotation.x = this.elbows[1].rotation.x = -0.3 - 0.4 * lift;
      this.body.rotation.x = 0.28 - 0.18 * lift;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 0.25;
      this.hips[0].rotation.x = this.hips[1].rotation.x = -0.25;
    } else if (this.action === "bend") {
      // bent to the crop, hands working at it
      this.body.rotation.x = 0.55;
      this.hips[0].rotation.x = this.hips[1].rotation.x = -0.55;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 0.35;
      const w = Math.sin(this.t * 5);
      this.shoulders[0].rotation.x = -0.9 + w * 0.2;
      this.shoulders[1].rotation.x = -0.9 - w * 0.2;
      this.elbows[0].rotation.x = this.elbows[1].rotation.x = -0.4;
    } else if (this.action === "carry") {
      // one hand steadies the pot on the head
      this.shoulders[0].rotation.x = -2.9;
      this.elbows[0].rotation.x = -0.9;
    } else if (this.action === "draw") {
      // hauling the bucket rope up hand over hand
      const c = Math.sin(this.t * 3.2);
      this.shoulders[0].rotation.x = -1.9 + c * 0.5;
      this.shoulders[1].rotation.x = -1.9 - c * 0.5;
      this.elbows[0].rotation.x = -0.6 - Math.max(0, c) * 0.5;
      this.elbows[1].rotation.x = -0.6 - Math.max(0, -c) * 0.5;
      this.body.rotation.x = 0.12 + Math.abs(c) * 0.05;
    } else if (this.action === "sit") {
      this.hips[0].rotation.x = this.hips[1].rotation.x = -1.5;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 1.5;
      this.body.position.y = -0.45;
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = -0.4;
    }
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }
}
