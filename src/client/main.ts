import * as THREE from "three";
import { generateWorld, WORLD_SEED } from "../shared/world";
import { buildAtlasTexture } from "./engine/atlas";
import { Sky } from "./engine/sky";
import { WorldRenderer } from "./engine/world-renderer";

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
const worker = new Worker(new URL("./engine/mesh.worker.ts", import.meta.url), { type: "module" });
const worldRenderer = new WorldRenderer(worker, buildAtlasTexture());
scene.add(worldRenderer.group);

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
const target = new THREE.Vector3();
function view(name: keyof typeof VIEWS) {
  const v = VIEWS[name];
  camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
  target.set(v.look[0], v.look[1], v.look[2]);
  camera.lookAt(target);
}
view("overview");

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
  sky.update(hour, dt, camera.position);
  renderer.render(scene, camera);
});

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
    setCamera: (pos: [number, number, number], look: [number, number, number]) => {
      camera.position.set(...pos);
      target.set(...look);
      camera.lookAt(target);
    },
    stats: () => {
      const sorted = [...frameTimes].sort((a, b) => a - b);
      return {
        meshAllMs: Math.round(meshAllMs),
        lastChunkMs: Math.round(worldRenderer.lastMeshMs * 10) / 10,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        medianFrameMs: Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) * 10) / 10,
        p95FrameMs: Math.round((sorted[Math.floor(sorted.length * 0.95)] ?? 0) * 10) / 10,
      };
    },
    plots: world.plots.length,
  });
});
worker.postMessage({ type: "init", seed: WORLD_SEED });
