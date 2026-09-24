import * as THREE from "three";
import { inject as injectAnalytics } from "@vercel/analytics";
import { B, block, BLOCKS, isCropBlock } from "../shared/blocks";
import { advance, CROPS, msToRipe } from "../shared/crops";
import { canCapacity, isNight, type Result } from "../shared/rules";
import { newSave } from "../shared/save";
import { clock, fmtHour, SEASON_DAYS, SEASON_NAMES } from "../shared/time";
import { D, generateWorld, H, idx, W, WATER_LEVEL, WORLD_SEED } from "../shared/world";
import { buildAtlasTexture } from "./engine/atlas";
import { Sky } from "./engine/sky";
import { WorldRenderer } from "./engine/world-renderer";
import { Game } from "./game";
import { Net } from "./net";
import { Controls } from "./player/controls";
import { Hotbar } from "./player/hotbar";
import { type Box, boxHits, type Hit, MOVE, raycast } from "./player/physics";
import { Heightfield, TERRAIN } from "./scene/heightfield";
import { buildTerrain } from "./scene/terrain";
import { Water } from "./scene/water";
import { Grass } from "./scene/grass";
import { Trees } from "./scene/trees";
import { Village } from "./scene/village";
import { Fields } from "./scene/crops";
import { Post } from "./scene/post";
import { FARMER, Figure } from "./scene/figure";
import { Walker } from "./player/walker";
import { CameraRig } from "./player/camera-rig";
import { skyColors, sunDirection } from "./engine/sky";
import { Hud } from "./ui/hud";
import { Npc } from "./engine/npc";
import { type PanelKind, Panels } from "./ui/panels";
import { MapView } from "./ui/map";
import { Signs } from "./engine/signs";
import { askingPrice, forSale } from "../shared/land";
import { bullsMoodWord, bullsNow } from "../shared/bulls";
import { isOverdue, netWorth, TITLES, titleFor } from "../shared/bank";
import { Farmyard } from "./farmyard";
import { Villagers } from "./villagers";
import { FIRESIDE, Nights } from "./nights";
import { Infrastructure } from "./scene/infrastructure";
import { Nav, separate } from "./player/nav";
import { Audio, renderRms, SOUNDS } from "./audio";
import { Guide } from "./ui/guide";
import { Leaderboard } from "./ui/leaderboard";
import { PhoneMenu } from "./ui/phonemenu";
import { current } from "../shared/missions";
import { loadSettings, SettingsPanel, TitleScreen, Tutorial } from "./ui/screens";
import { isTouch, TouchControls } from "./player/touch";

type Hooks = {
  ready: boolean;
  setHour: (h: number | null) => void;
  view: (name: keyof typeof VIEWS) => void;
  stats: () => Record<string, number>;
};
declare global {
  interface Window {
    __bailgaadi: Partial<Hooks> & Record<string, unknown>;
  }
}
window.__bailgaadi = { ready: false };
// Vercel Web Analytics: page views only (no cookies, no personal data); it does nothing on localhost
injectAnalytics({ mode: import.meta.env.DEV ? "development" : "production" });

const VIEWS = {
  overview: { pos: [170, 60, 190], look: [100, 14, 108] },
  square: { pos: [112, 19, 128], look: [102, 17, 110] },
  fields: { pos: [80, 26, 96], look: [30, 15, 70] },
  river: { pos: [56, 20, 110], look: [50, 15, 100] },
  market: { pos: [30, 22, 40], look: [14, 16, 22] },
} as const;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.shadowMap.enabled = true;
renderer.info.autoReset = false; // the composer renders in passes; count a whole frame
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const TOUCH = isTouch();
// phones: fewer pixels and a smaller shadow map keep it smooth
renderer.setPixelRatio(Math.min(window.devicePixelRatio, TOUCH ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 900);
const sky = new Sky(scene);

const world = generateWorld(WORLD_SEED);
// what's drawn and collided with; world.voxels stays the pristine seeded world the rules diff against
const vox = world.voxels.slice();
const worker = new Worker(new URL("./engine/mesh.worker.ts", import.meta.url), { type: "module" });
const atlas = buildAtlasTexture();
const worldRenderer = new WorldRenderer(worker, atlas);
scene.add(worldRenderer.group);

// ---- world queries used by physics and the pick ray ----
const get = (x: number, y: number, z: number) => {
  if (y >= H) return B.AIR;
  if (y < 0 || x < 0 || z < 0 || x >= W || z >= D) return B.BEDROCK; // the map edge is a wall
  return vox[idx(x, y, z)];
};
const solidAt = (x: number, y: number, z: number) => block(get(x, y, z)).solid;
const waterAt = (x: number, y: number, z: number) => !!block(get(x, y, z)).liquid;
const pickable = (x: number, y: number, z: number) => {
  const id = get(x, y, z);
  return id !== B.AIR && !block(id).liquid;
};

// ---- the game state (local until the server arrives in M4) ----
// a placeholder until the server's save arrives (nothing is drawn or sent before that)
const game = new Game(world, vox, newSave("loading", world, Date.now()), worldRenderer);
const net = new Net();
let lastTitle = -1; // the title shown so far, for the "you are now…" toast
let booted_ = false;

// ---- the player ----
const spawn = world.landmarks.spawn;
// the ground is smooth now: a height field for walking; buildings and fences still block as solid blocks
const hf = new Heightfield(world);
const WATER_Y = WATER_LEVEL + 0.86;
scene.add(buildTerrain(hf, WATER_Y));
const water = new Water(hf, WATER_Y);
scene.add(water.mesh);
const walker = new Walker((x, z) => hf.at(x, z), (x, y, z) => { const id = get(x, y, z); return !TERRAIN.has(id) && block(id).solid; }, WATER_Y, W);
walker.pos = { x: spawn.x, y: hf.at(spawn.x, spawn.z), z: spawn.z };
const body = Object.defineProperty(walker, "inWater", { get: () => walker.wading > 0.3 }) as Walker & { readonly inWater: boolean };
// the living landscape: modelled trees, and grass wherever the ground is grassy and open
const trees = new Trees(world.trees, (x, z) => hf.at(x, z));
scene.add(trees.group);
const village = new Village(world.structures, world.plots, (x, z) => hf.at(x, z));
scene.add(village.group);
// pumps: at the vihir, and borewells by three fields (their sheds and tanks are solid)
const VH = world.landmarks.ghat; // the vihir (its landmark is the path beside it)
const PUMPS: { x: number; z: number; tankDir: [number, number] }[] = [
  { x: VH.x + 3.5, z: VH.z - 0.5, tankDir: [0, -1] },
  { x: 94.5, z: 163.5, tankDir: [1, 0] },
  { x: 56, z: 52.5, tankDir: [1, 0] },
];
for (const p of PUMPS) {
  const solid = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = Math.floor(z0); z <= Math.floor(z1); z++)
      for (let x = Math.floor(x0); x <= Math.floor(x1); x++) {
        const g = Math.floor(hf.at(x + 0.5, z + 0.5) + 0.05);
        if (!TERRAIN.has(vox[idx(x, g, z)])) vox[idx(x, g, z)] = B.BRICK;
      }
  };
  solid(p.x - 0.9, p.z - 0.9, p.x + 0.9, p.z + 0.9);
  const tx = p.x + p.tankDir[0] * 2.6, tz = p.z + p.tankDir[1] * 2.6;
  solid(tx - 0.9, tz - 0.9, tx + 0.9, tz + 0.9);
}
const grass = new Grass(
  hf,
  (x, z) => {
    // no grass under buildings, walls and fences, in plots (they're fields) or under trunks
    if (world.plotMap[x + W * z] >= 0) return true;
    const g = Math.floor(hf.at(x + 0.5, z + 0.5));
    for (let y = g; y < g + 2; y++) {
      const id = get(x, y, z);
      if (id && !TERRAIN.has(id) && block(id).solid) return true;
    }
    return false;
  },
  WATER_Y,
);
scene.add(grass.group);
const fields = new Fields();
scene.add(fields.group);
const syncFields = () => fields.sync(game.save, game.now(), (x, z) => hf.at(x, z));
const farmer = new Figure(FARMER);
scene.add(farmer.root);

// ---- night: tungsten bulbs at every door, and the farmer's hand torch (T) ----
// a fixed pool of lights follows the nearest bulbs, so the shader cost stays constant all night
const BULB_LIGHTS = Array.from({ length: 8 }, () => {
  const l = new THREE.PointLight("#ffac55", 0, 11, 1.6);
  scene.add(l);
  return l;
});
const torch = new THREE.SpotLight("#fff2d6", 0, 34, 0.42, 0.55, 1.2);
const torchAim = new THREE.Object3D();
scene.add(torch, torchAim);
torch.target = torchAim;
// the torch itself, held in the right hand: a steel body and a glowing lens
const torchModel = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 10), new THREE.MeshStandardMaterial({ color: "#8a9096", metalness: 0.7, roughness: 0.35 }));
  body.rotation.x = Math.PI / 2;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.034, 12), new THREE.MeshStandardMaterial({ color: "#fff6e0", emissive: "#fff2d0", emissiveIntensity: 6 }));
  lens.position.z = 0.111;
  torchModel.add(body, lens);
  torchModel.position.set(0.24, 0.98, 0.16);
  farmer.root.add(torchModel);
}
let torchOn = false;
let nightK = 0;
const controls = new Controls(canvas);
controls.yaw = 0.25; // face up the north road, your first field off to the left
const hotbar = new Hotbar();
const hud = new Hud(document.getElementById("ui")!, atlas.image as HTMLCanvasElement, hotbar);
let mode: "play" | "cinematic" | "title" = "title";
/*
 * The mouse: the game releases it to show a card or panel (a "soft" release), and takes it back when
 * that closes. Only when YOU press Esc does the full "Click to play" pause panel appear.
 */
