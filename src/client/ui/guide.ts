import * as THREE from "three";
import { netWorth, titleFor } from "../../shared/bank";
import type { Save } from "../../shared/save";
import type { World } from "../../shared/world";

/*
 * Making the game easy to follow: a welcome card, a chain of goals (each checked from the save),
 * a golden marker in the world with an on-screen arrow and distance, and a help card (H).
 */
type Goal = {
  id: string;
  title: string;
  how: string; // what to press, in plain words
  done: (s: Save, c: Ctx) => boolean;
  progress?: (s: Save, c: Ctx) => string;
  where?: (c: Ctx) => { x: number; y: number; z: number; label: string } | null;
};
type Ctx = { world: World; now: number; day: number; onOwnLand: boolean };

const cells = (s: Save) => Object.values(s.farm);
const GOALS: Goal[] = [
  {
    id: "field", title: "Walk to your field, Aamrai", how: "Follow the golden marker. <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> to walk, mouse to look, <kbd>Shift</kbd> to run.",
    done: (s, c) => c.onOwnLand || cells(s).length > 0,
    where: (c) => { const p = c.world.plots.find((q) => q.starter)!; return { x: p.gate!.x + 0.5, y: p.y + 1, z: p.gate!.z + 0.5, label: "Your field" }; },
  },
  {
    id: "till", title: "Plough 6 patches of soil", how: "Press <kbd>2</kbd> for the hoe, look at the soil, <b>right-click</b>.",
    done: (s) => cells(s).length >= 6, progress: (s) => `${Math.min(6, cells(s).length)} / 6`,
    where: (c) => { const p = c.world.plots.find((q) => q.starter)!; return { x: (p.x0 + p.x1) / 2, y: p.y + 1, z: (p.z0 + p.z1) / 2, label: "Your field" }; },
  },
  {
    id: "sow", title: "Sow seeds in the ploughed soil", how: "Press <kbd>4</kbd> jowar, <kbd>5</kbd> onion or <kbd>6</kbd> sugarcane, <b>right-click</b> ploughed soil. Onion is quickest.",
    done: (s) => cells(s).filter((c) => c.plant).length >= 6 || s.stats.harvested > 0, progress: (s) => `${Math.min(6, cells(s).filter((c) => c.plant).length)} / 6`,
  },
  {
    id: "water", title: "Fetch water and water your crops", how: "Press <kbd>3</kbd> for the can. Right-click the well (marker) to fill it, then right-click your sown soil. Watered crops grow 3× faster.",
    done: (s, c) => cells(s).some((x) => x.wetUntil > c.now) || s.stats.harvested > 0,
    where: (c) => ({ x: c.world.landmarks.well.x + 0.5, y: 17, z: c.world.landmarks.well.z - 1.5, label: "Well" }),
  },
  {
    id: "harvest", title: "Harvest when the crop is ripe", how: "Crops take a few minutes (they keep growing while you're away). Look at a ripe one: <b>left-click</b>. The text under the crosshair tells you how long is left.",
    done: (s) => s.stats.harvested > 0,
  },
  {
    id: "sell", title: "Sell your harvest to Ganpat Seth", how: "Walk to his saffron stall in the square and press <kbd>E</kbd>, then <b>Sell all</b>.",
    done: (s) => s.stats.earned > 0,
    where: (c) => ({ x: c.world.landmarks.trader.x + 0.5, y: 17, z: c.world.landmarks.trader.z - 0.5, label: "Ganpat's stall" }),
  },
  {
    id: "save", title: "Save up ₹8,000", how: "Keep planting, watering and selling. Check prices at Ganpat's (<b>Prices</b> tab) and sell when they're high. Need cash sooner? The bank lends.",
    done: (s) => s.money >= 8000 || !!s.bulls, progress: (s) => `₹${s.money.toLocaleString("en-IN")} / ₹8,000`,
  },
  {
    id: "bulls", title: "Buy Sarja & Raja, your bulls, and a cart", how: "At Sitabai's blue stall, press <kbd>E</kbd>. Bulls plough a whole row at once (<kbd>Shift</kbd> + right-click with the hoe).",
    done: (s) => !!s.bulls && !!s.inv.cart,
    where: (c) => ({ x: c.world.landmarks.seedShop.x + 0.5, y: 17, z: c.world.landmarks.seedShop.z - 0.5, label: "Sitabai's stall" }),
  },
  {
    id: "town", title: "Cart a harvest to the town mandi", how: "Stand by your cart and press <kbd>R</kbd>. The town pays about 30% more than the village.",
    done: (s) => s.ledger.some((l) => l.where === "town"),
  },
  {
    id: "land", title: "Buy a second field", how: "Visit Naik Dhavlu at his kacheri (<kbd>E</kbd>). Fields near water and the road cost more and grow better.",
    done: (s) => s.plots.length >= 2,
    where: (c) => ({ x: c.world.landmarks.landOffice.x + 3, y: 17, z: c.world.landmarks.landOffice.z + 0.5, label: "Naik's kacheri" }),
  },
  {
    id: "kisan", title: "Become a Bada Kisan", how: "Grow your net worth to ₹1,00,000: more land, better crops, smart selling.",
    done: (s, c) => titleFor(netWorth(c.world, s, c.now, c.day).total).name !== "Small farmer" && titleFor(netWorth(c.world, s, c.now, c.day).total).name !== "Kisan",
  },
];

