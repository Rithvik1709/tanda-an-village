import * as THREE from "three";
import { biteFor, CASTS_PER_DAY, FISH } from "../shared/fish";
import type { Action, Result } from "../shared/rules";
import type { Save } from "../shared/save";
import { clock } from "../shared/time";
import { TALAV, talavOut } from "../shared/world";
import { makeFloat, makeLine, setLine } from "./scene/playground";
import type { Figure } from "./scene/figure";
import { isSurging, newReel, type Reel, reelStep } from "./reel";
import { isTouch } from "./player/touch";

/*
 * Fishing at the talav, the way it's done with a bamboo gal: cast the float out, wait for it to dip,
 * strike, then play the fish in — hold to reel, ease off when it surges or the line will snap.
 * The game decides nothing here the server doesn't: which fish bites comes from the save.
 */
type Deps = {
  scene: THREE.Scene;
  ui: HTMLElement;
  farmer: Figure;
  save: () => Save;
  now: () => number;
  act: (a: Action) => Result;
  toast: (m: string, k?: "ok" | "bad") => void;
  sound: (name: string) => void;
};
type State = "off" | "cast" | "wait" | "bite" | "reel" | "landed";

const big = (f: keyof typeof FISH) => FISH[f].fight > 0.6;

/** Standing on the bank, close enough to cast? */
export const atTalavEdge = (x: number, z: number) => {
  const d = talavOut(x, z);
  return d > -0.2 && d < 2.6;
};

export class Fishing {
  state: State = "off";
  private float = makeFloat();
  private line = makeLine();
  private fishMesh: THREE.Group;
  private ring: THREE.Mesh;
  private el: HTMLElement;
  private target = new THREE.Vector3();
  private timer = 0;
  private reel: Reel = newReel();
  private bite: { fish: keyof typeof FISH; kg: number } | null = null;
  private held = false;
  private btnHeld = false;
  private t = 0;
  private reelSfx = 0;
  private prevSpace = false;
  /** Which way the farmer should face while fishing. */
  heading = 0;