let softRelease = false;
function releaseMouse() {
  if (document.pointerLockElement) softRelease = true;
  document.exitPointerLock?.();
}
function resumePlay() {
  if (titleScreen.open || mode !== "play" || switching || windowOpen()) return;
  if (TOUCH) return hud.setPlaying(true);
  const p = canvas.requestPointerLock?.() as Promise<void> | undefined;
  // browsers refuse a re-lock right after a release; then a small "click to continue" chip is enough
  if (p?.catch) p.catch(() => hud.setResume(true));
  else if (!document.pointerLockElement) setTimeout(() => !document.pointerLockElement && hud.setResume(true), 200);
}
const audio = new Audio();
const uiRoot = document.getElementById("ui")!;
uiRoot.classList.add("ui-title");
const settings = loadSettings();
controls.sensitivity = settings.sensitivity;
audio.setVolume(settings.volume);
const titleScreen = new TitleScreen(uiRoot);
const settingsPanel = new SettingsPanel(uiRoot, settings);
const tutorial = new Tutorial(uiRoot);
const guide = new Guide(uiRoot, scene, (x, z) => hf.at(x, z));
guide.act = (a) => game.act(a);
guide.onToast = (m, k) => hud.toast(m, k);
guide.onDialogue = (open) => {
  if (open) releaseMouse();
  hud.setPlaying(open || titleScreen.open);
  // closing a story card (a click, so the browser allows it) drops you straight back into play
  if (!open) resumePlay();
};
guide.onGoalDone = (title) => {
  hud.toast(`✓ Done: ${title}`);
  audio.play("cash");
};
settingsPanel.onChange = (st) => {
  controls.sensitivity = st.sensitivity;
  audio.setVolume(st.volume);
  applyRenderDistance();
};
settingsPanel.onClose = () => hud.setPlaying(titleScreen.open);
function applyRenderDistance() {
  const fog = scene.fog as THREE.Fog | null;
  if (fog) {
    fog.near = settings.renderDistance * 0.5;
    fog.far = settings.renderDistance * 1.3;
  }
}
/** Leave the title screen for the village. `lock` asks for the mouse (a real click); scripts skip it. */
function enterGame(lock: boolean) {
  if (!titleScreen.open) return;
  titleScreen.hide();
  uiRoot.classList.remove("ui-title");
  mode = "play";
  audio.unlock();
  hud.setPlaying(false);
  if (TOUCH) {
    hud.setPlaying(true); // no "click to play" on a phone
    document.documentElement.requestFullscreen?.().then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape")).catch(() => {});
    return;
  }
  if (lock) canvas.requestPointerLock?.();
}
titleScreen.onPlay = () => {
  // the first time: a short story card first, then into the village
  if (!guide.showWelcome(uiRoot, () => enterGame(true))) enterGame(true);
};
titleScreen.onSettings = () => settingsPanel.show();
const board = new Leaderboard(uiRoot, () => net.token);
board.onClose = () => (titleScreen.open ? hud.setPlaying(true) : resumePlay());
board.setName = async (n) => {
  const r = game.act({ t: "setName", name: n });
  if (!r.ok) return r.error;
  await net.flush();
  return null;
};
const showBoard = () => {
  closeWindows();
  board.show();
  hud.setPlaying(true);
  releaseMouse();
};
titleScreen.onBoard = showBoard;
const showSettings = settingsPanel.show.bind(settingsPanel);
settingsPanel.show = () => {
  closeWindows();
  showSettings();
  hud.setPlaying(true); // the pause panel steps aside
  releaseMouse();
};
/* ---------- one window at a time ----------
 * Every window the game can show is listed here. Opening one closes the others; while any is open
 * (or a story card is up) the farmer stands still, the thumb controls hide, and nothing in the
 * world reacts to taps or keys.
 */
let switching = false;
let autoSkip = false; // test hook: scripts that aren't about the story tap its cards away before acting
const STILL = { forward: 0, right: 0, jump: false, sprint: false };
const phoneMenu = new PhoneMenu(uiRoot, () => net.recoveryCode);
const WINDOWS = () => [
  { open: () => !!panels.open, close: () => panels.close() },
  { open: () => map.open, close: () => map.close() },
  { open: () => board.open, close: () => board.close() },
  { open: () => settingsPanel.open, close: () => settingsPanel.close() },
  { open: () => guide.helpOpen, close: () => guide.toggleHelp(false) },
  { open: () => phoneMenu.open, close: () => phoneMenu.close() },
];
function closeWindows() {
  switching = true;
  for (const w of WINDOWS()) if (w.open()) w.close();
  switching = false;
}
function windowOpen() {
  return WINDOWS().some((w) => w.open()) || guide.dialogueOpen || !!document.querySelector(".welcome, .fs-gate:not([hidden])");
}
phoneMenu.onPick = (what) => (what === "map" ? showMap() : what === "board" ? showBoard() : what === "help" ? controls.onHelp() : settingsPanel.show());
phoneMenu.onClose = () => resumePlay();
phoneMenu.onRestore = async (code) => {
  const err = await net.restore(code);
  if (err) return err;
  location.reload();
  return null;
};
// tapping the dark area round a window closes it (not story cards: those need their buttons)
uiRoot.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if ((t.classList.contains("panel") || t.classList.contains("mapview")) && !t.classList.contains("dialogue") && !t.classList.contains("welcome")) closeWindows();
});
// Android's back gesture closes the window instead of leaving the game
history.pushState({ tanda: 1 }, "");
window.addEventListener("popstate", () => {
  history.pushState({ tanda: 1 }, "");
  if (WINDOWS().some((w) => w.open())) closeWindows();
});

// phones and tablets: touch controls, landscape only
const touch = TOUCH ? new TouchControls(uiRoot, controls) : null;
if (touch) {
  controls.touch = touch;
  touch.onMenu = () => (phoneMenu.open ? phoneMenu.close() : (closeWindows(), phoneMenu.show()));
  document.body.classList.add("is-touch");
  // first, full screen: one tap before the title (Android can also lock landscape; iPhone can't, so the game turns itself)
  const gate = document.createElement("div");
  gate.className = "fs-gate";
  const canFullscreen = !!document.documentElement.requestFullscreen;
  gate.innerHTML = `<div class="panel-card"><div class="eyebrow">Tanda · उखळी तांडा</div><h2>Play full screen</h2>
    <p class="lede">${canFullscreen ? "Tanda is best played full screen, in landscape." : "Tip: for full screen on iPhone, tap Share → Add to Home Screen, then open Tanda from there."}</p>
    <div class="big-acts"><button data-go>▶ Tap to play</button></div></div>`;
  uiRoot.appendChild(gate);
  const goFull = () => {
    document.documentElement.requestFullscreen?.({ navigationUI: "hide" }).then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.("landscape")).catch(() => {});
    gate.hidden = true;
    setTimeout(resize, 300);
  };
  gate.querySelector("[data-go]")!.addEventListener("click", goFull);
  // leaving full screen mid-game pauses behind the same card
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && canFullscreen && !titleScreen.open) {
      gate.querySelector("h2")!.textContent = "Paused";
      gate.querySelector("[data-go]")!.textContent = "▶ Tap to continue full screen";
      gate.hidden = false;
    }
    setTimeout(resize, 300);
  });
  // tapping a hotbar slot picks it
  uiRoot.addEventListener("touchstart", (e) => {
    const slot = (e.target as HTMLElement).closest(".slot");
    if (!slot) return;
    const i = [...slot.parentElement!.children].indexOf(slot);
    controls.onSelect(i);
  });
}
let target: Hit | null = null;

const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)),
  new THREE.LineBasicMaterial({ color: 0x0d0a08, transparent: true, opacity: 0.9 }),
);
outline.visible = false;
scene.add(outline);

