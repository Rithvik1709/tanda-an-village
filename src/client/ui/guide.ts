import * as THREE from "three";
import { complete, current, deadlineAt, MISSIONS, progress } from "../../shared/missions";
import type { Action, Result } from "../../shared/rules";
import { DAY_MS } from "../../shared/time";
import { helpCard } from "./help";
import { t } from "../i18n";

/** On phones, key names in the text become the on-screen buttons. */
const TOUCH_UI = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1);
export const forDevice = (t: string) =>
  !TOUCH_UI
    ? t
    : t
        .replace(/\(press E near (him|her)\)/g, "(walk up and tap the button that appears)")
        .replace(/\bE at the\b/g, "tap the button at the")
        .replace(/\(E\)/g, "(tap the button that appears)")
        .replace(/, E\)/g, ", tap the button)")
        .replace(/load the cart with R/g, "tap Load the cart by your cart")
        .replace(/\(F near the bulls\)/g, "(tap Feed by the bulls)")
        .replace(/then F near the bulls/g, "then tap Feed near the bulls")
        .replace(/Shift \+ right-click with the hoe/g, "tap Use with the hoe, your bulls nearby")
        .replace(/press P in your field/g, "tap the Plough button in your field")
        .replace(/press E/gi, "tap the button that appears")
        .replace(/Press <kbd>H<\/kbd> any time for the controls/g, "Tap ☰ any time for help")
        // the crosshair tips and the first-steps card
        .replace(/Right-click: /g, "Tap Use: ")
        .replace(/\bright-click (the|your|tilled) /gi, "tap Use on $1 ")
        .replace(/\bleft-click (it )?to harvest/gi, "tap Harvest")
        .replace(/\bright-click(ing)?\b/gi, "tap Use")
        .replace(/\bleft-click(ing)?\b/gi, "tap Harvest")
        .replace(/Press M for the map|Press <kbd>M<\/kbd> for the map/g, "Tap Map to see where")
        .replace(/Press 2 for the hoe/g, "Pick the hoe below").replace(/press 2 for the hoe/g, "pick the hoe below")
        .replace(/press 3 for the can|\(press 3\)/g, "(pick the can below)")
        .replace(/press 4, 5 or 6 for seeds/g, "pick a seed bag below")
        .replace(/Pick the hoe \(2\)/g, "Pick the hoe below").replace(/Pick the onion seeds \(5\)/g, "Pick the onion seeds below").replace(/Pick the can \(3\)/g, "Pick the can below")
        .replace(/look at (the |ploughed )?soil and right-click/g, "look at $1soil and tap Use")
        .replace(/Hold it and walk/g, "Hold Use and walk").replace(/or hold it and walk/g, "or hold Use and walk")
        .replace(/, then press E\./g, ", then tap the button that appears.").replace(/Press E and open/g, "Tap the button and open")
        .replace(/or press M for the map/g, "or tap Map")
        .replace(/ ?<kbd>\d<\/kbd>(–<kbd>\d<\/kbd>)?/g, "")
        .replace(/press <kbd>E<\/kbd>/gi, "tap the button that appears");

const seen = (id: string) => { try { return localStorage.getItem(`tanda.mission.${id}`) === "1"; } catch { return false; } };
const markSeen = (id: string) => { try { localStorage.setItem(`tanda.mission.${id}`, "1"); } catch { /* ignore */ } };
import type { Save } from "../../shared/save";
import type { World } from "../../shared/world";

/*
 * Making the game easy to follow: a welcome card, a chain of goals (each checked from the save),
 * a golden marker in the world with an on-screen arrow and distance, and a help card (H).
 */
type Ctx = { world: World; now: number; day: number; onOwnLand: boolean; me?: { x: number; z: number } };
type Where = { x: number; y: number; z: number; label: string };

