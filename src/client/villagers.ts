import * as THREE from "three";
import { CROP_IDS, type Planting } from "../shared/crops";
import { forSale } from "../shared/land";
import { hash2 } from "../shared/rng";
import type { Save } from "../shared/save";
import { UKHALI_ROADS } from "../shared/ukhali-osm";
import { idx, type World } from "../shared/world";
import { Fields } from "./scene/crops";
import { banjaraWoman, Figure, type Look } from "./scene/figure";

/*
 * The life of the tanda: neighbours working their own fields (and those fields growing their own
 * crops), women carrying water from the well, men walking the roads to the fields and the mandi,
 * children playing in the square. Everyone keeps day hours and goes home after dark.
 * Purely presentation — none of it touches the save.
 */
type Pt = { x: number; z: number };
type Role =
  | { kind: "farmer"; plot: number; job: "hoe" | "bend" }
  | { kind: "water"; route: Pt[] }
  | { kind: "walker"; route: Pt[] }
  | { kind: "child"; center: Pt; r: number };

class Villager {
  fig: Figure;
  pos: Pt;
  heading = 0;
  private goal: Pt | null = null;
  private workLeft = 0;
  private leg = 0;
  private speed = 1.3;

  constructor(look: Look, public role: Role, start: Pt, private scale = 1) {
    this.fig = new Figure(look);
    this.fig.root.scale.setScalar(scale);
    this.pos = { ...start };
    if (role.kind === "farmer") this.fig.hold("hoe");
    if (role.kind === "water") this.fig.hold("pot");
    if (role.kind === "child") this.speed = 2.8;
  }

  update(dt: number, t: number, day: boolean, world: World, ground: (x: number, z: number) => number, rnd: () => number) {
    const r = this.role;
    const fig = this.fig;
    let moving = false;
    const walkTo = (p: Pt, speed = this.speed) => {
      const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.15) return true;
      const step = Math.min(d, speed * dt);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      const want = Math.atan2(dx, dz);
      this.heading += Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 6);
      moving = true;
      return false;
    };
    fig.root.visible = day || r.kind === "walker";
    if (r.kind === "farmer") {
      const p = world.plots[r.plot];
      if (this.workLeft > 0) {
        this.workLeft -= dt;
        fig.action = r.job;
      } else {
        fig.action = "none";
        this.goal ??= { x: p.x0 + 2 + rnd() * (p.x1 - p.x0 - 3), z: p.z0 + 2 + rnd() * (p.z1 - p.z0 - 3) };
        if (walkTo(this.goal)) {
          this.goal = null;
          this.workLeft = 6 + rnd() * 8;
        }
      }
    } else if (r.kind === "water" || r.kind === "walker") {
      fig.action = r.kind === "water" ? "carry" : "none";
      if (this.workLeft > 0) {
        this.workLeft -= dt; // a pause at each stop: drawing water, chatting at a door
        if (r.kind === "water") fig.action = "none";
      } else if (walkTo(r.route[this.leg])) {
        this.leg = (this.leg + 1) % r.route.length;
        this.workLeft = r.kind === "water" ? 3 + rnd() * 4 : rnd() < 0.3 ? 4 : 0;
      }
    } else {
      // children chase each other in wobbly circles
      const a = t * 0.9 + this.scale * 10;
      walkTo({ x: r.center.x + Math.cos(a) * r.r * (1 + 0.3 * Math.sin(t * 0.7)), z: r.center.z + Math.sin(a) * r.r }, 3.2);
      fig.action = "none";
    }
    fig.root.position.set(this.pos.x, ground(this.pos.x, this.pos.z), this.pos.z);
    fig.root.rotation.y = this.heading;
    fig.animate(dt, moving ? this.speed : 0);
  }
}

export class Villagers {
  readonly group = new THREE.Group();
  private people: Villager[] = [];
  readonly fields = new Fields();
  private worked: number[] = [];
  private key = "";
  private seed = 1;
  private rnd = () => (this.seed = (this.seed * 16807) % 2147483647) / 2147483647;

