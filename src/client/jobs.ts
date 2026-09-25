import * as THREE from "three";
import { CROPS } from "../shared/crops";
import { fishCount } from "../shared/fish";
import { GIVERS, type GiverId, GOAT_SPOTS, type Job, jobLine, jobsFor } from "../shared/jobs";
import type { Action, Result } from "../shared/rules";
import type { Save } from "../shared/save";
import { clock } from "../shared/time";
import type { World } from "../shared/world";
import { Npc, type NpcLook } from "./engine/npc";
import { mergeParts } from "./engine/merge";
import { Q } from "./quality";
import type { Nav } from "./player/nav";

/*
 * The neighbours who ask for a hand (kaam), each at their own spot in the tanda, with a "!" over
 * anyone who has a job for you today; Chinki the goat, when she's lost; and the list of today's jobs.
 */
type P = { x: number; z: number };
type Deps = {
  ui: HTMLElement;
  world: World;
  nav: Nav;
  ground: (x: number, z: number) => number;
  save: () => Save;
  now: () => number;
  act: (a: Action) => Result;
  toast: (m: string, k?: "ok" | "bad") => void;
  sound: (name: string) => void;
  dialogue: (who: string, title: string, text: string, buttons: { label: string; sub?: string; onClick: () => void }[]) => void;
  closeDialogue: () => void;
};

const LOOKS: Record<GiverId, NpcLook> = {
  kashibai: { kurta: "", dhoti: "#8a4a10", hat: "#2e8a8a", woman: true },
  bhimrao: { kurta: "#efe7d2", dhoti: "#ece4cf", hat: "#e0762a", hatTall: true, skin: "#8a5636" },
  tulsa: { kurta: "", dhoti: "#5a2a4a", hat: "#e8e0d0", woman: true },
  guruji: { kurta: "#f4f2ea", dhoti: "#3a3a44", hat: "#f6f4ec", skin: "#9a6240" },
  lakshmi: { kurta: "", dhoti: "#1f4fa0", hat: "#e8a030", woman: true },
  savitri: { kurta: "", dhoti: "#7a1f4a", hat: "#d04a2a", woman: true },
};

export const DAYTIME = (h: number) => h >= 7 && h < 19.5;

export class Jobs {
  readonly group = new THREE.Group();
  private givers = new Map<GiverId, { npc: Npc; at: P; mark: THREE.Sprite }>();
  private goat: Goat;
  private goatHome: P = { x: 0, z: 0 };
  /** Chinki is following you. */
  goatFollowing = false;
  private el: HTMLElement;
  private listHtml = "";

  constructor(private d: Deps) {
    const L = d.world.landmarks;
    const houses = d.world.structures.filter((s) => s.kind === "house") as { x0: number; z0: number; w: number; d: number; door: "N" | "S" | "E" | "W" }[];
    const doorOf = (h: (typeof houses)[number]): P => {
      const side = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[h.door];
      return { x: h.x0 + h.w / 2 + side[0] * (h.w / 2 + 1), z: h.z0 + h.d / 2 + side[1] * (h.d / 2 + 1) };
    };
    const near = (p: P) => houses.map(doorOf).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const spots: Record<GiverId, P> = {
      kashibai: { x: L.well.x + 3.4, z: L.well.z + 1.2 },
      bhimrao: { x: 104.5, z: 119.8 }, // by the banyan, clear of the stalls
      tulsa: near({ x: 110, z: 132 }),
      guruji: { x: 131.5, z: 92.2 }, // at the school's back corner, watching the boys on the maidan
      lakshmi: { x: L.hanuman.x - 1.8, z: L.hanuman.z + 2.7 },
      savitri: { x: 94.5, z: 123.5 },
    };
    for (const id of Object.keys(GIVERS) as GiverId[]) {
      const at = d.nav.open(spots[id]);
      const npc = new Npc(LOOKS[id], at.x, d.ground(at.x, at.z), at.z, 0);
      const mark = new THREE.Sprite(new THREE.SpriteMaterial({ map: bangTexture(), depthWrite: false, toneMapped: false }));
      mark.scale.set(0.55, 0.55, 1);
      mark.position.set(at.x, d.ground(at.x, at.z) + 2.35, at.z);
      this.group.add(npc.group, mark);
      this.givers.set(id, { npc, at, mark });
    }
    const lk = this.givers.get("lakshmi")!.at;
    this.goatHome = { x: lk.x + 0.9, z: lk.z + 0.6 };
    this.goat = new Goat();
    this.group.add(this.goat.root);
    this.el = document.createElement("div");
    this.el.className = "kaam";
    d.ui.appendChild(this.el);
    this.el.addEventListener("click", () => this.el.classList.toggle("open"));
  }