/** Where each objective happens, for the golden marker. */
function whereFor(mission: string, objective: string, c: Ctx, save: Save): Where | null {
  const L = c.world.landmarks;
  const at = (p: { x: number; z: number }, label: string, dx = 0.5, dz = 0.5): Where => ({ x: p.x + dx, y: 17, z: p.z + dz, label });
  const field = () => {
    const p = c.world.plots.find((q) => q.starter)!;
    return { x: (p.x0 + p.x1) / 2, y: p.y + 1, z: (p.z0 + p.z1) / 2, label: "Aamrai, your field" };
  };
  const key = `${mission}:${objective}`;
  switch (key) {
    case "homecoming:talk": return at({ x: L.landOffice.x + 3, z: L.landOffice.z }, "Naik Dhavlu");
    case "homecoming:visit": case "homecoming:till": case "firstcrop:harvest": return field();
    case "firstcrop:prices": case "firstcrop:sell": return at({ x: L.trader.x, z: L.trader.z - 1 }, "Ganpat's stall");
    case "water:vihir": return at({ x: L.ghat.x, z: L.ghat.z - 2 }, "The vihir");
    case "water:water": return field();
    case "order:deliver": return save.inv.jowar >= 20 ? at({ x: L.seedShop.x, z: L.seedShop.z - 1 }, "Sitabai's stall") : field();
    case "bulls:buy": return at({ x: L.seedShop.x, z: L.seedShop.z - 1 }, "Sitabai's stall");
    case "teej:offerJ": case "teej:offerO": case "teej:night": return at({ x: L.temple.x, z: L.temple.z - 1 }, "Sevalal mandir");
    case "land:buy": return at({ x: L.landOffice.x + 3, z: L.landOffice.z }, "Naik's kacheri");
    case "pola:paint": return save.inv.gerua ? null : at({ x: L.seedShop.x, z: L.seedShop.z - 1 }, "Sitabai (gerua)");
    case "pola:procession": { const ch = c.world.chowk; return { x: (ch.x0 + ch.x1) / 2, y: 17, z: (ch.z0 + ch.z1) / 2, label: "The chowk" }; }
    case "debt:choose": return at({ x: 99.5, z: 124 }, "Ramu kaka");
    case "election:kamla": return at({ x: L.school.x - 1.5, z: L.school.z - 7.5 }, "Kamlabai Jadhav", 0, 0);
    case "election:shankar": return at({ x: L.school.x - 1.5, z: L.school.z + 7.5 }, "Shankar Pawar", 0, 0);
    case "election:sabha": case "election:choose": case "election:vote": return at(L.school, "Z.P. school", 0, 0);
  }
  return null;
}

export class Guide {
  private card: HTMLElement;
  private arrow: HTMLElement;
  private help: HTMLElement;
  private welcome: HTMLElement | null = null;
  private marker: THREE.Group;
  private beam: THREE.Mesh;
  private target: { x: number; y: number; z: number; label: string } | null = null;
  private shownFor = "";
  private choiceAsked = "";
  private claiming = "";
  /** A place picked on the map: the marker and the arrow guide you there instead, until you arrive. */
  waypoint: { x: number; y: number; z: number; label: string } | null = null;
  /** Set by the game when you're standing near the person who asks you to choose. */
  nearChoice = false;
  onToast: (m: string, k: "ok" | "bad") => void = () => {};
  private cardHtml = "";
  helpOpen = false;
  onGoalDone: (title: string) => void = () => {};

  constructor(parent: HTMLElement, scene: THREE.Scene, private groundAt: (x: number, z: number) => number) {
    this.card = el("div", "goal", parent);
    // on phones the card folds to one line; a tap opens it
    this.card.addEventListener("click", () => this.card.classList.toggle("open"));
    this.arrow = el("div", "goal-arrow", parent);
    this.arrow.hidden = true;
    this.help = el("div", "panel help", parent);
    this.help.hidden = true;
    this.help.innerHTML = helpCard();
    this.help.addEventListener("click", (e) => (e.target as HTMLElement).closest("[data-close]") && this.toggleHelp(false));
    // the world marker: a soft pillar of light with a turning diamond on top
    this.marker = new THREE.Group();
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying vec2 vUv; void main(){ float a = (1.0 - vUv.y * 0.8) * 0.6 * (0.8 + 0.2 * sin(uTime * 3.0)); gl_FragColor = vec4(1.6, 1.2, 0.5, a); }`,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 14, 16, 1, true), beamMat);
    this.beam.renderOrder = 5;
    this.beam.frustumCulled = false;
    this.beam.position.y = 7;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: "#ffd060", toneMapped: false }));
    gem.position.y = 3;
    gem.name = "gem";
    // a glowing ring on the ground where you should stand
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: "#ffd060", transparent: true, opacity: 0.8, toneMapped: false, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    this.marker.add(ring);
    this.marker.add(this.beam, gem);
    this.marker.visible = false;
    scene.add(this.marker);
  }

  /** The first-time story card. Resolves when the player is ready. */
  showWelcome(parent: HTMLElement, onGo: () => void) {
    try {
      if (localStorage.getItem("tanda.welcomed")) return false;
    } catch {
      /* ignore */
    }
    this.welcome = el("div", "panel welcome", parent);
    this.welcome.innerHTML = `<div class="panel-card"><h2>Ram Ram! Welcome home to Ukhali Tanda</h2>
      <p>Dada's field, <b>Aamrai</b>, is waiting for you. The card at the top left and the golden marker will show you each step.</p>
      <div class="big-acts"><button data-go>Let's farm</button></div></div>`;
    this.welcome.querySelector("[data-go]")!.addEventListener("click", () => {
      try {
        localStorage.setItem("tanda.welcomed", "1");
      } catch {
        /* ignore */
      }
      this.welcome?.remove();
      this.welcome = null;
      onGo();
    });
    return true;
  }

