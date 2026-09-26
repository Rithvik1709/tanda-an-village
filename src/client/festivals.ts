import * as THREE from "three";
import { CROP_IDS, CROPS } from "../shared/crops";
import { BHOG_N, FEST_HOUR, type FestivalId, FESTIVALS, festivalOn, yearOf } from "../shared/festivals";
import type { Action, Result } from "../shared/rules";
import type { Save } from "../shared/save";
import { clock } from "../shared/time";
import type { World } from "../shared/world";
import type { Nav } from "./player/nav";

/*
 * The festivals in the world: on Dawali diyas line the chowk (and, once you light them, your
 * aangan); on Holi a fire is built in the chowk and gulal colours the ground; on Sevalal Jayanti
 * saffron flags fly at the mandir. Also what E does there. The server decides what counts.
 */
type P = { x: number; z: number };
type Button = { label: string; sub?: string; onClick: () => void };
type Deps = {
  world: World;
  nav: Nav;
  ground: (x: number, z: number) => number;
  save: () => Save;
  now: () => number;
  act: (a: Action) => Result;
  toast: (m: string, k?: "ok" | "bad") => void;
  sound: (name: string) => void;
  dialogue: (who: string, title: string, text: string, buttons: Button[]) => void;
  closeDialogue: () => void;
};

const flame = new THREE.MeshStandardMaterial({ color: "#ffb347", emissive: new THREE.Color("#ff7a1a"), emissiveIntensity: 3, transparent: true, opacity: 0.9 });
const diyaLight = new THREE.MeshStandardMaterial({ color: "#ffd27a", emissive: new THREE.Color("#ffb347"), emissiveIntensity: 3 });
const clay = new THREE.MeshStandardMaterial({ color: "#a8542e", roughness: 0.9 });

/** A clay diya with its little flame. */
function diya() {
  const g = new THREE.Group();
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.05, 8), clay);
  cup.position.y = 0.025;
  const f = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5).scale(1, 1.8, 1), diyaLight);
  f.position.y = 0.09;
  g.add(cup, f);
  return g;
}

export class Festivals {
  readonly group = new THREE.Group();
  private dawali = new THREE.Group();
  private aangan = new THREE.Group(); // your own diyas, once lit
  private holi = new THREE.Group();
  private sevalal = new THREE.Group();
  private flames: THREE.Mesh[] = [];
  private fireLight = new THREE.PointLight("#ff8a3a", 0, 14, 1.6);
  readonly fireAt: P;
  private homeAt: P;
  private templeAt: P;
  private t = 0;

