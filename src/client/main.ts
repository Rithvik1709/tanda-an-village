import * as THREE from "three";
import { B, block, isCropBlock } from "../shared/blocks";
import { advance, CROPS, msToRipe } from "../shared/crops";
import { canCapacity, type Result } from "../shared/rules";
import { newSave } from "../shared/save";
import { clock, fmtHour, SEASON_DAYS, SEASON_NAMES } from "../shared/time";
import { D, generateWorld, H, idx, W, WORLD_SEED } from "../shared/world";
import { buildAtlasTexture } from "./engine/atlas";
import { Sky } from "./engine/sky";
import { WorldRenderer } from "./engine/world-renderer";
import { Game } from "./game";
import { Net } from "./net";
import { Controls } from "./player/controls";
import { Hotbar } from "./player/hotbar";
import { type Body, type Box, boxHits, type Hit, MOVE, PLAYER, raycast, step } from "./player/physics";
import { Hud } from "./ui/hud";
import { Npc } from "./engine/npc";
import { type PanelKind, Panels } from "./ui/panels";
import { MapView } from "./ui/map";
import { Signs } from "./engine/signs";
import { askingPrice, forSale } from "../shared/land";
import { bullsMoodWord, bullsNow } from "../shared/bulls";
import { isOverdue, netWorth, TITLES, titleFor } from "../shared/bank";
import { Farmyard } from "./farmyard";
import { groundY } from "./player/path";

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

const VIEWS = {
  overview: { pos: [150, 50, 150], look: [78, 14, 82] },
  square: { pos: [98, 18.8, 114], look: [90, 19, 88] },
  fields: { pos: [100, 24, 42], look: [48, 15, 60] },
  river: { pos: [34, 17, 112], look: [14, 11, 92] },
  market: { pos: [160, 24, 110], look: [182, 16, 96] },
} as const;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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
const body: Body = { pos: { x: spawn.x, y: spawn.y, z: spawn.z }, vel: { x: 0, y: 0, z: 0 }, onGround: false, inWater: false };
const controls = new Controls(canvas);
controls.yaw = 0.25; // face up the north road, your first field off to the left
const hotbar = new Hotbar();
const hud = new Hud(document.getElementById("ui")!, atlas.image as HTMLCanvasElement, hotbar);
let mode: "play" | "cinematic" = "play";
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
    npc: new Npc({ kurta: "#f1ead8", dhoti: "#e8e0cc", hat: "#f6f2e8" }, 102.5, world.landmarks.trader.y, 86.3, 0),
    label: "Sell to Ganpat Seth, the trader",
  },
  {
    kind: "shop",
    at: { ...world.landmarks.seedShop, x: world.landmarks.seedShop.x + 0.5, z: world.landmarks.seedShop.z - 0.5 },
    npc: new Npc({ kurta: "#4f7fae", dhoti: "#e8e0cc", hat: "#e8892c", hatTall: true }, 102.5, world.landmarks.seedShop.y, 102.3, 0),
    label: "Buy seeds & tools from Sakharam",
  },
  {
    kind: "land",
    at: { x: lo.x + 3, y: lo.y, z: lo.z + 0.5 },
    npc: new Npc({ kurta: "#f4f0e4", dhoti: "#3a3a44", hat: "#f6f2e8", skin: "#9a6440" }, lo.x + 1.6, lo.y, lo.z + 0.5, Math.PI / 2),
    label: "Buy & sell land at the Talathi's office",
  },
  {
    kind: "bank",
    at: { x: world.landmarks.bank.x + 0.5, y: world.landmarks.bank.y, z: world.landmarks.bank.z - 0.3 },
    npc: new Npc({ kurta: "#dfe6ee", dhoti: "#3a3a44", hat: "#2a2a30", skin: "#b07a52" }, world.landmarks.bank.x + 0.5, world.landmarks.bank.y, world.landmarks.bank.z + 1.3, Math.PI),
    label: "Loans & the godown at the Sahakari Bank",
  },
  {
    kind: "sahukar",
    at: { x: 108.5, y: groundY(vox, 108.5, 108.5), z: 108.5 },
    npc: new Npc({ kurta: "#f2e6c8", dhoti: "#f6f0e0", hat: "#c0392b", hatTall: true, skin: "#b07a52" }, 108.5, groundY(vox, 108.5, 110.3), 110.3, Math.PI),
    label: "Borrow from Sahukar Motilal (fast, but dear)",
  },
  {
    kind: "town",
    at: { x: 176.5, y: world.landmarks.market.y, z: 96.5 },
    npc: new Npc({ kurta: "#e8d8a8", dhoti: "#f0ead8", hat: "#c0392b", hatTall: true, skin: "#9a6440" }, 178.8, world.landmarks.market.y, 96.5, -Math.PI / 2),
    label: "Talk to Haribhau at the town mandi",
  },
];
for (const s of STALLS) scene.add(s.npc.group);
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
});
panels.onClose = () => hud.setPlaying(false);