// ---- the village people you trade with ----
const lo = world.landmarks.landOffice; // its door, on the house's east wall
const STALLS: { kind: PanelKind; at: { x: number; y: number; z: number }; npc: Npc; label: string }[] = [
  {
    kind: "trader",
    at: { ...world.landmarks.trader, x: world.landmarks.trader.x + 0.5, z: world.landmarks.trader.z - 0.5 },
    npc: new Npc({ kurta: "#f1ead8", dhoti: "#e8e0cc", hat: "#f6f2e8" }, world.landmarks.trader.x - 0.5, world.landmarks.trader.y, world.landmarks.trader.z - 2.6, 0),
    label: "Sell to Ganpat Seth, the trader",
  },
  {
    kind: "shop",
    at: { ...world.landmarks.seedShop, x: world.landmarks.seedShop.x + 0.5, z: world.landmarks.seedShop.z - 0.5 },
    npc: new Npc({ kurta: "", dhoti: "#a8262c", hat: "#d04a2a", woman: true }, world.landmarks.seedShop.x - 0.5, world.landmarks.seedShop.y, world.landmarks.seedShop.z - 2.6, 0),
    label: "Buy seeds & tools from Sitabai",
  },
  {
    kind: "land",
    at: { x: lo.x + 3, y: lo.y, z: lo.z + 0.5 },
    npc: new Npc({ kurta: "#f4f0e4", dhoti: "#3a3a44", hat: "#f6f2e8", skin: "#9a6440" }, lo.x + 1.6, lo.y, lo.z + 0.5, Math.PI / 2),
    label: "Buy & sell land with Naik Dhavlu, the tanda's headman",
  },
  {
    kind: "kamlabai",
    at: { x: world.landmarks.school.x - 1, y: world.landmarks.school.y, z: world.landmarks.school.z - 6 },
    npc: new Npc({ kurta: "", dhoti: "#1d4ed8", hat: "#15803d", woman: true }, world.landmarks.school.x - 1.2, world.landmarks.school.y, world.landmarks.school.z - 7.2, -Math.PI / 2),
    label: "Hear Kamlabai Jadhav, candidate for sarpanch",
  },
  {
    kind: "shankar",
    at: { x: world.landmarks.school.x - 1, y: world.landmarks.school.y, z: world.landmarks.school.z + 6.5 },
    npc: new Npc({ kurta: "#f6f2e8", dhoti: "#f0ead8", hat: "#f6f2e8", skin: "#a8704a" }, world.landmarks.school.x - 1.2, world.landmarks.school.y, world.landmarks.school.z + 7.6, -Math.PI / 2),
    label: "Hear Shankar Pawar, candidate for sarpanch",
  },
  {
    kind: "mandir",
    at: { x: world.landmarks.temple.x + 0.5, y: world.landmarks.temple.y, z: world.landmarks.temple.z - 0.5 },
    npc: new Npc({ kurta: "#f4f0e4", dhoti: "#f0ead8", hat: "#f6f4ec", hatTall: true, skin: "#8f5a3a" }, world.landmarks.temple.x + 2.2, world.landmarks.temple.y, world.landmarks.temple.z - 1, Math.PI),
    label: "Visit the Sevalal Maharaj mandir",
  },
  {
    kind: "bank",
    at: { x: world.landmarks.bank.x + 0.5, y: world.landmarks.bank.y, z: world.landmarks.bank.z - 0.3 },
    npc: new Npc({ kurta: "#dfe6ee", dhoti: "#3a3a44", hat: "#2a2a30", skin: "#b07a52" }, world.landmarks.bank.x + 0.5, world.landmarks.bank.y, world.landmarks.bank.z + 1.3, Math.PI),
    label: "Loans & the godown at the Sahakari Bank",
  },
  {
    kind: "sahukar",
    at: { x: 102.5, y: hf.at(102.5, 124.5), z: 124.5 },
    npc: new Npc({ kurta: "#f2e6c8", dhoti: "#f6f0e0", hat: "#c0392b", hatTall: true, skin: "#b07a52" }, 108.5, hf.at(102.5, 126.3), 126.3, Math.PI),
    label: "Borrow from Sahukar Motilal (fast, but dear)",
  },
  {
    kind: "town",
    at: { x: world.landmarks.market.x + 1.5, y: world.landmarks.market.y, z: world.landmarks.market.z },
    npc: new Npc({ kurta: "#e8d8a8", dhoti: "#f0ead8", hat: "#c0392b", hatTall: true, skin: "#9a6440" }, world.landmarks.market.x - 1.5, world.landmarks.market.y, world.landmarks.market.z, Math.PI / 2),
    label: "Talk to Haribhau at the town mandi",
  },
];
for (const s of STALLS) scene.add(s.npc.group);
// the candidates only stand at the school during the election; campaign posters go up with them
const campaign = new THREE.Group();
scene.add(campaign);
{
  const poster = (lines: string[], bg: string, symbol: string, x: number, z: number, rot: number) => {
    const c = document.createElement("canvas");
    c.width = 384;
    c.height = 512;
    const g = c.getContext("2d")!;
    g.fillStyle = bg;
    g.fillRect(0, 0, 384, 512);
    g.fillStyle = "#fff8e6";
    g.fillRect(16, 16, 352, 480);
    g.fillStyle = bg;
    g.textAlign = "center";
    g.font = "120px system-ui";
    g.fillText(symbol, 192, 190);
    lines.forEach((l, i) => {
      g.font = i === 0 ? "800 46px 'Noto Sans Devanagari', system-ui" : "700 30px system-ui";
      g.fillText(l, 192, 290 + i * 56);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    // printed on both faces, so it reads from either side
    const m = new THREE.Group();
    for (const flip of [0, Math.PI]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.6), new THREE.MeshStandardMaterial({ map: tex }));
      face.rotation.y = flip;
      face.position.z = flip ? -0.01 : 0.01;
      m.add(face);
    }
    m.position.set(x, hf.at(x, z) + 2.2, z);
    m.rotation.y = rot;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.2, 0.08), new THREE.MeshStandardMaterial({ color: "#5a4636" }));
    post.position.set(x, hf.at(x, z) + 1.1, z - 0.05);
    campaign.add(m, post);
  };
  const sc = world.landmarks.school;
  poster(["कमलाबाई जाधव", "Kamlabai Jadhav", "for Sarpanch"], "#15803d", "🚰", sc.x - 2.6, sc.z - 8.6, -Math.PI / 2);
  poster(["शंकर पवार", "Shankar Pawar", "for Sarpanch"], "#b45309", "🛣️", sc.x - 2.6, sc.z + 9, -Math.PI / 2);
  poster(["मतदान केंद्र", "Polling Booth", "Z.P. School"], "#1d4ed8", "🗳️", sc.x - 1.6, sc.z + 1.6, -Math.PI / 2);
}
// the people of the tanda going about their day (not traders — just neighbours)
const WL = world.landmarks.well;
const NEIGHBOURS = [
  new Npc({ kurta: "", dhoti: "#1f4fa0", hat: "#c0392b", woman: true }, WL.x - 1.5, hf.at(WL.x - 1.5, WL.z), WL.z, 0.6), // at the well
  new Npc({ kurta: "", dhoti: "#7a1f4a", hat: "#e8a030", woman: true }, WL.x + 1.8, hf.at(WL.x + 1.8, WL.z - 1), WL.z - 1, -2.2),
  new Npc({ kurta: "", dhoti: "#1b6a3a", hat: "#8a2a8a", woman: true }, world.landmarks.temple.x - 2, hf.at(world.landmarks.temple.x - 2, world.landmarks.temple.z + 1), world.landmarks.temple.z + 1, 3.0), // at Sevalal's shrine
  new Npc({ kurta: "#f1ead9", dhoti: "#e9e1cd", hat: "#f2f2ee", hatTall: true }, 99.5, hf.at(99.5, 124), 124, 1.2), // under the banyan
];
for (const n of NEIGHBOURS) scene.add(n.group);
const infra = new Infrastructure((x, z) => hf.at(x, z), (x, z) => world.plotMap[Math.floor(x) + W * Math.floor(z)] >= 0 || !!block(get(Math.floor(x), Math.floor(hf.at(x, z) + 0.05), Math.floor(z))).solid, PUMPS);
scene.add(infra.group);
for (const p of infra.poleSpots) {
  const x = Math.floor(p.x), z = Math.floor(p.z), g = Math.floor(hf.at(p.x, p.z) + 0.05);
  for (let k = 0; k < 3; k++) if (vox[idx(x, g + k, z)] === B.AIR) vox[idx(x, g + k, z)] = B.LOG;
}
const nav = new Nav(vox, (x, z) => hf.at(x, z));
const villagers = new Villagers(world, (x, z) => hf.at(x, z), nav);
const nights = new Nights(world, (x, z) => hf.at(x, z));
scene.add(nights.group);
// stall keepers and the neighbours by the well stand still; everyone else keeps clear of them
const fixedBodies = [...STALLS.map((s) => s.npc), ...NEIGHBOURS].map((n) => ({ pos: { x: n.group.position.x, z: n.group.position.z }, r: 0.34, fixed: true }));
const playerBody = { pos: { x: 0, z: 0 }, r: 0.32 };
scene.add(villagers.group);
const panels = new Panels(document.getElementById("ui")!, {
  save: () => game.save,
  now: () => game.now(),
  act: (a) => {
    const r = game.act(a);
    if (r.ok) sfxQueue.push(a.t === "sell" ? "cash" : "buy");
    return r;
  },
  toast: (m, k) => hud.toast(m, k),
  world,
  showMap: () => showMap(),
  ride: (dest) => startRide(dest),
  onTab: (tab) => {
    if (tab === "prices" && current(game.save)?.id === "firstcrop") game.act({ t: "visit", place: "prices" });
  },
});
panels.onClose = () => resumePlay();

