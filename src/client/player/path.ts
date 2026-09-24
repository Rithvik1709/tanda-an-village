import { B, block } from "../../shared/blocks";
import { D, H, W } from "../../shared/world";

/*
 * A* over the map's columns for the bullock cart: roads are cheap, open ground costs more, and
 * fences, walls, water and steps higher than one block are off limits.
 */
export type Pt = { x: number; z: number };

export function groundY(vox: Uint8Array, x: number, z: number): number {
  const xi = Math.max(0, Math.min(W - 1, Math.floor(x))), zi = Math.max(0, Math.min(D - 1, Math.floor(z)));
  for (let y = H - 2; y > 0; y--) {
    const id = vox[xi + W * (zi + D * y)];
    if (id && block(id).solid) return y + 1;
  }
  return 1;
}

export function findPath(vox: Uint8Array, from: Pt, to: Pt): Pt[] | null {
  const top = new Int16Array(W * D);
  const cost = new Float32Array(W * D);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const c = x + W * z;
      const y = groundY(vox, x, z);
      top[c] = y;
      const surf = vox[x + W * (z + D * (y - 1))];
      const above = vox[x + W * (z + D * y)];
      const liquid = block(vox[x + W * (z + D * y)]).liquid || block(surf).liquid;
      const blocked = liquid || (above && block(above).solid) || surf === B.FENCE || surf === B.LOG || surf === B.COBBLE;
      cost[c] = blocked ? Infinity : surf === B.ROAD ? 1 : surf === B.TILLED || surf === B.TILLED_WET ? 6 : 2.6;
    }
  const start = Math.floor(from.x) + W * Math.floor(from.z);
  const goal = Math.floor(to.x) + W * Math.floor(to.z);
  cost[start] = Math.min(cost[start], 2.6);
  cost[goal] = Math.min(cost[goal], 2.6);
  const g = new Float32Array(W * D).fill(Infinity);
  const prev = new Int32Array(W * D).fill(-1);
  const open: number[] = [start]; // a small binary heap on f
  const f = new Float32Array(W * D).fill(Infinity);
  const h = (c: number) => Math.hypot((c % W) - (goal % W), Math.floor(c / W) - Math.floor(goal / W));
  g[start] = 0;
  f[start] = h(start);
  const push = (c: number) => {
    open.push(c);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (f[open[p]] <= f[open[i]]) break;
      [open[p], open[i]] = [open[i], open[p]];
      i = p;
    }
  };
  const pop = () => {
    const top0 = open[0];
    const last = open.pop()!;
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < open.length && f[open[l]] < f[open[m]]) m = l;
        if (r < open.length && f[open[r]] < f[open[m]]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i], open[m]];
        i = m;
      }
    }
    return top0;
  };
  const closed = new Uint8Array(W * D);
  while (open.length) {
    const c = pop();
    if (c === goal) break;
    if (closed[c]) continue;
    closed[c] = 1;
    const cx = c % W, cz = Math.floor(c / W);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 1 || nz < 1 || nx >= W - 1 || nz >= D - 1) continue;
        const n = nx + W * nz;
        if (cost[n] === Infinity || Math.abs(top[n] - top[c]) > 1) continue;
        if (dx && dz && (cost[cx + dx + W * cz] === Infinity || cost[cx + W * (cz + dz)] === Infinity)) continue; // no corner cutting
        const ng = g[c] + cost[n] * (dx && dz ? 1.414 : 1);
        if (ng < g[n]) {
          g[n] = ng;
          prev[n] = c;
          f[n] = ng + h(n);
          push(n);
        }
      }
  }
  if (prev[goal] < 0 && goal !== start) return null;
  const cells: Pt[] = [];
  for (let c = goal; c >= 0; c = prev[c]) {
    cells.push({ x: (c % W) + 0.5, z: Math.floor(c / W) + 0.5 });
    if (c === start) break;
  }
  cells.reverse();
  return smooth(cells);
}

/** Soften the grid staircase: a few passes of neighbour averaging, keeping the ends fixed. */
function smooth(p: Pt[]): Pt[] {
  let pts = p;
  for (let k = 0; k < 4; k++)
    pts = pts.map((q, i) => (i === 0 || i === pts.length - 1 ? q : { x: (pts[i - 1].x + q.x * 2 + pts[i + 1].x) / 4, z: (pts[i - 1].z + q.z * 2 + pts[i + 1].z) / 4 }));
  return pts;
}

/** Total length of a path in blocks. */
export const pathLength = (p: Pt[]) => p.slice(1).reduce((a, q, i) => a + Math.hypot(q.x - p[i].x, q.z - p[i].z), 0);

/** The point `d` blocks along the path, and the heading there. */
export function along(p: Pt[], d: number): { x: number; z: number; heading: number } {
  let rest = d;
  for (let i = 1; i < p.length; i++) {
    const seg = Math.hypot(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z);
    if (rest <= seg || i === p.length - 1) {
      const t = seg ? Math.min(1, rest / seg) : 1;
      return { x: p[i - 1].x + (p[i].x - p[i - 1].x) * t, z: p[i - 1].z + (p[i].z - p[i - 1].z) * t, heading: Math.atan2(p[i].x - p[i - 1].x, p[i].z - p[i - 1].z) };
    }
    rest -= seg;
  }
  const last = p[p.length - 1];
  return { ...last, heading: 0 };
}