  /** Where each neighbour stands (for the map and for keeping people apart). */
  spots() {
    return [...this.givers.entries()].map(([id, g]) => ({ id, ...g.at }));
  }
  bodies() {
    return [...this.givers.values()].map((g) => ({ pos: { x: g.at.x, z: g.at.z }, r: 0.34, fixed: true }));
  }

  /** Today's jobs, and what's been done. */
  today() {
    const s = this.d.save();
    const day = clock(this.d.now()).day;
    const done = s.jobs?.day === day ? s.jobs.done : [];
    const carrying = s.jobs?.day === day ? s.jobs.carrying : undefined;
    return { day, jobs: jobsFor(day), done, carrying };
  }

  /** Givers with something for you right now (a "!" over their heads). */
  private wants(id: GiverId) {
    const { jobs, done, carrying } = this.today();
    return jobs.filter((j) => !done.includes(j.slot) && (j.who === id || (j.kind === "parcel" && j.to === id && carrying === j.slot)));
  }

  /** Everyone with a job for you right now. */
  open(): GiverId[] {
    return (Object.keys(GIVERS) as GiverId[]).filter((id) => this.wants(id).length > 0);
  }

  /** The neighbour you're standing by, if any. */
  nearGiver(p: P): GiverId | null {
    let best: GiverId | null = null, bd = 2.4;
    for (const [id, g] of this.givers) {
      const dd = Math.hypot(p.x - g.at.x, p.z - g.at.z);
      if (dd < bd) {
        bd = dd;
        best = id;
      }
    }
    return best;
  }
  nearGoat(p: P) {
    return this.goat.root.visible && !this.goatFollowing && Math.hypot(p.x - this.goat.pos.x, p.z - this.goat.pos.z) < 2.4;
  }

  /** The E hint near a neighbour or the goat. */
  hint(p: P, hour: number): string {
    if (!DAYTIME(hour)) return "";
    if (this.nearGoat(p)) return "<kbd>E</kbd> Call Chinki — she'll follow you";
    const id = this.nearGiver(p);
    if (!id) return "";
    const w = this.wants(id);
    const who = GIVERS[id].name;
    if (!w.length) return `<kbd>E</kbd> Talk to ${who}`;
    const j = w[0];
    if (j.kind === "parcel" && j.to === id) return `<kbd>E</kbd> Give ${who} his tiffin`;
    if (j.kind === "goat" && this.goatFollowing) return `<kbd>E</kbd> Bring Chinki home to ${who}`;
    return `<kbd>E</kbd> ${who} needs a hand <small class="hours">· ${jobLine(j).split(": ")[1]}</small>`;
  }

  /** E: talk to whoever is here. Returns false if nobody is. */
  interact(p: P, hour: number): boolean {
    if (!DAYTIME(hour)) return false;
    if (this.nearGoat(p)) {
      this.goatFollowing = true;
      this.d.sound("bleat");
      this.d.toast("Chinki bleats and trots after you. Take her back to Lakshmi at the Hanuman mandir.");
      return true;
    }
    const id = this.nearGiver(p);
    if (!id) return false;
    const w = this.wants(id);
    const who = `${GIVERS[id].name} · ${GIVERS[id].local}`;
    if (!w.length) {
      const { done, jobs } = this.today();
      const helped = jobs.some((j) => done.includes(j.slot) && (j.who === id || (j.kind === "parcel" && j.to === id)));
      this.d.toast(helped ? `${GIVERS[id].name}: "Thank you again, bala. Come by tomorrow."` : `${GIVERS[id].name}: "Ram Ram! Nothing today — but ask the others, someone always needs a hand."`);
      return true;
    }
    this.offer(id, who, w[0]);
    return true;
  }