// ---- the map (M) and the for-sale boards at plot gates ----
const map = new MapView(document.getElementById("ui")!, world);
map.onClose = () => (panels.open ? hud.setPlaying(true) : resumePlay());
function showMap() {
  closeWindows();
  map.show(game.save, clock(game.now()).day, { x: body.pos.x, z: body.pos.z, yaw: controls.yaw });
  hud.setPlaying(true);
  releaseMouse();
}
const signs = new Signs();
scene.add(signs.group);
function refreshSigns() {
  const day = clock(game.now()).day;
  const want = new Map<number, { lines: string[]; color: string }>();
  for (const p of world.plots) {
    const listing = game.save.listings[p.id];
    if (listing) want.set(p.id, { lines: ["Listed · विक्री", p.name, `₹${listing.price.toLocaleString("en-IN")}`], color: "#2c5fa0" });
    else if (!game.save.plots.includes(p.id) && forSale(p, day)) want.set(p.id, { lines: ["FOR SALE · विक्री", p.name, `₹${askingPrice(p, day).toLocaleString("en-IN")}`], color: "#b0452a" });
  }
  signs.set(world.plots, want);
}

// ---- Sarja & Raja, and the bailgaadi ----
const farmyard = new Farmyard(vox, world.plots.find((p) => p.starter)!, (x, z) => hf.at(x, z), world.landmarks.market);
scene.add(farmyard.group);
let rideHeading = 0;
function startRide(dest: "town" | "home") {
  if (!farmyard.startRide(dest)) return hud.toast("The bulls can't find a road from here.", "bad");
  rideHeading = farmyard.pos.heading;
  controls.yaw = farmyard.pos.heading + Math.PI;
  controls.pitch = -0.08;
  hud.setPlaying(true);
  hud.toast(dest === "town" ? "Off to the town mandi…" : "Heading home…");
  sfxQueue.push("bells");
}
farmyard.onArrive = (dest) => {
  // step down beside the cart
  const h = farmyard.cartAt.heading;
  const x = farmyard.cartAt.x + Math.cos(h) * 1.6, z = farmyard.cartAt.z - Math.sin(h) * 1.6;
  Object.assign(body.pos, { x, y: hf.at(x, z), z });
  Object.assign(body.vel, { x: 0, y: 0, z: 0 });
  hud.setPlaying(false);
  // turn to whoever you came to see
  const look = dest === "town" ? { x: world.landmarks.market.x - 1.5, z: world.landmarks.market.z } : { x: farmyard.pos.x, z: farmyard.pos.z };
  controls.yaw = Math.atan2(-(look.x - x), -(look.z - z));
  controls.pitch = -0.1;
  if (dest === "town") openStall("town");
  else hud.toast("Home again. Sarja and Raja deserve some kadba.");
};
const nearCart = () => game.save.inv.cart && !farmyard.ride && farmyard.distTo(body.pos, farmyard.cartAt.x, farmyard.cartAt.z) < 3.6;
const nearBulls = () => game.save.bulls && !farmyard.ride && farmyard.distTo(body.pos, farmyard.pos.x, farmyard.pos.z) < 4.5;
const cartInTown = () => farmyard.distTo(farmyard.cartAt, farmyard.town.x, farmyard.town.z) < 3;
function cartAction() {
  if (!nearCart()) return false;
  if (game.save.trip) cartInTown() ? openStall("town") : startRide("town");
  else if (cartInTown()) startRide("home");
  else if (!game.save.bulls) hud.toast("A cart needs bulls — Sitabai sells a Khillari pair.", "bad");
  else openStall("cart");
  return true;
}
function feedBulls() {
  if (!nearBulls()) return;
  if (game.save.inv.gerua && current(game.save)?.id === "pola" && !game.save.missions.flags.decorated) {
    const d = game.act({ t: "decorate" });
    hud.toast(d.ok ? (d.msg ?? "") : d.error, d.ok ? "ok" : "bad");
    return;
  }
  const r = game.act({ t: "feed" });
  hud.toast(r.ok ? (r.msg ?? "Fed") : r.error, r.ok ? "ok" : "bad");
}
function cartHint(): string {
  if (nearCart()) {
    if (game.save.trip) return cartInTown() ? "<kbd>R</kbd> Sell the load at the mandi" : "<kbd>R</kbd> Continue to the town mandi";
    return cartInTown() ? "<kbd>R</kbd> Ride home" : "<kbd>R</kbd> Load the cart for the town mandi";
  }
  if (polaHere()) return "<kbd>E</kbd> Lead Sarja & Raja in the Pola procession";
  if (isNight(nowHour()) && nearHome()) return "<kbd>E</kbd> Go home and sleep till morning";
  if (Nights.evening(nowHour()) && nearFire()) return "<kbd>E</kbd> Sit with your friends by the fire";
  if (schoolHere()) {
    const ms = game.save.missions;
    const sabha = (ms.c["visit:gramsabha"] ?? 0) > (ms.base["visit:gramsabha"] ?? 0);
    return !sabha ? "<kbd>E</kbd> Join the gram sabha" : !ms.choice ? "Decide whom you back…" : "<kbd>E</kbd> Vote at the polling booth";
  }
  if (nearBulls() && game.save.inv.gerua && current(game.save)?.id === "pola" && !game.save.missions.flags.decorated) return "<kbd>F</kbd> Paint Sarja & Raja's horns with gerua";
  if (nearBulls()) return `<kbd>F</kbd> Feed Sarja & Raja (${game.save.inv.fodder ?? 0} kadba)`;
  return "";
}
function bullsChip(): string {
  if (!game.save.bulls) return "";
  const b = bullsNow(game.save.bulls, game.now());
  const trip = game.save.trip ? " · 🛞 loaded" : "";
  return `🐂 <b>Sarja & Raja</b> <span>stamina ${Math.round(b.stamina)}</span> <span>${bullsMoodWord(b.mood)}</span>${trip}`;
}

/** A small toast when you walk onto a different plot. */
let lastPlot = -2;
function checkPlotEntry() {
  const id = world.plotMap[Math.floor(body.pos.x) + W * Math.floor(body.pos.z)] ?? -1;
  if (id === lastPlot) return;
  const first = lastPlot === -2;
  lastPlot = id;
  if (id < 0 || first) return;
  const p = world.plots[id];
  const day = clock(game.now()).day;
  const mine = game.save.plots.includes(id);
  if (world.plots[id].starter && current(game.save)?.id === "homecoming") game.act({ t: "visit", place: "aamrai" });
  hud.toast(mine ? `${p.name} · your land` : forSale(p, day) ? `${p.name} · for sale, ₹${askingPrice(p, day).toLocaleString("en-IN")}` : `${p.name} · a neighbour's field`);
}

/** The stall the player is standing at, if any (within a few steps of its counter). */
function nearStall() {
  // the nearest one wins (the Naik's door and Ganpat's stall are neighbours on the chowk)
  let best: (typeof STALLS)[number] | undefined, bd = 3.4;
  for (const s of STALLS) {
    if ((s.kind === "kamlabai" || s.kind === "shankar") && current(game.save)?.id !== "election") continue;
    const d = Math.hypot(body.pos.x - s.at.x, body.pos.z - s.at.z);
    if (d < bd && Math.abs(body.pos.y - s.at.y) < 2) {
      bd = d;
      best = s;
    }
  }
  return best;
}
const TALK: Partial<Record<PanelKind, string>> = { land: "naik", trader: "ganpat", shop: "sitabai", sahukar: "motilal", town: "haribhau", bank: "joshi", kamlabai: "kamlabai", shankar: "shankar" };
function openStall(kind: PanelKind, tab?: string) {
  const who = TALK[kind];
  if (who && booted_) game.act({ t: "talk", npc: who });
  closeWindows();
  panels.show(kind, tab);
  hud.setPlaying(true); // hide the click-to-play panel under it
  hud.setHint("");
  releaseMouse();
}

/** The watering can can aim at water (to fill up); everything else looks through it. */
const pickWater = (x: number, y: number, z: number) => get(x, y, z) !== B.AIR;

let ploughNext = false; // test hook: the next hoe use ploughs as if Shift were held
/** Plants are slimmer than their cell, so you can aim past a row of crops at the one behind. */
const PLANT_H = [0.35, 0.6, 0.85, 1];
const plantBox = (x: number, y: number, z: number): Box | null => {
  const id = get(x, y, z);
  if (block(id).shape !== "cross") return null;
  const h = isCropBlock(id) ? PLANT_H[(id - B.JOWAR_0) % 4] : 0.7;
  return [0.2, 0, 0.2, 0.8, h, 0.8];
};

type Outcome = Result | null;
function report(r: Outcome, sfx: string): Outcome {
  if (!r) return r;
  if (r.ok) {
    sfxQueue.push(sfx);
    if (r.msg) hud.toast(r.msg);
  } else hud.toast(r.error, "bad");
  return r;
}

/** Left click: harvest a crop (an unripe one just says how far along it is), otherwise dig. */
function useLeft(): Outcome {
  if (!target) return null;
  const { x, y, z } = target;
  if (block(get(x, y, z)).liquid) return null;
  if (isCropBlock(get(x, y, z))) return report(game.act({ t: "harvest", x, y: y - 1, z }), "harvest");
  return null; // real farming: the land isn't dug up block by block
}

