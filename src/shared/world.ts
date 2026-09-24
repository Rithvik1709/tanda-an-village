import { B } from "./blocks";
import { fbm } from "./noise";
import { hash2, mulberry32 } from "./rng";

/*
 * Deterministic world generation. The server regenerates the same world from the seed to validate
 * actions (tilling, planting, ownership), so everything here must depend only on `seed`.
 */

export const W = 192; // x
export const D = 192; // z
export const H = 48; // y
export const CHUNK = 16;
export const WATER_LEVEL = 11;
export const WORLD_SEED = 20260924;

export type Plot = {
  id: number;
  name: string;
  x0: number;
  z0: number;
  x1: number; // inclusive
  z1: number;
  y: number; // surface height (the soil block's y)
  soil: number; // 0..1 base soil quality
  water: number; // 0..1 water access (river / well distance)
  road: number; // 0..1 road access
  starter?: boolean;
  gate?: { x: number; z: number; side: "N" | "S" | "E" | "W" }; // the fence opening, facing the road
};

export type Landmark = { x: number; y: number; z: number; label: string };
/** A building or fixture, recorded so the client can model it (the voxels stay for collision). */
export type Structure =
  | { kind: "house"; x0: number; z0: number; w: number; d: number; y: number; walls: "whitewash" | "brick"; roof: "tile" | "thatch"; door: "N" | "S" | "E" | "W" }
  | { kind: "stall"; x0: number; z0: number; w: number; d: number; y: number; awning: "saffron" | "blue" }
  | { kind: "temple"; x0: number; z0: number; y: number }
  | { kind: "well"; x: number; z: number; y: number }
  | { kind: "hay"; x: number; z: number; y: number };
/** A tree: where it stands, how tall, how wide, and the trunk/root columns it occupies in the voxels. */
export type Tree = { kind: "neem" | "banyan"; x: number; y: number; z: number; h: number; r: number; trunks: [number, number, number, number][] };

export type World = {
  seed: number;
  voxels: Uint8Array; // index = x + W * (z + D * y)
  plots: Plot[];
  plotMap: Int16Array; // per column: plot id or -1
  trees: Tree[];
  structures: Structure[];
  landmarks: Record<"spawn" | "temple" | "trader" | "seedShop" | "landOffice" | "bank" | "well" | "market" | "ghat", Landmark>;
};

export const idx = (x: number, y: number, z: number) => x + W * (z + D * y);
export const inWorld = (x: number, y: number, z: number) => x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H;

const MARATHI_PLOT_NAMES = [
  "Nadikath", "Vadacha Mala", "Pimpalwadi", "Kalya Matiche Shet", "Vihirwadi", "Aamrai", "Tekdi", "Devrai",
  "Bandh", "Otyache Shet", "Mhasoba Mala", "Gavthan", "Ghatmatha", "Chinchwadi", "Bor Mala", "Dhangarwadi",
];

export function riverCenter(z: number) {
  return 14 + 5 * Math.sin(z / 27) + 2 * Math.sin(z / 11 + 1.3);
}
export function riverHalfWidth(z: number) {
  return 3.5 + 1.2 * Math.sin(z / 17 + 0.7);
}