export class Guide {
  private card: HTMLElement;
  private arrow: HTMLElement;
  private help: HTMLElement;
  private welcome: HTMLElement | null = null;
  private marker: THREE.Group;
  private beam: THREE.Mesh;
  private target: { x: number; y: number; z: number; label: string } | null = null;
  private lastGoal = "";
  private cardHtml = "";
  helpOpen = false;
  onGoalDone: (title: string) => void = () => {};

  constructor(parent: HTMLElement, scene: THREE.Scene, private groundAt: (x: number, z: number) => number) {
    this.card = el("div", "goal", parent);
    this.arrow = el("div", "goal-arrow", parent);
    this.arrow.hidden = true;
    this.help = el("div", "panel help", parent);
    this.help.hidden = true;
    this.help.innerHTML = `<div class="panel-card"><button class="x" data-close>✕</button><h2>How to play</h2>
      <p class="lede">You farm a field in Ukhali Tanda. Grow crops, sell them, and use the money for bulls, a cart and more land.</p>
      <div class="help-grid">
        <div><b>Move</b><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> jump · mouse look</span></div>
        <div><b>Pick a tool</b><span><kbd>1</kbd> hand · <kbd>2</kbd> hoe · <kbd>3</kbd> watering can · <kbd>4</kbd><kbd>5</kbd><kbd>6</kbd> seeds (or mouse wheel)</span></div>
        <div><b>Use it</b><span><b>Right-click</b> the soil: plough, sow, water · <b>Left-click</b> a ripe crop: harvest</span></div>
        <div><b>Talk &amp; trade</b><span><kbd>E</kbd> near a stall or person</span></div>
        <div><b>Bulls &amp; cart</b><span><kbd>F</kbd> feed · <kbd>R</kbd> at the cart: load and ride to the town mandi</span></div>
        <div><b>Other</b><span><kbd>M</kbd> map · <kbd>V</kbd> first/third person · <kbd>T</kbd> torch at night · <kbd>H</kbd> this help · <kbd>Esc</kbd> pause</span></div>
      </div>
      <p class="hint">The golden marker and the goal card (top left) always show what to do next. Your farm is saved online automatically.</p>
      <div class="big-acts"><button data-close>Got it</button></div></div>`;
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
      <p>You've come back to the tanda to farm <b>Aamrai</b>, your family's small field of black soil.</p>
      <ol class="steps"><li><b>Grow</b>: plough the soil, sow seeds, water them from the well.</li>
      <li><b>Sell</b>: take the harvest to Ganpat Seth in the square, or by bullock cart to the town mandi for more.</li>
      <li><b>Grow bigger</b>: buy bulls, a cart and more land, and rise from small farmer to <b>Bada Kisan</b>.</li></ol>
      <p class="hint">The <b>goal card</b> (top left) and the <b>golden marker</b> show you what to do next. Press <kbd>H</kbd> any time for the controls.</p>
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

  update(save: Save, c: Ctx, camera: THREE.Camera, t: number, hidden: boolean) {
    const i = GOALS.findIndex((g) => !g.done(save, c));
    const g = GOALS[i];
    if (this.lastGoal && g?.id !== this.lastGoal) {
      const prev = GOALS.find((x) => x.id === this.lastGoal);
      if (prev) this.onGoalDone(prev.title);
    }
    this.lastGoal = g?.id ?? "all";
    this.card.hidden = hidden;
    let html: string;
    if (!g) {
      html = `<div class="goal-head">All goals done</div><b>You're a Bada Kisan of Ukhali Tanda!</b><span>Aim for Zamindar: buy land and keep farming.</span>`;
      this.target = null;
    } else {
      const prog = g.progress?.(save, c);
      html = `<div class="goal-head">Goal ${i + 1} of ${GOALS.length}${prog ? ` · ${prog}` : ""}</div><b>${g.title}</b><span>${g.how}</span><small>Press <kbd>H</kbd> for all controls</small>`;
      this.target = g.where?.(c) ?? null;
    }
    if (html !== this.cardHtml) this.card.innerHTML = this.cardHtml = html;
    // the marker and the edge-of-screen arrow
    const tg = this.target;
    this.marker.visible = !!tg && !hidden;
    (this.beam.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
    if (!tg || hidden) {
      this.arrow.hidden = true;
      return;
    }
    this.marker.position.set(tg.x, this.groundAt(tg.x, tg.z), tg.z);
    const gem = this.marker.getObjectByName("gem")!;
    gem.rotation.y = t * 1.5;
    gem.position.y = 3 + Math.sin(t * 2) * 0.25;
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
    this.arrow.style.left = `${(x * 0.5 + 0.5) * 100}%`;
    this.arrow.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
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
