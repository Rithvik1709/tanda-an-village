import * as THREE from "three";
import { COURT, MAIDAN } from "../shared/world";
import { Figure, type Look } from "./scene/figure";
import { KABADDI_LINES } from "./scene/playground";
import { Q } from "./quality";
import { isTouch } from "./player/touch";

/** How a tag is made: a click, or on a phone the Harvest button. */
const TAG = isTouch() ? "tap Tag" : "click";

/** The boys only matter near the maidan: past this they aren't drawn. */
const BOYS_FAR = 75;

/*
 * Kabaddi on the maidan behind the school. By day the boys practise here; press E and they'll take
 * you on: Ukhali's side against the Hanuman Vyayamshala boys, five raids each.
 *   Your raid: cross the midline, chant (your breath runs down), tag defenders with a click, and get
 *   back over the midline before your breath runs out — without being tackled.
 *   Their raid: their raider comes into your half; tackle him with a click before he tags you.
 * Everything here is play on the client; only the result goes to the server (a prize once a day).
 */
type P = { x: number; z: number };
type Boy = { fig: Figure; pos: P; heading: number; speed: number; team: "us" | "them" | "ref"; home: P; out: boolean; dash: number; rest: number; react: number; idle: number };
type Phase = "ready" | "raid" | "their" | "result" | "over";

export const RAIDS = 5;
const BREATH = 7; // seconds of "kabaddi-kabaddi" in one breath
const REACH = 1.75; // how far a tag (or a tackle) reaches: a raider's hand or a kick
const CATCH = 0.62; // a lunging defender this close has you
const LUNGE_AT = 1.3; // a defender lunges when you come this close…
const LUNGE_WAIT = 0.45; // …and stay there this long
const TAGGED_SIDE = COURT.x1 + 1.2; // where the out players sit

const vest = (c: string, skin: string): Look => ({ kurta: c, dhoti: "#2a2a30", hat: "", hatStyle: "none", skin });
const NAMES_THEM = ["Sachin", "Pintya", "Raju", "Balu"];

export type KabaddiDeps = {
  ui: HTMLElement;
  ground: (x: number, z: number) => number;
  /** Move the farmer (start of a raid) and face him up or down the court. */
  place: (x: number, z: number, yaw: number) => void;
  toast: (m: string, k?: "ok" | "bad") => void;
  sound: (name: string) => void;
  /** The match is over: send the result. */
  finish: (won: boolean, us: number, them: number) => void;
};

export class Kabaddi {
  readonly group = new THREE.Group();
  private boys: Boy[] = [];
  private el: HTMLElement;
  phase: Phase | null = null;
  private raid = 0; // raids so far (yours and theirs: 0..2*RAIDS)
  private us = 0;
  private them = 0;
  private breath = BREATH;
  private crossed = false;
  private tags = new Set<Boy>();
  private bonus = false;
  private timer = 0;
  private cool = 0;
  private raider: Boy | null = null;
  private raiderPlan: { target: Boy | null; t: number; tagged: boolean } = { target: null, t: 0, tagged: false };