  toggleHelp(on = !this.helpOpen) {
    this.helpOpen = on;
    this.help.hidden = !on;
  }

  /** Show a story card: the mission's opening, its closing line, or a choice. */
  dialogue(who: string, title: string, text: string, buttons: { label: string; sub?: string; onClick: () => void }[]) {
    this.dlg?.remove();
    const d = el("div", "panel dialogue", this.card.parentElement!);
    this.dlg = d;
    const touch = document.body.classList.contains("is-touch");
    const foot = touch ? "" : buttons.length === 1 ? t("E or Enter to continue") : t("Press 1–{n} to choose", { n: buttons.length });
    d.innerHTML = `<div class="panel-card"><div class="dlg-who">${who}</div><h2>${title}</h2><p class="dlg-text">“${text}”</p><div class="big-acts"></div>${foot ? `<div class="panel-foot">${foot}</div>` : ""}</div>`;
    const acts = d.querySelector(".big-acts")!;
    // E, Enter or Space picks the only button; 1, 2, 3… pick one of several. A key still held from
    // opening the card (or repeating) doesn't count.
    const opened = performance.now();
    const onKey = (e: KeyboardEvent) => {
      if (!d.isConnected) return window.removeEventListener("keydown", onKey, true);
      if (e.repeat || performance.now() - opened < 250) return;
      const btns = [...acts.querySelectorAll("button")] as HTMLButtonElement[];
      const pick = buttons.length === 1 && (e.code === "Enter" || e.code === "Space" || e.code === "KeyE") ? 0 : /^Digit[1-9]$/.test(e.code) ? Number(e.code.slice(5)) - 1 : -1;
      if (pick < 0 || !btns[pick]) return;
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener("keydown", onKey, true);
      btns[pick].click();
    };
    window.addEventListener("keydown", onKey, true);
    for (const b of buttons) {
      const btn = document.createElement("button");
      btn.innerHTML = (buttons.length > 1 ? `<kbd class="dlg-n">${acts.children.length + 1}</kbd>` : "") + b.label + (b.sub ? `<small>${b.sub}</small>` : "");
      btn.addEventListener("click", () => {
        d.remove();
        this.dlg = null;
        b.onClick();
      });
      acts.appendChild(btn);
    }
    this.onDialogue(true);
  }
  private dlg: HTMLElement | null = null;
  onDialogue: (open: boolean) => void = () => {};
  /** Send an action; the guide calls this to claim rewards and make choices. */
  act: (a: Action) => Result = () => ({ ok: false, error: "offline" });
  get dialogueOpen() {
    return !!this.dlg;
  }