  private offer(id: GiverId, who: string, j: Job) {
    const s = this.d.save();
    const reward = `+₹${j.pay} · ★ +${j.rep}`;
    const done = (r: Result, line: string) => {
      this.d.closeDialogue();
      if (!r.ok) return this.d.toast(r.error, "bad");
      this.d.sound("cash");
      this.d.dialogue(who, "Thank you!", line, [{ label: `Collect: ${reward.replace("+", "")}`, onClick: () => this.d.closeDialogue() }]);
      this.d.toast(r.msg ?? "");
    };
    const later = (label: string, sub?: string) => ({ label, sub, onClick: () => this.d.closeDialogue() });
    const title = jobLine(j).split(": ")[1];
    const act = (a: Action) => this.d.act(a);
    switch (j.kind) {
      case "produce": {
        const have = s.inv[j.item] ?? 0;
        const name = CROPS[j.item].name.toLowerCase();
        return this.d.dialogue(who, title, j.ask, have >= j.n ? [{ label: `Give ${j.n} ${name}`, sub: reward, onClick: () => done(act({ t: "job", slot: j.slot }), j.thanks) }, later("Not now")] : [later("I'll bring them", `you have ${have} of ${j.n} ${name}`)]);
      }
      case "fish": {
        const have = fishCount(s.inv);
        return this.d.dialogue(who, title, j.ask, have >= j.n ? [{ label: `Give ${j.n === 1 ? "a fish" : `${j.n} fish`}`, sub: reward + " · the smallest go first", onClick: () => done(act({ t: "job", slot: j.slot }), j.thanks) }, later("Not now")] : [later("I'll go fishing", s.inv.rod ? "the talav is behind the Z.P. school" : "Sitabai sells a fishing rod (gal)")]);
      }
      case "water": {
        const have = s.inv.water ?? 0;
        return this.d.dialogue(who, title, j.ask, have >= j.n ? [{ label: `Pour ${j.n} from your can`, sub: reward, onClick: () => done(act({ t: "job", slot: j.slot }), j.thanks) }, later("Not now")] : [later("I'll fill my can", `you have ${have} of ${j.n} · fill it at the well, the vihir or the talav`)]);
      }
      case "parcel": {
        if (j.to === id) return this.d.dialogue(who, "Your tiffin", "Arre, my tiffin! Did Baba send you all this way? Come, sit a moment.", [{ label: "Here you are", sub: reward, onClick: () => done(act({ t: "job", slot: j.slot }), j.thanks) }]);
        const { carrying } = this.today();
        if (carrying === j.slot) return this.d.dialogue(who, title, `Go on, it'll get cold! ${GIVERS[j.to].name} is ${GIVERS[j.to].about}.`, [later("On my way")]);
        return this.d.dialogue(who, title, j.ask, [
          {
            label: "I'll take it",
            sub: `to ${GIVERS[j.to].name}, ${GIVERS[j.to].about}`,
            onClick: () => {
              this.d.closeDialogue();
              const r = act({ t: "job", slot: j.slot, step: "take" });
              this.d.toast(r.ok ? (r.msg ?? "") : r.error, r.ok ? "ok" : "bad");
            },
          },
          later("Not now"),
        ]);
      }
      case "goat": {
        if (this.goatFollowing) return this.d.dialogue(who, "Chinki!", "Chinki! There you are, you wicked thing!", [{ label: "Here she is", sub: reward, onClick: () => { this.goatFollowing = false; done(act({ t: "job", slot: j.slot }), j.thanks); } }]);
        return this.d.dialogue(who, title, `${j.ask} Someone saw her ${GOAT_SPOTS[j.at][2]}.`, [later("I'll find her")]);
      }
    }
  }

  update(dt: number, t: number, hour: number, player: THREE.Vector3, me: P) {
    const day = DAYTIME(hour);
    const { jobs, done } = this.today();
    for (const [id, g] of this.givers) {
      // like every villager: not drawn past the tier's distance, and only near ones cast shadows
      const far = Math.hypot(player.x - g.at.x, player.z - g.at.z);
      g.npc.group.visible = day && far < Q.peopleFar;
      if (g.npc.group.visible) {
        g.npc.setShadow(Q.shadows && far < Q.peopleShadow);
        g.npc.update(dt, player);
      }
      const want = g.npc.group.visible && this.wants(id).length > 0;
      g.mark.visible = want;
      if (want) g.mark.position.y = this.d.ground(g.at.x, g.at.z) + 2.35 + Math.sin(t * 2.5) * 0.08;
    }
    // Chinki: lost somewhere (if that's today's job), following you, or home with Lakshmi
    const gj = jobs.find((j) => j.kind === "goat");
    const found = gj && done.includes(gj.slot);
    this.goat.root.visible = !!gj && day;
    if (gj && !found && !this.goatFollowing) {
      const s = GOAT_SPOTS[gj.kind === "goat" ? gj.at : 0];
      const at = this.d.nav.open({ x: s[0], z: s[1] });
      if (Math.hypot(this.goat.pos.x - at.x, this.goat.pos.z - at.z) > 3) this.goat.pos = { ...at };
      this.goat.graze(dt, t);
    } else if (this.goatFollowing) {
      // trot along behind you, never through a wall
      const dx = me.x - this.goat.pos.x, dz = me.z - this.goat.pos.z, dd = Math.hypot(dx, dz);
      if (dd > 9) this.goat.pos = { x: me.x - (dx / dd) * 1.3, z: me.z - (dz / dd) * 1.3 }; // she catches up
      else if (dd > 1.3) {
        const k = Math.min(dd - 1.3, 4.5 * dt);
        const nx = this.goat.pos.x + (dx / dd) * k, nz = this.goat.pos.z + (dz / dd) * k;
        if (!this.d.nav.isBlocked(nx, nz)) this.goat.pos = { x: nx, z: nz };
      }
      this.goat.walk(dt, t, Math.atan2(dx, dz), dd > 1.35);
      if (!day) this.goatFollowing = false;
    } else {
      this.goat.pos = { ...this.goatHome };
      this.goat.graze(dt, t);
    }
    this.goat.root.position.set(this.goat.pos.x, this.d.ground(this.goat.pos.x, this.goat.pos.z), this.goat.pos.z);
    this.renderList(jobs, done, day);
  }