  constructor(private d: KabaddiDeps) {
    const skins = ["#8a5636", "#9a6240", "#7a4a2e", "#a06a45"];
    const home = (team: "us" | "them", i: number): P => ({ x: COURT.x0 + 1.2 + i * 2, z: team === "them" ? COURT.mid + 2.5 + (i % 2) * 0.7 : COURT.mid - 2.4 - (i % 2) * 0.6 });
    for (let i = 0; i < 4; i++) this.add(vest("#e0762a", skins[i % 4]), "them", home("them", i)); // Hanuman Vyayamshala: saffron vests
    for (let i = 0; i < 3; i++) this.add(vest("#1f5fbf", skins[(i + 1) % 4]), "us", home("us", i + 0.5)); // Ukhali: blue
    // the referee, Pawar guruji's colleague, with a whistle, at the midline
    this.add({ kurta: "#f2f0ea", dhoti: "#3a3a44", hat: "#f2f2ee", hatStyle: "topi", skin: "#9a6240" }, "ref", { x: COURT.x1 + 0.8, z: COURT.mid });
    this.el = document.createElement("div");
    this.el.className = "kabaddi";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="kb-score"></div><div class="kb-breath"><span>कबड्डी कबड्डी कबड्डी</span><i></i></div><div class="kb-status"></div>`;
    d.ui.appendChild(this.el);
  }

  private add(look: Look, team: Boy["team"], home: P) {
    const fig = new Figure(look);
    fig.root.scale.setScalar(team === "ref" ? 1 : 0.9);
    this.group.add(fig.root);
    this.boys.push({ fig, pos: { ...home }, heading: team === "them" ? Math.PI : 0, speed: 0, team, home, out: false, dash: 0, rest: 0, react: 0, idle: Math.random() * 10 });
  }

  get active() {
    return this.phase !== null;
  }
  /** Bodies to keep apart from others when no match is on. */
  bodies() {
    return this.active ? [] : this.boys.filter((b) => b.fig.root.visible).map((b) => ({ pos: b.pos, r: 0.3 }));
  }

  /** Where you can ask to play: on the maidan, by day, with the boys there. */
  static canPlay(hour: number) {
    return hour >= 8 && hour < 19;
  }

  start() {
    if (this.active) return;
    this.phase = "ready";
    this.raid = 0;
    this.us = this.them = 0;
    for (const b of this.boys) {
      b.out = false;
      b.pos = { ...b.home };
    }
    this.el.hidden = false;
    this.d.sound("whistle");
    this.nextRaid();
  }

  quit(msg: string) {
    if (!this.active) return;
    this.phase = null;
    this.el.hidden = true;
    this.raider = null;
    this.d.toast(msg, "bad");
  }

  /** Your raid or theirs, by turn. */
  private nextRaid() {
    this.tags.clear();
    this.bonus = false;
    this.crossed = false;
    this.breath = BREATH;
    this.raider = null;
    if (this.raid >= RAIDS * 2) return this.end();
    const yours = this.raid % 2 === 0;
    this.phase = "ready";
    this.timer = 1.6;
    for (const b of this.boys) if (!b.out) b.pos = { ...b.home };
    if (yours) this.d.place((COURT.x0 + COURT.x1) / 2, COURT.mid - 1.4, Math.PI);
    else this.d.place((COURT.x0 + COURT.x1) / 2, COURT.mid - 2.6, Math.PI);
    this.status(yours ? `Your raid (${this.raid / 2 + 1} of ${RAIDS}): cross the midline, tag them (${TAG}), and get back in one breath!` : `Their raid: stay in your half and tackle their raider (${TAG}) before he touches you!`);
  }

  private end() {
    this.phase = "over";
    this.timer = 3;
    const won = this.us > this.them;
    this.status(won ? `You win ${this.us}–${this.them}! Ukhali Tanda zindabad!` : this.us === this.them ? `A draw, ${this.us}–${this.them}. The boys want a rematch!` : `They win ${this.them}–${this.us}. Next time!`);
    this.d.sound(won ? "cheer" : "whistle");
    this.d.finish(won, this.us, this.them);
  }

  private status(s: string) {
    (this.el.querySelector(".kb-status") as HTMLElement).textContent = s;
  }

  /** A click: tag a defender on your raid, tackle their raider on theirs. */
  tag(me: P) {
    if (this.phase !== "raid" && this.phase !== "their") return;
    if (this.cool > 0) return;
    this.cool = 0.35;
    if (this.phase === "raid") {
      if (!this.crossed) return;
      let best: Boy | null = null, bd = REACH;
      for (const b of this.boys) {
        if (b.team !== "them" || b.out || this.tags.has(b)) continue;
        const dd = Math.hypot(b.pos.x - me.x, b.pos.z - me.z);
        if (dd < bd) {
          bd = dd;
          best = b;
        }
      }
      if (!best) return;
      this.tags.add(best);
      best.rest = 0.6; // stunned for a moment
      this.d.sound("place");
      this.d.toast(`Touched ${NAMES_THEM[this.boys.indexOf(best)]}! Now get back over the line!`);
    } else if (this.raider && Math.hypot(this.raider.pos.x - me.x, this.raider.pos.z - me.z) < REACH && this.raider.pos.z < COURT.mid) {
      this.us += 1;
      this.d.sound("cheer");
      this.d.toast("Tackle! Their raider is out · +1");
      this.result();
    } else {
      // a dive at thin air: you're on the ground for a moment, and he knows it
      this.cool = 1.3;
      this.d.sound("step");
      this.d.toast("You dive — and miss! Wait until he's close.", "bad");
    }
  }

  /** Holding the action: tag (or tackle) the moment someone is within reach, never diving at thin air. */
  hold(me: P) {
    if (this.cool > 0) return;
    if (this.phase === "raid" && this.crossed) {
      const near = this.boys.some((b) => b.team === "them" && !b.out && !this.tags.has(b) && Math.hypot(b.pos.x - me.x, b.pos.z - me.z) < REACH);
      if (near) this.tag(me);
    } else if (this.phase === "their" && this.raider && this.raider.pos.z < COURT.mid && Math.hypot(this.raider.pos.x - me.x, this.raider.pos.z - me.z) < REACH) this.tag(me);
  }

  private result() {
    this.phase = "result";
    this.timer = 1.4;
  }

  private scoreboard() {
    const yours = this.raid % 2 === 0;
    const turn = Math.min(RAIDS, Math.floor(this.raid / 2) + 1);
    const html = `<b>Ukhali</b> <em>${this.us}</em> – <em>${this.them}</em> <b>Hanuman Club</b><small>${this.phase === "over" ? "full time" : `${yours ? "your" : "their"} raid · ${turn} of ${RAIDS}`}</small>`;
    const el = this.el.querySelector(".kb-score") as HTMLElement;
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  /** me: the farmer; vel: his velocity; eye: the camera (for drawing distance). */
  update(dt: number, hour: number, me: { x: number; z: number }, vel: { x: number; z: number }, eye: { x: number; z: number }) {
    this.cool = Math.max(0, this.cool - dt);
    const day = Kabaddi.canPlay(hour) || this.active;
    const far = Math.hypot(eye.x - (COURT.x0 + COURT.x1) / 2, eye.z - COURT.mid);
    const drawn = day && far < BOYS_FAR;
    for (const b of this.boys) {
      b.fig.root.visible = drawn;
      if (drawn) b.fig.setShadow(Q.shadows && Math.hypot(eye.x - b.pos.x, eye.z - b.pos.z) < Q.peopleShadow);
    }
    if (!day) return;
    if (!this.active) this.practise(dt);
    else this.play(dt, me, vel);
    if (drawn)
      for (const b of this.boys) {
        b.fig.root.position.set(b.pos.x, this.d.ground(b.pos.x, b.pos.z), b.pos.z);
        b.fig.root.rotation.y = b.heading;
        b.fig.animate(dt, b.speed);
      }
    this.scoreboard();
  }

  /** No match: the boys jog round the court, stretch, and chat on the touchline. */
  private practise(dt: number) {
    const cx = (COURT.x0 + COURT.x1) / 2, cz = COURT.mid, rx = (COURT.x1 - COURT.x0) / 2 + 0.6, rz = (COURT.z1 - COURT.z0) / 2 + 0.4;
    this.boys.forEach((b, i) => {
      b.idle += dt;
      if (b.team === "ref") {
        b.speed = 0;
        b.fig.action = "none";
        b.heading = -Math.PI / 2;
        return;
      }
      if (i % 3 === 2) {
        // stretching and chatting on the touchline
        b.speed = 0;
        b.fig.action = Math.sin(b.idle * 0.4) > 0.3 ? "crouch" : "none";
        b.pos = { x: COURT.x0 - 0.4, z: cz - 3 + i * 0.9 };
        b.heading = Math.PI / 2;
        return;
      }
      // a slow jog round the court, one behind the other
      const a = b.idle * 0.22 + i * 0.9;
      const nx = cx + Math.cos(a) * rx, nz = cz + Math.sin(a) * rz;
      b.heading = Math.atan2(nx - b.pos.x, nz - b.pos.z);
      b.speed = Math.hypot(nx - b.pos.x, nz - b.pos.z) / Math.max(dt, 1e-3);
      b.pos = { x: nx, z: nz };
      b.fig.action = "none";
    });
  }

  private step(b: Boy, to: P, speed: number, dt: number) {
    const dx = to.x - b.pos.x, dz = to.z - b.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.05) {
      b.speed = 0;
      return;
    }
    const k = Math.min(d, speed * dt);
    b.pos.x += (dx / d) * k;
    b.pos.z += (dz / d) * k;
    b.speed = k / Math.max(dt, 1e-3);
    const want = Math.atan2(dx, dz);
    b.heading += Math.atan2(Math.sin(want - b.heading), Math.cos(want - b.heading)) * Math.min(1, dt * 8);
  }

  private play(dt: number, me: P, vel: P) {
    const breathEl = this.el.querySelector(".kb-breath") as HTMLElement;
    breathEl.hidden = !(this.phase === "raid" && this.crossed);
    // walk off the maidan and the game goes on without you
    if (me.x < MAIDAN.x0 - 2 || me.x > MAIDAN.x1 + 2 || me.z < MAIDAN.z0 - 2 || me.z > MAIDAN.z1 + 2) return this.quit("You walked off the maidan — the boys carry on without you.");
    const ref = this.boys.find((b) => b.team === "ref")!;
    this.step(ref, { x: COURT.x1 + 0.8, z: Math.max(COURT.z0, Math.min(COURT.z1, me.z)) }, 2, dt);
    ref.heading = -Math.PI / 2;
    for (const b of this.boys) if (b.out && b.team === "them") {
      // the out players sit on the side and wait to be revived
      this.step(b, { x: TAGGED_SIDE, z: COURT.mid + 1 + this.boys.indexOf(b) * 0.8 }, 3, dt);
      b.fig.action = b.speed < 0.1 ? "sit" : "none";
    }
    const defenders = this.boys.filter((b) => b.team === "them" && !b.out);
    const mates = this.boys.filter((b) => b.team === "us");
    switch (this.phase) {
      case "ready": {
        this.timer -= dt;
        for (const b of [...defenders, ...mates]) {
          this.step(b, b.home, 3, dt);
          b.fig.action = "crouch";
          b.heading = b.team === "them" ? Math.PI : 0;
        }
        if (this.timer <= 0) {
          this.d.sound("whistle");
          if (this.raid % 2 === 0) {
            this.phase = "raid";
            this.timer = 15; // time to start the raid
          } else {
            this.phase = "their";
            this.raider = defenders[Math.floor(Math.random() * defenders.length)] ?? null;
            this.raiderPlan = { target: null, t: 0, tagged: false };
            if (!this.raider) this.result();
          }
        }
        break;
      }
      case "raid": {
        const inTheirs = me.z > COURT.mid;
        if (inTheirs && !this.crossed) {
          this.crossed = true;
          this.status(`Kabaddi kabaddi kabaddi… tag them (${TAG}) and get back over the midline!`);
        }
        if (!this.crossed) {
          this.timer -= dt;
          if (this.timer <= 0) return this.raidOut("Too slow — the referee calls your raid off.");
        } else {
          this.breath -= dt;
          (breathEl.querySelector("i") as HTMLElement).style.width = `${Math.max(0, (this.breath / BREATH) * 100)}%`;
          breathEl.classList.toggle("low", this.breath < 2.2);
          if (inTheirs && this.breath <= 0) return this.raidOut("Out of breath! The chant stopped in their half.");
          if (me.x < COURT.x0 - 0.25 || me.x > COURT.x1 + 0.25 || me.z > COURT.z1 + 0.25) return this.raidOut("Out of bounds!");
          if (me.z > COURT.mid + KABADDI_LINES.bonus && !this.bonus && defenders.length >= 3) {
            this.bonus = true;
            this.d.toast("Bonus line! +1 if you get back");
          }
          if (me.z < COURT.mid - 0.2) return this.raidHome();
        }
        // the defenders: the one you go for backs away and draws you deeper, the rest close off your
        // way home; anyone lunges if you linger close — and faster the moment you turn for the line
        const turning = vel.z < -1;
        let bait: Boy | null = null, bd = 1e9;
        for (const b of defenders) {
          const dd = Math.hypot(me.x - b.pos.x, me.z - b.pos.z);
          if (dd < bd) {
            bd = dd;
            bait = b;
          }
        }
        for (let i = 0; i < defenders.length; i++) {
          const b = defenders[i];
          b.fig.action = "crouch";
          if (b.rest > 0) {
            b.rest -= dt;
            b.speed = 0;
            continue;
          }
          const dist = Math.hypot(me.x - b.pos.x, me.z - b.pos.z);
          if (b.dash > 0) {
            b.dash -= dt;
            const lead = { x: me.x + vel.x * 0.25, z: me.z + vel.z * 0.25 };
            this.step(b, { x: lead.x, z: Math.max(COURT.mid + 0.1, lead.z) }, 6, dt);
            if (dist < CATCH && inTheirs) return this.raidOut(`Tackled by ${NAMES_THEM[this.boys.indexOf(b)]}! The Hanuman Club gets a point.`);
            if (b.dash <= 0) b.rest = 0.9; // winded after a lunge
            continue;
          }
          if (!this.crossed) {
            this.step(b, b.home, 2, dt);
            b.heading = Math.PI;
            continue;
          }
          let to: P;
          if (b === bait && dist < 2.4) {
            // keep out of reach: back off, away from you
            const ax = b.pos.x - me.x, az = b.pos.z - me.z, al = Math.hypot(ax, az) || 1;
            to = { x: me.x + (ax / al) * 2.3, z: me.z + (az / al) * 2.3 };
          } else {
            // cut off the way back: stand between you and the line, spread out
            const spread = (i - (defenders.length - 1) / 2) * 1.15;
            to = { x: me.x + spread, z: me.z - 1.1 + Math.abs(spread) * 0.4 };
          }
          to = { x: Math.max(COURT.x0 + 0.3, Math.min(COURT.x1 - 0.3, to.x)), z: Math.max(COURT.mid + 0.4, Math.min(COURT.z1 - 0.3, to.z)) };
          this.step(b, to, 2.6, dt);
          b.heading = Math.atan2(me.x - b.pos.x, me.z - b.pos.z);
          if (inTheirs && (dist < LUNGE_AT || (turning && dist < 2))) {
            b.react += dt;
            if (b.react > (turning ? 0.18 : LUNGE_WAIT)) {
              b.react = 0;
              b.dash = 0.35;
              this.d.sound("step");
            }
          } else b.react = Math.max(0, b.react - dt);
        }
        for (const b of mates) {
          this.step(b, b.home, 2, dt);
          b.fig.action = "cheer";
          b.heading = 0;
        }
        break;
      }
      case "their": {
        const r = this.raider;
        if (!r) return this.result();
        const plan = this.raiderPlan;
        plan.t += dt;
        r.fig.action = "none";
        // their raider picks someone to go for, darts in, and heads home after a touch (or a few seconds)
        const targets: (Boy | null)[] = [...mates, null]; // null: you
        plan.target ??= targets[Math.floor(Math.random() * targets.length)];
        const tp = plan.target ? plan.target.pos : me;
        if (!plan.tagged && plan.t < 5.5) {
          this.step(r, { x: tp.x, z: Math.max(COURT.z0 + 0.3, tp.z) }, 3.9, dt);
          if (Math.hypot(tp.x - r.pos.x, tp.z - r.pos.z) < 0.75) {
            plan.tagged = true;
            this.d.sound("place");
            this.d.toast(plan.target ? `${NAMES_THEM[this.boys.indexOf(r)]} touched one of your team — stop him getting back!` : `${NAMES_THEM[this.boys.indexOf(r)]} touched you — stop him getting back!`, "bad");
          }
        } else this.step(r, { x: r.pos.x, z: COURT.mid + 1 }, 4.3, dt);
        if (r.pos.z > COURT.mid && (plan.tagged || plan.t > 5.5) && plan.t > 1) {
          if (plan.tagged) {
            this.them += 1;
            this.d.toast(`${NAMES_THEM[this.boys.indexOf(r)]} made it back · Hanuman Club +1`, "bad");
          } else this.d.toast("Their raid came to nothing.");
          return this.result();
        }
        // your teammates close in, and sometimes bring him down themselves
        for (const b of mates) {
          b.fig.action = "crouch";
          const dd = Math.hypot(r.pos.x - b.pos.x, r.pos.z - b.pos.z);
          if (r.pos.z < COURT.mid - 0.3 && dd < 2.6) this.step(b, r.pos, 2.4, dt);
          else this.step(b, b.home, 2, dt);
          b.heading = Math.atan2(r.pos.x - b.pos.x, r.pos.z - b.pos.z);
          if (dd < 0.6 && plan.tagged && Math.random() < dt * 1.5) {
            this.us += 1;
            this.d.sound("cheer");
            this.d.toast("Your team brings him down! +1");
            return this.result();
          }
        }
        for (const b of defenders) if (b !== r) {
          this.step(b, b.home, 2, dt);
          b.fig.action = "cheer";
        }
        break;
      }
      case "result": {
        this.timer -= dt;
        for (const b of this.boys) if (b.team !== "ref" && !b.out) b.fig.action = "none";
        if (this.timer <= 0) {
          this.raid++;
          this.nextRaid();
        }
        break;
      }
      case "over": {
        this.timer -= dt;
        for (const b of mates) b.fig.action = this.us > this.them ? "cheer" : "none";
        if (this.timer <= 0) {
          this.phase = null;
          this.el.hidden = true;
          for (const b of this.boys) b.out = false;
        }
        break;
      }
    }
  }

  private raidOut(msg: string) {
    this.them += 1;
    this.d.sound("whistle");
    this.d.toast(msg + " · Hanuman Club +1", "bad");
    this.result();
  }

  private raidHome() {
    const pts = this.tags.size + (this.bonus ? 1 : 0);
    for (const b of this.tags) b.out = true;
    this.us += pts;
    let msg = pts ? `Back safe! +${pts}` : "Back safe, but no points that time.";
    // every defender out: a lona, two more points, and they all come back
    if (this.boys.filter((b) => b.team === "them").every((b) => b.out)) {
      this.us += 2;
      msg += " · LONA! All out: +2";
      for (const b of this.boys) b.out = false;
    }
    this.d.sound(pts ? "cheer" : "whistle");
    this.d.toast(msg);
    this.result();
  }

  /** For tests: where everyone is. */
  debug() {
    return { phase: this.phase, raid: this.raid, us: this.us, them: this.them, breath: this.breath, crossed: this.crossed, tags: this.tags.size, boys: this.boys.map((b) => ({ team: b.team, x: +b.pos.x.toFixed(2), z: +b.pos.z.toFixed(2), out: b.out })) };
  }
}