/** Right click: use whatever is in hand on the block you're looking at. */
function useRight(): Outcome {
  if (!target) return null;
  const slot = hotbar.current;
  const id = get(target.x, target.y, target.z);
  // aiming at a plant means "the soil it grows in"
  const soilY = isCropBlock(id) ? target.y - 1 : target.y;
  const at = { x: target.x, y: soilY, z: target.z };
  if (slot.kind === "tool" && slot.tool === "hoe") {
    // (on a phone, Use with the hoe ploughs a whole row whenever your bulls and plough are there)
    const shift = controls.held.has("ShiftLeft") || controls.held.has("ShiftRight") || ploughNext || TOUCH;
    ploughNext = false;
    if (shift && game.save.inv.plough && game.save.bulls && farmyard.distTo(body.pos, farmyard.pos.x, farmyard.pos.z) < 10) {
      // plough the row ahead, in the direction you're facing
      const fx = -Math.sin(controls.yaw), fz = -Math.cos(controls.yaw);
      const dir = Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? "x+" : "x-") : fz > 0 ? "z+" : "z-";
      const r = game.act({ t: "plough", ...at, dir });
      if (r.ok) {
        const n = r.gained?.ploughed ?? 0;
        for (let i = 0; i < n + 1; i++) for (const dy of [0, 1]) game.sync(at.x + (dir === "x+" ? i : dir === "x-" ? -i : 0), at.y + dy, at.z + (dir === "z+" ? i : dir === "z-" ? -i : 0));
        farmyard.walk(at.x + 0.5 + (dir === "x+" ? n : dir === "x-" ? -n : 0), at.z + 0.5 + (dir === "z+" ? n : dir === "z-" ? -n : 0));
      }
      return report(r, "plough");
    }
    return report(game.act({ t: "till", ...at }), "till");
  }
  if (slot.kind === "tool" && slot.tool === "can")
    return game.save.farm[String(idx(at.x, at.y, at.z))] ? report(game.act({ t: "water", ...at }), "water") : report(game.act({ t: "refill", ...target }), "fill");
  if (slot.kind === "seed") return report(game.act({ t: "plant", ...at, crop: slot.crop }), "plant");
  if (slot.kind === "hand") return isCropBlock(id) ? useLeft() : null;
  if (slot.kind !== "block") return null;
  // building: plants are replaced in place, like tall grass; otherwise build onto the face we look at
  const onPlant = block(id).shape === "cross" && !isCropBlock(id);
  const x = onPlant ? target.x : target.x + target.nx;
  const y = onPlant ? target.y : target.y + target.ny;
  const z = onPlant ? target.z : target.z + target.nz;
  const test = (xx: number, yy: number, zz: number) => (xx === x && yy === y && zz === z) || solidAt(xx, yy, zz);
  if (block(slot.block).solid && boxHits(body.pos, test)) return null; // never build into yourself
  return report(game.act({ t: "place", x, y, z, b: slot.block }), "place");
}

function nearWater(t: Hit) {
  for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (waterAt(t.x + dx, t.y + dy, t.z + dz)) return true;
  return false;
}

/** What the crosshair tooltip says about the block in view. */
function tipFor(t: Hit | null): string {
  if (!t) return "";
  const id = get(t.x, t.y, t.z);
  const soil = game.save.farm[String(idx(t.x, isCropBlock(id) ? t.y - 1 : t.y, t.z))];
  const cur = hotbar.current;
  if (!soil) {
    if (cur.kind === "tool" && cur.tool === "can" && nearWater(t)) return "Right-click: fill the can";
    const plotId = world.plotMap[t.x + W * t.z];
    if (plotId < 0 || t.ny !== 1) return nearWater(t) && !(cur.kind === "tool" && cur.tool === "can") ? "Water here — press 3 for the can" : "";
    if (!game.save.plots.includes(plotId)) return `✋ ${world.plots[plotId].name} is a neighbour's field`;
    if (!block(id).farmable) return "";
    return cur.kind === "tool" && cur.tool === "hoe" ? "Right-click: plough this soil" : "Press 2 for the hoe to plough here";
  }
  const now = game.now();
  const wet = soil.wetUntil > now ? "watered" : "dry";
  if (!soil.plant) {
    if (cur.kind === "seed") return `Right-click: sow ${CROPS[cur.crop].name.toLowerCase()} · soil ${Math.round(soil.q * 100)}%`;
    return `Ploughed soil · press 4, 5 or 6 for seeds, then right-click`;
  }
  const p = advance(soil.plant, soil.wetUntil, now);
  const c = CROPS[p.crop];
  if (p.progress >= 1) return `${c.name} is ripe · left-click to harvest`;
  if (wet === "dry" && cur.kind === "tool" && cur.tool === "can") return `${c.name} · ${Math.floor(p.progress * 100)}% · right-click to water`;
  const mins = Math.ceil(msToRipe(p) / 60000);
  return `${c.name} · ${Math.floor(p.progress * 100)}% grown · ${wet === "dry" ? "dry — water it (press 3)" : "watered"} · ripe in ~${mins} min`;
}

function refreshStatus() {
  const s = game.save;
  hud.setInventory(s.inv, canCapacity(s));
  panels.render();
  const c = clock(game.now());
  const worth = netWorth(world, s, game.now(), c.day);
  const title = titleFor(worth.total);
  const overdue = s.loans.some((l) => isOverdue(l, game.now()));
  if (s.bestTitle > lastTitle && lastTitle >= 0) hud.toast(`You are now a ${TITLES[s.bestTitle].name}! · ${TITLES[s.bestTitle].local}`);
  if (booted_) lastTitle = s.bestTitle;
  const saved = { saved: "✓ saved", saving: "saving…", offline: "offline — retrying" }[net.status];
  hud.setInfo(`${s.perks.includes("sarpanch") ? `<span class="title">Sarpanch</span>` : ""}<span class="title" title="Net worth ₹${worth.total.toLocaleString("en-IN")}">${title.name}</span><span class="money">₹${s.money.toLocaleString("en-IN")}</span>${s.rep ? `<span class="rep" title="Reputation with the tanda: better prices from Ganpat">★ ${s.rep}</span>` : ""}${overdue ? `<span class="debt">loan overdue!</span>` : ""}<span class="sync ${net.status}">${saved}</span><span>${fmtHour(hourOverride ?? c.hour)}</span><span>${SEASON_NAMES[c.season]} · day ${c.dayOfSeason + 1} of ${SEASON_DAYS}</span>`);
}
game.onChange(refreshStatus);
game.onChange(() => syncFields());
const sfxQueue = { push: (name: string) => audio.play(name) };

