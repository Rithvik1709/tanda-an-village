import * as THREE from "three";
import { advance, CROP_IDS, CROPS, type CropId } from "../shared/crops";
import { CANCEL_REFUND, HELPER_IDS, HELPER_MIN_PLOTS, type HelperId, type HelperJob, helperPhase, type HelperPhase, HELPERS, type Hire, hireDay, HIRE_MAX, JOB_NAMES, MUKADAM, ORDER_BY, restMs } from "../shared/helpers";
import type { Action, Result } from "../shared/rules";
import type { Save } from "../shared/save";
import { clock } from "../shared/time";
import { D, W, type World } from "../shared/world";
import { Npc, type NpcLook } from "./engine/npc";
import { markTexture } from "./jobs";
import type { Nav } from "./player/nav";
import { Q } from "./quality";
import { banjaraWoman, Figure } from "./scene/figure";

/*
 * Majoor: Devidas Chavan the mukadam at his door on the chowk, the labourers who sit outside his
 * house until someone hires them, and — on the day you've hired them — the same labourers waiting
 * in your aangan (they walk over as soon as you hire them, and sit there till dusk if they start
 * tomorrow), walking out to your field, working it patch by patch, and sleeping on a charpai by the
 * field between jobs, with a countdown till they're up. Where they stand is drawn from the save
 * (shared/helpers.ts decides what they've done); this file only shows it.
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

const MUKADAM_LOOK: NpcLook = { kurta: "#f2efe6", dhoti: "#efe9d8", hat: "#f4f1e8", skin: "#8e5a38" };
const LOOKS: Record<HelperId, () => Figure> = {
  sakharam: () => new Figure({ kurta: "#b8a88a", dhoti: "#d9ceb4", hat: "#c0392b", hatStyle: "pheta", skin: "#7e4e30" }),
  parvati: () => new Figure(banjaraWoman("#2f6b3a", "#c8742a")),
  vithoba: () => new Figure({ kurta: "#efe8d6", dhoti: "#e6dcc4", hat: "#e8e2d2", hatStyle: "topi", skin: "#6f4428" }),
};
const DAYTIME = (h: number) => h >= 7 && h < 19.5; // the mukadam keeps village hours
const WORKDAY = (h: number) => h >= 6 && h < 19.5; // labourers start at 6
const SPEED = 2.2; // a brisk walk out to the fields (you walk at 3.4)
const rs = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** A charpai: a rope-strung cot on four legs, 1.9 m long, its length along z. */
function charpai() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: "#6e4a2a" });
  const rope = new THREE.MeshLambertMaterial({ color: "#cdb07a" });
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
  };
  for (const x of [-0.42, 0.42]) for (const z of [-0.9, 0.9]) box(0.07, 0.4, 0.07, wood, x, 0.2, z);
  for (const x of [-0.42, 0.42]) box(0.06, 0.06, 1.9, wood, x, 0.38, 0);
  for (const z of [-0.9, 0.9]) box(0.9, 0.06, 0.06, wood, 0, 0.38, z);
  box(0.8, 0.02, 1.76, rope, 0, 0.39, 0);
  return g;
}
const BED_TOP = 0.41;

