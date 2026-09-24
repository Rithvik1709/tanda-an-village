import { B, block } from "../../shared/blocks";
import { CHUNK, D, H, idx, W } from "../../shared/world";
import { tileUV } from "./uv";

/*
 * Chunk mesher: face culling + per-vertex ambient occlusion + fixed face shading (baked into vertex
 * colours — the soft, toy-like Minecraft look). Three passes: opaque, cutout (leaves, fences, plants),
 * water. Pure function so it runs in a web worker.
 */

export type MeshData = { positions: Float32Array; normals: Float32Array; uvs: Float32Array; colors: Float32Array; indices: Uint32Array };
export type ChunkMesh = { cx: number; cz: number; opaque: MeshData; cutout: MeshData; water: MeshData };

class Builder {
  p: number[] = [];
  n: number[] = [];
  u: number[] = [];
  c: number[] = [];
  i: number[] = [];
  quad(v: number[][], nrm: number[], uv: [number, number, number, number], shade: number[], flip: boolean) {
    const base = this.p.length / 3;
    const uvs = [
      [uv[0], uv[1]],
      [uv[2], uv[1]],
      [uv[2], uv[3]],
      [uv[0], uv[3]],
    ];
    for (let k = 0; k < 4; k++) {
      this.p.push(v[k][0], v[k][1], v[k][2]);
      this.n.push(nrm[0], nrm[1], nrm[2]);
      this.u.push(uvs[k][0], uvs[k][1]);
      this.c.push(shade[k], shade[k], shade[k]);
    }
    // flip the triangulation along the brighter diagonal so AO interpolates without streaks
    if (flip) this.i.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  done(): MeshData {
    return {
      positions: new Float32Array(this.p),
      normals: new Float32Array(this.n),
      uvs: new Float32Array(this.u),
      colors: new Float32Array(this.c),
      indices: new Uint32Array(this.i),
    };
  }
}

// face: normal, the 4 corners (counter-clockwise seen from outside), the "up" axis used for tiles
const FACES = [
  { n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1.0, tile: 0 }, // top
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.55, tile: 2 }, // bottom
  { n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.86, tile: 1 }, // south (+z)
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.8, tile: 1 }, // north (-z)
  { n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.72, tile: 1 }, // east (+x)
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.68, tile: 1 }, // west (-x)
] as const;
const AO = [1.0, 0.8, 0.64, 0.5];

export function meshChunk(vox: Uint8Array, cx: number, cz: number): ChunkMesh {
  const opaque = new Builder();
  const cutout = new Builder();
  const water = new Builder();
  // outside the map counts as solid (nobody can see the outer walls from inside), above it as air
  const get = (x: number, y: number, z: number) => (y >= H ? B.AIR : x < 0 || z < 0 || x >= W || z >= D || y < 0 ? B.STONE : vox[idx(x, y, z)]);
  const occ = (x: number, y: number, z: number) => (block(get(x, y, z)).opaque ? 1 : 0);

  const x0 = cx * CHUNK;
  const z0 = cz * CHUNK;
  for (let y = 0; y < H; y++)
    for (let z = z0; z < z0 + CHUNK; z++)
      for (let x = x0; x < x0 + CHUNK; x++) {
        const id = vox[idx(x, y, z)];
        if (id === B.AIR) continue;
        const def = block(id);

        if (def.shape === "cross") {
          const uv = tileUV(def.tiles[1]);
          const s = 0.85;
          const h = 0.9;
          const a = [x + 0.5 - s / 2, z + 0.5 - s / 2];
          const b = [x + 0.5 + s / 2, z + 0.5 + s / 2];
          const lit = [0.95, 0.95, 1, 1];
          cutout.quad([[a[0], y, a[1]], [b[0], y, b[1]], [b[0], y + h, b[1]], [a[0], y + h, a[1]]], [0.7, 0, -0.7], uv, lit, false);
          cutout.quad([[b[0], y, a[1]], [a[0], y, b[1]], [a[0], y + h, b[1]], [b[0], y + h, a[1]]], [-0.7, 0, -0.7], uv, lit, false);
          continue;
        }

        const target = def.liquid ? water : def.cutout ? cutout : opaque;
        for (const f of FACES) {
          const nx = x + f.n[0];
          const ny = y + f.n[1];
          const nz = z + f.n[2];
          const nid = get(nx, ny, nz);
          const nd = block(nid);
          if (def.liquid) {
            if (nid === B.WATER || (nd.opaque && f.n[1] !== 1)) continue; // water: only faces against air/non-opaque
            if (nd.opaque) continue;
          } else if (nd.opaque || (nid === id && def.cutout)) continue;

          // ambient occlusion per corner: the two side neighbours and the diagonal on the face's plane
          const shade: number[] = [];
          const verts: number[][] = [];
          for (const c of f.c) {
            const vx = x + c[0];
            const vy = y + c[1] - (def.liquid && f.n[1] === 1 && get(x, y + 1, z) !== B.WATER ? 0.12 : 0);
            const vz = z + c[2];
            verts.push([vx, vy, vz]);
            if (def.liquid) {
              shade.push(f.shade);
              continue;
            }
            // offsets toward the corner along the two tangent axes
            const t: number[][] = [];
            for (let axis = 0; axis < 3; axis++) {
              if (f.n[axis] !== 0) continue;
              const o = [0, 0, 0];
              o[axis] = c[axis] === 1 ? 1 : -1;
              t.push(o);
            }
            const s1 = occ(nx + t[0][0], ny + t[0][1], nz + t[0][2]);
            const s2 = occ(nx + t[1][0], ny + t[1][1], nz + t[1][2]);
            const cr = occ(nx + t[0][0] + t[1][0], ny + t[0][1] + t[1][1], nz + t[0][2] + t[1][2]);
            const ao = s1 && s2 ? 3 : s1 + s2 + cr;
            shade.push(f.shade * AO[ao]);
          }
          const tileIndex = def.tiles[f.tile];
          const flip = shade[0] + shade[2] < shade[1] + shade[3];
          target.quad(verts, f.n as unknown as number[], tileUV(tileIndex), shade, flip);
        }
      }
  return { cx, cz, opaque: opaque.done(), cutout: cutout.done(), water: water.done() };
}