controls.onDig = () => void (!windowOpen() && useLeft());
controls.onPlace = () => void (!windowOpen() && useRight());
controls.onSelect = (i) => {
  hotbar.select(i);
  hud.refresh();
};
controls.onScroll = (d) => {
  hotbar.scroll(d);
  hud.refresh();
};
controls.onToggleDebug = () => hud.toggleDebug();
/** Pola: lead the bulls into the chowk. */
function polaHere() {
  const ch = world.chowk;
  return current(game.save)?.id === "pola" && !!game.save.bulls && body.pos.x > ch.x0 - 2 && body.pos.x < ch.x1 + 2 && body.pos.z > ch.z0 - 2 && body.pos.z < ch.z1 + 2 && farmyard.distTo(body.pos, farmyard.pos.x, farmyard.pos.z) < 12;
}
/** At the school during the election: the gram sabha, then the booth. */
function schoolHere() {
  const sc = world.landmarks.school;
  return current(game.save)?.id === "election" && Math.hypot(body.pos.x - sc.x, body.pos.z - sc.z) < 3.2;
}
const nowHour = () => hourOverride ?? clock(game.now()).hour;
const nearHome = () => Math.hypot(body.pos.x - nights.home.door.x, body.pos.z - nights.home.door.z) < 2.6;
const nearFire = () => Math.hypot(body.pos.x - nights.fire.x, body.pos.z - nights.fire.z) < 4.2;
let sleeping = false;
/** Go home: the door swings open, you step in, the screen fades to night and back to dawn. */
async function goHomeToSleep() {
  if (sleeping) return;
  const r = game.act({ t: "sleep" });
  if (!r.ok) return hud.toast(r.error, "bad");
  sleeping = true;
  const skip = (r as { gained?: { sleptMs?: number } }).gained?.sleptMs ?? 0;
  game.skew += skip; // our clock jumps with the server's (it confirms on the next sync)
  nights.openDoor(true);
  audio.play("place");
  hud.fade(true, "You sleep soundly at home…");
  await new Promise((res) => setTimeout(res, 1600));
  Object.assign(body.pos, { x: nights.home.door.x, y: hf.at(nights.home.door.x, nights.home.door.z), z: nights.home.door.z });
  controls.yaw = nights.home.face + Math.PI;
  nights.openDoor(false);
  await net.flush();
  await new Promise((res) => setTimeout(res, 900));
  hud.fade(false, "");
  hud.toast("Good morning, Ukhali! The bulls are rested and the crops grew overnight.");
  audio.play("chirp");
  sleeping = false;
}
controls.onInteract = () => {
  if (guide.dialogueOpen) return;
  if (windowOpen() && !panels.open) return;
  const h = nowHour();
  if (isNight(h) && nearHome() && !nearStall()) return void goHomeToSleep();
  if (Nights.evening(h) && nearFire() && !nearStall()) {
    const r = game.act({ t: "friends" });
    const line = FIRESIDE[clock(game.now()).day % FIRESIDE.length];
    guide.dialogue("Friends at the chowk", "Evening round the fire", line.replace(/^[^:]+: /, "").replace(/^"|"$/g, ""), [{ label: r.ok ? (r.msg ?? "Good night!") : r.error, onClick: () => guide.onDialogue(false) }]);
    return;
  }
  if (schoolHere() && !nearStall()) {
    const ms = game.save.missions;
    const sabhaDone = (ms.c["visit:gramsabha"] ?? 0) - (ms.base["visit:gramsabha"] ?? 0) > 0;
    const r = game.act({ t: "visit", place: !sabhaDone ? "gramsabha" : "vote" });
    hud.toast(r.ok ? (!sabhaDone ? "The gram sabha: the whole tanda packed into the classroom, arguing over taps and roads." : "Ink on your finger, ballot in the box. Counting is tonight!") : r.error, r.ok ? "ok" : "bad");
    if (r.ok && sabhaDone) celebrate();
    return;
  }
  if (polaHere() && !nearStall()) {
    const r = game.act({ t: "visit", place: "pola" });
    hud.toast(r.ok ? "The procession begins! Drums, gulal, and the whole tanda cheering." : r.error, r.ok ? "ok" : "bad");
    if (r.ok) celebrate();
    return;
  }
  if (map.open) return map.close();
  if (panels.open) return panels.close();
  const s = nearStall();
  if (s) openStall(s.kind);
};
controls.onEscape = () => closeWindows();
controls.onMap = () => (map.open ? map.close() : showMap());
controls.onBoard = () => (board.open ? board.close() : showBoard());
controls.onHelp = () => {
  if (!guide.helpOpen) closeWindows();
  guide.toggleHelp();
  if (guide.helpOpen) releaseMouse();
};
controls.onTorch = () => {
  torchOn = !torchOn;
  hud.toast(torchOn ? "Torch on" : "Torch off");
  audio.play("buy");
};
controls.onView = () => {
  rig.view = rig.view === "third" ? "first" : "third";
  hud.toast(rig.view === "third" ? "Third person" : "First person");
};
controls.onRide = () => void (!windowOpen() && cartAction());
controls.onFeed = () => void (!windowOpen() && feedBulls());
// the pause panel sits over the canvas: a click on it (outside the account box) also starts play
document.querySelector(".play-prompt")!.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".account")) canvas.requestPointerLock?.();
});
controls.onLockChange = (locked) => {
  if (locked) enterGame(false);
  if (locked) {
    mode = "play";
    panels.close();
  }
  if (locked) map.close();
  const busy = !!panels.open || map.open || titleScreen.open || guide.dialogueOpen || board.open || settingsPanel.open || guide.helpOpen;
  if (locked) {
    softRelease = false;
    hud.setResume(false);
    hud.setPlaying(true);
  } else if (softRelease || busy) {
    // the game let go of the mouse for a card: no pause panel
    softRelease = false;
    hud.setPlaying(true);
    if (!busy) hud.setResume(true);
  } else hud.setPlaying(titleScreen.open || TOUCH); // you pressed Esc: the pause panel
};
// the pause panel gets a Settings button
{
  const b = document.createElement("div");
  b.className = "pause-buttons";
  b.innerHTML = `<button data-settings>Settings</button>`;
  document.querySelector(".play-prompt")!.insertBefore(b, document.querySelector(".play-prompt .account"));
  b.addEventListener("click", (e) => {
    e.stopPropagation();
    settingsPanel.show();
  });
}

// the land beyond the map: a wide fogged plain with an exact square hole where the world is,
// so the map never ends in a hard edge against the sky
{
  const R = 1200;
  const shape = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R + 192, -R), new THREE.Vector2(R + 192, R + 192), new THREE.Vector2(-R, R + 192)]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(0, 0), new THREE.Vector2(0, 192), new THREE.Vector2(192, 192), new THREE.Vector2(192, 0)]));
  const plain = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshStandardMaterial({ color: "#7a8f48", roughness: 1, side: THREE.DoubleSide }));
  plain.rotation.x = Math.PI / 2; // shape (x, y) → world (x, z)
  plain.position.y = 15.2;
  plain.receiveShadow = true;
  scene.add(plain);
}

/** Screenshots and the dev tools can pin the sky to an hour; otherwise it follows the game clock. */
let hourOverride: number | null = null;
const lookAt = new THREE.Vector3();
function setCamera(pos: readonly number[], look: readonly number[]) {
  enterGame(false);
  mode = "cinematic";
  camera.position.set(pos[0], pos[1], pos[2]);
  lookAt.set(look[0], look[1], look[2]);
  camera.lookAt(lookAt);
}
function view(name: keyof typeof VIEWS) {
  setCamera(VIEWS[name].pos, VIEWS[name].look);
}

const post = new Post(renderer, scene, camera);
const rig = new CameraRig(camera, (x, z) => hf.at(x, z), (x, y, z) => {
  const id = get(x, y, z);
  return !!id && !TERRAIN.has(id) && block(id).solid && block(id).opaque;
});
/** On a phone held upright, the whole game is turned sideways (it always plays in landscape). */
const screenSize = () => ({ w: Math.round(window.visualViewport?.width ?? window.innerWidth), h: Math.round(window.visualViewport?.height ?? window.innerHeight) });
const rotated = () => TOUCH && screenSize().h > screenSize().w;
function resize() {
  const turn = rotated();
  const sz = screenSize();
  document.documentElement.classList.toggle("rotated", turn);
  const w = turn ? sz.h : sz.w, h = turn ? sz.w : sz.h;
  // the game's own width and height (landscape), in real pixels
  document.documentElement.style.setProperty("--app-w", `${w}px`);
  document.documentElement.style.setProperty("--app-h", `${h}px`);
  renderer.setSize(w, h, false);
  post.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 250));
window.visualViewport?.addEventListener("resize", resize);
// no pinch or double-tap zoom on phones (iOS ignores the viewport tag for this)
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("dblclick", (e) => e.preventDefault());
resize();

