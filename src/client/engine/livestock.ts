import * as THREE from "three";
import { mergeBoxes } from "./merge";

/*
 * The Khillari bull pair and the bullock cart, built from boxes like everything else.
 * Everything faces +z. A `Rig` is the pair (always) plus the cart behind them (when hitched).
 */
const mat = (() => {
  const cache = new Map<string, THREE.MeshLambertMaterial>();
  return (c: string) => cache.get(c) ?? (cache.set(c, new THREE.MeshLambertMaterial({ color: c })), cache.get(c)!);
})();
function box(parent: THREE.Object3D, w: number, h: number, d: number, c: string, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

class Bull {
  readonly group = new THREE.Group();
  private legs: THREE.Group[] = [];
  private head = new THREE.Group();
  private tail = new THREE.Group();

  constructor(blanket: string, hornTip: string) {
    const g = this.group;
    const hide = "#e6e0d4", shade = "#cdc6b8", dark = "#8f857a";
    box(g, 0.72, 0.72, 1.5, hide, 0, 0.98, 0); // body
    box(g, 0.74, 0.6, 0.5, shade, 0, 1.02, 0.45); // shoulders
    box(g, 0.44, 0.28, 0.36, shade, 0, 1.46, 0.46); // the hump
    box(g, 0.2, 0.34, 0.5, shade, 0, 0.66, 0.62); // dewlap
    box(g, 0.76, 0.06, 0.78, blanket, 0, 1.36, -0.12); // jhool, the painted cloth
    box(g, 0.78, 0.2, 0.06, blanket, 0, 1.26, 0.27);
    for (const [x, z] of [[-0.22, 0.52], [0.22, 0.52], [-0.22, -0.55], [0.22, -0.55]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.66, z);
      box(leg, 0.18, 0.6, 0.18, hide, 0, -0.3, 0);
      box(leg, 0.19, 0.08, 0.2, "#3a2f28", 0, -0.62, 0.01); // hooves
      g.add(leg);
      this.legs.push(leg);
    }
    this.head.position.set(0, 1.18, 0.82);
    g.add(this.head);
    box(this.head, 0.34, 0.36, 0.46, hide, 0, 0, 0.16);
    box(this.head, 0.3, 0.22, 0.18, dark, 0, -0.08, 0.46); // muzzle
    box(this.head, 0.36, 0.04, 0.02, "#1d1814", 0, 0.06, 0.39); // eyes line
    box(this.head, 0.14, 0.08, 0.06, shade, -0.23, 0.08, 0.02); // ears
    box(this.head, 0.14, 0.08, 0.06, shade, 0.23, 0.08, 0.02);
    for (const s of [-1, 1]) {
      // long horns sweeping up and back, painted at the tips
      const horn = new THREE.Group();
      horn.position.set(s * 0.13, 0.18, 0.02);
      horn.rotation.set(-0.95, 0, s * 0.3);
      box(horn, 0.07, 0.07, 0.34, "#d8cdb4", 0, 0, -0.17);
      box(horn, 0.075, 0.075, 0.14, hornTip, 0, 0, -0.4);
      box(horn, 0.05, 0.05, 0.06, "#c9a040", 0, 0, -0.5); // brass tip cap
      this.head.add(horn);
    }
    box(g, 0.3, 0.1, 0.12, "#c9a040", 0, 0.86, 0.8); // bell on the collar
    box(g, 0.12, 0.12, 0.1, "#b08a30", 0, 0.76, 0.84);
    this.tail.position.set(0, 1.25, -0.76);
    box(this.tail, 0.06, 0.62, 0.06, shade, 0, -0.31, 0);
    box(this.tail, 0.1, 0.14, 0.1, "#3a2f28", 0, -0.66, 0);
    g.add(this.tail);
  }

  animate(t: number, gait: number) {
    // gait 0 = standing (head bobs, tail flicks), 1 = walking
    this.legs.forEach((leg, i) => (leg.rotation.x = Math.sin(t * 7 + (i === 0 || i === 3 ? 0 : Math.PI)) * 0.45 * gait));
    this.head.rotation.x = Math.sin(t * (gait ? 7 : 1.3)) * (gait ? 0.05 : 0.08) + (gait ? 0 : 0.12);
    this.tail.rotation.z = Math.sin(t * 2.3) * 0.25;
    this.tail.rotation.x = 0.15 + Math.sin(t * 1.1) * 0.08;
  }
}

class Cart {
  readonly group = new THREE.Group();
  private wheels: THREE.Group[] = [];
  constructor() {
    const g = this.group;
    const wood = "#9a7046", dark = "#6a4a2c";
    box(g, 0.12, 0.12, 2.6, dark, -0.18, 1.05, 1.1); // the two shafts running up to the yoke
    box(g, 0.12, 0.12, 2.6, dark, 0.18, 1.05, 1.1);
    box(g, 1.3, 0.1, 1.9, wood, 0, 1.08, -1.0); // bed
    for (const x of [-0.62, 0.62]) {
      box(g, 0.08, 0.4, 1.9, wood, x, 1.33, -1.0); // side rails
      for (const z of [-1.9, -1.35, -0.8, -0.25]) box(g, 0.1, 0.55, 0.1, dark, x, 1.35, z); // stakes
    }
    box(g, 1.3, 0.4, 0.08, wood, 0, 1.33, -1.95);
    box(g, 1.1, 0.12, 0.5, "#c9a45c", 0, 1.2, -0.4); // a hay cushion for the driver
    for (const x of [-0.82, 0.82]) {
      const w = new THREE.Group();
      w.position.set(x, 0.78, -1.0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.74, 0.06, 6, 20), mat("#4a3420"));
      rim.rotation.y = Math.PI / 2;
      w.add(rim);
      for (let i = 0; i < 6; i++) {
        const spoke = box(w, 0.05, 1.42, 0.06, wood, 0, 0, 0);
        spoke.rotation.x = (i / 6) * Math.PI;
      }
      box(w, 0.2, 0.2, 0.2, dark, 0, 0, 0); // hub
      g.add(w);
      this.wheels.push(w);
    }
    box(g, 1.9, 0.08, 0.08, dark, 0, 0.78, -1.0); // axle
  }
  roll(dist: number) {
    for (const w of this.wheels) w.rotation.x = dist / 0.78;
  }
}

