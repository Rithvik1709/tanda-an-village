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
export const FARMER: Look = { kurta: "#c4592f", dhoti: "#2b3d63", hat: "#17110d", hatStyle: "none", skin: "#9b6541", modern: true };

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
  // the player's extra joints (villagers leave these empty)
  private feet: THREE.Group[] = [];
  private chest?: THREE.Group;
  private bag?: THREE.Group;
  private scarf?: THREE.Group;
  private t = Math.random() * 10;
  private shadowOn = true;
  private meshes?: THREE.Mesh[];
  /** Far-off people needn't cast shadows (each body part is its own draw in the shadow pass). */
  setShadow(on: boolean) {
    if (on === this.shadowOn) return;
    this.shadowOn = on;
    this.meshes ??= (() => {
      const out: THREE.Mesh[] = [];
      this.root.traverse((o) => (o as THREE.Mesh).isMesh && (o as THREE.Mesh).castShadow && out.push(o as THREE.Mesh));
      return out;
    })();
    for (const m of this.meshes) m.castShadow = on;
  }

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
      this.hero(look);
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
    } else if (look.hatStyle !== "none") {
      // Gandhi topi: a folded white boat cap
      const cap = part(new THREE.CylinderGeometry(0.1, 0.12, 0.09, 4, 1), look.hat, h, 0, 0.24, 0);
      cap.scale.set(1, 1, 1.35);
      cap.rotation.y = Math.PI / 4;
    }
    mergeParts(this.root);
  }

  /**
   * The player: home from the city to a Banjara tanda. A rust kurta with a cream hem and rolled
   * sleeves over indigo jeans, white canvas sneakers, a mirror-work Banjara bag worn across the body,
   * a checked red gamcha round the neck and a steel kada on the wrist. The rig adds what the
   * villagers don't need: ankles that roll heel to toe, a chest that twists against the hips, and a
   * bag and gamcha that swing on springs.
   */
  private hero(look: Look) {
    const b = this.body;
    const group = (parent: THREE.Object3D, x: number, y: number, z: number) => {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    const jeans = look.dhoti, cuff = "#3d5482", shoe = "#f4f1e8", sole = "#c0392b", trim = "#f1e4c4", hair = look.hat;

    // legs: thigh, shin and an ankle, so the foot can strike with the heel and push off the toe
    for (const s of [-1, 1]) {
      const hip = group(b, s * 0.1, 0.92, 0);
      part(new THREE.CapsuleGeometry(0.09, 0.28, 4, 12), jeans, hip, 0, -0.22, 0);
      const knee = group(hip, 0, -0.45, 0);
      part(new THREE.CapsuleGeometry(0.074, 0.28, 4, 12), jeans, knee, 0, -0.19, 0);
      part(new THREE.CylinderGeometry(0.079, 0.077, 0.05, 14), cuff, knee, 0, -0.36, 0); // a turned-up cuff
      const ankle = group(knee, 0, -0.4, 0);
      const upper = part(new THREE.CapsuleGeometry(0.056, 0.15, 4, 10), shoe, ankle, 0, -0.03, 0.045, 0.7);
      upper.rotation.x = Math.PI / 2;
      upper.scale.set(1, 1, 0.68);
      part(new THREE.BoxGeometry(0.118, 0.026, 0.285), sole, ankle, 0, -0.064, 0.045, 0.9);
      part(new THREE.BoxGeometry(0.05, 0.012, 0.09), "#d8d2c4", ankle, 0, 0.004, 0.06); // laces
      this.hips.push(hip);
      this.knees.push(knee);
      this.feet.push(ankle);
    }
    part(new THREE.CapsuleGeometry(0.125, 0.09, 4, 12).rotateZ(Math.PI / 2), jeans, b, 0, 0.9, 0); // seat of the jeans

    // the chest twists against the hips; arms, head, gamcha and bag ride on it
    const chest = group(b, 0, 0.98, 0);
    this.chest = chest;
    const kurta = part(lathe([[0.001, -0.2], [0.205, -0.2], [0.188, -0.02], [0.2, 0.2], [0.208, 0.3], [0.185, 0.39], [0.07, 0.46], [0.001, 0.46]], 24), look.kurta, chest);
    kurta.scale.z = 0.72;
    const hem = part(new THREE.CylinderGeometry(0.207, 0.207, 0.035, 24, 1, true), trim, chest, 0, -0.185, 0);
    hem.scale.z = 0.72;
    part(new THREE.BoxGeometry(0.035, 0.17, 0.01), trim, chest, 0, 0.33, 0.141); // the placket
    for (let i = 0; i < 3; i++) part(new THREE.SphereGeometry(0.009, 6, 4), "#5a3b22", chest, 0, 0.38 - i * 0.045, 0.148);
    part(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 12), look.skin, chest, 0, 0.49, 0); // neck

    // arms: kurta sleeves rolled to just above the elbow, bare forearms
    for (const s of [-1, 1]) {
      const sh = group(chest, s * 0.235, 0.33, 0);
      part(new THREE.CapsuleGeometry(0.068, 0.18, 4, 12), look.kurta, sh, 0, -0.11, 0);
      part(new THREE.CylinderGeometry(0.073, 0.071, 0.05, 14), "#a8482a", sh, 0, -0.235, 0); // the rolled cuff
      const el = group(sh, 0, -0.31, 0);
      part(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), look.skin, el, 0, -0.12, 0);
      part(new THREE.SphereGeometry(0.052, 12, 10), look.skin, el, 0, -0.285, 0.008).scale.set(0.9, 1.1, 0.8);
      part(new THREE.SphereGeometry(0.022, 8, 6), look.skin, el, s * -0.035, -0.26, 0.035); // thumb
      if (s < 0) part(new THREE.TorusGeometry(0.05, 0.011, 6, 16), "#c9ccd1", el, 0, -0.22, 0, 0.25).rotation.x = Math.PI / 2; // steel kada
      sh.rotation.z = s * 0.08;
      this.shoulders.push(sh);
      this.elbows.push(el);
    }

    // the gamcha: draped round the neck, one end hanging down the front on a spring
    const gamcha = new THREE.MeshStandardMaterial({ map: checkTex("#b3262f"), roughness: 0.9 });
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.034, 8, 20), gamcha);
    loop.position.set(0, 0.44, 0.005);
    loop.rotation.x = Math.PI / 2 - 0.18;
    loop.scale.set(1, 0.82, 1);
    loop.castShadow = true;
    chest.add(loop);
    const scarf = group(chest, 0.07, 0.42, 0.12);
    const end = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.3, 0.016), gamcha);
    end.position.set(0, -0.15, 0.012);
    end.castShadow = true;
    scarf.add(end);
    this.scarf = scarf;

    // the Banjara bag: strap over the left shoulder, the bag at the right hip, swinging from the shoulder
    const bag = group(chest, -0.15, 0.39, 0);
    const strapLen = Math.hypot(0.3, 0.42);
    const front = part(new THREE.BoxGeometry(0.038, strapLen, 0.012), "#2a1c14", bag, 0.15, -0.21, 0.152);
    front.rotation.z = Math.atan2(0.3, 0.42);
    const back = part(new THREE.BoxGeometry(0.038, 0.5, 0.012), "#2a1c14", bag, 0.12, -0.2, -0.15);
    back.rotation.z = 0.6;
    const sack = group(bag, 0.31, -0.55, 0.13);
    sack.rotation.y = 0.55; // follows the curve of the hip
    part(new THREE.BoxGeometry(0.26, 0.24, 0.07), "#1f1a22", sack, 0, 0, 0, 0.95);
    const bands = ["#c8302a", "#e8b830", "#2f8a4a"];
    bands.forEach((c, i) => part(new THREE.BoxGeometry(0.262, 0.022, 0.072), c, sack, 0, 0.07 - i * 0.05, 0, 0.9));
    for (let i = 0; i < 4; i++) {
      const mirror = part(new THREE.CylinderGeometry(0.014, 0.014, 0.004, 10), "#e6edf0", sack, -0.09 + i * 0.06, -0.08, 0.037, 0.15);
      mirror.rotation.x = Math.PI / 2;
    }
    for (let i = 0; i < 5; i++) part(new THREE.SphereGeometry(0.014, 6, 4), i % 2 ? "#e8b830" : "#c8302a", sack, -0.1 + i * 0.05, -0.135, 0.01); // tassels
    this.bag = bag;

    // head: an open face, brows, a short fade with a swept quiff
    this.head.position.set(0, 0.55, 0);
    chest.add(this.head);
    const h = this.head;
    part(new THREE.SphereGeometry(0.118, 22, 16), look.skin, h, 0, 0.115, 0).scale.set(0.93, 1.05, 1);
    part(new THREE.SphereGeometry(0.092, 16, 12), look.skin, h, 0, 0.06, 0.018).scale.set(0.95, 0.82, 1); // jaw and chin
    const nose = part(new THREE.CapsuleGeometry(0.017, 0.03, 3, 8), look.skin, h, 0, 0.1, 0.112);
    nose.rotation.x = 0.35;
    part(new THREE.BoxGeometry(0.042, 0.008, 0.01), "#6b3a2a", h, 0, 0.058, 0.103); // mouth
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.018, 10, 8), "#f4efe6", h, s * 0.042, 0.135, 0.098, 0.4).scale.set(1.2, 0.85, 0.6); // eye whites
      part(new THREE.SphereGeometry(0.011, 8, 6), "#1c1410", h, s * 0.042, 0.135, 0.108, 0.3);
      const brow = part(new THREE.BoxGeometry(0.046, 0.011, 0.012), hair, h, s * 0.044, 0.168, 0.104);
      brow.rotation.z = s * -0.12;
      part(new THREE.SphereGeometry(0.024, 8, 6), look.skin, h, s * 0.113, 0.11, -0.005).scale.set(0.6, 1, 1); // ears
    }
    const cap = part(new THREE.SphereGeometry(0.125, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), hair, h, 0, 0.118, -0.008);
    cap.rotation.x = -0.4;
    cap.scale.set(1.02, 1, 1.04);
    // the quiff: a few soft lumps, swept to his right
    for (const [x, y, z, sx] of [[0.02, 0.215, 0.05, 1.6], [-0.04, 0.22, 0.02, 1.3], [0.05, 0.205, -0.02, 1.2]] as const) {
      part(new THREE.SphereGeometry(0.055, 12, 8), hair, h, x, y, z).scale.set(sx, 0.55, 1);
    }
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
  action: "none" | "hoe" | "bend" | "carry" | "sit" | "draw" | "pour" | "fish" | "reel" | "crouch" | "cheer" = "none";
  private props = new Map<string, THREE.Object3D>();
  private restZ?: number[];

  /** Give the figure something to hold: a hoe (kudal) in the hands, or a clay pot (matka) on the head. */
  hold(kind: "hoe" | "pot" | "can" | "bag" | "rod" | "none") {
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
    } else if (kind === "can") {
      // a brass watering can with its long spout, held by the handle
      part(new THREE.CylinderGeometry(0.1, 0.11, 0.2, 12), "#c9a24a", g, 0, -0.08, 0.08, 0.35);
      const spout = part(new THREE.CylinderGeometry(0.014, 0.02, 0.3, 6), "#b08a30", g, 0, -0.02, 0.26, 0.35);
      spout.rotation.x = 1.0;
      part(new THREE.TorusGeometry(0.06, 0.012, 5, 10, Math.PI), "#b08a30", g, 0, 0.04, 0.02, 0.35);
      g.position.set(0, -0.3, 0);
      this.elbows[1].add(g);
    } else if (kind === "rod") {
      // a bamboo gal: a long thin cane with a few knots, the line running from its tip
      const cane = new THREE.Group();
      part(new THREE.CylinderGeometry(0.008, 0.017, 2.3, 6), "#c8a868", cane, 0, 1.1, 0, 0.6);
      for (let i = 1; i < 5; i++) part(new THREE.CylinderGeometry(0.019 - i * 0.002, 0.019 - i * 0.002, 0.03, 6), "#8a6a3c", cane, 0, i * 0.45, 0, 0.6);
      const tip = new THREE.Object3D();
      tip.name = "rodTip";
      tip.position.y = 2.25;
      cane.add(tip);
      cane.rotation.x = 2.05; // out over the water, about 30° above level when the arm is raised
      g.add(cane);
      g.position.set(0, -0.3, 0.02);
      this.elbows[1].add(g);
    } else if (kind === "bag") {
      // a cloth seed bag in the hand
      part(new THREE.SphereGeometry(0.08, 10, 8).scale(1, 1.2, 0.8), "#d8c29a", g, 0, -0.06, 0.03, 1);
      part(new THREE.CylinderGeometry(0.03, 0.05, 0.05, 8), "#a0453a", g, 0, 0.04, 0.03, 1);
      g.position.set(0, -0.3, 0);
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

  /** Walk phase in radians: one step per half cycle, advanced by distance so the feet keep pace with the ground. */
  private phase = Math.random() * Math.PI * 2;
  private lastSpeed = 0;

  /** How far one step carries the body at a given speed (m): about 1.4 m at a brisk walk, 2.1 m at a run. */
  static stepLength(speed: number) {
    return Math.min(2.2, Math.max(0.5, 0.55 + 0.25 * speed));
  }

  // springs for the player's bag and gamcha: [angle, velocity]
  private bagFwd = [0, 0];
  private bagSide = [0, 0];
  private scarfSwing = [0, 0];
  private lean = 0;
  private accelS = 0;
  private airPose = 0;

  /**
   * `turn`: how fast the body is turning (rad/s, positive to the left), to lean into it.
   * `air`: 1 while off the ground, for the jump pose. Both only matter for the player's rig.
   */
  animate(dt: number, speed: number, motion: { turn?: number; air?: number } = {}) {
    const smooth = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const walking = smooth(0.15, 1.2, speed);
    const run = smooth(3.6, 6, speed);
    this.t += dt;
    this.phase += ((Math.PI * speed) / Figure.stepLength(speed)) * dt;
    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    // hips: forward is negative x. Leg 0 swings forward while cos > 0, leg 1 half a cycle behind,
    // and the swinging leg lifts its knee to clear the ground while the other carries the body.
    const stride = (0.42 + 0.2 * run) * walking;
    const lift = (0.55 + 0.6 * run) * walking;
    this.hips[0].rotation.x = -s * stride;
    this.hips[1].rotation.x = s * stride;
    this.knees[0].rotation.x = 0.04 * walking + Math.max(0, c) ** 1.5 * lift;
    this.knees[1].rotation.x = 0.04 * walking + Math.max(0, -c) ** 1.5 * lift;
    // arms swing against the legs, and bend more as the pace picks up
    const arm = (0.4 + 0.35 * run) * walking;
    this.shoulders[0].rotation.x = s * arm;
    this.shoulders[1].rotation.x = -s * arm;
    this.elbows[0].rotation.x = -0.2 - (0.15 + 0.9 * run) * walking - Math.max(0, -s) * 0.25 * walking;
    this.elbows[1].rotation.x = -0.2 - (0.15 + 0.9 * run) * walking - Math.max(0, s) * 0.25 * walking;
    // the body dips as the legs spread and rises over the planted foot (twice a cycle), leans into
    // the pace and into speeding up, and the hips twist against the shoulders
    const accel = dt > 0 ? (speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = speed;
    const posed = this.action === "none" ? 1 : 0;
    this.body.position.y = (-Math.abs(s) * 0.04 + 0.02) * walking - run * 0.02 + Math.sin(this.t * 1.6) * 0.004 * (1 - walking);
    this.body.rotation.x = (0.03 * walking + 0.07 * run + THREE.MathUtils.clamp(accel * 0.012, -0.08, 0.08)) * posed;
    this.body.rotation.y = s * 0.07 * walking * posed;
    if (this.chest) this.extras(dt, speed, s, c, walking, run, accel, posed, motion);
    // the head steadies itself against the twist, and glances around when standing
    this.head.rotation.y = -s * 0.06 * walking + Math.sin(this.t * 0.35) * 0.15 * (1 - walking);
    // poses may spread the arms; every frame starts from the shoulders' resting angle
    this.restZ ??= this.shoulders.map((sh) => sh.rotation.z);
    this.shoulders.forEach((sh, i) => (sh.rotation.z = this.restZ![i]));
    for (const [k, o] of this.props) if (k === "can" && this.action !== "pour") o.rotation.x = 0;
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
    } else if (this.action === "pour") {
      // the can held out in front and tipped
      this.shoulders[1].rotation.x = -1.15;
      this.elbows[1].rotation.x = -0.25;
      this.body.rotation.x = 0.12;
      for (const [k, o] of this.props) if (k === "can") o.rotation.x = 0.7 + Math.sin(this.t * 6) * 0.05;
    } else if (this.action === "draw") {
      // hauling the bucket rope up hand over hand
      const c = Math.sin(this.t * 3.2);
      this.shoulders[0].rotation.x = -1.9 + c * 0.5;
      this.shoulders[1].rotation.x = -1.9 - c * 0.5;
      this.elbows[0].rotation.x = -0.6 - Math.max(0, c) * 0.5;
      this.elbows[1].rotation.x = -0.6 - Math.max(0, -c) * 0.5;
      this.body.rotation.x = 0.12 + Math.abs(c) * 0.05;
    } else if (this.action === "fish" || this.action === "reel") {
      // both hands on the rod, held out over the water; reeling works the arms
      const w = this.action === "reel" ? Math.sin(this.t * 14) * 0.12 : Math.sin(this.t * 1.3) * 0.03;
      this.shoulders[1].rotation.x = -0.75 + w;
      this.elbows[1].rotation.x = -0.35;
      this.shoulders[0].rotation.x = -0.6 - w;
      this.elbows[0].rotation.x = -0.9;
      this.body.rotation.x = this.action === "reel" ? -0.08 : 0.04;
    } else if (this.action === "crouch") {
      // a kabaddi defender's stance: knees bent, arms out, ready to pounce
      this.hips[0].rotation.x = this.hips[1].rotation.x = -0.6;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 0.8;
      this.body.rotation.x = 0.35;
      this.body.position.y -= 0.12;
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = -1.1 + Math.sin(this.t * 3) * 0.1;
      this.shoulders[0].rotation.z = -0.35;
      this.shoulders[1].rotation.z = 0.35;
    } else if (this.action === "cheer") {
      const c = Math.abs(Math.sin(this.t * 5));
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = -2.8 + c * 0.3;
      this.body.position.y += c * 0.06;
    } else if (this.action === "sit") {
      this.hips[0].rotation.x = this.hips[1].rotation.x = -1.5;
      this.knees[0].rotation.x = this.knees[1].rotation.x = 1.5;
      this.body.position.y = -0.45;
      this.shoulders[0].rotation.x = this.shoulders[1].rotation.x = -0.4;
      if (this.props.get("rod")?.visible) {
        // sitting on the bank with a rod held out over the water
        this.shoulders[1].rotation.x = -0.85 + Math.sin(this.t * 1.1) * 0.03;
        this.elbows[1].rotation.x = -0.3;
        this.shoulders[0].rotation.x = -0.7;
        this.elbows[0].rotation.x = -0.8;
      }
    }
  }

  /** The player's rig on top of the shared walk: feet, chest, lean, jump, and the swinging bag and gamcha. */
  private extras(dt: number, speed: number, s: number, c: number, walking: number, run: number, accel: number, posed: number, motion: { turn?: number; air?: number }) {
    const k = (rate: number) => 1 - Math.exp(-rate * dt);
    const ramp = (a: number, b: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    // Lean into acceleration and into speed; bank into turns. The logic is SADAK's hero animator
    // (github.com/mittal-parth/sadak, used with its developer's permission), with its speeds mapped
    // onto ours: SADAK walks at 4.6 m/s and sprints at 12, we walk at 3.4 and run at 6.2.
    const toSadak = 12 / 6.2;
    const sRun = ramp(2.2, 4.6, speed * toSadak), sSprint = ramp(5.5, 9.5, speed * toSadak);
    this.accelS += (accel - this.accelS) * k(10); // frame-to-frame speed is noisy; smooth it first
    const lean = THREE.MathUtils.clamp(this.accelS * 0.009 + sRun * 0.1 + sSprint * 0.12, -0.2, 0.3) * posed;
    const bank = THREE.MathUtils.clamp(-(motion.turn ?? 0) * speed * toSadak * 0.02, -0.25, 0.25) * posed;
    const pelvisRoll = s * (0.03 + 0.02 * sRun) * walking * posed;
    this.lean += (bank - this.lean) * k(12);
    this.body.rotation.x = lean * 0.4;
    this.body.rotation.z = pelvisRoll + this.lean;
    for (const hip of this.hips) hip.rotation.x -= lean * 0.4; // the legs stay under the body
    this.chest!.rotation.x = lean; // the spine and chest take the rest of the lean
    this.chest!.rotation.z = -pelvisRoll - this.lean * 0.5; // the chest rights itself half way
    this.head.rotation.x = -lean * 0.7; // and the head keeps its gaze level
    this.head.rotation.z = -this.lean * 0.4;
    // heel strike as a leg reaches forward, toe-off as it leaves the ground behind, and the foot
    // otherwise kept level under a bent knee
    this.feet.forEach((f, i) => {
      const fwd = i === 0 ? s : -s; // 1 = this leg fully forward
      const level = -(this.hips[i].rotation.x + this.knees[i].rotation.x) * 0.85;
      f.rotation.x = (level - Math.max(0, fwd) ** 2 * 0.28 + Math.max(0, -fwd) ** 2 * 0.42) * walking * posed;
    });
    // the chest turns against the hips, so the shoulders swing with the opposite arm
    this.chest!.rotation.y = -s * 0.17 * walking * posed;
    // in the air: knees tucked, arms up and out for balance
    this.airPose += ((motion.air ?? 0) * posed - this.airPose) * k(motion.air ? 18 : 10);
    const a = this.airPose;
    if (a > 0.01) {
      this.hips[0].rotation.x -= a * 0.7;
      this.hips[1].rotation.x -= a * 0.15;
      this.knees[0].rotation.x += a * 1.1;
      this.knees[1].rotation.x += a * 0.45;
      this.shoulders.forEach((sh, i) => {
        sh.rotation.x -= a * 0.6;
        sh.rotation.z += (i === 0 ? -1 : 1) * a * 0.45;
      });
    }
    // springs: the bag swings back as you set off and forward as you stop, sways with each step and
    // swings out on turns; the gamcha end flaps with the bob
    const h = Math.min(dt, 1 / 30); // springs stay stable through a hitch
    const spring = (st: number[], stiff: number, damping: number, drive: number, rest: number) => {
      st[1] += (-stiff * (st[0] - rest) - damping * st[1] + drive) * h;
      st[0] = THREE.MathUtils.clamp(st[0] + st[1] * h, -1, 1);
      return st[0];
    };
    this.bag!.rotation.x = spring(this.bagFwd, 30, 5, -accel * 0.5 + Math.abs(c) * 5 * walking, 0.04 + run * 0.12);
    this.bag!.rotation.z = spring(this.bagSide, 26, 5, s * 7 * walking + (motion.turn ?? 0) * 4, 0);
    this.scarf!.rotation.x = spring(this.scarfSwing, 40, 6, Math.abs(c) * 9 * walking - accel * 0.4, -0.08 - run * 0.35);
  }

  /** Where the rod's tip is in the world (for the fishing line), or null without a rod in hand. */
  rodTip(out: THREE.Vector3): THREE.Vector3 | null {
    const rod = this.props.get("rod");
    if (!rod?.visible) return null;
    const tip = rod.getObjectByName("rodTip");
    if (!tip) return null;
    this.root.updateMatrixWorld(true);
    return tip.getWorldPosition(out);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }
}