// frame timing for the 60 fps check
const frameTimes: number[] = [];
let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  frameTimes.push(now - last);
  if (frameTimes.length > 240) frameTimes.shift();
  last = now;
  farmyard.set(!!game.save.bulls, !!game.save.inv.cart);
  farmyard.update(dt, body.pos);
  if (farmyard.ride) {
    // on the cart: the road does the walking, you look around — and your view turns with the cart
    controls.yaw += Math.atan2(Math.sin(farmyard.pos.heading - rideHeading), Math.cos(farmyard.pos.heading - rideHeading));
    rideHeading = farmyard.pos.heading;
    const seat = farmyard.seat();
    Object.assign(body.pos, { x: seat.x, y: seat.y - 1.18, z: seat.z });
    Object.assign(body.vel, { x: 0, y: 0, z: 0 });
    // the ride is filmed: a follow camera behind and above the cart (first person sits on the seat)
    const d0 = rig.distance, v0 = rig.view;
    rig.distance = 7.5;
    rig.view = "third";
    rig.update(dt, { x: seat.x, y: seat.y - 0.6, z: seat.z }, controls.yaw, Math.min(controls.pitch, -0.12), 1.58);
    rig.distance = d0;
    rig.view = v0;
    target = null;
    outline.visible = false;
    fields.setAim(null);
  } else if (mode === "play") {
    // fixed sub-steps keep collision stable when a frame hitches
    const n = Math.ceil(dt / (1 / 120));
    const input = windowOpen() ? STILL : controls.input(); // a window is open: the farmer waits
    for (let i = 0; i < n; i++) walker.step(input, controls.yaw, dt / n);
    rig.update(dt, body.pos, controls.yaw, controls.pitch);
    // aim along the crosshair; you can only reach what's near your farmer
    const ray = rig.ray();
    const cur = hotbar.current;
    const hit = raycast({ x: ray.o.x, y: ray.o.y, z: ray.o.z }, { x: ray.d.x, y: ray.d.y, z: ray.d.z }, MOVE.reach + (rig.view === "third" ? rig.distance + 1 : 0), cur.kind === "tool" && cur.tool === "can" ? pickWater : pickable, plantBox);
    target = hit && Math.hypot(hit.x + 0.5 - body.pos.x, hit.y + 0.5 - (body.pos.y + 1), hit.z + 0.5 - body.pos.z) <= MOVE.reach ? hit : null;
    outline.visible = false;
    // mark the field cell you'd act on (the soil under a crop, or the ground you look at)
    const aimCell = target && (isCropBlock(get(target.x, target.y, target.z)) || target.ny === 1 || game.save.farm[String(idx(target.x, target.y, target.z))]) ? target : null;
    fields.setAim(aimCell && world.plotMap[aimCell.x + W * aimCell.z] >= 0 ? aimCell : null, hf.at((aimCell?.x ?? 0) + 0.5, (aimCell?.z ?? 0) + 0.5));
  } else if (mode === "title") {
    fields.setAim(null);
    // the title screen: a slow circle over the village at golden hour
    const a = now / 1000 * 0.045;
    camera.position.set(104 + Math.cos(a) * 70, 42, 112 + Math.sin(a) * 70);
    camera.lookAt(104, 17, 110);
    outline.visible = false;
  } else outline.visible = false;
  if (mode === "play" && !farmyard.ride) footsteps(dt);
  if (farmyard.ride && Math.random() < dt * 2.2) audio.play("bells");
  audio.ambience(hourOverride ?? clock(game.now()).hour, !!game.save.bulls && farmyard.distTo(body.pos, farmyard.pos.x, farmyard.pos.z) < 12);
  if (now - lastTick > 500) {
    lastTick = now;
    game.tick();
    syncFields();
    refreshStatus();
    hud.setTip(mode === "play" ? tipFor(target) : "");
    refreshSigns();
    if (mode === "play") checkPlotEntry();
    const st = mode === "play" && !panels.open && !farmyard.ride ? nearStall() : undefined;
    hud.setHint(farmyard.ride || panels.open ? "" : st ? `<kbd>E</kbd> ${st.label}` : cartHint() || (nightK > 0.6 && !torchOn && mode === "play" ? "<kbd>T</kbd> Switch on your torch" : ""));
    hud.setBulls(bullsChip());
    // the watchdog: nothing may leave the player stuck — no pause panel on a phone, controls back when windows close
    if (TOUCH) {
      hud.setPlaying(true);
      hud.setResume(false);
    }
    infra.setDrip([...game.save.drip.map((id) => world.plots[id]), ...villagers.dripPlots().map((id) => world.plots[id])]);
    farmyard.rig.setDecor({ jhool: !!game.save.inv.jhool, gerua: !!game.save.missions.flags.decorated, garland: game.save.perks.includes("polaChampion") });
    // point the pool of bulb lights at the bulbs nearest to you
    if (nightK > 0) {
      const here = camera.position;
      const near = [...village.lamps, ...infra.lamps].sort((a, b) => a.distanceToSquared(here) - b.distanceToSquared(here));
      BULB_LIGHTS.forEach((l, i) => near[i] && l.position.copy(near[i]));
    }
    BULB_LIGHTS.forEach((l) => (l.intensity = nightK * 9));
    const elec = current(game.save)?.id === "election";
    guide.nearChoice = elec ? schoolHere() && (game.save.missions.c["visit:gramsabha"] ?? 0) > (game.save.missions.base["visit:gramsabha"] ?? 0) : Math.hypot(body.pos.x - 99.5, body.pos.z - 124) < 5;
    if (!titleScreen.open) tutorial.update(game.save, game.save.plots.includes(world.plotMap[Math.floor(body.pos.x) + W * Math.floor(body.pos.z)]), now);
  }
  worldRenderer.cull(camera.position, mode === "title" ? 200 : settings.renderDistance);
  const electionOn = current(game.save)?.id === "election";
  campaign.visible = electionOn;
  for (const s of STALLS) {
    if (s.kind === "kamlabai" || s.kind === "shankar") s.npc.group.visible = electionOn;
    s.npc.update(dt, camera.position);
  }
  for (const n of NEIGHBOURS) n.update(dt, camera.position);
  const tv0 = performance.now();
  villagers.update(dt, now / 1000, hourOverride ?? clock(game.now()).hour, game.save, clock(game.now()).day, game.now(), camera.position);
  prof.villagers = prof.villagers * 0.95 + (performance.now() - tv0) * 0.05;
  // nobody walks through anybody: villagers, the stall keepers, and you
  if (mode === "play" && !farmyard.ride) {
    playerBody.pos.x = body.pos.x;
    playerBody.pos.z = body.pos.z;
    const people = villagers.bodies();
    villagers.others = [...people, ...fixedBodies, playerBody];
    separate([...people, ...fixedBodies, playerBody], nav);
    for (const v of people) v.place((x, z) => hf.at(x, z));
    if (!walker.blockedAt(playerBody.pos.x, playerBody.pos.z)) {
      body.pos.x = playerBody.pos.x;
      body.pos.z = playerBody.pos.z;
    }
  }
  if (touch) touch.visible = mode === "play" && !titleScreen.open && !windowOpen() && !farmyard.ride;
  farmer.root.position.set(body.pos.x, body.pos.y, body.pos.z);
  farmer.root.rotation.y = body.heading;
  farmer.visible = mode !== "title" && (rig.view === "third" || !!farmyard.ride);
  if (farmyard.ride) {
    // sitting on the cart, facing the road
    farmer.root.position.set(farmyard.seat().x, farmyard.seat().y - 0.95, farmyard.seat().z);
    farmer.root.rotation.y = farmyard.pos.heading;
  }
  farmer.animate(dt, farmyard.ride ? 0 : body.speed);
  worldRenderer.flush();
  const hour = hourOverride ?? (mode === "title" ? 17.4 : clock(game.now()).hour);
  sky.update(hour, dt, mode === "play" ? new THREE.Vector3(body.pos.x, body.pos.y, body.pos.z) : camera.position);
  const sc = skyColors(hour);
  water.update(now / 1000, sunDirection(hour), sc.sun, sc.top, sc.horizon);
  trees.update(now / 1000);
  village.update(dt);
  nights.update(dt, hourOverride ?? clock(game.now()).hour);
  for (let i = confetti.length - 1; i >= 0; i--) {
    const c = confetti[i];
    c.v.y -= 6 * dt;
    c.v.multiplyScalar(1 - dt * 1.2);
    c.m.position.addScaledVector(c.v, dt);
    c.m.rotation.x += dt * 5;
    c.m.rotation.y += dt * 3;
    if ((c.life -= dt) <= 0) {
      scene.remove(c.m);
      confetti.splice(i, 1);
    }
  }
  // how dark it is: bulbs come on at dusk, off at dawn
  nightK = Math.max(0, Math.min(1, (0.1 - sunDirection(hour).y) / 0.22));
  village.setNight(nightK);
  infra.update(now / 1000, nightK, (() => { const h = hourOverride ?? clock(game.now()).hour; return h > 6.5 && h < 18.5; })());
  torchModel.visible = torchOn;
  torch.intensity = torchOn ? 70 : 0;
  if (torchOn) {
    // shine where you look, from the hand (or the eyes in first person)
    const ray = rig.ray();
    const from = rig.view === "first" || farmyard.ride ? camera.position.clone().add(new THREE.Vector3(0, -0.25, 0)) : new THREE.Vector3(body.pos.x, body.pos.y + 1.1, body.pos.z);
    torch.position.copy(from);
    torchAim.position.copy(from).addScaledVector(ray.d, 12);
    torchModel.rotation.y = Math.atan2(ray.d.x, ray.d.z) - farmer.root.rotation.y;
  }
  grass.lights({ on: torchOn, pos: torch.position, dir: torchAim.position.clone().sub(torch.position) }, BULB_LIGHTS.map((l) => l.position), nightK);
  fields.update(now / 1000);
  const grassAt = mode === "play" ? new THREE.Vector3(body.pos.x, body.pos.y, body.pos.z) : camera.position;
  grass.update(now / 1000, grassAt, mode === "title" ? 90 : Math.min(90, settings.renderDistance * 0.55), sunDirection(hour), sc.sun, sc.top);
  if (mode !== "title") applyRenderDistance();
  renderer.info.reset();
  const tr0 = performance.now();
  post.render();
  prof.render = prof.render * 0.95 + (performance.now() - tr0) * 0.05;
  prof.frame = prof.frame * 0.95 + (performance.now() - now) * 0.05;
  if (hud.debugOn) hud.setDebug(debugText(dt));
  if (booted_) {
    const c = clock(game.now());
    guide.update(game.save, { world, now: game.now(), day: c.day, onOwnLand: game.save.plots.includes(world.plotMap[Math.floor(body.pos.x) + W * Math.floor(body.pos.z)]) }, camera, now / 1000, mode === "title" || WINDOWS().some((w) => w.open()) || !!farmyard.ride || !!document.querySelector(".welcome, .fs-gate:not([hidden])"));
  }
});

