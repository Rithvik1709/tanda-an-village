import { B } from "../../shared/blocks";
import { D, H, W, type World } from "../../shared/world";

/*
 * The smooth ground. Each world column's top *terrain* block (soil, grass, road, sand — not
 * buildings, fences or trees) gives a height; corners average their columns, then a few blur passes
 * round off the voxel steps. Plots and the village square stay exactly flat, so fields and the
 * farm rules still line up with the grid.
 */
export const TERRAIN = new Set<number>([B.GRASS, B.DIRT, B.BLACK_SOIL, B.RED_SOIL, B.SAND, B.STONE, B.ROAD, B.BEDROCK, B.TILLED, B.TILLED_WET]);
export const RES = 2; // vertices per block

export class Heightfield {
  /** Corner elevations, (W*RES+1) × (D*RES+1). */
  readonly h: Float32Array;
  /** Surface block id per column (what the ground is made of). */
  readonly surface: Uint8Array;
  readonly n = W * RES + 1;

  constructor(world: World) {
    const v = world.voxels;
    const colTop = new Float32Array(W * D);
    this.surface = new Uint8Array(W * D);
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        let y = H - 1;
        for (; y > 0; y--) if (TERRAIN.has(v[x + W * (z + D * y)])) break;
        colTop[x + W * z] = y + 1;
        // the square is level ground: don't let the old well shaft dent it
        if (x >= 82 && x <= 110 && z >= 82 && z <= 110) colTop[x + W * z] = Math.max(colTop[x + W * z], 16);
        this.surface[x + W * z] = v[x + W * (z + D * y)];
      }
    const n = this.n;
    const h = new Float32Array(n * n);
    const pinned = new Uint8Array(n * n);
    const col = (x: number, z: number) => colTop[Math.max(0, Math.min(W - 1, x)) + W * Math.max(0, Math.min(D - 1, z))];
    const flat = (x: number, z: number) => {
      if (x < 0 || z < 0 || x >= W || z >= D) return false;
      return world.plotMap[x + W * z] >= 0 || (x >= 82 && x <= 110 && z >= 82 && z <= 110);
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = i / RES, z = j / RES;
        // sample the column the vertex sits in; corners between columns take their average
        const xs = Number.isInteger(x) ? [x - 1, x] : [Math.floor(x)];
        const zs = Number.isInteger(z) ? [z - 1, z] : [Math.floor(z)];
        let s = 0, c = 0, f = false;
        for (const zz of zs) for (const xx of xs) {
          s += col(xx, zz);
          c++;
          f ||= flat(xx, zz);
        }
        h[i + n * j] = s / c;
        if (f && xs.every((xx) => zs.every((zz) => flat(xx, zz)))) pinned[i + n * j] = 1;
      }
    // soften the steps (leave fields and the square exactly flat)
    const tmp = new Float32Array(n * n);
    for (let pass = 0; pass < 6; pass++) {
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const k = i + n * j;
          if (pinned[k] || i === 0 || j === 0 || i === n - 1 || j === n - 1) {
            tmp[k] = h[k];
            continue;
          }
          tmp[k] = (h[k] * 4 + h[k - 1] + h[k + 1] + h[k - n] + h[k + n]) / 8;
        }
      h.set(tmp);
    }
    this.h = h;
  }

  /** Ground elevation at any point (bilinear between vertices). */
  at(x: number, z: number): number {
    const n = this.n;
    const fx = Math.max(0, Math.min(n - 1.001, x * RES)), fz = Math.max(0, Math.min(n - 1.001, z * RES));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const k = i + n * j;
    const a = this.h[k], b = this.h[k + 1], c = this.h[k + n], d = this.h[k + n + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  /** Surface normal (for slope limits and shading). */
  normal(x: number, z: number): [number, number, number] {
    const e = 0.5;
    const dx = this.at(x + e, z) - this.at(x - e, z), dz = this.at(x, z + e) - this.at(x, z - e);
    const l = Math.hypot(dx, 2 * e, dz);
    return [-dx / l, (2 * e) / l, -dz / l];
  }

  surfaceAt(x: number, z: number) {
    const xi = Math.floor(x), zi = Math.floor(z);
    if (xi < 0 || zi < 0 || xi >= W || zi >= D) return B.GRASS;
    return this.surface[xi + W * zi];
  }
}