export function generateWorld(seed = WORLD_SEED): World {
  const vox = new Uint8Array(W * D * H);
  const plotMap = new Int16Array(W * D).fill(-1);
  const reserved = new Uint8Array(W * D); // columns trees/decoration must avoid
  const height = new Int16Array(W * D);
  const top = new Uint8Array(W * D); // surface block per column
  const col = (x: number, z: number) => x + W * z;
  const set = (x: number, y: number, z: number, b: number) => {
    if (inWorld(x, y, z)) vox[idx(x, y, z)] = b;
  };
  const get = (x: number, y: number, z: number) => (inWorld(x, y, z) ? vox[idx(x, y, z)] : B.AIR);

  /* ---------- 1. terrain heights ---------- */
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 46, z / 46, seed, 4);
      let h = 15 + Math.round((n - 0.5) * 4);
      // hills toward the edges of the map (the ghats in the distance)
      // …but never over the town market or the road to it (they must sit at plain level)
      const marketZone = x > 140 && Math.abs(z - 96) < 26;
      const edge = marketZone ? 0 : Math.max(0, Math.hypot(x - 96, z - 96) - 78);
      h += Math.round(Math.min(10, edge * 0.35) * fbm(x / 20, z / 20, seed + 7, 3) * 1.6);
      // river valley in the west
      const dr = Math.abs(x - riverCenter(z)) - riverHalfWidth(z);
      if (dr < 6) h = Math.min(h, dr <= 0 ? 8 : Math.round(11 + dr * 0.7));
      height[col(x, z)] = Math.max(4, Math.min(H - 10, h));
      top[col(x, z)] = dr <= 1.5 ? B.SAND : B.GRASS;
    }

  /* ---------- 2. flat areas: village square, roads, plots, market ---------- */
  const flatten = (x0: number, z0: number, x1: number, z1: number, y: number, surface: number, mark = true) => {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || z < 0 || x >= W || z >= D) continue;
        height[col(x, z)] = y;
        top[col(x, z)] = surface;
        if (mark) reserved[col(x, z)] = 1;
      }
  };
  const SQUARE = { x0: 82, z0: 82, x1: 110, z1: 110, y: 15 };
  flatten(SQUARE.x0, SQUARE.z0, SQUARE.x1, SQUARE.z1, SQUARE.y, B.GRASS);
  // packed-earth ring around the square
  for (let z = SQUARE.z0; z <= SQUARE.z1; z++)
    for (let x = SQUARE.x0; x <= SQUARE.x1; x++) if (hash2(x, z, seed + 3) < 0.55) top[col(x, z)] = B.DIRT;

  // roads: N–S through the square, E to the town market, W down to the river ghat
  const road = (x0: number, z0: number, x1: number, z1: number) => {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const c = col(x, z);
        const y = Math.max(13, Math.min(17, height[c]));
        height[c] = y;
        top[c] = B.ROAD;
        reserved[c] = 1;
      }
  };
  road(95, 4, 97, 187);
  road(97, 95, 187, 97);
  const ghatX = Math.round(riverCenter(96) + riverHalfWidth(96) + 2);
  road(ghatX, 95, 95, 97);
  // smooth road heights along their length so there are no cliffs
  for (let pass = 0; pass < 6; pass++) {
    for (let z = 5; z < 187; z++) for (let x = 95; x <= 97; x++) height[col(x, z)] = Math.round((height[col(x, z - 1)] + height[col(x, z)] + height[col(x, z + 1)]) / 3);
    for (let x = ghatX + 1; x < 187; x++) for (let z = 95; z <= 97; z++) height[col(x, z)] = Math.round((height[col(x - 1, z)] + height[col(x, z)] + height[col(x + 1, z)]) / 3);
  }
  // the square stays level where roads cross it
  for (let z = SQUARE.z0; z <= SQUARE.z1; z++) for (let x = SQUARE.x0; x <= SQUARE.x1; x++) height[col(x, z)] = SQUARE.y;

  /* ---------- 3. farm plots ---------- */
  const rng = mulberry32(seed ^ 0x51ab);
  const cols: [number, number][] = [
    [36, 60],
    [64, 90],
    [102, 128],
    [132, 166],
  ];
  const rows: [number, number][] = [
    [12, 38],
    [44, 78],
    [114, 146],
    [152, 182],
  ];
  const plots: Plot[] = [];
  let pid = 0;
  for (let ri = 0; ri < rows.length; ri++)
    for (let ci = 0; ci < cols.length; ci++) {
      let [x0, x1] = cols[ci];
      let [z0, z1] = rows[ri];
      const starter = ci === 1 && ri === 1;
      if (starter) {
        // a small plot close to the village to start with
        x0 = 72;
        x1 = 87;
        z0 = 62;
        z1 = 77;
      } else {
        x0 += Math.floor(rng() * 4);
        x1 -= Math.floor(rng() * 4);
        z0 += Math.floor(rng() * 4);
        z1 -= Math.floor(rng() * 4);
      }
      let sum = 0;
      let n = 0;
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          sum += height[col(x, z)];
          n++;
        }
      const y = Math.round(sum / n);
      const red = ci >= 2 && rng() < 0.4;
      flatten(x0, z0, x1, z1, y, red ? B.RED_SOIL : B.BLACK_SOIL);
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) plotMap[col(x, z)] = pid;
      const cx = (x0 + x1) / 2;
      const cz = (z0 + z1) / 2;
      const riverDist = Math.max(0, x0 - (riverCenter(cz) + riverHalfWidth(cz)));
      const roadDist = Math.min(Math.abs(cx - 96) - (x1 - x0) / 2, Math.abs(cz - 96) - (z1 - z0) / 2);
      plots.push({
        id: pid,
        name: MARATHI_PLOT_NAMES[pid],
        x0,
        z0,
        x1,
        z1,
        y,
        soil: starter ? 0.55 : Math.round((0.45 + rng() * 0.5 - (red ? 0.08 : 0)) * 100) / 100,
        water: Math.round(Math.max(0.2, Math.min(1, 1 - riverDist / 120)) * 100) / 100,
        road: Math.round(Math.max(0.2, Math.min(1, 1 - Math.max(0, roadDist) / 60)) * 100) / 100,
        starter,
      });
      pid++;
    }

  /* ---------- 4. write columns ---------- */
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const c = col(x, z);
      const h = height[c];
      set(x, 0, z, B.BEDROCK);
      for (let y = 1; y < h - 3; y++) set(x, y, z, B.STONE);
      for (let y = Math.max(1, h - 3); y < h; y++) set(x, y, z, top[c] === B.SAND ? B.SAND : B.DIRT);
      set(x, h, z, top[c]);
      for (let y = h + 1; y <= WATER_LEVEL; y++) set(x, y, z, B.WATER);
    }

  /* ---------- 5. fences around plots, with a gate facing the nearest road ---------- */
  for (const p of plots) {
    const gateSide = Math.abs((p.x0 + p.x1) / 2 - 96) > Math.abs((p.z0 + p.z1) / 2 - 96) ? ((p.x0 + p.x1) / 2 < 96 ? "E" : "W") : (p.z0 + p.z1) / 2 < 96 ? "S" : "N";
    const midX = Math.round((p.x0 + p.x1) / 2);
    const midZ = Math.round((p.z0 + p.z1) / 2);
    const isGate = (x: number, z: number) =>
      (gateSide === "N" && z === p.z0 && Math.abs(x - midX) <= 1) ||
      (gateSide === "S" && z === p.z1 && Math.abs(x - midX) <= 1) ||
      (gateSide === "W" && x === p.x0 && Math.abs(z - midZ) <= 1) ||
      (gateSide === "E" && x === p.x1 && Math.abs(z - midZ) <= 1);
    p.gate = { x: gateSide === "W" ? p.x0 : gateSide === "E" ? p.x1 : midX, z: gateSide === "N" ? p.z0 : gateSide === "S" ? p.z1 : midZ, side: gateSide };
    for (let x = p.x0; x <= p.x1; x++)
      for (const z of [p.z0, p.z1]) {
        set(x, p.y, z, B.GRASS);
        if (!isGate(x, z)) set(x, p.y + 1, z, B.FENCE);
      }
    for (let z = p.z0; z <= p.z1; z++)
      for (const x of [p.x0, p.x1]) {
        set(x, p.y, z, B.GRASS);
        if (!isGate(x, z)) set(x, p.y + 1, z, B.FENCE);
      }
    for (const [x, z] of [
      [p.x0, p.z0],
      [p.x1, p.z0],
      [p.x0, p.z1],
      [p.x1, p.z1],
    ]) {
      set(x, p.y + 1, z, B.LOG);
      set(x, p.y + 2, z, B.LOG);
    }
  }

  /* ---------- 6. buildings ---------- */
  const structures: Structure[] = [];
  const house = (x0: number, z0: number, w: number, d: number, walls: number, roof: number, doorSide: "N" | "S" | "E" | "W") => {
    const y0 = height[col(x0, z0)] + 1;
    structures.push({ kind: "house", x0, z0, w, d, y: y0, walls: walls === B.BRICK ? "brick" : "whitewash", roof: roof === B.THATCH ? "thatch" : "tile", door: doorSide });
    const x1 = x0 + w - 1;
    const z1 = z0 + d - 1;
    flatten(x0 - 1, z0 - 1, x1 + 1, z1 + 1, y0 - 1, B.DIRT);
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = y0; y < y0 + 8; y++) set(x, y, z, B.AIR);
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 1; x++) set(x, y0 - 1, z, B.DIRT);
    for (let y = y0; y < y0 + 3; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const edge = x === x0 || x === x1 || z === z0 || z === z1;
          if (!edge) continue;
          const corner = (x === x0 || x === x1) && (z === z0 || z === z1);
          set(x, y, z, corner ? B.LOG : walls);
        }
    // door (2 high, painted blue frame) and windows
    const dx = Math.round((x0 + x1) / 2);
    const dz = Math.round((z0 + z1) / 2);
    const door = doorSide === "N" ? [dx, z0] : doorSide === "S" ? [dx, z1] : doorSide === "W" ? [x0, dz] : [x1, dz];
    set(door[0], y0, door[1], B.AIR);
    set(door[0], y0 + 1, door[1], B.AIR);
    set(door[0], y0 + 2, door[1], B.BLUE_WOOD);
    if (w > 4) {
      set(x0 + 1, y0 + 1, z0, B.BLUE_WOOD);
      set(x1 - 1, y0 + 1, z1, B.BLUE_WOOD);
    }
    // stepped roof
    for (let s = 0; s <= Math.ceil(Math.min(w, d) / 2); s++)
      for (let z = z0 - 1 + s; z <= z1 + 1 - s; z++)
        for (let x = x0 - 1 + s; x <= x1 + 1 - s; x++) {
          if (x0 - 1 + s > x1 + 1 - s || z0 - 1 + s > z1 + 1 - s) continue;
          set(x, y0 + 3 + s, z, roof);
        }
    for (let x = x0; x <= x1; x++) for (let z = z0 - 1; z <= z1 + 1; z++) reserved[col(x, z)] = 1;
    return { x: door[0], y: y0, z: door[1] + (doorSide === "N" ? -2 : doorSide === "S" ? 2 : 0) };
  };

  const stall = (x0: number, z0: number, w: number, d: number, awning: number) => {
    const y0 = height[col(x0, z0)] + 1;
    structures.push({ kind: "stall", x0, z0, w, d, y: y0, awning: awning === B.SAFFRON ? "saffron" : "blue" });
    for (const [x, z] of [
      [x0, z0],
      [x0 + w - 1, z0],
      [x0, z0 + d - 1],
      [x0 + w - 1, z0 + d - 1],
    ]) {
      set(x, y0, z, B.LOG);
      set(x, y0 + 1, z, B.LOG);
      set(x, y0 + 2, z, B.LOG);
    }
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) set(x, y0 + 3, z, awning);
    for (let x = x0 + 1; x < x0 + w - 1; x++) set(x, y0, z0 + d - 1, B.PLANKS); // counter
    for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) reserved[col(x, z)] = 1;
    return { x: Math.round(x0 + w / 2), y: y0, z: z0 + d + 1 };
  };

  // temple: whitewash plinth + stepped shikhara + saffron flag
  const temple = (() => {
    const x0 = 84;
    const z0 = 84;
    const y0 = SQUARE.y + 1;
    structures.push({ kind: "temple", x0, z0, y: y0 });
    for (let z = z0; z < z0 + 9; z++) for (let x = x0; x < x0 + 9; x++) set(x, y0, z, B.COBBLE);
    for (let s = 0; s < 6; s++) {
      const a = x0 + 1 + Math.floor(s / 2);
      const b = x0 + 7 - Math.floor(s / 2);
      for (let z = a; z <= b; z++) for (let x = a; x <= b; x++) set(x, y0 + 1 + s, z + (z0 - x0), s < 2 && x > a && x < b && z > a && z < b ? B.AIR : B.WHITEWASH);
    }
    set(x0 + 4, y0 + 1, z0 + 8, B.AIR);
    set(x0 + 4, y0 + 2, z0 + 8, B.AIR);
    set(x0 + 4, y0 + 7, z0 + 4, B.SAFFRON);
    set(x0 + 4, y0 + 8, z0 + 4, B.LOG);
    set(x0 + 4, y0 + 9, z0 + 4, B.SAFFRON);
    set(x0 + 5, y0 + 9, z0 + 4, B.SAFFRON);
    for (let z = z0; z < z0 + 9; z++) for (let x = x0; x < x0 + 9; x++) reserved[col(x, z)] = 1;
    return { x: x0 + 4, y: y0, z: z0 + 10 };
  })();

  const trader = stall(100, 84, 5, 4, B.SAFFRON);
  const seedShop = stall(100, 100, 5, 4, B.BLUE_WOOD);
  const landOffice = house(84, 100, 6, 5, B.WHITEWASH, B.ROOF_TILE, "E");
  const bank = house(111, 100, 7, 6, B.BRICK, B.ROOF_TILE, "N");

  // the village well
  const well = (() => {
    const cx = 91;
    const cz = 95;
    const y0 = SQUARE.y;
    structures.push({ kind: "well", x: cx, z: cz, y: y0 + 1 });
    for (let z = cz - 1; z <= cz + 1; z++)
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (let y = y0 - 5; y <= y0; y++) set(x, y, z, x === cx && z === cz ? (y < y0 ? B.WATER : B.AIR) : B.COBBLE);
        set(x, y0 + 1, z, x === cx && z === cz ? B.AIR : B.COBBLE);
      }
    set(cx - 1, y0 + 2, cz - 1, B.LOG);
    set(cx + 1, y0 + 2, cz + 1, B.LOG);
    reserved[col(cx, cz)] = 1;
    return { x: cx, y: y0 + 1, z: cz + 2 };
  })();

  // houses along the north road
  house(100, 56, 6, 5, B.WHITEWASH, B.THATCH, "W");
  house(100, 66, 5, 5, B.WHITEWASH, B.ROOF_TILE, "W");
  house(88, 50, 5, 5, B.WHITEWASH, B.THATCH, "E");
  house(100, 118, 6, 5, B.WHITEWASH, B.THATCH, "W");
  house(88, 122, 5, 6, B.BRICK, B.ROOF_TILE, "E");

  // town market at the end of the east road
  const market = (() => {
    const cx = 180;
    flatten(170, 84, 190, 108, 15, B.DIRT);
    for (let z = 84; z <= 108; z++) for (let x = 170; x <= 190; x++) if (hash2(x, z, seed + 9) < 0.35) top[col(x, z)] = B.ROAD;
    for (let z = 84; z <= 108; z++)
      for (let x = 170; x <= 190; x++) {
        for (let y = 12; y <= 15; y++) set(x, y, z, y === 15 ? top[col(x, z)] : B.DIRT);
        for (let y = 16; y < 30; y++) set(x, y, z, B.AIR);
      }
    // re-lay the road into the market (the fill above covered it)
    for (let x = 170; x <= 187; x++) for (let z = 95; z <= 97; z++) set(x, 15, z, B.ROAD);
    stall(172, 86, 5, 4, B.SAFFRON);
    stall(180, 86, 5, 4, B.BLUE_WOOD);
    stall(172, 101, 5, 4, B.BLUE_WOOD);
    stall(180, 101, 5, 4, B.SAFFRON);
    for (const [x, z] of [
      [186, 92],
      [187, 92],
      [186, 93],
      [178, 99],
    ]) {
      set(x, 16, z, B.HAY);
      structures.push({ kind: "hay", x, z, y: 16 });
    }
    return { x: cx, y: 16, z: 96 };
  })();

  /* ---------- 7. trees: neem everywhere, a few great banyans ---------- */
  const treeRng = mulberry32(seed ^ 0x7ee);
  const canTree = (x: number, z: number, r: number) => {
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const X = x + dx;
        const Z = z + dz;
        if (X < 1 || Z < 1 || X >= W - 1 || Z >= D - 1) return false;
        if (reserved[col(X, Z)]) return false;
      }
    const t = top[col(x, z)];
    return t === B.GRASS && height[col(x, z)] > WATER_LEVEL;
  };
  const trees: Tree[] = [];
  const neem = (x: number, z: number) => {
    const y0 = height[col(x, z)] + 1;
    const h = 4 + Math.floor(treeRng() * 2);
    for (let y = y0; y < y0 + h; y++) set(x, y, z, B.LOG);
    const cy = y0 + h;
    const r = 2 + (treeRng() < 0.4 ? 1 : 0);
    trees.push({ kind: "neem", x: x + 0.5, y: y0, z: z + 0.5, h, r, trunks: [[x, z, y0, y0 + h - 1]] });
    for (let dy = -1; dy <= 2; dy++)
      for (let dz = -r; dz <= r; dz++)
        for (let dx = -r; dx <= r; dx++) {
          const d = Math.hypot(dx, dz * 1.05, dy * 1.4);
          if (d <= r + 0.35 && hash2(x + dx * 7, z + dz * 5 + dy * 3, seed) > 0.06 && get(x + dx, cy + dy, z + dz) === B.AIR) set(x + dx, cy + dy, z + dz, B.LEAVES);
        }
  };
  const banyan = (x: number, z: number) => {
    const y0 = height[col(x, z)] + 1;
    for (let y = y0; y < y0 + 6; y++)
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ])
        set(x + dx, y, z + dz, B.LOG);
    // aerial roots
    for (const [dx, dz] of [
      [-3, 1],
      [4, -1],
      [1, 4],
      [0, -3],
    ])
      for (let y = y0; y < y0 + 5; y++) set(x + dx, y, z + dz, B.LOG);
    const cy = y0 + 6;
    trees.push({
      kind: "banyan", x: x + 1, y: y0, z: z + 1, h: 6, r: 6.6,
      trunks: [[x, z, y0, y0 + 5], [x + 1, z, y0, y0 + 5], [x, z + 1, y0, y0 + 5], [x + 1, z + 1, y0, y0 + 5], [x - 3, z + 1, y0, y0 + 4], [x + 4, z - 1, y0, y0 + 4], [x + 1, z + 4, y0, y0 + 4], [x, z - 3, y0, y0 + 4]],
    });
    for (let dy = -1; dy <= 2; dy++)
      for (let dz = -6; dz <= 7; dz++)
        for (let dx = -6; dx <= 7; dx++) {
          const d = Math.hypot(dx - 0.5, dz - 0.5, dy * 2.2);
          if (d <= 6.6 && hash2(x + dx * 3, z + dz * 5 + dy, seed + 1) > 0.05 && get(x + dx, cy + dy, z + dz) === B.AIR) set(x + dx, cy + dy, z + dz, B.BANYAN_LEAVES);
        }
    for (let dz = -6; dz <= 7; dz++) for (let dx = -6; dx <= 7; dx++) if (x + dx >= 0 && z + dz >= 0 && x + dx < W && z + dz < D) reserved[col(x + dx, z + dz)] = 1;
  };
  // the village banyan, in the square's corner; two more at the ghat and on the market road
  banyan(104, 106);
  for (const [bx, bz] of [
    [ghatX + 4, 102],
    [150, 102],
  ])
    if (canTree(bx, bz, 1)) banyan(bx, bz);
  for (let gz = 2; gz < D - 2; gz += 7)
    for (let gx = 2; gx < W - 2; gx += 7) {
      if (treeRng() > 0.42) continue;
      const x = gx + Math.floor(treeRng() * 5);
      const z = gz + Math.floor(treeRng() * 5);
      if (canTree(x, z, 2)) neem(x, z);
    }
  // a neat row of neem trees along the east road
  for (let x = 112; x < 168; x += 9) {
    if (canTree(x, 92, 1)) neem(x, 92);
    if (canTree(x + 4, 100, 1)) neem(x + 4, 100);
  }

  /* ---------- 8. grass tufts and marigolds ---------- */
  for (let z = 1; z < D - 1; z++)
    for (let x = 1; x < W - 1; x++) {
      const c = col(x, z);
      if (reserved[c] || top[c] !== B.GRASS) continue;
      const y = height[c] + 1;
      if (get(x, y, z) !== B.AIR) continue;
      const r = hash2(x, z, seed + 21);
      if (r < 0.1) set(x, y, z, B.TALL_GRASS);
      else if (r < 0.112) set(x, y, z, B.MARIGOLD);
    }

  const lm = (p: { x: number; y: number; z: number }, label: string): Landmark => ({ ...p, label });
  const starter = plots.find((p) => p.starter)!;
  return {
    seed,
    voxels: vox,
    plots,
    plotMap,
    trees,
    structures,
    landmarks: {
      spawn: { x: 96.5, y: SQUARE.y + 1, z: 90.5, label: "Village square" },
      temple: lm(temple, "Temple"),
      trader: lm(trader, "Trader"),
      seedShop: lm(seedShop, "Seed & tool shop"),
      landOffice: lm(landOffice, "Land office"),
      bank: lm(bank, "Cooperative bank"),
      well: lm(well, "Well"),
      market: lm(market, "Town market"),
      ghat: { x: ghatX, y: 12, z: 96, label: `River ghat (near ${starter.name})` },
    },
  };
}

/** The highest non-air block's y at a column (for placing things and the camera). */
export function surfaceY(w: World, x: number, z: number): number {
  for (let y = H - 1; y >= 0; y--) {
    const b = w.voxels[idx(x, y, z)];
    if (b !== B.AIR && b !== B.WATER && b !== B.TALL_GRASS && b !== B.MARIGOLD) return y;
  }
  return 0;
}
