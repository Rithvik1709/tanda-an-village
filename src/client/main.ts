import * as THREE from "three";
import { B, block, isCropBlock } from "../shared/blocks";
import { advance, CAN_MAX, CROPS, msToRipe } from "../shared/crops";
import type { Result } from "../shared/rules";
import { newSave } from "../shared/save";
import { clock, fmtHour, SEASON_DAYS, SEASON_NAMES } from "../shared/time";
import { D, generateWorld, H, idx, W, WORLD_SEED } from "../shared/world";
import { buildAtlasTexture } from "./engine/atlas";
import { Sky } from "./engine/sky";
import { WorldRenderer } from "./engine/world-renderer";
import { Game } from "./game";
import { Controls } from "./player/controls";
import { Hotbar } from "./player/hotbar";
import { type Body, type Box, boxHits, type Hit, MOVE, PLAYER, raycast, step } from "./player/physics";
import { Hud } from "./ui/hud";

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
const game = new Game(world, vox, newSave("local", world, Date.now()), worldRenderer);

// ---- the player ----
const spawn = world.landmarks.spawn;
const body: Body = { pos: { x: spawn.x, y: spawn.y, z: spawn.z }, vel: { x: 0, y: 0, z: 0 }, onGround: false, inWater: false };
const controls = new Controls(canvas);
controls.yaw = 0.675; // face north-west, toward your first field
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

function lookDir() {
  const cp = Math.cos(controls.pitch);
  return { x: -Math.sin(controls.yaw) * cp, y: Math.sin(controls.pitch), z: -Math.cos(controls.yaw) * cp };
}
function eye() {
  return { x: body.pos.x, y: body.pos.y + PLAYER.eye, z: body.pos.z };
}
/** The watering can can aim at water (to fill up); everything else looks through it. */
const pickWater = (x: number, y: number, z: number) => get(x, y, z) !== B.AIR;

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
  if (slot.kind === "tool" && slot.tool === "hoe") return report(game.act({ t: "till", ...at }), "till");
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
  hud.setInventory(s.inv, CAN_MAX);
  const c = clock(game.now());
  hud.setInfo(`<span class="money">₹${s.money.toLocaleString("en-IN")}</span><span>${fmtHour(hourOverride ?? c.hour)}</span><span>${SEASON_NAMES[c.season]} · day ${c.dayOfSeason + 1} of ${SEASON_DAYS}</span>`);
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
controls.onLockChange = (locked) => {
  if (locked) mode = "play";
  hud.setPlaying(locked);
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
  if (mode === "play") {
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
  }
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

worker.addEventListener("message", async (e) => {
  if (e.data.type !== "ready") return;
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
    farm: () => structuredClone(game.save.farm),
    landmarks: () => world.landmarks,
    starterPlot: () => world.plots.find((p) => p.starter),
    ...(import.meta.env.DEV
      ? {
          // dev-only: fast-forward the game clock (never shipped; the server owns time in M4)
          skip: async (ms: number) => {
            game.skew += ms;
            game.tick();
            refreshStatus();
            await worldRenderer.flush();
            return game.skew;
          },
        }
      : {}),
    toggleDebug: () => hud.toggleDebug(),
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
