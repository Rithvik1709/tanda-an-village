import { B, block } from "../../shared/blocks";
import { D, H, W } from "../../shared/world";
import { TERRAIN } from "../scene/heightfield";

/*
 * Where people can walk: every column whose ground level is free of walls, fences, well rings,
 * stall posts and tree trunks. Villagers route over this with A* (lanes cheap, fields dearer),
 * and everyone — you included — is kept apart by simple circle separation.
 */
export type Pt = { x: number; z: number };

export class Nav {
  readonly blocked = new Uint8Array(W * D);
  readonly cost = new Float32Array(W * D);

  constructor(vox: Uint8Array, ground: (x: number, z: number) => number) {
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        const c = x + W * z;
        const g = Math.floor(ground(x + 0.5, z + 0.5) + 0.05);
        let solid = false;
        for (let y = g; y < Math.min(H, g + 2) && !solid; y++) {
          const id = vox[x + W * (z + D * y)];
          solid = !!id && !TERRAIN.has(id) && (block(id).solid || id === B.WATER);
        }
        const surf = vox[x + W * (z + D * Math.max(0, g - 1))];
        this.blocked[c] = solid || x === 0 || z === 0 || x === W - 1 || z === D - 1 ? 1 : 0;
        this.cost[c] = surf === B.ROAD ? 1 : surf === B.DIRT ? 1.3 : surf === B.BLACK_SOIL || surf === B.RED_SOIL ? 3 : 2;
      }
  }

  isBlocked(x: number, z: number) {
    const xi = Math.floor(x), zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= W || zi >= D) return true;
    return this.blocked[xi + W * zi] === 1;
  }

  /** Nearest open cell to a point (targets like "a doorstep" may sit on a wall's edge). */
  open(p: Pt): Pt {
    if (!this.isBlocked(p.x, p.z)) return p;
    for (let r = 1; r < 6; r++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) if (!this.isBlocked(p.x + dx, p.z + dz)) return { x: Math.floor(p.x + dx) + 0.5, z: Math.floor(p.z + dz) + 0.5 };
    return p;
  }

  /** A* from a to b; returns smoothed waypoints (cell centres), or a straight line if unreachable. */
  path(a0: Pt, b0: Pt): Pt[] {
    const a = this.open(a0), b = this.open(b0);
    const start = Math.floor(a.x) + W * Math.floor(a.z), goal = Math.floor(b.x) + W * Math.floor(b.z);
    const g = new Float32Array(W * D).fill(Infinity), prev = new Int32Array(W * D).fill(-1), closed = new Uint8Array(W * D);
    const heap: [number, number][] = [];
    const push = (f: number, c: number) => {
      heap.push([f, c]);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const t = heap[0], l = heap.pop()!;
      if (heap.length) {
        heap[0] = l;
        let i = 0;
        for (;;) {
          const L = 2 * i + 1, R = L + 1;
          let m = i;
          if (L < heap.length && heap[L][0] < heap[m][0]) m = L;
          if (R < heap.length && heap[R][0] < heap[m][0]) m = R;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return t[1];
    };
    const hx = goal % W, hz = Math.floor(goal / W);
    g[start] = 0;
    push(0, start);
    while (heap.length) {
      const c = pop();
      if (c === goal) break;
      if (closed[c]) continue;
      closed[c] = 1;
      const cx = c % W, cz = Math.floor(c / W);
      for (let dz = -1; dz <= 1; dz++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const nx = cx + dx, nz = cz + dz;
          if (nx < 0 || nz < 0 || nx >= W || nz >= D) continue;
          const n = nx + W * nz;
          if (this.blocked[n]) continue;
          if (dx && dz && (this.blocked[cx + dx + W * cz] || this.blocked[cx + W * (cz + dz)])) continue;
          const ng = g[c] + this.cost[n] * (dx && dz ? 1.414 : 1);
          if (ng < g[n]) {
            g[n] = ng;
            prev[n] = c;
            push(ng + Math.hypot(nx - hx, nz - hz), n);
          }
        }
    }
    if (prev[goal] < 0) return [a, b];
    const cells: Pt[] = [];
    for (let c = goal; c >= 0; c = prev[c]) {
      cells.push({ x: (c % W) + 0.5, z: Math.floor(c / W) + 0.5 });
      if (c === start) break;
    }
    cells.reverse();
    // drop points that lie on a straight open line between their neighbours
    const out: Pt[] = [cells[0]];
    for (let i = 1; i < cells.length - 1; i++) if (!this.clear(out[out.length - 1], cells[i + 1])) out.push(cells[i]);
    out.push(cells[cells.length - 1]);
    return out;
  }

  /** Is the straight line between two points free of blocked cells (with a little clearance)? */
  clear(a: Pt, b: Pt) {
    const d = Math.hypot(b.x - a.x, b.z - a.z);
    for (let t = 0; t <= d; t += 0.25) {
      const x = a.x + ((b.x - a.x) * t) / (d || 1), z = a.z + ((b.z - a.z) * t) / (d || 1);
      for (const [ox, oz] of [[0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) if (this.isBlocked(x + ox, z + oz)) return false;
    }
    return true;
  }
}

/** Push overlapping bodies apart. `fixed` bodies (stall keepers) never move. */
export function separate(bodies: { pos: Pt; r: number; fixed?: boolean }[], nav: Nav) {
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), min = a.r + b.r;
      if (d >= min || d < 1e-5) continue;
      const push = (min - d) / d;
      const wa = a.fixed ? 0 : b.fixed ? 1 : 0.5, wb = b.fixed ? 0 : a.fixed ? 1 : 0.5;
      const ax = a.pos.x - dx * push * wa, az = a.pos.z - dz * push * wa;
      const bx = b.pos.x + dx * push * wb, bz = b.pos.z + dz * push * wb;
      // never push someone into a wall
      if (!nav.isBlocked(ax, az)) Object.assign(a.pos, { x: ax, z: az });
      if (!nav.isBlocked(bx, bz)) Object.assign(b.pos, { x: bx, z: bz });
    }
}