  constructor(private d: Deps) {
    this.float.visible = this.line.visible = false;
    d.scene.add(this.float, this.line);
    // the catch: a silver carp with a darker back, a forked tail and a fin, hung nose-up from the line
    this.fishMesh = new THREE.Group();
    const silver = new THREE.MeshStandardMaterial({ color: "#dfe6e6", metalness: 0.15, roughness: 0.35 });
    const back = new THREE.MeshStandardMaterial({ color: "#5d6f72", roughness: 0.5 });
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10).scale(0.55, 1, 2.6), silver);
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.4).scale(0.52, 0.95, 2.5), back);
    top.position.y = 0.012;
    const tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.13, -0.16, 0, -0.13, -0.16, 0, 0, 0, 0, -0.13, -0.16, 0, 0.13, -0.16], 3));
    tailGeo.computeVertexNormals();
    const tail = new THREE.Mesh(tailGeo, back);
    tail.position.z = -0.24;
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.12, 4).scale(0.2, 1, 1), back);
    fin.position.set(0, 0.1, 0.02);
    fin.rotation.x = -0.5;
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 4), new THREE.MeshStandardMaterial({ color: "#1a1410" }));
    eye.position.set(0.045, 0.02, 0.19);
    const eye2 = eye.clone();
    eye2.position.x = -0.045;
    this.fishMesh.add(belly, top, tail, fin, eye, eye2);
    this.fishMesh.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    this.fishMesh.visible = false;
    d.scene.add(this.fishMesh);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 24), new THREE.MeshBasicMaterial({ color: "#e8f0ee", transparent: true, opacity: 0, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    d.scene.add(this.ring);
    this.el = document.createElement("div");
    this.el.className = "fishing";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="fish-card"><div class="fish-status"></div>
      <div class="fish-bars"><label>Tension</label><div class="bar tension"><i></i><b class="danger"></b></div>
      <label>Line in</label><div class="bar progress"><i></i></div></div>
      <button class="fish-btn">Hold to reel</button><div class="fish-foot"></div></div>`;
    d.ui.appendChild(this.el);
    const btn = this.el.querySelector(".fish-btn") as HTMLButtonElement;
    const down = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      this.btnHeld = true;
      if (this.state === "bite" || this.state === "wait") this.press();
    };
    const up = () => (this.btnHeld = false);
    btn.addEventListener("pointerdown", down);
    btn.addEventListener("pointerup", up);
    btn.addEventListener("pointerleave", up);
    btn.addEventListener("pointercancel", up);
    // the mouse button counts too (while the pointer is locked the game sees it, not the button)
    document.addEventListener("mousedown", (e) => e.button === 0 && (this.held = true));
    document.addEventListener("mouseup", (e) => e.button === 0 && (this.held = false));
  }

  get active() {
    return this.state !== "off";
  }
  /** While a fish is on (or the float just dipped) the farmer stands still. */
  get locked() {
    return this.state === "bite" || this.state === "reel" || this.state === "landed" || this.state === "cast";
  }

  castsLeft() {
    const f = this.d.save().fishing;
    const day = clock(this.d.now()).day;
    return CASTS_PER_DAY - (f && f.day === day ? f.casts : 0);
  }

  /** Cast from where you stand, out along where you're looking (or towards the middle of the water). */
  start(pos: { x: number; y: number; z: number }, yaw: number) {
    if (this.active) return;
    if (!this.d.save().inv.rod) return this.d.toast("You need a fishing rod — Sitabai sells a bamboo gal.", "bad");
    if (this.castsLeft() <= 0) return this.d.toast("The talav has gone quiet — the fish won't bite again today. Come back tomorrow.", "bad");
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
    let tx = pos.x + fx * 3.2, tz = pos.z + fz * 3.2;
    if (talavOut(tx, tz) > -0.6) {
      // not over open water: aim for the middle instead, stopping a little way in from the edge
      const cx = TALAV.x - pos.x, cz = TALAV.z - pos.z, len = Math.hypot(cx, cz);
      for (let s = 0.5; s < len; s += 0.25) {
        tx = pos.x + (cx / len) * s;
        tz = pos.z + (cz / len) * s;
        if (talavOut(tx, tz) < -0.9) break;
      }
    }
    this.target.set(tx, TALAV.level + 0.02, tz);
    this.heading = Math.atan2(tx - pos.x, tz - pos.z);
    this.state = "cast";
    this.timer = 0.55;
    this.d.farmer.hold("rod");
    this.d.farmer.action = "fish";
    this.el.hidden = false;
    this.el.classList.remove("reeling");
    this.status("Casting…", `${this.castsLeft()} casts left today at the talav`);
  }

  /** E, a click, Space or the button: strike when the float dips; reel in early otherwise. */
  press() {
    if (this.state === "bite") {
      this.state = "reel";
      this.reel = newReel();
      this.el.classList.add("reeling");
      this.d.sound("reel");
      const big = FISH[this.bite!.fish].fight > 0.6;
      this.status(big ? "Something big is on!" : "Fish on!", "Hold to reel · ease off when it pulls hard");
      (this.el.querySelector(".fish-btn") as HTMLElement).textContent = "Hold to reel";
      return;
    }
    if (this.state === "wait") this.stop("You reel in the line.");
  }

  stop(msg?: string) {
    if (!this.active) return;
    this.state = "off";
    this.float.visible = this.line.visible = this.fishMesh.visible = false;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0;
    this.el.hidden = true;
    this.d.farmer.action = "none";
    if (msg) this.d.toast(msg);
  }

  private status(line: string, foot = "") {
    (this.el.querySelector(".fish-status") as HTMLElement).textContent = line;
    (this.el.querySelector(".fish-foot") as HTMLElement).textContent = foot;
    (this.el.querySelector(".fish-btn") as HTMLElement).textContent = this.state === "reel" ? "Hold to reel" : this.state === "bite" ? "Strike!" : "Reel in";
  }

  /** `space` is the game's Space key; `moving` means the player wants to walk away; `at` is where the farmer is. */
  update(dt: number, space: boolean, moving: boolean, hour: number, at: { x: number; z: number }) {
    if (!this.active) return;
    // gone from the bank some other way (asleep at home, off on the cart): the line comes in
    if (!atTalavEdge(at.x, at.z)) return this.stop();
    this.t += dt;
    const holding = this.held || this.btnHeld || space;
    const tip = this.d.farmer.rodTip(new THREE.Vector3());
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = Math.max(0, ringMat.opacity - dt * 0.8);
    this.ring.scale.multiplyScalar(1 + dt * 2.2);
    switch (this.state) {
      case "cast": {
        // the float flies out in an arc
        this.timer -= dt;
        const k = 1 - Math.max(0, this.timer) / 0.55;
        if (tip) {
          this.float.visible = this.line.visible = true;
          this.float.position.lerpVectors(tip, this.target, k);
          this.float.position.y += Math.sin(k * Math.PI) * 1.2;
          setLine(this.line, tip, this.float.position, 0.1);
        }
        if (this.timer <= 0) {
          this.state = "wait";
          this.d.sound("splash");
          this.splashRing(this.target);
          // fish bite best at dawn and in the evening
          const eager = (hour > 5.5 && hour < 9) || (hour > 16.5 && hour < 20) ? 0.6 : 1;
          this.timer = (2.5 + Math.random() * 5.5) * eager;
          this.status("Waiting for a bite…", "Watch the float · move or press E to reel in");
        }
        break;
      }
      case "wait": {
        if (moving) return this.stop();
        this.timer -= dt;
        // the float bobs; now and then a nibble twitches it
        const nibble = Math.sin(this.t * 17) > 0.97 && this.timer < 2.5 ? 0.02 : 0;
        this.float.position.set(this.target.x, this.target.y + Math.sin(this.t * 2.2) * 0.012 - nibble, this.target.z);
        if (this.timer <= 0) {
          const s = this.d.save();
          this.bite = biteFor(s.id, s.fishing?.n ?? 0); // the same fish the server will give

          this.state = "bite";
          this.timer = FISH[this.bite.fish].fight > 0.8 ? 0.85 : 1.05;
          this.d.sound("bite");
          this.splashRing(this.target);
          this.status("Bite! Strike now!", isTouch() ? "tap the button" : "E, click or Space");
        }
        break;
      }
      case "bite": {
        this.timer -= dt;
        this.float.position.set(this.target.x, this.target.y - 0.07 + Math.sin(this.t * 30) * 0.02, this.target.z);
        if (space && !this.prevSpace) {
          this.prevSpace = space;
          return this.press();
        }
        if (this.timer <= 0) this.lose("It took the bait and swam off. Strike faster when the float dips!");
        break;
      }
      case "reel": {
        const fish = FISH[this.bite!.fish];
        const out = reelStep(this.reel, holding, dt, fish.fight, Math.random);
        const surging = isSurging(this.reel);
        // the float is dragged in towards the bank as you win line, and thrashes when it surges
        const from = tip ?? this.target;
        const k = Math.min(0.85, this.reel.progress * 0.85);
        this.float.position.lerpVectors(this.target, from, k);
        this.float.position.y = TALAV.level + 0.02 - 0.06 + (surging ? Math.sin(this.t * 40) * 0.05 : 0);
        if (surging) this.float.position.x += Math.sin(this.t * 23) * 0.08;
        if (surging && Math.random() < dt * 4) this.splashRing(this.float.position);
        this.d.farmer.action = holding ? "reel" : "fish";
        if (holding && (this.reelSfx -= dt) <= 0) {
          this.d.sound("reel");
          this.reelSfx = 0.22;
        }
        const tb = this.el.querySelector(".tension i") as HTMLElement, pb = this.el.querySelector(".progress i") as HTMLElement;
        tb.style.width = `${Math.round(this.reel.tension * 100)}%`;
        tb.parentElement!.classList.toggle("hot", this.reel.tension > 0.72);
        pb.style.width = `${Math.round(this.reel.progress * 100)}%`;
        this.el.classList.toggle("surge", surging);
        (this.el.querySelector(".fish-status") as HTMLElement).textContent = surging ? "It's pulling hard — ease off!" : holding ? "Reeling in…" : big(this.bite!.fish) ? "Something big is on!" : "Fish on!";
        if (out === "landed") this.land();
        else if (out === "snapped") {
          this.d.sound("snap");
          this.lose("Snap! The line broke — ease off when the fish surges.");
        } else if (out === "escaped") this.lose("It slipped the hook and got away.");
        break;
      }
      case "landed": {
        // hold the catch up for a moment
        this.timer -= dt;
        if (tip) {
          // it hangs nose-up under the tip, twisting and flapping its tail
          this.fishMesh.position.copy(tip).add(new THREE.Vector3(0, -0.34 * this.fishMesh.scale.y - 0.12, 0));
          this.fishMesh.rotation.set(-Math.PI / 2 + Math.sin(this.t * 13) * 0.25, this.heading + Math.sin(this.t * 3) * 0.8, 0, "YXZ");
          setLine(this.line, tip, this.fishMesh.position, 0);
        }
        if (this.timer <= 0) this.stop();
        break;
      }
    }
    this.prevSpace = space;
    if (tip && this.state !== "landed" && this.state !== "cast") setLine(this.line, tip, this.float.position, this.state === "reel" ? 0.02 : 0.3);
    this.line.visible = true;
  }

  debug() {
    const tip = this.d.farmer.rodTip(new THREE.Vector3());
    return { state: this.state, fish: this.fishMesh.visible ? this.fishMesh.position.toArray().map((v) => +v.toFixed(2)) : null, tip: tip?.toArray().map((v) => +v.toFixed(2)) ?? null, float: this.float.visible ? this.float.position.toArray().map((v) => +v.toFixed(2)) : null };
  }

  private splashRing(p: THREE.Vector3) {
    this.ring.position.set(p.x, TALAV.level + 0.03, p.z);
    this.ring.scale.setScalar(1);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.7;
  }

  private land() {
    const r = this.d.act({ t: "fish", got: true });
    if (!r.ok) {
      this.d.toast(r.error, "bad");
      return this.stop();
    }
    const f = FISH[this.bite!.fish];
    this.d.toast(`Caught a ${this.bite!.kg} kg ${f.name} · ${f.local} — ${f.note}`);
    this.d.sound("splash");
    this.d.sound("cash");
    this.state = "landed";
    this.timer = 1.6;
    this.float.visible = false;
    this.fishMesh.visible = true;
    this.fishMesh.scale.setScalar(1 + this.bite!.kg * 0.3); // a katla is a handful; a chilapi fits in your palm
    this.el.hidden = true;
  }

  private lose(msg: string) {
    const r = this.d.act({ t: "fish", got: false });
    this.stop(r.ok ? msg : r.error);
  }
}