  update(save: Save, c: Ctx, camera: THREE.Camera, t: number, hidden: boolean) {
    const m = current(save);
    const mc = { world: c.world, now: c.now };
    // a new mission: show its story once
    if (m && !hidden && !this.dlg && this.shownFor !== m.id) {
      this.shownFor = m.id;
      if (!seen(m.id)) {
        markSeen(m.id);
        this.dialogue(`${m.who} · Mission ${save.missions.i + 1} of ${MISSIONS.length}`, `${m.title} <small>${m.local}</small>`, m.story, [{ label: "Let's do it", onClick: () => this.onDialogue(false) }]);
      }
    }
    // a choice to make
    if (m?.choices && !save.missions.choice && !hidden && !this.dlg && this.choiceAsked !== m.id && this.nearChoice) {
      this.choiceAsked = m.id;
      this.dialogue(m.who, m.title, m.story, m.choices.map((ch) => ({ label: ch.label, sub: ch.effect, onClick: () => { this.onDialogue(false); const r = this.act({ t: "choose", option: ch.id }); if (!r.ok) { this.choiceAsked = ""; this.onToast(r.error, "bad"); } else this.onToast(r.msg ?? "", "ok"); } })));
    }
    // done: claim the reward and hear the closing line
    if (m && complete(save, mc) && !this.dlg && !hidden && this.claiming !== m.id) {
      this.claiming = m.id;
      const r = this.act({ t: "claimMission" }) as Result & { line?: string };
      if (r.ok) {
        this.onGoalDone(m.title);
        const line = (r as { line?: string }).line ?? m.done;
        this.dialogue(`Mission complete · ${m.who}`, `${m.title} ✓`, line, [{ label: m.choices ? "Continue" : `Collect: ${m.reward.text}`, onClick: () => this.onDialogue(false) }]);
      } else this.claiming = "";
    }
    this.card.hidden = hidden;
    let html: string;
    if (!m) {
      html = `<div class="goal-head">The story is complete</div><b>Pola champion of Ukhali Tanda!</b><span>Keep farming, buy land and aim for Zamindar.</span>`;
      this.target = null;
    } else {
      const ps = progress(save, mc);
      const next = ps.find((o) => o.got < o.need);
      const dl = deadlineAt(save);
      const left = dl ? Math.max(0, (dl - c.now) / DAY_MS) : null;
      const deadline = left !== null ? `<div class="goal-deadline">⏳ ${left >= 1 ? `${Math.floor(left)} day${Math.floor(left) === 1 ? "" : "s"} ${Math.round((left % 1) * 24)} h` : `${Math.round(left * 24)} hours`} left</div>` : "";
      const missed = save.missions.flags.missed && m.deadlineDays ? `<div class="goal-missed">You missed the last deadline — here's another chance.</div>` : "";
      html = `<div class="goal-head">Mission ${save.missions.i + 1} of ${MISSIONS.length} · ${m.who}</div><b>${m.title} <small>${m.local}</small></b>${deadline}${missed}
        <ul class="objectives">${ps.map((o) => `<li class="${o.got >= o.need ? "done" : o === next ? "now" : ""}"><i>${o.got >= o.need ? "✓" : ""}</i><span>${forDevice(o.text)}${o === next && o.how ? `<small class="how">${forDevice(o.how)}</small>` : ""}</span>${o.need > 1 ? ` <em>${o.got}/${o.need}</em>` : ""}</li>`).join("")}</ul>
        <small>Reward: ${m.reward.text} · <kbd>H</kbd> controls</small>`;
      this.target = next ? whereFor(m.id, next.id, c, save) : null;
    }
    if (html !== this.cardHtml) this.card.innerHTML = this.cardHtml = html;
    // the marker and the edge-of-screen arrow
    // a waypoint you set on the map wins over the story's marker until you reach it
    const me = c.me ?? camera.position;
    if (this.waypoint && Math.hypot(this.waypoint.x - me.x, this.waypoint.z - me.z) < 3.5) {
      this.onToast(`You're at ${this.waypoint.label.replace(/^📍 /, "")}`, "ok");
      this.waypoint = null;
    }
    const tg = this.waypoint ?? this.target;
    this.marker.visible = !!tg && !hidden;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    if (!tg || hidden) {
      this.arrow.hidden = true;
      return;
    }
    this.marker.position.set(tg.x, this.groundAt(tg.x, tg.z), tg.z);
    const gem = this.marker.getObjectByName("gem")!;
    gem.rotation.y = t * 1.5;
    gem.position.y = 3 + (document.documentElement.classList.contains("reduce-motion") ? 0 : Math.sin(t * 2) * 0.25);
    const p = new THREE.Vector3(tg.x, tg.y + 2, tg.z);
    const dist = p.distanceTo(camera.position);
    const v = p.clone().project(camera);
    const behind = v.z > 1;
    const onScreen = !behind && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.85;
    this.arrow.hidden = false;
    let x = v.x, y = v.y;
    if (behind) {
      x = -x;
      y = -Math.abs(y) - 0.5;
    }
    if (!onScreen) {
      const k = 0.88 / Math.max(Math.abs(x), Math.abs(y) / 0.9);
      x *= k;
      y *= k;
    }
    const ang = Math.atan2(-y, x);
    // never on top of the goal card, or under a thumb on a phone
    const box = this.arrow.parentElement!.getBoundingClientRect();
    let ax = (x * 0.5 + 0.5) * box.width, ay = (-y * 0.5 + 0.5) * box.height;
    // (the arrow is centred on its point, so test its whole box, from its size last frame)
    const hw = (this.arrow.offsetWidth || 120) / 2 + 4, hh = (this.arrow.offsetHeight || 26) / 2 + 4;
    for (const sel of [".goal", ".touch:not([hidden]) .t-stick", ".touch:not([hidden]) .t-use", ".touch:not([hidden]) .t-pad", ".touch:not([hidden]) .t-jump"]) {
      const o = document.querySelector(sel)?.getBoundingClientRect();
      if (!o || !o.width) continue;
      const l = o.left - box.left, r = o.right - box.left, t = o.top - box.top, b = o.bottom - box.top;
      if (ax + hw > l && ax - hw < r && ay + hh > t && ay - hh < b) ay = t > box.height / 2 ? t - hh : b + hh;
    }
    this.arrow.style.left = `${(ax / box.width) * 100}%`;
    this.arrow.style.top = `${(ay / box.height) * 100}%`;
    this.arrow.classList.toggle("edge", !onScreen);
    const ah = `${onScreen ? "" : `<i style="transform:rotate(${ang}rad)">➤</i>`}<span>${tg.label} · ${Math.round(dist)} m</span>`;
    if (ah !== this.arrow.innerHTML) this.arrow.innerHTML = ah;
    // don't nag once you're there
    if (dist < 4) this.arrow.hidden = true;
  }
}

function el(tag: string, cls: string, parent: HTMLElement) {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}