  private renderList(jobs: Job[], done: number[], day: boolean) {
    const left = jobs.filter((j) => !done.includes(j.slot)).length;
    const html = `<div class="kaam-head">📋 Kaam today <span>${left ? `${left} of ${jobs.length} open` : "all done!"}</span></div>
      <ul>${jobs.map((j) => `<li class="${done.includes(j.slot) ? "done" : ""}"><i>${done.includes(j.slot) ? "✓" : ""}</i><span>${jobLine(j)}</span><em>₹${j.pay}</em></li>`).join("")}</ul>
      <small>${day ? "Look for the <b>!</b> over their heads · new jobs every day" : "Everyone's gone in for the night — new jobs in the morning"}</small>`;
    if (html !== this.listHtml) this.el.innerHTML = this.listHtml = html;
  }

  set hidden(h: boolean) {
    this.el.hidden = h;
  }

  debug() {
    return { goat: { ...this.goat.pos, visible: this.goat.root.visible, following: this.goatFollowing }, givers: this.spots() };
  }
}

/** A gold disc with a "!" on it. */
function bangTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = "#f2b12e";
  g.beginPath();
  g.arc(32, 32, 28, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = "#5a3a08";
  g.stroke();
  g.fillStyle = "#3a2406";
  g.font = "900 42px system-ui";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("!", 32, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Chinki: a small brown-and-white goat with little horns and floppy ears. */
class Goat {
  readonly root = new THREE.Group();
  pos: P = { x: 0, z: 0 };
  private legs: THREE.Object3D[] = [];
  private head = new THREE.Group();
  private heading = 0;
  private ph = 0;

  constructor() {
    const brown = new THREE.MeshStandardMaterial({ color: "#7a4a2a", roughness: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: "#efe8da", roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: "#2a1c14", roughness: 0.8 });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.42, 4, 10), brown);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.52;
    body.castShadow = true;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), white);
    belly.scale.set(1, 0.8, 1.6);
    belly.position.set(0, 0.46, 0.05);
    this.root.add(body, belly);
    for (const [x, z] of [[-0.1, 0.22], [0.1, 0.22], [-0.1, -0.22], [0.1, -0.22]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.42, z);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.42, 6), x < 0 && z > 0 ? white : brown);
      m.position.y = -0.21;
      m.castShadow = true;
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.04, 6), dark);
      hoof.position.y = -0.42;
      leg.add(m, hoof);
      this.legs.push(leg);
      this.root.add(leg);
    }
    this.head.position.set(0, 0.68, 0.36);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), white);
    skull.scale.set(0.85, 0.9, 1.4);
    skull.castShadow = true;
    const snout = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), brown);
    snout.position.set(0, -0.03, 0.12);
    this.head.add(skull, snout);
    for (const s of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), brown);
      ear.scale.set(0.5, 0.25, 1.4);
      ear.position.set(s * 0.1, 0, -0.01);
      ear.rotation.z = s * 0.6;
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 6), dark);
      horn.position.set(s * 0.04, 0.1, -0.04);
      horn.rotation.x = -0.6;
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), dark);
      eye.position.set(s * 0.06, 0.03, 0.08);
      this.head.add(ear, horn, eye);
    }
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), brown);
    tail.position.set(0, 0.66, -0.34);
    tail.rotation.x = -0.9;
    this.root.add(this.head, tail);
    mergeParts(this.root);
  }

  /** Head down in the grass, now and then looking up. */
  graze(dt: number, t: number) {
    this.ph += dt;
    this.head.rotation.x = Math.sin(t * 0.7) > -0.3 ? 0.9 + Math.sin(t * 5) * 0.08 : 0;
    for (const l of this.legs) l.rotation.x = 0;
    this.root.rotation.y = this.heading;
  }

  walk(dt: number, _t: number, toward: number, moving: boolean) {
    this.heading += Math.atan2(Math.sin(toward - this.heading), Math.cos(toward - this.heading)) * Math.min(1, dt * 6);
    this.ph += dt * (moving ? 12 : 0);
    this.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(this.ph + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.5 : 0));
    this.head.rotation.x = 0.1;
    this.root.rotation.y = this.heading;
  }
}
