/// <reference lib="webworker" />
import { generateWorld, idx } from "../../shared/world";
import { meshChunk } from "./mesher";

// The worker keeps its own copy of the world (regenerated from the seed — cheaper than copying 1.7 MB)
// and applies every block edit the main thread makes, so remeshing never blocks rendering.
let vox: Uint8Array | null = null;

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === "init") {
    vox = generateWorld(m.seed).voxels;
    for (const [x, y, z, b] of m.edits ?? []) vox[idx(x, y, z)] = b;
    (self as unknown as Worker).postMessage({ type: "ready" });
  } else if (m.type === "set" && vox) {
    vox[idx(m.x, m.y, m.z)] = m.b;
  } else if (m.type === "mesh" && vox) {
    const t0 = performance.now();
    const cm = meshChunk(vox, m.cx, m.cz);
    const bufs = [cm.opaque, cm.cutout, cm.water].flatMap((d) => [d.positions.buffer, d.normals.buffer, d.uvs.buffer, d.colors.buffer, d.indices.buffer]);
    (self as unknown as Worker).postMessage({ type: "mesh", ...cm, ms: performance.now() - t0, req: m.req }, bufs as Transferable[]);
  }
};