  constructor(private world: World, private ground: (x: number, z: number) => number) {
    this.group.add(this.fields.group);
    this.fields.aim.visible = false;
    const w = world;
    const L = w.landmarks;
    const well = { x: L.well.x + 0.5, z: L.well.z - 0.5 };
    const doors = w.structures.filter((s) => s.kind === "house").map((h) => {
      const side = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[h.door];
      return { x: h.x0 + h.w / 2 + side[0] * (h.w / 2 + 1.6), z: h.z0 + h.d / 2 + side[1] * (h.d / 2 + 1.6) };
    }).sort((a, b) => Math.hypot(a.x - well.x, a.z - well.z) - Math.hypot(b.x - well.x, b.z - well.z));
    const woman = (i: number) => banjaraWoman(["#a8262c", "#1f4fa0", "#1b6a3a", "#7a1f4a", "#8a4a10"][i % 5], ["#e8a030", "#c0392b", "#8a2a8a", "#d04a2a", "#2e8a8a"][i % 5]);
    const man = (i: number): Look => ({ kurta: ["#f1ead9", "#e8e0c8", "#dfe6ee"][i % 3], dhoti: "#e9e1cd", hat: ["#f2f2ee", "#e0762a", "#c0392b"][i % 3], hatStyle: i % 2 ? "pheta" : "topi", skin: "#9a6240" });
    // water carriers: from the well to a few doorsteps and back
    doors.slice(0, 4).forEach((d, i) => this.add(new Villager(woman(i), { kind: "water", route: [well, d] }, { x: d.x, z: d.z })));
    // men walking the roads: the square to the north fields, and out to the mandi road
    // people walking the real roads: out along each road and back again
    const roads = UKHALI_ROADS.filter((r) => r.k !== "lane").map((r) => r.p.map(([x, z]) => ({ x, z })).filter((q) => q.x > 2 && q.z > 2 && q.x < 190 && q.z < 190));
    roads.forEach((pts, i) => {
      if (pts.length < 2) return;
      const route = [...pts, ...pts.slice(1, -1).reverse()];
      this.add(new Villager(i % 2 ? woman(i + 5) : man(i), { kind: "walker", route }, pts[Math.floor(pts.length / 2)]));
    });
    // children in the square
    const ch = w.chowk;
    for (let i = 0; i < 3; i++) this.add(new Villager(i % 2 ? woman(i + 2) : man(i + 1), { kind: "child", center: { x: (ch.x0 + ch.x1) / 2 + 2, z: (ch.z0 + ch.z1) / 2 }, r: 2.5 + i }, { x: ch.x0 + 6 + i, z: ch.z0 + 6 }, 0.62 + i * 0.04));
    // farmers for every neighbour's field (made visible when that field is worked)
    for (const p of w.plots) {
      if (p.starter) continue;
      for (let k = 0; k < 2; k++) {
        const v = new Villager(k ? woman(p.id) : man(p.id), { kind: "farmer", plot: p.id, job: k ? "bend" : "hoe" }, { x: p.x0 + 3 + k * 4, z: p.z0 + 4 });
        if (k) v.fig.hold("none");
        this.add(v);
      }
    }
  }

  private add(v: Villager) {
    this.people.push(v);
    this.group.add(v.fig.root);
  }

  /** Which fields the neighbours are working: every plot that isn't yours and isn't up for sale. */
  private refreshFields(save: Save, day: number, now: number) {
    const worked = this.world.plots.filter((p) => !p.starter && !save.plots.includes(p.id) && !forSale(p, day)).map((p) => p.id);
    const key = worked.join(",") + ":" + day;
    if (key === this.key) return;
    this.key = key;
    this.worked = worked;
    // their crops: rows on every other line, one crop per field, the stage moving on with the days
    const farm: Save["farm"] = {};
    for (const id of worked) {
      const p = this.world.plots[id];
      const crop = CROP_IDS[Math.floor(hash2(id, Math.floor(day / 8), 71) * 3)];
      const progress = (((day + id * 3) % 8) + 1) / 8;
      for (let z = p.z0 + 2; z < p.z1 - 1; z += 2)
        for (let x = p.x0 + 2; x < p.x1 - 1; x++) {
          // a continuous furrow along the row, a plant on every other cell
          const plant: Planting = { crop, plantedAt: now, progress: Math.min(1, progress + hash2(x, z, 3) * 0.1), wetMs: 1, dryMs: 0, updatedAt: now, speed: 1 };
          farm[String(idx(x, p.y, z))] = { baseQ: 1, q: 1, wetUntil: 0, restedAt: now, plant: (x - p.x0) % 2 ? undefined : plant };
        }
    }
    this.fields.sync({ farm } as Save, now, this.ground);
  }

  debug() {
    return { worked: this.worked, visible: this.people.filter((p) => p.fig.root.visible).length, plants: this.fields.group.children.map((c) => (c as THREE.InstancedMesh).count).filter(Boolean) };
  }

  update(dt: number, t: number, hour: number, save: Save, day: number, now: number, near: THREE.Vector3) {
    this.refreshFields(save, day, now);
    const daytime = hour > 6.2 && hour < 19.3;
    this.fields.update(t);
    for (const v of this.people) {
      if (v.role.kind === "farmer") {
        const on = this.worked.includes(v.role.plot);
        v.fig.root.visible = on && daytime;
        if (!v.fig.root.visible) continue;
      }
      // people far away don't need animating every frame
      const far = Math.hypot(v.pos.x - near.x, v.pos.z - near.z) > 90;
      if (far && Math.random() > 0.2) continue;
      v.update(far ? dt * 5 : dt, t, daytime, this.world, this.ground, this.rnd);
    }
  }
}
