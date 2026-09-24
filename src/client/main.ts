import * as THREE from "three";
import { B, block } from "../shared/blocks";
import { D, generateWorld, H, idx, W, WORLD_SEED } from "../shared/world";
import { buildAtlasTexture } from "./engine/atlas";
import { Sky } from "./engine/sky";
import { WorldRenderer } from "./engine/world-renderer";
import { Controls } from "./player/controls";
import { Hotbar } from "./player/hotbar";
import { type Body, boxHits, type Hit, MOVE, PLAYER, raycast, step } from "./player/physics";
import { Hud } from "./ui/hud";

type Hooks = {
  ready: boolean;
  hour: number;
  setHour: (h: number) => void;
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
const vox = world.voxels;
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
const inside = (x: number, y: number, z: number) => x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H;

// ---- the player ----
const spawn = world.landmarks.spawn;
const body: Body = { pos: { x: spawn.x, y: spawn.y, z: spawn.z }, vel: { x: 0, y: 0, z: 0 }, onGround: false, inWater: false };
const controls = new Controls(canvas);
controls.yaw = Math.PI; // face south, down the road toward the fields
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

/** Left click. Returns what was dug, or null. */
function dig(): string | null {
  if (!target) return null;
  const { x, y, z } = target;
  const id = get(x, y, z);
  if (id === B.BEDROCK || !inside(x, y, z)) return null;
  worldRenderer.setBlock(vox, x, y, z, B.AIR);
  // a plant can't float: lose whatever grew on top of the dug block
  if (inside(x, y + 1, z) && block(get(x, y + 1, z)).shape === "cross") worldRenderer.setBlock(vox, x, y + 1, z, B.AIR);
  sfxQueue.push("dig");
  return block(id).name;
}

/** Right click with a block selected. Returns the placed block's name, or null. */
function place(): string | null {
  const slot = hotbar.current;
  if (!target || slot.kind !== "block") return null;
  // plants are replaced in place, like tall grass; otherwise build onto the face we're looking at
  const onPlant = block(get(target.x, target.y, target.z)).shape === "cross";
  const x = onPlant ? target.x : target.x + target.nx;
  const y = onPlant ? target.y : target.y + target.ny;
  const z = onPlant ? target.z : target.z + target.nz;
  if (!inside(x, y, z)) return null;
  const here = get(x, y, z);
  if (here !== B.AIR && !block(here).liquid && block(here).shape !== "cross") return null;
  // never build a block into yourself
  const test = (xx: number, yy: number, zz: number) => (xx === x && yy === y && zz === z) || solidAt(xx, yy, zz);
  if (block(slot.block).solid && boxHits(body.pos, test)) return null;
  worldRenderer.setBlock(vox, x, y, z, slot.block);
  sfxQueue.push("place");
  return block(slot.block).name;
}
const sfxQueue: string[] = []; // sound arrives in M9; the queue keeps the call sites honest

controls.onDig = () => void dig();
controls.onPlace = () => void place();
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

let hour = 17.4; // open on golden hour
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
    target = raycast(e, lookDir(), MOVE.reach, pickable);
    outline.visible = !!target;
    if (target) outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
  } else outline.visible = false;
  worldRenderer.flush();
  sky.update(hour, dt, camera.position);
  renderer.render(scene, camera);
  if (hud.debugOn) hud.setDebug(debugText(dt));
});

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
    `time ${Math.floor(hour)}:${String(Math.floor((hour % 1) * 60)).padStart(2, "0")}  edit remesh ${worldRenderer.lastEditMs.toFixed(1)} ms`,
  ].join("\n");
}

worker.addEventListener("message", async (e) => {
  if (e.data.type !== "ready") return;
  const t0 = performance.now();
  await worldRenderer.meshAll();
  const meshAllMs = performance.now() - t0;
  Object.assign(window.__bailgaadi, {
    ready: true,
    hour,
    setHour: (h: number) => {
      hour = h;
      window.__bailgaadi.hour = h;
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
    dig: async () => {
      const r = dig();
      await worldRenderer.flush();
      return r;
    },
    place: async () => {
      const r = place();
      await worldRenderer.flush();
      return r;
    },
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