  constructor(private d: Deps) {
    const L = d.world.landmarks, ch = d.world.chowk;
    this.fireAt = d.nav.open({ x: 106, z: 110.5 });
    this.homeAt = { x: L.home.x + 4.5, z: L.home.z - 4 };
    this.templeAt = { x: L.temple.x, z: L.temple.z };
    const put = (g: THREE.Group, o: THREE.Object3D, p: P) => {
      o.position.set(p.x, d.ground(p.x, p.z), p.z);
      g.add(o);
    };
    // Dawali: diyas all round the edge of the chowk
    for (let x = ch.x0 + 0.5; x <= ch.x1 + 0.5; x += 1.6) for (const z of [ch.z0 + 0.3, ch.z1 + 0.7]) put(this.dawali, diya(), { x, z });
    for (let z = ch.z0 + 0.5; z <= ch.z1 + 0.5; z += 1.6) for (const x of [ch.x0 + 0.3, ch.x1 + 0.7]) put(this.dawali, diya(), { x, z });
    // …and a row along your aangan when you light them
    for (let i = 0; i < 9; i++) put(this.aangan, diya(), { x: this.homeAt.x + (i % 3) * 0.5, z: this.homeAt.z - 1.5 + Math.floor(i / 3) * 1.4 });
    this.dawali.add(this.aangan);
    // Holi: a stack of logs and the fire, and gulal on the ground round it
    const logs = new THREE.MeshStandardMaterial({ color: "#5a3a22", roughness: 1 });
    const fire = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.5, 6), logs);
      // leaning in to a point, like a tepee
      log.rotation.z = 0.5;
      log.position.set(0.3, 0.6, 0);
      const pivot = new THREE.Group();
      pivot.rotation.y = (i / 6) * Math.PI * 2;
      pivot.add(log);
      fire.add(pivot);
    }
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.45 - i * 0.1, 1.2 + i * 0.3, 7), flame);
      f.position.y = 0.8 + i * 0.1;
      f.rotation.y = i;
      this.flames.push(f);
      fire.add(f);
    }
    this.fireLight.position.y = 1.6;
    fire.add(this.fireLight);
    put(this.holi, fire, this.fireAt);
    const gulal = ["#e8457b", "#f5c518", "#3fbf5a", "#3f7fe8", "#b04ae8"].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 1 }));
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4, r = 2 + (i % 5) * 1.1;
      const spot = new THREE.Mesh(new THREE.CircleGeometry(0.35 + (i % 3) * 0.15, 10).rotateX(-Math.PI / 2), gulal[i % gulal.length]);
      const p = { x: this.fireAt.x + Math.cos(a) * r, z: this.fireAt.z + Math.sin(a) * r };
      if (p.x < ch.x0 || p.x > ch.x1 + 1 || p.z < ch.z0 || p.z > ch.z1 + 1) continue;
      spot.position.set(p.x, d.ground(p.x, p.z) + 0.02, p.z);
      this.holi.add(spot);
    }
    // Sevalal Jayanti: saffron flags on bamboo poles before the mandir
    const pole = new THREE.MeshStandardMaterial({ color: "#c8a868", roughness: 0.9 });
    const saffron = new THREE.MeshStandardMaterial({ color: "#f07a1a", roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.2, 6), pole);
      stick.position.y = 1.6;
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0.9, 0.25), new THREE.Vector2(0, 0.5)]);
      const flag = new THREE.Mesh(new THREE.ShapeGeometry(tri), saffron);
      flag.position.y = 2.6;
      g.add(stick, flag);
      put(this.sevalal, g, { x: this.templeAt.x - 3.5 + i * 1.4, z: this.templeAt.z + 1.6 });
    }
    this.group.add(this.dawali, this.holi, this.sevalal);
  }

  /** The festival today, if any. */
  today(): FestivalId | null {
    return festivalOn(clock(this.d.now()).day);
  }
  private done(what: string) {
    const f = this.today();
    return !!f && this.d.save().fests?.[`${f}:${what}`] === yearOf(clock(this.d.now()).day);
  }

  update(dt: number, hour: number) {
    const f = this.today();
    this.dawali.visible = f === "dawali";
    this.aangan.visible = this.done("diyas");
    this.holi.visible = f === "holi";
    this.sevalal.visible = f === "sevalal";
    this.t += dt;
    if (this.holi.visible) {
      // the fire is lit at dusk and burns through the night
      const lit = hour >= 18 || hour < 6;
      this.flames.forEach((fl, i) => {
        fl.visible = lit;
        fl.scale.set(1, 1 + Math.sin(this.t * (7 + i * 3)) * 0.15, 1);
      });
      this.fireLight.intensity = lit ? 3 + Math.sin(this.t * 11) * 0.6 : 0;
    }
    for (const fl of this.sevalal.children) (fl.children[1] as THREE.Mesh).rotation.y = Math.sin(this.t * 2 + fl.position.x) * 0.25;
  }

  private where(p: P): "home" | "fire" | "temple" | null {
    const f = this.today();
    const near = (q: P, r: number) => Math.hypot(p.x - q.x, p.z - q.z) < r;
    if (f === "dawali" && near(this.homeAt, 5)) return "home";
    if (f === "holi" && near(this.fireAt, 3.5)) return "fire";
    if (f === "sevalal" && near(this.templeAt, 5)) return "temple";
    return null;
  }

  /** The hint line for what E does here on a festival, or "". */
  hint(p: P, hour: number): string {
    const w = this.where(p);
    const dark = hour >= FEST_HOUR || hour < 6;
    if (w === "home") return this.done("diyas") ? "🪔 Your diyas are lit — Shubh Dawali!" : dark ? "<kbd>E</kbd> Light the Dawali diyas at Rathod Bhuvan" : "🪔 Light your Dawali diyas here after dark (7 pm)";
    if (w === "fire") return this.done("fire") ? "🔥 Holi hai! The fire burns till morning" : dark ? "<kbd>E</kbd> Sit by the Holi fire and sing the lengi" : "🔥 The Holi fire is lit here after dark (7 pm)";
    if (w === "temple") return this.done("bhog") ? "🚩 Sevalal Maharaj has blessed your fields" : `<kbd>E</kbd> Offer bhog to Sevalal Maharaj <small class="hours">· ${BHOG_N} produce</small>`;
    return "";
  }

  /** E on a festival: true if it did something. */
  interact(p: P, hour: number): boolean {
    const w = this.where(p);
    if (!w) return false;
    const report = (r: Result) => {
      this.d.toast(r.ok ? (r.msg ?? "") : r.error, r.ok ? "ok" : "bad");
      if (r.ok) this.d.sound("templebell");
    };
    const dark = hour >= FEST_HOUR || hour < 6;
    if (w === "home" && !this.done("diyas") && dark) report(this.d.act({ t: "festival", what: "diyas" }));
    else if (w === "fire" && !this.done("fire") && dark) report(this.d.act({ t: "festival", what: "fire" }));
    else if (w === "temple" && !this.done("bhog")) {
      const s = this.d.save();
      const crops = CROP_IDS.filter((c) => (s.inv[c] ?? 0) >= BHOG_N);
      const f = FESTIVALS.sevalal;
      if (!crops.length) this.d.dialogue(`${f.icon} ${f.name} · ${f.local}`, "Bhog", `Bring ${BHOG_N} of your harvest — onions, jowar or cane — as bhog for Maharaj.`, [{ label: "I'll bring it", onClick: this.d.closeDialogue }]);
      else
        this.d.dialogue(`${f.icon} ${f.name} · ${f.local}`, "Bhog for Sevalal Maharaj", "The pujari waits with the thali. Offer the first of your harvest, and Maharaj's blessing will fall on your fields like rain.", [
          ...crops.map((c) => ({ label: `Offer ${BHOG_N} ${CROPS[c].name.toLowerCase()}`, sub: `you have ${s.inv[c]}`, onClick: () => (this.d.closeDialogue(), report(this.d.act({ t: "festival", what: "bhog", item: c }))) })),
          { label: "Not now", onClick: this.d.closeDialogue },
        ]);
    } else return false;
    return true;
  }
}
