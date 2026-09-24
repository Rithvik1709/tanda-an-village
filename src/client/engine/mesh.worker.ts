/// <reference lib="webworker" />
import { generateWorld, idx } from "../../shared/world";
import { meshChunk } from "./mesher";

// The worker keeps its own copy of the world (regenerated from the seed — cheaper than copying 1.7 MB)
// and applies every block edit the main thread makes, so remeshing never blocks rendering.
let vox: Uint8Array | null = null;
// the smooth terrain and water are drawn elsewhere now; the mesher only builds what stands on them
let skip = new Set<number>();

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "init") {
    const w = generateWorld(m.seed);
    vox = w.voxels;
    skip = new Set(m.skipTerrain ?? []);
    // trees are modelled now: clear their trunks from the voxels (leaves are in the skip set)
    if (m.modelTrees) for (const t of w.trees) for (const [x, z, y0, y1] of t.trunks) for (let y = y0; y <= y1; y++) if (vox[idx(x, y, z)] === 9) vox[idx(x, y, z)] = 0;
    for (const [x, y, z, b] of m.edits ?? []) vox[idx(x, y, z)] = b;
    if (skip.size) for (let i = 0; i < vox.length; i++) if (skip.has(vox[i])) vox[i] = 0;
    (self as unknown as Worker).postMessage({ type: "ready" });
  } else if (m.type === "set" && vox) {
    vox[idx(m.x, m.y, m.z)] = skip.has(m.b) ? 0 : m.b;
  } else if (m.type === "mesh" && vox) {
    const t0 = performance.now();
    const cm = meshChunk(vox, m.cx, m.cz);
    const bufs = [cm.opaque, cm.cutout, cm.water].flatMap((d) => [d.positions.buffer, d.normals.buffer, d.uvs.buffer, d.colors.buffer, d.indices.buffer]);
    (self as unknown as Worker).postMessage({ type: "mesh", ...cm, ms: performance.now() - t0, req: m.req }, bufs as Transferable[]);
  }
};
