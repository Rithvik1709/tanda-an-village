import * as THREE from "three";
import { yearOf } from "../shared/festivals";
import { closedText, isOpen } from "../shared/hours";
import { NEIGHBOURS } from "../shared/neighbours";
import { deskOn, effectText, type Request, requestsFor } from "../shared/panchayat";
import type { Action, Result } from "../shared/rules";
import type { Save } from "../shared/save";
import { clock } from "../shared/time";
import type { World } from "../shared/world";
import { Npc, type NpcLook } from "./engine/npc";
import { markTexture } from "./jobs";
import type { Nav } from "./player/nav";
import { Q } from "./quality";
import { banjaraWoman, Figure } from "./scene/figure";

/*
 * The Sarpanch's desk: a table and chair in the aangan in front of Rathod Bhuvan, with Balu the
 * gram sevak beside it in office hours. Sit down (E) and the tanda comes to you — one person at a
 * time walks up from the lane, stands before the table and tells you their trouble; you decide, the
 * stamp comes down, and they go off and the next one comes. Standing up sends whoever's waiting away.
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
  dialogueOpen: () => boolean;
  /** Seat the farmer on the desk's chair. */
  sit: (at: { x: number; y: number; z: number }, face: number) => void;
};

const SEVAK: NpcLook = { kurta: "#dfe6ee", dhoti: "#3b4a5a", hat: "", skin: "#86573a" };
const WHO = "Balu · the gram sevak · ग्रामसेवक";
const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const names = (id: keyof typeof NEIGHBOURS) => NEIGHBOURS[id].name;
const SPEED = 1.8;
const CHAIR_Y = 0.42; // the chair's seat

/** Who walks up to the desk for each request. */
const WOMEN = new Set(["drain", "mango", "dogs", "licence", "light", "tanker"]);
function petitioner(key: string) {
  if (WOMEN.has(key)) return new Figure(banjaraWoman(key === "tanker" ? "#7a2e5a" : "#2f5b8a", "#c8742a"));
  const looks: Record<string, [string, string, string]> = { pension: ["#e8e0cc", "#e8e2d2", "#7e4e30"], sahukar: ["#f4efe2", "#f4f1e8", "#9a6a48"], nala: ["#b8a88a", "#c0392b", "#6f4428"], stall: ["#f2efe6", "#e8e2d2", "#8e5a38"], nets: ["#cfc4a8", "#8a6a3c", "#5e3a24"] };
  const [kurta, hat, skin] = looks[key] ?? ["#d9ceb4", "#e8e2d2", "#7e4e30"];
  return new Figure({ kurta, dhoti: "#e6dcc4", hat, hatStyle: key === "sahukar" ? "topi" : "pheta", skin });
}

/** A plain table and chair, a register and the rubber stamp. */
function furniture() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: "#7a5230" });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  // the table (its long side facing the lane, +x), centred on the origin
  box(0.8, 0.05, 1.3, wood, 0, 0.76, 0);
  for (const x of [-0.34, 0.34]) for (const z of [-0.58, 0.58]) box(0.06, 0.74, 0.06, wood, x, 0.37, z);
  box(0.36, 0.04, 0.26, new THREE.MeshLambertMaterial({ color: "#7c2d12" }), -0.05, 0.8, 0.25); // the register
  box(0.3, 0.005, 0.22, new THREE.MeshLambertMaterial({ color: "#f3ead6" }), -0.05, 0.823, 0.25);
  box(0.05, 0.08, 0.05, new THREE.MeshLambertMaterial({ color: "#3a2a1a" }), 0.05, 0.82, -0.3); // the stamp
  box(0.08, 0.02, 0.06, new THREE.MeshLambertMaterial({ color: "#1f4e79" }), 0.05, 0.79, -0.3);
  // a little tricolour
  box(0.01, 0.3, 0.01, wood, -0.3, 0.93, -0.55);
  ["#ff9933", "#ffffff", "#138808"].forEach((c, i) => box(0.005, 0.04, 0.14, new THREE.MeshLambertMaterial({ color: c }), -0.3, 1.05 - i * 0.04, -0.48));
  // the chair, on the verandah side (-x)
  box(0.45, 0.05, 0.45, wood, -0.8, CHAIR_Y, 0);
  for (const x of [-0.98, -0.62]) for (const z of [-0.18, 0.18]) box(0.04, CHAIR_Y, 0.04, wood, x, CHAIR_Y / 2, z);
  box(0.04, 0.5, 0.45, wood, -1.02, CHAIR_Y + 0.27, 0);
  return g;
}