/** Gulal and marigold petals in the air. */
const confetti: { m: THREE.Mesh; v: THREE.Vector3; life: number }[] = [];
function celebrate() {
  const cols = ["#e8327a", "#f2a01e", "#f6e04a", "#e8662a", "#ffffff"];
  for (let i = 0; i < 160; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.12), new THREE.MeshBasicMaterial({ color: cols[i % 5], side: THREE.DoubleSide }));
    m.position.set(body.pos.x + (Math.random() - 0.5) * 3, body.pos.y + 1.5, body.pos.z + (Math.random() - 0.5) * 3);
    scene.add(m);
    confetti.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 6, 4 + Math.random() * 5, (Math.random() - 0.5) * 6), life: 4 + Math.random() * 2 });
  }
  audio.play("cash");
  audio.play("bells");
}
let lastTick = 0;
const prof = { villagers: 0, frame: 0, render: 0 };
let fpsAvg = 60;
let stepAcc = 0;
/** A footstep every so often while walking on the ground; road crunches brighter than grass. */
function footsteps(dt: number) {
  const speed = Math.hypot(body.vel.x, body.vel.z);
  if (!body.onGround || speed < 1) return void (stepAcc = 0.3);
  stepAcc += dt * speed;
  if (stepAcc < 2.1) return;
  stepAcc = 0;
  const under = get(Math.floor(body.pos.x), Math.floor(body.pos.y - 0.1), Math.floor(body.pos.z));
  audio.play("step", under === B.ROAD || under === B.COBBLE ? 1 : under === B.SAND ? 0.6 : 0.2);
}
function debugText(dt: number) {
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
  const p = body.pos;
  const dirs = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
  const facing = dirs[Math.round((((controls.yaw % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 4))) % 8];
  const plot = world.plotMap[Math.floor(p.x) + W * Math.floor(p.z)];
  return [
    `Tanda v1 · ${Math.round(fpsAvg)} fps · ${renderer.info.render.calls} draws`,
    `xyz ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${p.z.toFixed(1)}  chunk ${Math.floor(p.x / 16)},${Math.floor(p.z / 16)}  facing ${facing}`,
    `ground ${body.onGround ? "yes" : "no"}${body.inWater ? " · in water" : ""}  plot ${plot >= 0 ? world.plots[plot].name : "—"}`,
    target ? `target ${target.x} ${target.y} ${target.z} ${block(get(target.x, target.y, target.z)).name}` : "target —",
    `time ${fmtHour(hourOverride ?? clock(game.now()).hour)}  edit remesh ${worldRenderer.lastEditMs.toFixed(1)} ms`,
  ].join("\n");
}

/** Sign in and load the farm, retrying until the village server answers. */
async function bootNet() {
  for (let attempt = 0; ; attempt++) {
    try {
      return await net.boot();
    } catch {
      hud.setBanner("Can't reach the village server — retrying…");
      await new Promise((r) => setTimeout(r, Math.min(8000, 1000 * 2 ** attempt)));
    }
  }
}
const booted = bootNet();
const workerReady = new Promise<void>((res) => worker.addEventListener("message", (e) => e.data.type === "ready" && res()));

net.onStatus = () => refreshStatus();
net.onRejected = (errs) => {
  hud.toast(`The village refused: ${errs[0]}`, "bad");
  sfxQueue.push("refused");
};
titleScreen.onRestore = async (code) => {
  const err = await net.restore(code);
  if (err) return err;
  location.reload();
  return null;
};
hud.onRestore = async (code) => {
  const err = await net.restore(code);
  if (err) return err;
  location.reload(); // simplest correct way to swap every block, crop and coin for the other farm
  return null;
};

Promise.all([booted, workerReady]).then(async ([boot]) => {
  hud.setBanner("");
  game.save = boot.save;
  booted_ = true;
  game.skew = boot.serverNow - Date.now();
  net.attach(game);
  hud.setAccount(net.recoveryCode);
  const t0 = performance.now();
  game.syncAll(); // saved edits and fields go to the worker before the first mesh
  syncFields();
  await worldRenderer.meshAll();
  refreshStatus();
  const meshAllMs = performance.now() - t0;
  titleScreen.ready(game.save, titleFor(netWorth(world, game.save, game.now(), clock(game.now()).day).total).name);
  Object.assign(window.__bailgaadi, {
    ready: true,
    setHour: (h: number | null) => {
      hourOverride = h;
      refreshStatus();
    },
    view,
    setCamera,
    // ---- M2 test hooks: drive the player without pointer lock ----
    play: () => {
      enterGame(false);
      mode = "play";
    },
    teleport: (x: number, y: number, z: number, yaw = controls.yaw, pitch = controls.pitch) => {
      enterGame(false);
      mode = "play";
      hud.setPlaying(true); // scripted play counts as playing: hide the click prompt
      Object.assign(body.pos, { x, y: Math.max(y, walker.floorAt(x, z, y)), z });
      Object.assign(body.vel, { x: 0, y: 0, z: 0 });
      controls.yaw = yaw;
      controls.pitch = pitch;
    },
    hold: (code: string, ms: number) =>
      new Promise<void>((res) => {
        controls.held.add(code);
        setTimeout(() => {
          controls.held.delete(code);
          res();
        }, ms);
      }),
    player: () => ({ ...body.pos, onGround: body.onGround, inWater: body.inWater, yaw: controls.yaw, pitch: controls.pitch }),
    target: () => (target ? { ...target, block: block(get(target.x, target.y, target.z)).name } : null),
    blockAt: (x: number, y: number, z: number) => block(get(x, y, z)).name,
    select: (i: number) => controls.onSelect(i),
    left: async () => {
      if (autoSkip) (window.__bailgaadi.skipStory as () => number)();
      const r = useLeft();
      await worldRenderer.flush();
      return r;
    },
    right: async () => {
      if (autoSkip) (window.__bailgaadi.skipStory as () => number)();
      const r = useRight();
      await worldRenderer.flush();
      return r;
    },
    inv: () => ({ ...game.save.inv }),
    // what a cheater could do in devtools: edit the local save. The server must undo it.
    tamperLocal: (item: string, n: number) => {
      game.save.inv[item] = n;
      refreshStatus();
    },
    sync: () => net.flush().then(() => net.status),
    netStatus: () => net.status,
    recoveryCode: () => net.recoveryCode,
    // test hook: act as a tampering client would — send an action straight to the server, skipping local rules
    sendRaw: async (a: unknown) => {
      const r = await fetch("/api/act", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${net.token}` }, body: JSON.stringify({ actions: [a] }) });
      return r.json();
    },
    farm: () => structuredClone(game.save.farm),
    landmarks: () => world.landmarks,
    starterPlot: () => world.plots.find((p) => p.starter),
    ...(import.meta.env.DEV
      ? {
          // dev-only: fast-forward the game clock (never shipped; the server owns time in M4)
          skip: async (ms: number) => {
            await net.skip(ms);
            game.tick();
            refreshStatus();
            await worldRenderer.flush();
            return game.skew;
          },
          jumpMission: async (i: number, rep: number) => {
            await net.skip(0, 0, { mission: i, rep });
            refreshStatus();
          },
          grant: async (money: number) => {
            await net.skip(0, money);
            refreshStatus();
          },
        }
      : {}),
    toggleDebug: () => hud.toggleDebug(),
    setView: (v: "first" | "third") => (rig.view = v),
    torch: (on: boolean) => (torchOn = on),
    villagerDebug: () => villagers.debug(),
    // test hook: tap through any story card that's showing (they're tested in missions.js)
    autoSkipStory: (on: boolean) => (autoSkip = on),
    skipStory: () => {
      let n = 0;
      for (let b = document.querySelector(".dialogue button") as HTMLButtonElement | null; b && n < 5; b = document.querySelector(".dialogue button"), n++) b.click();
      return n;
    },
    home: () => ({ door: { ...nights.home.door }, fire: { ...nights.fire } }),
    clockNow: () => ({ hour: clock(game.now()).hour, day: clock(game.now()).day }),
    noFog: () => {
      settings.renderDistance = 2000;
      document.getElementById("ui")!.style.display = "none";
    },
    prof: () => ({ ...prof }),
    hideLayer: (name: string, on: boolean) => {
      const m: Record<string, THREE.Object3D> = { villagers: villagers.group, grass: grass.group, trees: trees.group, village: village.group, fields: fields.group };
      if (name === "vfields") villagers.fields.group.visible = !on;
      else m[name].visible = !on;
    },
    title: () => ({ open: titleScreen.open, mode }),
    openSettings: () => settingsPanel.show(),
    audioSelfTest: async () => Object.fromEntries(await Promise.all(Object.keys(SOUNDS).map(async (k) => [k, Math.round((await renderRms(k)) * 1e4) / 1e4]))),
    openStall: (kind: PanelKind, tab?: string) => openStall(kind, tab),
    closePanel: () => panels.close(),
    showMap: () => showMap(),
    closeMap: () => map.close(),
    key: (code: string) => {
      if (autoSkip) (window.__bailgaadi.skipStory as () => number)();
      window.dispatchEvent(new KeyboardEvent("keydown", { code }));
    },
    plough: async () => {
      ploughNext = true;
      const r = useRight();
      await worldRenderer.flush();
      return r;
    },
    farmyard: () => ({ pos: { ...farmyard.pos }, cartAt: { ...farmyard.cartAt }, home: farmyard.home, riding: farmyard.ride ? { d: farmyard.ride.d, len: farmyard.ride.len, dest: farmyard.ride.dest } : null, bulls: game.save.bulls && bullsNow(game.save.bulls, game.now()), trip: game.save.trip }),
    land: () => ({ owned: [...game.save.plots], listings: structuredClone(game.save.listings) }),
    act: (a: import("../shared/rules").Action) => game.act(a),
    nearStall: () => nearStall()?.kind ?? null,
    money: () => game.save.money,
    worth: () => {
      const w = netWorth(world, game.save, game.now(), clock(game.now()).day);
      return { ...w, title: titleFor(w.total).name, bestTitle: game.save.bestTitle, loans: structuredClone(game.save.loans), godown: structuredClone(game.save.godown) };
    },
    ledger: () => game.save.ledger,
    editMs: () => worldRenderer.lastEditMs,
    stats: () => {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      return {
        meshAllMs: Math.round(meshAllMs),
        lastChunkMs: Math.round(worldRenderer.lastMeshMs * 10) / 10,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        medianFrameMs: Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) * 10) / 10,
        lastEditMs: Math.round(worldRenderer.lastEditMs * 10) / 10,
        p95FrameMs: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
      };
    },
    plots: world.plots.length,
  });
});
// the voxels remain for collision and the rules; everything you see is modelled, so the mesher draws nothing
worker.postMessage({ type: "init", seed: WORLD_SEED, skipTerrain: BLOCKS.map((b) => b.id), modelTrees: true });