/** The pair (always) and the cart (when hitched). */
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
    this.bulls[0].group.position.x = -0.5;
    this.bulls[1].group.position.x = 0.5;
    this.pair.add(this.bulls[0].group, this.bulls[1].group);
    box(this.pair, 1.9, 0.12, 0.14, "#6a4a2c", 0, 1.38, 0.72); // the yoke across their necks
    this.group.add(this.pair);
    this.cart.group.position.z = -1.35;
    this.cart.group.visible = false;
    this.group.add(this.cart.group);
    mergeBoxes(this.group);
  }

  setHitched(on: boolean) {
    this.hitched = on;
    this.cart.group.visible = on;
  }

  /** Advance animation; `moved` is how far the rig travelled this frame. */
  update(dt: number, moved: number) {
    this.t += dt;
    const gait = Math.min(1, moved / Math.max(dt, 1e-3) / 2);
    this.bulls.forEach((b, i) => b.animate(this.t + i * 0.37, gait));
    this.rolled += moved;
    this.cart.roll(this.rolled);
  }
}

/** A cart standing alone (parked), so it can wait at home or at the mandi. */
export function parkedCart(): THREE.Group {
  const c = new Cart();
  // tip the cart forward about its axle until the shaft ends rest on the ground
  const pivot = new THREE.Group();
  pivot.position.set(0, 0.78, -1.0);
  c.group.position.set(0, -0.78, 1.0);
  pivot.rotation.x = 0.29;
  pivot.add(c.group);
  const g = new THREE.Group();
  g.add(pivot);
  mergeBoxes(g);
  return g;
}