type Visitor = { req: Request; fig: Figure; pos: P; heading: number; path: P[]; leaving: boolean; asked: boolean };

export class PanchayatDesk {
  readonly group = new THREE.Group();
  /** Table centre; the chair is 0.8 m west of it, and petitioners stand 1.7 m east. */
  readonly table: P;
  readonly chair: P;
  private front: P;
  private lane: P;
  private sevak: Npc;
  private mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture("!"), depthWrite: false, toneMapped: false }));
  private visitor: Visitor | null = null;
  private sent = new Set<string>(); // "day:slot" — who has already come today (and gone off unheard)
  seated = false;

  constructor(private d: Deps) {
    // in the aangan, east of Rathod Bhuvan's verandah, towards its south end
    this.table = { x: 91.5, z: 126.5 };
    this.chair = { x: this.table.x - 0.8, z: this.table.z };
    this.front = { x: this.table.x + 1.7, z: this.table.z };
    this.lane = d.nav.open({ x: 99, z: 132 });
    const f = furniture();
    f.position.set(this.table.x, d.ground(this.table.x, this.table.z), this.table.z);
    const at = d.nav.open({ x: this.table.x, z: this.table.z - 1.4 });
    this.sevak = new Npc(SEVAK, at.x, d.ground(at.x, at.z), at.z, Math.PI);
    this.mark.scale.set(0.55, 0.55, 1);
    this.mark.position.set(this.table.x, d.ground(this.table.x, this.table.z) + 1.9, this.table.z);
    this.group.add(f, this.sevak.group, this.mark);
  }

  private sarpanch = () => this.d.save().perks.includes("sarpanch");
  private day = () => clock(this.d.now()).day;
  private desk() {
    return deskOn(this.d.save().panchayat, this.day(), yearOf);
  }
  /** Requests not yet settled today. */
  private waiting() {
    const done = this.desk().done;
    return requestsFor(this.day()).filter((r) => !done.includes(r.slot));
  }
  private near(p: P) {
    return Math.hypot(p.x - this.table.x, p.z - this.table.z) < 2.4;
  }

  update(dt: number, hour: number, player: THREE.Vector3) {
    const office = isOpen("panchayat", hour);
    const far = Math.hypot(player.x - this.table.x, player.z - this.table.z) > Q.peopleFar;
    this.sevak.group.visible = office && !far;
    if (this.sevak.group.visible) this.sevak.update(dt, player);
    this.mark.visible = office && !far && !this.seated && this.sarpanch() && this.waiting().length > 0;
    // seated in office hours: send for the next person with a request
    if (this.seated && office && this.sarpanch() && !this.visitor) {
      const next = this.waiting().find((r) => !this.sent.has(`${this.day()}:${r.slot}`)) ?? this.waiting()[0];
      if (next) this.call(next);
    }
    if (!this.seated || !office) this.dismiss();
    const v = this.visitor;
    if (!v) return;
    const goal = v.leaving ? this.lane : this.front;
    const there = this.step(v, goal, dt);
    if (there && v.leaving) {
      this.group.remove(v.fig.root);
      this.visitor = null;
      return;
    }
    if (there && !v.asked) {
      v.asked = true;
      if (!this.d.dialogueOpen()) this.ask();
    }
    if (there) v.heading += Math.atan2(Math.sin(-Math.PI / 2 - v.heading), Math.cos(-Math.PI / 2 - v.heading)) * Math.min(1, dt * 5); // face the desk
    v.fig.animate(dt, there ? 0 : SPEED);
    v.fig.root.rotation.y = v.heading;
    v.fig.root.position.set(v.pos.x, this.d.ground(v.pos.x, v.pos.z), v.pos.z);
  }

  /** Walk a visitor toward p along the nav grid; true once there. */
  private step(v: Visitor, p: P, dt: number) {
    if (!v.path.length || Math.hypot(v.path[v.path.length - 1].x - p.x, v.path[v.path.length - 1].z - p.z) > 0.5) v.path = [...this.d.nav.path(v.pos, p), p];
    while (v.path.length) {
      const q = v.path[0], dx = q.x - v.pos.x, dz = q.z - v.pos.z, dd = Math.hypot(dx, dz);
      if (dd < 0.12) {
        v.path.shift();
        continue;
      }
      const k = Math.min(dd, SPEED * dt);
      v.pos = { x: v.pos.x + (dx / dd) * k, z: v.pos.z + (dz / dd) * k };
      const want = Math.atan2(dx, dz);
      v.heading += Math.atan2(Math.sin(want - v.heading), Math.cos(want - v.heading)) * Math.min(1, dt * 6);
      return false;
    }
    return true;
  }

  private call(req: Request) {
    const fig = petitioner(req.key);
    this.sent.add(`${this.day()}:${req.slot}`);
    this.visitor = { req, fig, pos: { ...this.lane }, heading: -Math.PI / 2, path: [], leaving: false, asked: false };
    this.group.add(fig.root);
  }
  /** Whoever's at the desk goes off (you stood up, or the office closed). */
  private dismiss() {
    if (this.visitor && !this.visitor.leaving) this.visitor.leaving = true;
  }

  /** The hint line by the desk, or "". */
  hint(p: P, hour: number): string {
    if (this.seated) {
      const n = this.waiting().length;
      return `Move to stand up <small class="hours">· ${n ? `${n} more to hear today` : "everyone's been heard today"} · fund ${rs(this.desk().fund)}</small>`;
    }
    if (!this.near(p)) return "";
    if (!isOpen("panchayat", hour)) return closedText("panchayat");
    if (!this.sarpanch()) return "<kbd>E</kbd> Talk to Balu, the gram sevak";
    const n = this.waiting().length;
    return `<kbd>E</kbd> Sit at the Sarpanch's desk <small class="hours">· ${n ? `${n} waiting to see you` : "all heard today"} · fund ${rs(this.desk().fund)}</small>`;
  }

  /** E by the desk: sit down (the Sarpanch) or talk to Balu. True if it did something. */
  interact(p: P, hour: number): boolean {
    if (!this.near(p) || !isOpen("panchayat", hour)) return false;
    if (!this.sarpanch()) {
      const s = this.d.save();
      const text = s.perks.includes("dripSubsidy")
        ? "Sarpanch Kamlabai Jadhav hears the tanda's troubles at the panchayat every morning. The taps are coming, lane by lane."
        : s.perks.includes("sahukarRaj")
          ? "Sarpanch Shankar Pawar is… out. He's usually out. Motilal seth's munshi comes by for the stamp when it's needed."
          : "When the tanda elects its Sarpanch, I'll set up the desk wherever they sit. Some say you could stand yourself, if the tanda trusts you.";
      this.d.dialogue(WHO, "Gram panchayat, Ukhali", text, [{ label: "Ram Ram", onClick: this.d.closeDialogue }]);
      return true;
    }
    this.d.sit({ x: this.chair.x, y: this.d.ground(this.chair.x, this.chair.z) + CHAIR_Y, z: this.chair.z }, Math.PI / 2);
    this.d.toast(this.waiting().length ? `Balu opens the register: "${this.waiting().length} to see you today, Sarpanch saheb."` : `Balu: "Everyone's been heard today, saheb. The fund stands at ${rs(this.desk().fund)}."`);
    return true;
  }

  /** E while seated: hear the one standing at the desk again. False if nobody's there (then E stands you up). */
  press(): boolean {
    const v = this.visitor;
    if (!v || v.leaving || !v.asked) return false;
    this.ask();
    return true;
  }

  private ask() {
    const v = this.visitor;
    if (!v) return;
    const r = v.req, fund = this.desk().fund, money = this.d.save().money;
    this.d.dialogue(`${r.who} · before the Sarpanch`, r.title, `${r.ask}\n\n(Panchayat fund: ${rs(fund)})`, [
      ...r.choices.map((ch) => {
        const short = (ch.effect.fund ?? 0) + fund < 0 ? " · the fund can't cover it" : (ch.effect.money ?? 0) + money < 0 ? " · you can't afford it" : "";
        return {
          label: ch.label,
          sub: effectText(ch.effect, names) + short,
          onClick: () => {
            const res = this.d.act({ t: "panchayat", slot: r.slot, choice: ch.id });
            if (!res.ok) return this.d.toast(res.error, "bad");
            this.d.closeDialogue();
            this.d.toast(res.msg ?? "");
            this.d.sound("stamp");
            v.leaving = true;
          },
        };
      }),
      { label: "Think it over", sub: "they'll wait — press E to hear them again", onClick: this.d.closeDialogue },
    ]);
  }
}
