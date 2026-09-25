import * as THREE from "three";
import type { Structure, World } from "../shared/world";
import { banjaraWoman, Figure, type Look } from "./scene/figure";

/*
 * Evenings in the tanda: friends round a small fire in the chowk, and your own house (the one
 * nearest Aamrai) with a door that swings open when you go home to sleep.
 */
type House = Extract<Structure, { kind: "house" }>;

export class Nights {
  readonly group = new THREE.Group();
  readonly home: { door: THREE.Vector3; inside: THREE.Vector3; face: number; yard: THREE.Vector3; yardFace: number };
  private gotha = new THREE.Group();
  readonly fire: THREE.Vector3;
  private hinge = new THREE.Group();
  private baseYaw = 0;
  private doorAngle = 0;
  private doorTarget = 0;
  private friends: Figure[] = [];
  private flame: THREE.Mesh;
  readonly light = new THREE.PointLight("#ff9a3c", 0, 12, 1.6);
  private t = 0;

  constructor(world: World, ground: (x: number, z: number) => number, blocked: (x: number, z: number) => boolean = () => false) {
    // home: the house closest to your field
    const aamrai = world.plots.find((p) => p.starter)!;
    const ac = { x: (aamrai.x0 + aamrai.x1) / 2, z: (aamrai.z0 + aamrai.z1) / 2 };
    const houses = world.structures.filter((s): s is House => s.kind === "house");
    // Rathod Bhuvan, if the village has it: your door is the middle one, in the wall behind the verandah
    const wada = world.structures.find((s) => s.kind === "wada");
    const h: House = wada
      ? { kind: "house", x0: wada.x0, z0: Math.floor(wada.z0 + wada.d / 2), w: 4, d: 1, y: wada.y, walls: "whitewash", roof: "tile", door: "E" }
      : houses.sort((a, b) => Math.hypot(a.x0 + a.w / 2 - ac.x, a.z0 + a.d / 2 - ac.z) - Math.hypot(b.x0 + b.w / 2 - ac.x, b.z0 + b.d / 2 - ac.z))[0];
    const side = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[h.door];
    const cx = h.x0 + h.w / 2, cz = h.z0 + h.d / 2;
    const dx = cx + side[0] * (h.w / 2 + 0.06), dz = cz + side[1] * (h.d / 2 + 0.06);
    const y = h.y + 0.3;
    // a new wooden door leaf over the painted one, hinged on its left edge
    const along = side[0] ? [0, 1] : [1, 0];
    this.hinge.position.set(dx - along[0] * 0.47, y, dz - along[1] * 0.47);
    this.baseYaw = Math.atan2(side[0], side[1]) - Math.PI / 2;
    this.hinge.rotation.y = this.baseYaw;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.94, 1.95, 0.06), new THREE.MeshStandardMaterial({ color: "#6b4a2e", roughness: 0.85 }));
    leaf.geometry.translate(0.47, 0.975, 0);
    leaf.castShadow = true;
    this.hinge.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshStandardMaterial({ color: "#c9a040", metalness: 0.7, roughness: 0.3 }));
    knob.position.set(0.82, 1.0, 0.05);
    this.hinge.add(knob);
    this.group.add(this.hinge);
    // a name board: this one is yours
    // the yard behind the house: a khunta (tie post) and a stone trough, and the gotha if you build one
    // find an open patch of ground (5 × 5 clear of walls, fences and trees) close to the house,
    // preferring the back and sides over the front door
    const clear = (x: number, z: number) => {
      for (let dz = -2.5; dz <= 2.5; dz += 1) for (let dx = -2.5; dx <= 2.5; dx += 1) if (blocked(x + dx, z + dz)) return false;
      return true;
    };
    let yx = cx - side[0] * ((side[0] ? h.w : h.d) / 2 + 2.6), yz = cz - side[1] * ((side[0] ? h.w : h.d) / 2 + 2.6);
    let best = Infinity;
    for (let r = 4; r <= 14; r += 1)
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 16) {
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        if (!clear(x, z)) continue;
        const front = (Math.cos(a) * side[0] + Math.sin(a) * side[1]) > 0.5 ? 5 : 0; // not in front of the door
        const score = r + front;
        if (score < best) {
          best = score;
          yx = x;
          yz = z;
        }
      }
    const yy = ground(yx, yz);
    const yardFace = Math.atan2(cx - yx, cz - yz); // the trough side faces away from the house
    this.home = { door: new THREE.Vector3(dx + side[0] * 1.4, y, dz + side[1] * 1.4), inside: new THREE.Vector3(cx, y, cz), face: Math.atan2(-side[0], -side[1]), yard: new THREE.Vector3(yx, yy, yz), yardFace };
    const wood = new THREE.MeshStandardMaterial({ color: "#6a4a2c", roughness: 0.9 });
    const stoneM = new THREE.MeshStandardMaterial({ color: "#8e877b", roughness: 1 });
    const hay = new THREE.MeshStandardMaterial({ color: "#d9b35a", roughness: 1 });
    const yard = new THREE.Group();
    const put = (g: THREE.BufferGeometry, m: THREE.Material, x: number, py: number, z: number, parent = yard) => {
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(x, py, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    put(new THREE.CylinderGeometry(0.09, 0.11, 1.3, 8), wood, 0, 0.65, 1.2); // the khunta
    put(new THREE.TorusGeometry(0.12, 0.025, 6, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#a08a60" }), 0, 1.0, 1.2); // its rope
    put(new THREE.BoxGeometry(1.6, 0.45, 0.55), stoneM, 0, 0.22, 2.0); // the trough
    put(new THREE.BoxGeometry(1.4, 0.12, 0.4), hay, 0, 0.46, 2.0); // kadba in it
    // the gotha: four posts and a tiled roof over the tying place
    for (const [px, pz] of [[-1.8, -0.4], [1.8, -0.4], [-1.8, 2.6], [1.8, 2.6]]) put(new THREE.CylinderGeometry(0.1, 0.12, 2.6, 8), wood, px, 1.3, pz, this.gotha);
    const roof = put(new THREE.BoxGeometry(4.3, 0.12, 3.8), new THREE.MeshStandardMaterial({ color: "#a8492e", roughness: 0.8 }), 0, 2.7, 1.1, this.gotha);
    roof.rotation.x = 0.12;
    for (let i = 0; i < 6; i++) put(new THREE.SphereGeometry(0.35, 8, 6).scale(1, 0.6, 1), hay, -1.4 + (i % 3) * 0.5, 0.2, 2.8 + Math.floor(i / 3) * 0.1, this.gotha);
    this.gotha.visible = false;
    yard.add(this.gotha);
    yard.position.set(yx, yy, yz);
    yard.rotation.y = yardFace;
    this.group.add(yard);

    // the evening fire in the chowk, with stones round it and friends sitting close
    const ch = world.chowk;
    const fx = (ch.x0 + ch.x1) / 2 + 2, fz = ch.z1 - 3.5;
    const fy = ground(fx, fz);
    this.fire = new THREE.Vector3(fx, fy, fz);
    const stone = new THREE.MeshStandardMaterial({ color: "#7a746a", roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14), stone);
      st.position.set(fx + Math.cos(a) * 0.5, fy + 0.07, fz + Math.sin(a) * 0.5);
      this.group.add(st);
    }
    for (let i = 0; i < 3; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), new THREE.MeshStandardMaterial({ color: "#4a3422" }));
      log.rotation.set(Math.PI / 2, (i / 3) * Math.PI, 0.3);
      log.position.set(fx, fy + 0.1, fz);
      this.group.add(log);
    }
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 10, 1, true), new THREE.MeshBasicMaterial({ color: "#ffb347", transparent: true, opacity: 0.9, toneMapped: false }));
    this.flame.position.set(fx, fy + 0.35, fz);
    this.group.add(this.flame);
    this.light.position.set(fx, fy + 0.8, fz);
    this.group.add(this.light);
    const looks: Look[] = [
      { kurta: "#f1ead9", dhoti: "#e9e1cd", hat: "#e0762a", hatStyle: "pheta", skin: "#9a6240" },
      banjaraWoman("#1f4fa0", "#c0392b"),
      { kurta: "#dfe6ee", dhoti: "#2c3e5c", hat: "#1a1210", hatStyle: "topi", skin: "#a8704a" },
      banjaraWoman("#7a1f4a", "#e8a030"),
    ];
    looks.forEach((l, i) => {
      const f = new Figure(l);
      const a = (i / looks.length) * Math.PI * 2 + 0.4;
      f.root.position.set(fx + Math.cos(a) * 1.3, fy, fz + Math.sin(a) * 1.3);
      f.root.rotation.y = Math.atan2(fx - f.root.position.x, fz - f.root.position.z);
      f.action = "sit";
      this.group.add(f.root);
      this.friends.push(f);
    });
  }

  /** Your place in the circle: the gap between two friends nearest where you stand, facing the fire. */
  seatBy(px: number, pz: number) {
    let best = { x: 0, z: 0, face: 0 }, bd = Infinity;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4 + Math.PI / 4;
      const x = this.fire.x + Math.cos(a) * 1.3, z = this.fire.z + Math.sin(a) * 1.3;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        best = { x, z, face: Math.atan2(this.fire.x - x, this.fire.z - z) };
      }
    }
    return { ...best, y: this.fire.y };
  }

  /** Evening: friends out and the fire lit (7 to 11:30 pm). */
  static evening = (hour: number) => hour >= 19 && hour < 23.5;

  /** Show the gotha once you've built it. */
  setGotha(on: boolean) {
    this.gotha.visible = on;
  }

  openDoor(open: boolean) {
    this.doorTarget = open ? -1.6 : 0;
  }

  update(dt: number, hour: number) {
    this.t += dt;
    const on = Nights.evening(hour);
    for (const f of this.friends) {
      f.root.visible = on;
      if (on) f.animate(dt, 0);
    }
    this.flame.visible = on;
    this.light.intensity = on ? 14 + Math.sin(this.t * 13) * 3 + Math.sin(this.t * 7.3) * 2 : 0;
    this.flame.scale.set(1 + Math.sin(this.t * 11) * 0.12, 1 + Math.sin(this.t * 9) * 0.2, 1);
    this.doorAngle += (this.doorTarget - this.doorAngle) * Math.min(1, dt * 4);
    this.hinge.rotation.y = this.baseYaw + this.doorAngle;
  }
}

/** What friends say round the fire (one per evening). */
export const FIRESIDE = [
  "Ramu kaka: \"Onion prices jump in the monsoon, beta. Keep some in the godown.\"",
  "Kamlabai: \"Drip lines save half the water. The panchayat should help every farmer buy them.\"",
  "Sitaram: \"Remember when we raced bullock carts to the Jalna mandi? Sarja would have won.\"",
  "Laxmi: \"Next Teej, I'll grow the tallest wheat basket in the tanda. You'll see.\"",
  "Sitaram: \"The sahukar's interest eats a family alive. Borrow from the Sahakari Bank if you must.\"",
  "Ramu kaka: \"Our grandfathers walked the whole Deccan with their tandas. Now we have taps and a tanki!\"",
  "Laxmi: \"Water your crops in the morning — in summer the soil dries by afternoon.\"",
];