// ---- the map (M) and the for-sale boards at plot gates ----
const map = new MapView(document.getElementById("ui")!, world);
map.onClose = () => hud.setPlaying(!!panels.open);
function showMap() {
  map.show(game.save, clock(game.now()).day, { x: body.pos.x, z: body.pos.z, yaw: controls.yaw });
  hud.setPlaying(true);
  document.exitPointerLock?.();
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
const farmyard = new Farmyard(vox, world.plots.find((p) => p.starter)!);
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
  Object.assign(body.pos, { x, y: groundY(vox, x, z) + 0.05, z });
  Object.assign(body.vel, { x: 0, y: 0, z: 0 });
  hud.setPlaying(false);
  // turn to whoever you came to see
  const look = dest === "town" ? { x: 178.8, z: 96.5 } : { x: farmyard.pos.x, z: farmyard.pos.z };
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
  else if (!game.save.bulls) hud.toast("A cart needs bulls — Sakharam sells a Khillari pair.", "bad");
  else openStall("cart");
  return true;
}
function feedBulls() {
  if (!nearBulls()) return;
  const r = game.act({ t: "feed" });
  hud.toast(r.ok ? (r.msg ?? "Fed") : r.error, r.ok ? "ok" : "bad");
}
function cartHint(): string {
  if (nearCart()) {
    if (game.save.trip) return cartInTown() ? "<kbd>R</kbd> Sell the load at the mandi" : "<kbd>R</kbd> Continue to the town mandi";
    return cartInTown() ? "<kbd>R</kbd> Ride home" : "<kbd>R</kbd> Load the cart for the town mandi";
  }
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
  hud.toast(mine ? `${p.name} · your land` : forSale(p, day) ? `${p.name} · for sale, ₹${askingPrice(p, day).toLocaleString("en-IN")}` : `${p.name} · a neighbour's field`);
}

/** The stall the player is standing at, if any (within a few steps of its counter). */
function nearStall() {
  return STALLS.find((s) => Math.hypot(body.pos.x - s.at.x, body.pos.z - s.at.z) < 3.4 && Math.abs(body.pos.y - s.at.y) < 2);
}
function openStall(kind: PanelKind, tab?: string) {
  panels.show(kind, tab);
  hud.setPlaying(true); // hide the click-to-play panel under it
  hud.setHint("");
  document.exitPointerLock?.();
}

function lookDir() {
  const cp = Math.cos(controls.pitch);
  return { x: -Math.sin(controls.yaw) * cp, y: Math.sin(controls.pitch), z: -Math.cos(controls.yaw) * cp };
}
function eye() {
  return { x: body.pos.x, y: body.pos.y + PLAYER.eye, z: body.pos.z };
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
  return report(game.act({ t: "dig", x, y, z }), "dig");
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
    const shift = controls.held.has("ShiftLeft") || controls.held.has("ShiftRight") || ploughNext;
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
  if (!soil) {
    const cur = hotbar.current;
    return cur.kind === "tool" && cur.tool === "can" && nearWater(t) ? "Right click to fill the can" : "";
  }
  const now = game.now();
  const wet = soil.wetUntil > now ? "watered" : "dry";
  if (!soil.plant) return `Tilled soil · ${wet} · quality ${Math.round(soil.q * 100)}%`;
  const p = advance(soil.plant, soil.wetUntil, now);
  const c = CROPS[p.crop];
  if (p.progress >= 1) return `${c.name} · ripe — click to harvest`;
  const mins = Math.ceil(msToRipe(p) / 60000);
  return `${c.name} · ${Math.floor(p.progress * 100)}% · ${wet} · ~${mins} min if watered`;
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
  hud.setInfo(`<span class="title" title="Net worth ₹${worth.total.toLocaleString("en-IN")}">${title.name}</span><span class="money">₹${s.money.toLocaleString("en-IN")}</span>${overdue ? `<span class="debt">loan overdue!</span>` : ""}<span class="sync ${net.status}">${saved}</span><span>${fmtHour(hourOverride ?? c.hour)}</span><span>${SEASON_NAMES[c.season]} · day ${c.dayOfSeason + 1} of ${SEASON_DAYS}</span>`);
}
game.onChange(refreshStatus);
const sfxQueue: string[] = []; // sound arrives in M9; the queue keeps the call sites honest

controls.onDig = () => void useLeft();
controls.onPlace = () => void useRight();
controls.onSelect = (i) => {
  hotbar.select(i);
  hud.refresh();
};
controls.onScroll = (d) => {
  hotbar.scroll(d);
  hud.refresh();
};
controls.onToggleDebug = () => hud.toggleDebug();
controls.onInteract = () => {
  if (map.open) return map.close();
  if (panels.open) return panels.close();
  const s = nearStall();
  if (s) openStall(s.kind);
};
controls.onEscape = () => {
  panels.close();
  map.close();
};
controls.onMap = () => (map.open ? map.close() : showMap());
controls.onRide = () => void (!panels.open && cartAction());
controls.onFeed = () => void (!panels.open && feedBulls());
// the pause panel sits over the canvas: a click on it (outside the account box) also starts play
document.querySelector(".play-prompt")!.addEventListener("click", (e) => {
  if (!(e.target as HTMLElement).closest(".account")) canvas.requestPointerLock?.();
});
controls.onLockChange = (locked) => {
  if (locked) {
    mode = "play";
    panels.close();
  }
  if (locked) map.close();
  hud.setPlaying(locked || !!panels.open || map.open);
};

