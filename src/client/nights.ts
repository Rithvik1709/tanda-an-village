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
  readonly home: { door: THREE.Vector3; inside: THREE.Vector3; face: number };
  readonly fire: THREE.Vector3;
  private hinge = new THREE.Group();
  private baseYaw = 0;
  private doorAngle = 0;
  private doorTarget = 0;
  private friends: Figure[] = [];
  private flame: THREE.Mesh;
  private light = new THREE.PointLight("#ff9a3c", 0, 12, 1.6);
  private t = 0;

  constructor(world: World, ground: (x: number, z: number) => number) {
    // home: the house closest to your field
    const aamrai = world.plots.find((p) => p.starter)!;
    const ac = { x: (aamrai.x0 + aamrai.x1) / 2, z: (aamrai.z0 + aamrai.z1) / 2 };
    const houses = world.structures.filter((s): s is House => s.kind === "house");
    const h = houses.sort((a, b) => Math.hypot(a.x0 + a.w / 2 - ac.x, a.z0 + a.d / 2 - ac.z) - Math.hypot(b.x0 + b.w / 2 - ac.x, b.z0 + b.d / 2 - ac.z))[0];
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
    this.home = { door: new THREE.Vector3(dx + side[0] * 1.4, y, dz + side[1] * 1.4), inside: new THREE.Vector3(cx, y, cz), face: Math.atan2(-side[0], -side[1]) };

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

  /** Evening: friends out and the fire lit (7 to 11:30 pm). */
  static evening = (hour: number) => hour >= 19 && hour < 23.5;

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