/** A little sign over a sleeping labourer: 💤 and how long till they're up. */
class Countdown {
  readonly sprite: THREE.Sprite;
  private g: CanvasRenderingContext2D;
  private tex: THREE.CanvasTexture;
  private text = "";
  constructor() {
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = 64;
    this.g = c.getContext("2d")!;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, depthWrite: false, toneMapped: false }));
    this.sprite.scale.set(1.0, 0.4, 1);
  }
  set(ms: number) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    const text = `💤 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    if (text === this.text) return;
    this.text = text;
    const g = this.g;
    g.clearRect(0, 0, 160, 64);
    g.fillStyle = "rgba(24, 18, 40, 0.85)";
    g.beginPath();
    g.roundRect(4, 6, 152, 52, 26);
    g.fill();
    g.fillStyle = "#e9e4ff";
    g.font = "700 32px system-ui";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 80, 34);
    this.tex.needsUpdate = true;
  }
}

class Labourer {
  readonly fig: Figure;
  pos: P;
  heading = 0;
  private path: P[] = [];
  private goal: P | null = null;
  private retry = 0;
  constructor(readonly id: HelperId, start: P) {
    this.fig = LOOKS[id]();
    this.pos = { ...start };
  }
  /** Walk toward p along the nav grid; true once there. */
  walk(p: P, dt: number, nav: Nav): boolean {
    if (!this.goal || Math.hypot(this.goal.x - p.x, this.goal.z - p.z) > 0.5) {
      this.goal = { ...p };
      this.path = nav.path(this.pos, p);
    }
    while (this.path.length) {
      const q = this.path[0];
      const dx = q.x - this.pos.x, dz = q.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.15) {
        this.path.shift();
        continue;
      }
      const k = Math.min(d, SPEED * dt);
      this.pos = { x: this.pos.x + (dx / d) * k, z: this.pos.z + (dz / d) * k };
      this.turn(Math.atan2(dx, dz), dt);
      return false;
    }
    // the last waypoint is a cell centre: step the rest of the way straight in
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.1) return true;
    if (d > 2.5) {
      // the route ran out short of the goal (a stale route, or a fence built since): find a new one
      this.retry -= dt;
      if (this.retry <= 0) {
        this.retry = 1;
        this.goal = null;
      }
      return false;
    }
    const k = Math.min(d, SPEED * dt);
    this.pos = { x: this.pos.x + (dx / d) * k, z: this.pos.z + (dz / d) * k };
    return false;
  }
  turn(to: number, dt: number) {
    this.heading += Math.atan2(Math.sin(to - this.heading), Math.cos(to - this.heading)) * Math.min(1, dt * 6);
  }
  jump(p: P) {
    this.pos = { ...p };
    this.path = [];
    this.goal = null;
  }
}

export class Helpers {
  readonly group = new THREE.Group();
  private mukadam: Npc;
  /** Where the mukadam stands, at his door on the chowk. */
  readonly mukadamAt: P;
  private benchAt: P[];
  private aanganAt: P[];
  private crew: Labourer[];
  private marks = new Map<HelperId, THREE.Sprite>();
  private beds = new Map<HelperId, THREE.Group>();
  private timers = new Map<HelperId, Countdown>();
  private seen = new Map<HelperId, string>();

  constructor(private d: Deps) {
    // the mukadam's house, south of the chowk, its door facing east (shared/world.ts puts his board by the door)
    this.mukadamAt = d.nav.open(d.world.landmarks.mukadam);
    this.mukadam = new Npc(MUKADAM_LOOK, this.mukadamAt.x, d.ground(this.mukadamAt.x, this.mukadamAt.z), this.mukadamAt.z, Math.PI / 2);
    this.group.add(this.mukadam.group);
    // his labourers wait on the ground along the wall, north of his door, until someone hires them
    this.benchAt = [0, 1, 2].map((i) => d.nav.open({ x: this.mukadamAt.x - 0.4, z: this.mukadamAt.z - 1.3 - i * 0.9 }));
    // in your aangan, east of Rathod Bhuvan's verandah (its north end: Savitribai stands at the south)
    const home = d.world.landmarks.home;
    this.aanganAt = [0, 1, 2].map((i) => d.nav.open({ x: home.x + 6, z: home.z - 6 + i * 1.3 }));
    this.crew = HELPER_IDS.map((id, i) => new Labourer(id, this.benchAt[i]));
    for (const l of this.crew) {
      this.group.add(l.fig.root);
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture("!"), depthWrite: false, toneMapped: false }));
      mark.scale.set(0.5, 0.5, 1);
      this.group.add(mark);
      this.marks.set(l.id, mark);
      const bed = charpai(), timer = new Countdown();
      bed.visible = timer.sprite.visible = false;
      this.group.add(bed, timer.sprite);
      this.beds.set(l.id, bed);
      this.timers.set(l.id, timer);
    }
  }

  bodies() {
    return [{ pos: { ...this.mukadamAt }, r: 0.34, fixed: true }];
  }

  private hire(id: HelperId): Hire | undefined {
    const day = clock(this.d.now()).day;
    return this.d.save().helpers?.find((h) => h.who === id && h.day === day);
  }
  /** Is a hire made now for today (a morning hire) rather than tomorrow? */
  private forToday() {
    const now = this.d.now();
    return hireDay(now) === clock(now).day;
  }
  /** The labourers booked for the day a hire made now is for. */
  private booked() {
    const day = hireDay(this.d.now());
    return (this.d.save().helpers ?? []).filter((h) => h.day === day);
  }
  /** Hired for a later day: they go and sit in your aangan until dusk. */
  private booking(id: HelperId): Hire | undefined {
    const day = clock(this.d.now()).day;
    return this.d.save().helpers?.find((h) => h.who === id && h.day > day);
  }
  private phase(id: HelperId): HelperPhase | null {
    const h = this.hire(id);
    return h ? helperPhase(h, this.d.now()) : this.booking(id) ? "booked" : null;
  }

  private near(p: P): { kind: "mukadam" } | { kind: "labourer"; id: HelperId } | null {
    if (Math.hypot(p.x - this.mukadamAt.x, p.z - this.mukadamAt.z) < 2.4) return { kind: "mukadam" };
    let best: HelperId | null = null, bd = 2.2;
    for (const l of this.crew) {
      const ph = this.phase(l.id);
      if (!ph || ph === "home") continue;
      const dd = Math.hypot(p.x - l.pos.x, p.z - l.pos.z);
      if (dd < bd) {
        bd = dd;
        best = l.id;
      }
    }
    return best ? { kind: "labourer", id: best } : null;
  }

  /** The E hint by the mukadam or one of your labourers. */
  hint(p: P, hour: number): string {
    const n = this.near(p);
    if (!n || !(n.kind === "mukadam" ? DAYTIME : WORKDAY)(hour)) return "";
    if (n.kind === "mukadam") return `<kbd>E</kbd> ${MUKADAM.name}, the mukadam <small class="hours">· hire labourers for ${this.forToday() ? "today" : "tomorrow"}</small>`;
    const w = HELPERS[n.id], h = this.hire(n.id), j = h?.job;
    const ph = this.phase(n.id);
    if (ph === "booked") return `${w.name} <small class="hours">· ${h ? "just arriving" : "starts work here at 6 am tomorrow"}</small>`;
    if (ph === "sleeping") return `${w.name} is asleep <small class="hours">· up in ${this.upIn(n.id)}s</small>`;
    if (ph === "waiting" && j) return `<kbd>E</kbd> Give ${w.name} the next job <small class="hours">· ${this.doneLine(j)}</small>`;
    if (!j) return `<kbd>E</kbd> Tell ${w.name} the day's work`;
    const plot = this.d.world.plots[j.plot].name;
    return `${w.name} · ${j.kind === "plant" ? `sowing ${CROPS[j.crop as CropId].name.toLowerCase()}` : j.kind === "water" ? "watering" : "harvesting"} in ${plot} <small class="hours">· ${j.done} patches done${j.full ? " · the godown is full" : ""}</small>`;
  }

  /** E: talk to the mukadam or a labourer. False if nobody's here. */
  interact(p: P, hour: number): boolean {
    const n = this.near(p);
    if (!n || !(n.kind === "mukadam" ? DAYTIME : WORKDAY)(hour)) return false;
    if (n.kind === "mukadam") this.hireDialogue();
    else if (this.phase(n.id) === "booked") this.d.toast(`${HELPERS[n.id].name}: "Ram Ram, malak. ${this.hire(n.id) ? "Give me a moment to set down my things." : "I'll be here at 6 am, ready for whatever you say."}"`);
    else if (this.phase(n.id) === "sleeping") this.d.toast(`${HELPERS[n.id].name} snores on the charpai · up in ${this.upIn(n.id)}s`);
    else if (this.phase(n.id) === "waiting") this.orderDialogue(n.id);
    else {
      const w = HELPERS[n.id], j = this.hire(n.id)!.job!;
      this.d.toast(`${w.name}: "${j.over ? "The day's done, malak. I'm going home." : `Don't worry, I'll ${JOB_NAMES[j.kind]}. Then I'll rest a little, and you can give me the next job.`}"`);
    }
    return true;
  }

  /** Seconds till a sleeping labourer is up. */
  private upIn(id: HelperId) {
    const j = this.hire(id)?.job;
    return j?.doneAt === undefined ? 0 : Math.max(0, Math.ceil((j.doneAt + restMs(id) - this.d.now()) / 1000));
  }
  /** What the last job came to: "6 patches sown in Aamrai". */
  private doneLine(j: NonNullable<Hire["job"]>) {
    return `${j.done} patches ${j.kind === "plant" ? "sown" : j.kind === "water" ? "watered" : "harvested"} in ${this.d.world.plots[j.plot].name}${j.full ? " · the godown is full" : ""}`;
  }
  /**
   * A labourer's charpai by the field they're working: outside the fence on the gate side, just past
   * the gate, its head to the fence. Cots stand side by side — the first labourer on that field gets
   * the one nearest the gate, the second the next — so one worker means one cot, two mean two.
   * `feet`: where they lie from; `face`: the yaw that lays them (head along local -z) head to the fence.
   */
  private bedAt(id: HelperId, plot: number): { at: P; feet: P; stand: P; face: number } {
    const p = this.d.world.plots[plot];
    const g = p.gate ?? { x: p.x0, z: Math.round((p.z0 + p.z1) / 2), side: "W" as const };
    const [nx, nz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[g.side]; // out of the field
    const [tx, tz] = [-nz, nx]; // along the fence
    const today = clock(this.d.now()).day;
    const onField = (this.d.save().helpers ?? []).filter((h) => h.day === today && h.job?.plot === plot);
    const slot = Math.max(0, onField.findIndex((h) => h.who === id));
    const along = 2.4 + slot * 1.15, out = 1.5; // past the 3-wide gate; the fence is ~0.5 out from the cell centre
    const at = { x: g.x + 0.5 + nx * out + tx * along, z: g.z + 0.5 + nz * out + tz * along };
    return { at, feet: { x: at.x + nx * 0.9, z: at.z + nz * 0.9 }, stand: { x: at.x + nx * 1.5, z: at.z + nz * 1.5 }, face: Math.atan2(nx, nz) };
  }

  private close = () => this.d.closeDialogue();
  private report(r: Result) {
    this.d.closeDialogue();
    this.d.toast(r.ok ? (r.msg ?? "") : r.error, r.ok ? "ok" : "bad");
    if (r.ok) this.d.sound("cash");
  }

  private hireDialogue() {
    const s = this.d.save();
    const who = `${MUKADAM.name} · ${MUKADAM.local}`;
    if (s.plots.length < HELPER_MIN_PLOTS)
      return this.d.dialogue(who, "Majoor · मजूर", `Ram Ram! My people work the big farms — sowing, watering, cutting. But you have only the one field; you can work that yourself. Come back when you own ${HELPER_MIN_PLOTS} fields.`, [{ label: "I will", onClick: this.close }]);
    const booked = this.booked(), today = this.forToday();
    const free = HELPER_IDS.filter((id) => !booked.some((h) => h.who === id));
    const when = today ? `they'll walk over to your aangan now, ready for whatever you say. Before noon I can still send them today; after that, it's 6 am tomorrow. One job, one field, the rest of the day` : `they'll go over to your aangan now and start at 6 am tomorrow, ready for whatever you say. One job, one field, the whole day`;
    const text = `Tell me who you want, and ${when} — and the wage up front.${booked.length ? ` Coming to you ${today ? "today" : "tomorrow"}: ${booked.map((h) => HELPERS[h.who].name).join(" and ")}.` : ""}`;
    const buttons: Button[] =
      booked.length >= HIRE_MAX
        ? []
        : free.map((id) => {
            const w = HELPERS[id];
            return { label: `Hire ${w.name} · ${rs(w.wage)}`, sub: `${w.expert ? "expert · " : ""}${w.about} · about ${w.perHour * 12} patches a day`, onClick: () => this.report(this.d.act({ t: "hire", who: id })) };
          });
    // changed your mind? until they reach your aangan, he can send them elsewhere (once they're
    // there, the mukadam has nobody to cancel)
    const cancel: Button[] = booked.filter((h) => helperPhase(h, this.d.now()) === "booked").map((h) => {
      const w = HELPERS[h.who];
      return { label: `Cancel ${w.name}`, sub: `${rs(Math.round(w.wage * CANCEL_REFUND))} back · ${h.from ? "until they reach you" : "until 6 am"}`, onClick: () => this.report(this.d.act({ t: "cancelHire", who: h.who })) };
    });
    this.d.dialogue(who, "Majoor · मजूर", booked.length >= HIRE_MAX ? `${text} That's all I can spare you for one day.` : text, [...buttons, ...cancel, { label: "Not now", onClick: this.close }]);
  }

  /** How one of your fields stands: tilled patches free, growing, ripe, dry. */
  private fieldState(plot: number) {
    const s = this.d.save(), now = this.d.now();
    let free = 0, growing = 0, ripe = 0, dry = 0;
    for (const [k, c] of Object.entries(s.farm)) {
      const i = Number(k), x = i % W, z = Math.floor(i / W) % D;
      if (this.d.world.plotMap[x + W * z] !== plot) continue;
      if (c.wetUntil <= now) dry++;
      if (!c.plant) free++;
      else if (advance(c.plant, c.wetUntil, now).progress >= 1) ripe++;
      else growing++;
    }
    return { free, growing, ripe, dry };
  }

  private orderDialogue(id: HelperId) {
    const w = HELPERS[id];
    const who = `${w.name} · ${w.local}`;
    if (clock(this.d.now()).hour >= ORDER_BY) return this.d.dialogue(who, "Too late", "It's nearly dusk, malak — too late to start in the fields. Better luck tomorrow.", [{ label: "All right", onClick: this.close }]);
    const pick = (job: HelperJob) => this.fieldDialogue(id, job);
    const again = !!this.hire(id)?.job;
    this.d.dialogue(who, again ? "The next job" : "The day's work", `${again ? "Rested and ready, malak. What next?" : "Ram Ram, malak. What shall I do today?"} One job at a time: when it's done I'll lie down a little, then you can give me the next.`, [
      { label: "Sow seeds", sub: "you hand over the seeds · only in hoed soil", onClick: () => pick("plant") },
      { label: "Water a field", sub: "every dry patch", onClick: () => pick("water") },
      { label: "Harvest", sub: "the ripe crop goes straight to the godown", onClick: () => pick("harvest") },
      { label: "Not now", onClick: this.close },
    ]);
  }

  private fieldDialogue(id: HelperId, job: HelperJob) {
    const s = this.d.save(), w = HELPERS[id];
    const buttons: Button[] = s.plots.map((plot) => {
      const p = this.d.world.plots[plot], f = this.fieldState(plot);
      const sub = job === "plant" ? `${f.free} hoed patches free` : job === "water" ? (s.drip.includes(plot) ? "drip irrigated" : `${f.dry} dry patches`) : `${f.ripe} ripe · ${f.growing} still growing`;
      return { label: p.name, sub, onClick: () => (job === "plant" ? this.seedDialogue(id, plot) : this.report(this.d.act({ t: "orderHelper", who: id, job, plot }))) };
    });
    this.d.dialogue(`${w.name} · ${w.local}`, `Which field?`, `Where shall I ${JOB_NAMES[job]}?`, [...buttons, { label: "Back", onClick: () => this.orderDialogue(id) }]);
  }

  private seedDialogue(id: HelperId, plot: number) {
    const s = this.d.save(), w = HELPERS[id], p = this.d.world.plots[plot];
    const free = this.fieldState(plot).free;
    const crops = CROP_IDS.filter((c) => (s.inv[`seed:${c}`] ?? 0) > 0);
    if (!crops.length) return this.d.dialogue(`${w.name} · ${w.local}`, "No seeds", "You'll have to give me the seeds, malak — Sitabai at the seed shop has them.", [{ label: "Back", onClick: () => this.fieldDialogue(id, "plant") }]);
    const give = (crop: CropId, n: number) => this.report(this.d.act({ t: "orderHelper", who: id, job: "plant", plot, crop, seeds: n }));
    const buttons: Button[] = [];
    for (const c of crops) {
      const have = s.inv[`seed:${c}`] ?? 0, name = CROPS[c].name.toLowerCase();
      const fill = Math.min(have, free);
      if (fill > 0) buttons.push({ label: `Hand over ${fill} ${name}`, sub: fill === free ? `enough for every free patch in ${p.name}` : `all you have · ${free} patches free`, onClick: () => give(c, fill) });
      if (have > fill && fill < free) buttons.push({ label: `Hand over all ${have} ${name}`, onClick: () => give(c, have) });
    }
    this.d.dialogue(`${w.name} · ${w.local}`, `Sow in ${p.name}`, `Which seeds? I'll sow the hoed patches row by row, and bring back whatever's left at dusk.`, [...buttons, { label: "Back", onClick: () => this.fieldDialogue(id, "plant") }]);
  }

  /** Where a labourer should be, and doing what, right now. */
  private want(l: Labourer, i: number, ph: HelperPhase | null): { at: P; action: Figure["action"]; hold: "hoe" | "can" | "bag" | "none"; visible: boolean; lie?: boolean } {
    const h = this.hire(l.id), j = h?.job;
    // hired: straight over to your aangan — to start within the hour, or to sit there till tomorrow
    if (ph === "booked") return h?.from ? { at: this.aanganAt[i], action: "none", hold: "hoe", visible: true } : { at: this.aanganAt[i], action: "sit", hold: "none", visible: true };
    if (!ph) return { at: this.benchAt[i], action: "sit", hold: "none", visible: true };
    if (ph === "home") return { at: this.benchAt[i], action: "none", hold: "none", visible: false };
    // between jobs: asleep on their charpai by the field, then up at its foot
    if (j?.doneAt !== undefined && (ph === "sleeping" || ph === "waiting")) {
      const b = this.bedAt(l.id, j.plot);
      return ph === "sleeping" ? { at: b.feet, action: "none", hold: "none", visible: true, lie: true } : { at: b.stand, action: "none", hold: "hoe", visible: true };
    }
    if (ph === "waiting" || !j) return { at: this.aanganAt[i], action: "none", hold: "hoe", visible: true };
    const hold = j.kind === "water" ? "can" : j.kind === "plant" ? "bag" : "hoe";
    const p = this.d.world.plots[j.plot];
    const edge = this.d.nav.open(p.gate ?? { x: p.x0 + 1, z: p.z0 + 1 });
    if (ph === "walking" || !j.at) return { at: edge, action: "none", hold, visible: true };
    if (ph === "resting") return { at: edge, action: "sit", hold: "none", visible: true };
    const k = Number(j.at), x = k % W, z = Math.floor(k / W) % D;
    return { at: this.d.nav.open({ x: x + 0.5 - 0.7, z: z + 0.5 }), action: j.kind === "water" ? "pour" : "bend", hold, visible: true };
  }

  update(dt: number, hour: number, player: THREE.Vector3) {
    const day = DAYTIME(hour);
    const far = Math.hypot(player.x - this.mukadamAt.x, player.z - this.mukadamAt.z);
    this.mukadam.group.visible = day && far < Q.peopleFar;
    if (this.mukadam.group.visible) this.mukadam.update(dt, player);
    this.crew.forEach((l, i) => {
      const ph = this.phase(l.id);
      const w = this.want(l, i, ph);
      const mark = this.marks.get(l.id)!;
      this.notice(l.id);
      const shown = w.visible && (day || (ph !== null && ph !== "booked"));
      l.fig.root.visible = shown && Math.hypot(player.x - l.pos.x, player.z - l.pos.z) < Q.peopleFar;
      mark.visible = l.fig.root.visible && ph === "waiting";
      if (!shown) return;
      // far from where they should be and not meant to be walking? they're already there
      // (and in the morning they're in your aangan before you are)
      const gap = Math.hypot(w.at.x - l.pos.x, w.at.z - l.pos.z);
      const j = this.hire(l.id)?.job, bed = this.beds.get(l.id)!, timer = this.timers.get(l.id)!;
      // their cot stands by the field all the while they work it, not only while they sleep
      const b = j && ph && ph !== "booked" && ph !== "home" && !j.over ? this.bedAt(l.id, j.plot) : null;
      bed.visible = !!b && Math.hypot(player.x - b.at.x, player.z - b.at.z) < Q.peopleFar;
      if (b) {
        bed.position.set(b.at.x, this.d.ground(b.at.x, b.at.z), b.at.z);
        bed.rotation.y = b.face;
      }
      const onTheWay = ph === "walking" || ph === "working" || ph === "booked" || ph === "sleeping";
      if ((ph === "waiting" && gap > 3) || (!onTheWay && gap > 40)) l.jump(w.at);
      const there = l.walk(w.at, dt, this.d.nav);
      l.fig.action = there ? w.action : "none";
      l.fig.hold(there || w.hold !== "hoe" ? w.hold : "hoe");
      if (there && w.action === "none") l.turn(Math.atan2(player.x - l.pos.x, player.z - l.pos.z), dt);
      l.fig.animate(dt, there ? 0 : SPEED);
      // on the charpai: laid flat on his back from its foot, head along -z
      const lying = there && !!w.lie && !!b;
      if (lying) l.jump(b!.feet); // settle exactly onto the cot
      l.fig.root.rotation.set(lying ? -Math.PI / 2 : 0, lying ? b!.face : l.heading, 0, "YXZ");
      const y = this.d.ground(l.pos.x, l.pos.z);
      l.fig.root.position.set(l.pos.x, y + (lying ? BED_TOP + 0.12 : 0), l.pos.z);
      timer.sprite.visible = l.fig.root.visible && ph === "sleeping";
      if (timer.sprite.visible) {
        timer.set(j!.doneAt! + restMs(l.id) - this.d.now());
        const c = b?.at ?? l.pos;
        timer.sprite.position.set(c.x, this.d.ground(c.x, c.z) + 1.4, c.z);
      }
      if (mark.visible) mark.position.set(l.pos.x, y + 2.3, l.pos.z);
      if (Q.shadows) l.fig.setShadow(Math.hypot(player.x - l.pos.x, player.z - l.pos.z) < Q.peopleShadow);
    });
  }

  /** A word when something changes out in the field: the godown filled up, or the day's work is done. */
  private notice(id: HelperId) {
    const j = this.hire(id)?.job, w = HELPERS[id];
    const state = !j ? "" : j.over ? "over" : j.doneAt !== undefined ? `done:${j.doneAt}` : "";
    const prev = this.seen.get(id);
    this.seen.set(id, state);
    if (prev === undefined || prev === state || !j) return; // first look after loading: say nothing
    if (j.doneAt !== undefined && state !== "over") {
      if (j.full) this.d.toast(`The godown is full — ${w.name} has left the rest of the crop standing.`, "bad");
      else this.d.toast(`${w.name} has finished · ${this.doneLine(j)} · sleeping ${Math.round(restMs(id) / 1000)}s by the field, then ready for the next job`);
      return;
    }
    if (state === "over") this.d.toast(`${w.name} goes home for the night · ${j.done} patches ${j.kind === "plant" ? "sown" : j.kind === "water" ? "watered" : "harvested"} in ${this.d.world.plots[j.plot].name}`);
  }

  debug() {
    return this.crew.map((l, i) => ({ id: l.id, ...l.pos, phase: this.phase(l.id), visible: l.fig.root.visible, target: this.want(l, i, this.phase(l.id)).at, action: l.fig.action }));
  }
}