// the land beyond the map: a wide fogged plain with an exact square hole where the world is,
// so the map never ends in a hard edge against the sky
{
  const R = 1200;
  const shape = new THREE.Shape([new THREE.Vector2(-R, -R), new THREE.Vector2(R + 192, -R), new THREE.Vector2(R + 192, R + 192), new THREE.Vector2(-R, R + 192)]);
  shape.holes.push(new THREE.Path([new THREE.Vector2(0, 0), new THREE.Vector2(0, 192), new THREE.Vector2(192, 192), new THREE.Vector2(192, 0)]));
  const plain = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshLambertMaterial({ color: "#5f8a3a", side: THREE.DoubleSide }));
  plain.rotation.x = Math.PI / 2; // shape (x, y) → world (x, z)
  plain.position.y = 13.9;
  scene.add(plain);
}

/** Screenshots and the dev tools can pin the sky to an hour; otherwise it follows the game clock. */
let hourOverride: number | null = null;
const lookAt = new THREE.Vector3();
function setCamera(pos: readonly number[], look: readonly number[]) {
  mode = "cinematic";
  camera.position.set(pos[0], pos[1], pos[2]);
  lookAt.set(look[0], look[1], look[2]);
  camera.lookAt(lookAt);
}
function view(name: keyof typeof VIEWS) {
  setCamera(VIEWS[name].pos, VIEWS[name].look);
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
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
    Object.assign(body.pos, { x: seat.x, y: seat.y - PLAYER.eye + 0.4, z: seat.z });
    Object.assign(body.vel, { x: 0, y: 0, z: 0 });
    camera.position.set(seat.x, seat.y + 0.45, seat.z);
    camera.rotation.set(controls.pitch, controls.yaw, 0, "YXZ");
    target = null;
    outline.visible = false;
  } else if (mode === "play") {
    // fixed sub-steps keep collision stable when a frame hitches
    const n = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < n; i++) step(body, controls.input(), controls.yaw, dt / n, solidAt, waterAt);
    const e = eye();
    camera.position.set(e.x, e.y, e.z);
    camera.rotation.set(controls.pitch, controls.yaw, 0, "YXZ");
    const cur = hotbar.current;
    target = raycast(e, lookDir(), MOVE.reach, cur.kind === "tool" && cur.tool === "can" ? pickWater : pickable, plantBox);
    outline.visible = !!target;
    if (target) outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  } else outline.visible = false;
  if (now - lastTick > 500) {
    lastTick = now;
    game.tick();
    refreshStatus();
    hud.setTip(mode === "play" ? tipFor(target) : "");
    refreshSigns();
    if (mode === "play") checkPlotEntry();
    const st = mode === "play" && !panels.open && !farmyard.ride ? nearStall() : undefined;
    hud.setHint(farmyard.ride || panels.open ? "" : st ? `<kbd>E</kbd> ${st.label}` : cartHint());
    hud.setBulls(bullsChip());
  }
  for (const s of STALLS) s.npc.update(dt, camera.position);
  worldRenderer.flush();
  const hour = hourOverride ?? clock(game.now()).hour;
  sky.update(hour, dt, camera.position);
  renderer.render(scene, camera);
  if (hud.debugOn) hud.setDebug(debugText(dt));
});

let lastTick = 0;
let fpsAvg = 60;
function debugText(dt: number) {
  fpsAvg += (1 / Math.max(dt, 1e-3) - fpsAvg) * 0.05;
  const p = body.pos;
  const dirs = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
  const facing = dirs[Math.round((((controls.yaw % (2 * Math.PI)) + 2 * Math.PI) / (Math.PI / 4))) % 8];
  const plot = world.plotMap[Math.floor(p.x) + W * Math.floor(p.z)];
  return [
    `Bailgaadi v1 · ${Math.round(fpsAvg)} fps · ${renderer.info.render.calls} draws`,
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
  await worldRenderer.meshAll();
  refreshStatus();
  const meshAllMs = performance.now() - t0;
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
      mode = "play";
    },
    teleport: (x: number, y: number, z: number, yaw = controls.yaw, pitch = controls.pitch) => {
      mode = "play";
      hud.setPlaying(true); // scripted play counts as playing: hide the click prompt
      Object.assign(body.pos, { x, y, z });
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
      const r = useLeft();
      await worldRenderer.flush();
      return r;
    },
    right: async () => {
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
          grant: async (money: number) => {
            await net.skip(0, money);
            refreshStatus();
          },
        }
      : {}),
    toggleDebug: () => hud.toggleDebug(),
    openStall: (kind: PanelKind, tab?: string) => openStall(kind, tab),
    closePanel: () => panels.close(),
    showMap: () => showMap(),
    closeMap: () => map.close(),
    key: (code: string) => window.dispatchEvent(new KeyboardEvent("keydown", { code })),
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
worker.postMessage({ type: "init", seed: WORLD_SEED });
