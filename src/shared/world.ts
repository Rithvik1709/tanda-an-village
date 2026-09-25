import { B } from "./blocks.js";
import { hoursText } from "./hours.js";
import { type RoadKind, UKHALI_ROADS } from "./ukhali-osm.js";
import { fbm } from "./noise.js";
import { hash2, mulberry32 } from "./rng.js";

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
/** Aamrai's plot id on the Ukhali map (layout 2). */
export const STARTER_PLOT = 9;
/** Bumped whenever plot ids or positions change, so old saves can be moved to the new map. */
export const LAYOUT = 2;

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
  | { kind: "hay"; x: number; z: number; y: number }
  | { kind: "hanuman"; x0: number; z0: number; y: number } // a small open shrine, facing west
  | { kind: "school"; x0: number; z0: number; w: number; d: number; y: number } // the ZP school, verandah facing west
  | { kind: "pir"; x: number; z: number; y: number } // the pir: a roof on four posts, open on all sides
  | { kind: "tank"; x: number; z: number; y: number }
  | { kind: "statue"; x: number; z: number; y: number; facing: number } // Vasantrao Naik, in bronze, in the chowk // the village's overhead water tank, on the tekdi top
  | { kind: "plate"; x: number; z: number; y: number; facing: number; lines: string[]; color?: string }
  /** Rathod Bhuvan: a long two-storey wooden wada, three homes under one roof, its back to the lane and
   *  its carved verandah facing the village (east). The player's home. */
  | { kind: "wada"; x0: number; z0: number; w: number; d: number; y: number; name: string }
  /** The kabaddi maidan behind the school: a level earth ground (y is the ground you stand on). */
  | { kind: "kabaddi"; x0: number; z0: number; x1: number; z1: number; y: number }
  /** The talav: a small pond (an ellipse), its water surface at `level`. */
  | { kind: "talav"; x: number; z: number; rx: number; rz: number; level: number; y: number };

/** The kabaddi maidan: columns x0..x1, z0..z1, its top block at y (you stand at y + 1). */
export const MAIDAN = { x0: 135, z0: 84, x1: 144, z1: 98, y: 16 } as const;
/** The court drawn on it: 8 × 12, the midline across z = COURT.mid. Raiders start on the south half. */
export const COURT = { x0: 135.5, x1: 143.5, z0: 85, z1: 97, mid: 91 } as const;
/** The talav behind the maidan: an ellipse of water in a hollow at the foot of the tekdi. */
export const TALAV = { x: 151.5, z: 91.5, rx: 3.3, rz: 4.6, level: 20.6, floor: 18 } as const;
/** How far a point is outside the talav's edge (negative: in the water), roughly in blocks. */
export const talavOut = (x: number, z: number) => (Math.sqrt(((x - TALAV.x) / TALAV.rx) ** 2 + ((z - TALAV.z) / TALAV.rz) ** 2) - 1) * Math.min(TALAV.rx, TALAV.rz);
/** A tree: where it stands, how tall, how wide, and the trunk/root columns it occupies in the voxels. */
export type Tree = { kind: "neem" | "banyan"; x: number; y: number; z: number; h: number; r: number; trunks: [number, number, number, number][] };

export type World = {
  seed: number;
  voxels: Uint8Array; // index = x + W * (z + D * y)
  plots: Plot[];
  plotMap: Int16Array; // per column: plot id or -1
  /** The chowk (village square): flat, open ground. */
  chowk: { x0: number; z0: number; x1: number; z1: number; y: number };
  trees: Tree[];
  structures: Structure[];
  landmarks: Record<"spawn" | "temple" | "hanuman" | "school" | "pir" | "tank" | "home" | "trader" | "seedShop" | "landOffice" | "bank" | "well" | "market" | "ghat" | "kabaddi" | "talav" | "mukadam", Landmark>;
};

export const idx = (x: number, y: number, z: number) => x + W * (z + D * y);
export const inWorld = (x: number, y: number, z: number) => x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H;

const MARATHI_PLOT_NAMES = [
  "Nadikath", "Vadacha Mala", "Pimpalwadi", "Kalya Matiche Shet", "Vihirwadi", "Otyache Shet", "Tekdi", "Devrai",
  "Bandh", "Aamrai", "Mhasoba Mala", "Gavthan", "Ghatmatha", "Chinchwadi", "Bor Mala", "Dhangarwadi",
];

export function riverCenter(z: number) {
  return 14 + 5 * Math.sin(z / 27) + 2 * Math.sin(z / 11 + 1.3);
}
export function riverHalfWidth(z: number) {
  return 3.5 + 1.2 * Math.sin(z / 17 + 0.7);
}

/** Distance from a column to the tekdi's spine. */
function ridgeDist(x: number, z: number) {
  const ax = 146, az = 60, bx = 160, bz = 97;
  const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
  return Math.hypot(x - (ax + (bx - ax) * t), z - (az + (bz - az) * t));
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

  /* ---------- 1. terrain: the gentle Deccan plain, rising into red scrub land to the east ---------- */
  const scrub = (x: number, z: number) => Math.max(0, Math.min(1, (x - 132) / 26)) * Math.max(0, Math.min(1, (158 - z) / 18)) * Math.max(0, Math.min(1, (z - 58) / 14));
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++) {
      const n = fbm(x / 52, z / 52, seed, 4);
      let h = 15 + Math.round((n - 0.5) * 3);
      const sc = scrub(x, z);
      h += Math.round(sc * (2 + 3 * fbm(x / 18, z / 18, seed + 7, 3)));
      // the tekdi: a rocky ridge running north–south beside the temple, east of the village
      const rd = ridgeDist(x, z);
      const ridge = Math.exp(-((rd / 10) ** 2)) * (8 + 4 * fbm(x / 11, z / 11, seed + 13, 3));
      h += Math.round(ridge);
      height[col(x, z)] = Math.max(12, Math.min(H - 10, h));
      top[col(x, z)] = ridge > 7 && fbm(x / 5, z / 5, seed + 17, 2) > 0.5 ? B.STONE : (sc > 0.35 || ridge > 3) && fbm(x / 7, z / 7, seed + 5, 2) > 0.45 ? B.RED_SOIL : B.GRASS;
    }

  /* ---------- 2. the village ground, and the real roads of Ukhali (from OpenStreetMap) ---------- */
  const flatten = (x0: number, z0: number, x1: number, z1: number, y: number, surface: number, mark = true) => {
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        if (x < 0 || z < 0 || x >= W || z >= D) continue;
        height[col(x, z)] = y;
        top[col(x, z)] = surface;
        if (mark) reserved[col(x, z)] = 1;
      }
  };
  // the gaothan (village site) sits on one level; the chowk is its open heart
  const inVillage = (x: number, z: number) => {
    const dx = (x - 104) / 29, dz = (z - 112) / 40;
    return dx * dx + dz * dz < 1;
  };
  for (let z = 70; z <= 152; z++) for (let x = 74; x <= 132; x++) if (inVillage(x, z)) height[col(x, z)] = 15;
  const SQUARE = { x0: 97, z0: 108, x1: 113, z1: 122, y: 15 };
  flatten(SQUARE.x0, SQUARE.z0, SQUARE.x1, SQUARE.z1, SQUARE.y, B.DIRT);
  for (let z = SQUARE.z0; z <= SQUARE.z1; z++) for (let x = SQUARE.x0; x <= SQUARE.x1; x++) if (hash2(x, z, seed + 3) < 0.4) top[col(x, z)] = B.GRASS;
  // roads: stamp each polyline with its width; main roads are wider, field tracks narrower
  const roadCells = new Uint8Array(W * D);
  const WIDTH: Record<RoadKind, number> = { main: 2.2, road: 1.7, lane: 1.3, track: 1.0 };
  for (const r of UKHALI_ROADS) {
    const w = WIDTH[r.k];
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= len; t += 0.4) {
        const x = ax + ((bx - ax) * t) / Math.max(len, 1e-6), z = az + ((bz - az) * t) / Math.max(len, 1e-6);
        for (let dz = -Math.ceil(w); dz <= Math.ceil(w); dz++)
          for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
            const X = Math.round(x + dx), Z = Math.round(z + dz);
            if (X < 0 || Z < 0 || X >= W || Z >= D || Math.hypot(X - x, Z - z) > w) continue;
            roadCells[col(X, Z)] = r.k === "track" ? 2 : 1;
          }
      }
    }
  }
  for (let c = 0; c < W * D; c++)
    if (roadCells[c]) {
      top[c] = roadCells[c] === 2 ? B.DIRT : B.ROAD;
      reserved[c] = 1;
    }
  // roads run smooth: blur their heights so there are no steps
  for (let pass = 0; pass < 4; pass++)
    for (let z = 1; z < D - 1; z++)
      for (let x = 1; x < W - 1; x++) {
        const c = col(x, z);
        if (!roadCells[c] || inVillage(x, z)) continue;
        height[c] = Math.round((height[c] * 2 + height[c - 1] + height[c + 1] + height[c - W] + height[c + W]) / 6);
      }

  /* ---------- 3. the fields: laid over the real field strips around the village ---------- */
  const rng = mulberry32(seed ^ 0x51ab);
  const FIELDS: [number, number, number, number][] = [
    [58, 30, 77, 41], [84, 30, 101, 41], [102, 42, 124, 60], [58, 50, 77, 68],
    [30, 44, 54, 62], [4, 40, 26, 60], [4, 72, 28, 94], [30, 76, 54, 96],
    [18, 106, 46, 122], [58, 104, 72, 119], [4, 126, 30, 150], [34, 128, 60, 148],
    [10, 158, 50, 184], [96, 160, 126, 188], [136, 162, 168, 186], [140, 100, 166, 124],
  ];
  const STARTER = STARTER_PLOT;
  const WELLS: [number, number][] = [
    [104, 125], // the village well, at the edge of the chowk
    [50, 100], // the vihir: a round open well in the fields, visible on the satellite image
  ];
  const plots: Plot[] = [];
  FIELDS.forEach(([x0, z0, x1, z1], pid) => {
    let sum = 0;
    let n = 0;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        sum += height[col(x, z)];
        n++;
      }
    const y = Math.round(sum / n);
    const starter = pid === STARTER;
    const red = x0 > 130 || (!starter && rng() < 0.2);
    flatten(x0, z0, x1, z1, y, red ? B.RED_SOIL : B.BLACK_SOIL);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) plotMap[col(x, z)] = pid;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const wellDist = Math.min(...WELLS.map(([wx, wz]) => Math.hypot(wx - cx, wz - cz)));
    let roadDist = 99;
    for (let z = z0 - 6; z <= z1 + 6; z += 2) for (let x = x0 - 6; x <= x1 + 6; x += 2) if (x >= 0 && z >= 0 && x < W && z < D && roadCells[col(x, z)]) roadDist = Math.min(roadDist, Math.max(0, Math.max(x0 - x, x - x1, z0 - z, z - z1)));
    plots.push({
      id: pid,
      name: MARATHI_PLOT_NAMES[pid],
      x0,
      z0,
      x1,
      z1,
      y,
      soil: starter ? 0.55 : Math.round((0.45 + rng() * 0.5 - (red ? 0.08 : 0)) * 100) / 100,
      water: Math.round(Math.max(0.2, Math.min(1, 1 - wellDist / 110)) * 100) / 100,
      road: Math.round(Math.max(0.2, Math.min(1, 1 - roadDist / 12)) * 100) / 100,
      starter,
    });
  });

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
    // the gate opens toward the nearest road or lane
    let best = { d: 1e9, side: "S" as "N" | "S" | "E" | "W" };
    for (let z = 0; z < D; z += 1)
      for (let x = 0; x < W; x += 1) {
        if (!roadCells[col(x, z)]) continue;
        const dx = x < p.x0 ? p.x0 - x : x > p.x1 ? x - p.x1 : 0, dz = z < p.z0 ? p.z0 - z : z > p.z1 ? z - p.z1 : 0;
        const d = Math.hypot(dx, dz);
        if (d >= best.d) continue;
        best = { d, side: dx > dz ? (x < p.x0 ? "W" : "E") : z < p.z0 ? "N" : "S" };
      }
    const gateSide = best.side;
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
  const temple = ((x0: number, z0: number) => {
    const y0 = height[col(x0 + 4, z0 + 4)] + 1;
    flatten(x0 - 1, z0 - 1, x0 + 9, z0 + 10, y0 - 1, B.DIRT);
    structures.push({ kind: "temple", x0, z0, y: y0 });
    for (let z = z0; z < z0 + 9; z++) for (let x = x0; x < x0 + 9; x++) set(x, y0, z, B.COBBLE);
    for (let s = 0; s < 6; s++) {
      const a = x0 + 1 + Math.floor(s / 2);
      const b = x0 + 7 - Math.floor(s / 2);
      for (let z = a; z <= b; z++) for (let x = a; x <= b; x++) set(x, y0 + 1 + s, z + (z0 - x0), s < 2 && x > a && x < b && z > a && z < b ? B.AIR : B.WHITEWASH);
    }
    // the sanctum door stays open
    for (const dx of [3, 4, 5]) for (const dy of [1, 2]) set(x0 + dx, y0 + dy, z0 + 7, B.AIR);
    set(x0 + 4, y0 + 7, z0 + 4, B.SAFFRON);
    set(x0 + 4, y0 + 8, z0 + 4, B.LOG);
    set(x0 + 4, y0 + 9, z0 + 4, B.SAFFRON);
    set(x0 + 5, y0 + 9, z0 + 4, B.SAFFRON);
    for (let z = z0; z < z0 + 9; z++) for (let x = x0; x < x0 + 9; x++) reserved[col(x, z)] = 1;
    return { x: x0 + 4, y: y0, z: z0 + 10 };
  })(113, 95); // the Sevalal Maharaj mandir, north-east of the chowk
  // level a building's ground in the voxels too (the columns were written before the buildings)
  const pad = (x0: number, z0: number, x1: number, z1: number, y: number) => {
    flatten(x0, z0, x1, z1, y, B.DIRT);
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        for (let k = y - 4; k <= y; k++) set(x, k, z, B.DIRT);
        for (let k = y + 1; k < y + 12; k++) if (get(x, k, z) !== B.LOG) set(x, k, z, B.AIR);
      }
  };
  const plate = (x: number, z: number, y: number, facing: number, lines: string[], color?: string) => structures.push({ kind: "plate", x, z, y, facing, lines, color });
  plate(temple.x - 3.2, temple.z + 0.3, temple.y, 0.35, ["संत सेवालाल महाराज मंदिर", "Sant Sevalal Maharaj Mandir"], "#c2410c");
  const wallRing = (x0: number, z0: number, w: number, d: number, y0: number, h: number, b: number, door?: { side: "W" | "S"; at: number; wide: number }) => {
    for (let y = y0; y < y0 + h; y++)
      for (let z = z0; z < z0 + d; z++)
        for (let x = x0; x < x0 + w; x++) {
          if (x !== x0 && x !== x0 + w - 1 && z !== z0 && z !== z0 + d - 1) continue;
          if (door && y < y0 + 2 && ((door.side === "W" && x === x0 && Math.abs(z - door.at) < door.wide) || (door.side === "S" && z === z0 + d - 1 && Math.abs(x - door.at) < door.wide))) continue;
          set(x, y, z, b);
        }
  };
  // the Hanuman mandir: a small shrine by the Sevalal mandir, its door open to the west
  const hanuman = (() => {
    const x0 = 124, z0 = 99;
    const y0 = height[col(x0 + 2, z0 + 2)] + 1;
    pad(x0 - 1, z0 - 1, x0 + 5, z0 + 5, y0 - 1);
    wallRing(x0, z0, 5, 5, y0, 3, B.SAFFRON, { side: "W", at: z0 + 2, wide: 1 });
    structures.push({ kind: "hanuman", x0, z0, y: y0 });
    plate(x0 - 1.2, z0 + 4.2, y0, -Math.PI / 2, ["श्री हनुमान मंदिर", "Shri Hanuman Mandir"], "#c2410c");
    return { x: x0 - 1, y: y0, z: z0 + 2.5 };
  })();
  // the Zilla Parishad school: a long classroom block with a verandah, a compound wall and a flag
  const school = (() => {
    const x0 = 124, z0 = 84, w = 9, d = 6;
    const y0 = height[col(x0 + 4, z0 + 3)] + 1;
    pad(x0 - 4, z0 - 2, x0 + w + 1, z0 + d + 3, y0 - 1);
    wallRing(x0, z0, w, d, y0, 3, B.WHITEWASH, { side: "W", at: z0 + 3, wide: 1 });
    structures.push({ kind: "school", x0, z0, w, d, y: y0 });
    plate(x0 - 1.4, z0 + 3, y0 + 1.6, -Math.PI / 2, ["जिल्हा परिषद प्राथमिक शाळा", "उखळी तांडा, ता. जि. जालना", "Z.P. Primary School, Ukhali Tanda"], "#1d4ed8");
    return { x: x0 - 2, y: y0, z: z0 + 3 };
  })();
  // the pir on top of the tekdi: a roof on four posts over the mazar, a tree beside it
  const pir = (() => {
    const x = 151, z = 73;
    let y = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) y = Math.max(y, height[col(x + dx, z + dz)]);
    pad(x - 3, z - 3, x + 3, z + 3, y);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let k = 1; k <= 3; k++) set(x + dx, y + k, z + dz, B.LOG);
    set(x, y + 1, z, B.COBBLE); // the mazar
    structures.push({ kind: "pir", x, z, y: y + 1 });
    plate(x - 3.2, z + 2.2, y + 1, -Math.PI / 2, ["पीर बाबा", "Pir Baba"], "#15803d");
    return { x: x - 3, y: y + 1, z };
  })();
  // the pani ki tanki beside it: the tanda's water tank, standing tall on the hilltop
  const tank = (() => {
    // halfway up the tekdi's west face, on a terrace cut a little below the slope
    const x = 146, z = 80;
    let sum = 0;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) sum += height[col(x + dx, z + dz)];
    const y = Math.round(sum / 49) - 1;
    pad(x - 3, z - 3, x + 3, z + 3, y);
    for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let k = 1; k <= 3; k++) set(x + dx, y + k, z + dz, B.COBBLE);
    structures.push({ kind: "tank", x, z, y: y + 1 });
    return { x: x - 4, y: y + 1, z };
  })();
  plate(school.x + 0.2, school.z + 4, school.y, -Math.PI / 2, ["→ शाळा · मंदिर · पीर", "School · Mandir · Pir"]);

  // the chowk: Ganpat's and Sitabai's stalls on its north side, the Naik's kacheri to the west
  const trader = stall(98, 109, 5, 4, B.SAFFRON);
  const seedShop = stall(106, 109, 5, 4, B.BLUE_WOOD);
  // in front of Sitabai's, a small statue of Vasantrao Naik — the Banjara farmer's son who became
  // Maharashtra's longest-serving Chief Minister and the father of its Green Revolution
  {
    const x = seedShop.x + 2, z = seedShop.z + 2;
    const y = height[col(x, z)];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) set(x + dx, y + 1, z + dz, B.COBBLE); // the pedestal, solid
    set(x, y + 2, z, B.COBBLE);
    structures.push({ kind: "statue", x, z, y: y + 1, facing: 0 }); // facing the chowk
  }
  const landOffice = house(89, 111, 6, 5, B.WHITEWASH, B.ROOF_TILE, "E");
  const bank = house(114, 125, 7, 6, B.BRICK, B.ROOF_TILE, "W");
  // each board carries its opening hours
  plate(trader.x, trader.z - 1.2, trader.y, 0, ["गणपत शेठ · व्यापारी", "Ganpat Seth, Trader", `Open ${hoursText("trader")}`]);
  plate(seedShop.x, seedShop.z - 1.2, seedShop.y, 0, ["सीताबाई बी-बियाणे", "Sitabai Seeds & Tools", `Open ${hoursText("shop")}`]);
  plate(landOffice.x + 0.3, landOffice.z + 1.8, landOffice.y + 1.4, Math.PI / 2, ["नायक कचेरी", "Naik's Kacheri", `Open ${hoursText("land")}`]);
  plate(bank.x - 0.3, bank.z - 1.8, bank.y + 1.4, -Math.PI / 2, ["सहकारी बँक, उखळी तांडा", "Sahakari Bank", `Open ${hoursText("bank")}`], "#15803d");

  // wells: the village well by the chowk, and the round vihir out in the fields
  const makeWell = (cx: number, cz: number) => {
    const y0 = height[col(cx, cz)];
    flatten(cx - 2, cz - 2, cx + 2, cz + 2, y0, B.DIRT);
    structures.push({ kind: "well", x: cx, z: cz, y: y0 + 1 });
    for (let z = cz - 1; z <= cz + 1; z++)
      for (let x = cx - 1; x <= cx + 1; x++) {
        for (let y = y0 - 5; y <= y0; y++) set(x, y, z, x === cx && z === cz ? (y < y0 ? B.WATER : B.AIR) : B.COBBLE);
        set(x, y0 + 1, z, x === cx && z === cz ? B.AIR : B.COBBLE);
      }
    set(cx - 1, y0 + 2, cz - 1, B.LOG);
    set(cx + 1, y0 + 2, cz + 1, B.LOG);
    return { x: cx, y: y0 + 1, z: cz + 2 };
  };
  const well = makeWell(WELLS[0][0], WELLS[0][1]);
  // an open clearing round the village well, where women gather to draw water
  for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) if (Math.hypot(dx, dz) <= 5.2) reserved[col(WELLS[0][0] + dx, WELLS[0][1] + dz)] = 2;
  const vihir = makeWell(WELLS[1][0], WELLS[1][1]);

  // the rest of the gaothan: houses packed along the lanes, each door facing the nearest lane
  // the footprint must be free; the one-block yard around it only needs to stay off the lanes
  const fits = (x0: number, z0: number, w: number, d: number) => {
    for (let z = z0 - 1; z <= z0 + d; z++)
      for (let x = x0 - 1; x <= x0 + w; x++) {
        if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1) return false;
        const c = col(x, z);
        const inner = x >= x0 && x < x0 + w && z >= z0 && z < z0 + d;
        if (roadCells[c] || plotMap[c] >= 0 || !inVillage(x, z) || (inner && reserved[c]) || (!inner && reserved[c] === 2)) return false;
      }
    return true;
  };
  // Rathod Bhuvan and its aangan (front courtyard), in the south-west corner of the gaothan. The houses
  // that the generator would put here still "reserve" their ground, so the rest of the village is
  // laid out exactly as before; they're just never built.
  const WADA = { x0: 83, z0: 116, w: 6, d: 15 };
  const inWadaZone = (x: number, z: number, w: number, d: number) => {
    const hit = (ax0: number, az0: number, ax1: number, az1: number) => x <= ax1 && x + w - 1 >= ax0 && z <= az1 && z + d - 1 >= az0;
    return hit(WADA.x0, WADA.z0, WADA.x0 + WADA.w - 1, WADA.z0 + WADA.d - 1) || hit(WADA.x0 + WADA.w, WADA.z0, WADA.x0 + WADA.w + 6, WADA.z0 + 10);
  };
  const houseRng = mulberry32(seed ^ 0x40e);
  let houses = 0;
  for (let z = 72; z < 152; z += 1)
    for (let x = 75; x < 132; x += 1) {
      const w = 4 + Math.floor(houseRng() * 3), d = 4 + Math.floor(houseRng() * 2);
      if (!fits(x, z, w, d) || houseRng() < 0.08) continue;
      // which side is the lane on?
      const cx = x + w / 2, cz = z + d / 2;
      let bestSide: "N" | "S" | "E" | "W" = "S", bestD = 1e9;
      for (let r = 1; r < 14 && bestD === 1e9; r++)
        for (const [side, px, pz] of [["N", cx, z - r], ["S", cx, z + d - 1 + r], ["W", x - r, cz], ["E", x + w - 1 + r, cz]] as const) {
          const X = Math.round(px), Z = Math.round(pz);
          if (X >= 0 && Z >= 0 && X < W && Z < D && roadCells[col(X, Z)] && r < bestD) {
            bestD = r;
            bestSide = side;
          }
        }
      const roofs = houseRng() < 0.3 ? B.THATCH : B.ROOF_TILE;
      const walls = houseRng() < 0.25 ? B.BRICK : B.WHITEWASH;
      if (inWadaZone(x, z, w, d)) {
        for (let xx = x - 1; xx <= x + w; xx++) for (let zz = z - 1; zz <= z + d; zz++) reserved[col(xx, zz)] = 1;
        continue;
      }
      // the neighbour just south of the aangan stood in front of Rathod Bhuvan's verandah: it sits a
      // few metres further east (its first spot stays reserved, so the rest of the village is unchanged)
      const blocksWada = x <= WADA.x0 + WADA.w + 6 && x + w - 1 >= WADA.x0 + WADA.w && z >= WADA.z0 + 10 && z <= WADA.z0 + WADA.d;
      if (blocksWada) for (let xx = x - 1; xx <= x + w; xx++) for (let zz = z - 1; zz <= z + d; zz++) reserved[col(xx, zz)] = 1;
      house(blocksWada ? x + 5 : x, z, w, d, walls, roofs, bestSide);
      houses++;
    }

  // Rathod Bhuvan: solid ground-floor walls (back, ends, and the inner front wall with a door for each
  // of the three homes) and verandah posts, so you can walk the verandah and in at your own door
  const wada = (() => {
    const { x0, z0, w, d } = WADA, x1 = x0 + w - 1, z1 = z0 + d - 1, y0 = 16;
    flatten(x0 - 1, z0 - 1, x1 + 7, z1 + 1, y0 - 1, B.DIRT);
    for (let z = z0 - 1; z <= z1 + 1; z++) for (let x = x0 - 1; x <= x1 + 7; x++) {
      for (let y = y0 - 4; y < y0; y++) set(x, y, z, B.DIRT);
      for (let y = y0; y < y0 + 10; y++) set(x, y, z, B.AIR);
    }
    const inner = x0 + 3; // the front wall of the rooms; x0+4 .. x1 is the open verandah
    const unit = d / 3;
    const doors = [0, 1, 2].map((i) => Math.floor(z0 + unit * i + unit / 2));
    for (let y = y0; y < y0 + 6; y++)
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= inner; x++) {
          const edge = x === x0 || x === inner || z === z0 || z === z1;
          if (!edge) continue;
          if (x === inner && y < y0 + 2 && doors.includes(z)) continue;
          set(x, y, z, x === inner ? B.PLANKS : B.WHITEWASH);
        }
    for (let z = z0; z <= z1; z += 3) for (let y = y0; y < y0 + 3; y++) set(x1, y, z, B.LOG);
    for (let y = y0; y < y0 + 3; y++) set(x1, y, z1, B.LOG);
    structures.push({ kind: "wada", x0, z0, w, d, y: y0, name: "Rathod Bhuvan" });
    // a lane along the front of the wada, turning east past the aangan to meet the village road
    const lane = (x: number, z: number) => {
      const c = col(x, z);
      if (plotMap[c] >= 0) return;
      roadCells[c] ||= 1;
      top[c] = B.ROAD;
      if (get(x, height[c] + 1, z) === B.AIR) set(x, height[c], z, B.ROAD); // open ground only, not under a house
    };
    // the rest of the aangan is grass round the tulsi, so the lane reads as a lane
    for (let z = z0; z <= z0 + 8; z++) for (let x = x1 + 4; x <= x1 + 7; x++) {
      const c = col(x, z);
      if (plotMap[c] >= 0 || get(x, height[c] + 1, z) !== B.AIR) continue;
      top[c] = B.GRASS;
      set(x, height[c], z, B.GRASS);
    }
    for (let z = z0 - 2; z <= z0 + 10; z++) for (let x = x1 + 2; x <= x1 + 3; x++) lane(x, z);
    for (let x = x1 + 2; x <= 106; x++) for (let z = z0 + 9; z <= z0 + 10; z++) lane(x, z);
    return { x: inner + 1, y: y0, z: doors[1] };
  })();

  // the town mandi, where the main road leaves for Jalna in the west
  const market = (() => {
    const x0 = 3, z0 = 14, x1 = 27, z1 = 32;
    flatten(x0, z0, x1, z1, 15, B.DIRT);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (hash2(x, z, seed + 9) < 0.35) top[col(x, z)] = B.ROAD;
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        for (let y = 12; y <= 15; y++) set(x, y, z, y === 15 ? top[col(x, z)] : B.DIRT);
        for (let y = 16; y < 30; y++) set(x, y, z, B.AIR);
      }
    stall(5, 16, 5, 4, B.SAFFRON);
    stall(13, 16, 5, 4, B.BLUE_WOOD);
    stall(5, 26, 5, 4, B.BLUE_WOOD);
    stall(19, 26, 5, 4, B.SAFFRON);
    for (const [x, z] of [[24, 18], [25, 18], [24, 19], [14, 24]]) {
      set(x, 16, z, B.HAY);
      structures.push({ kind: "hay", x, z, y: 16 });
    }
    plate(16, 33.5, 16, 0, ["जालना बाजार समिती", "Jalna Mandi"], "#7c2d12");
    return { x: 15, y: 16, z: 23 };
  })();
  plate(84.5, 77, height[col(84, 77)] + 1, Math.PI * 0.85, ["उखळी तांडा", "Ukhali Tanda · ता. जि. जालना"], "#7c2d12");
  void houses;
  // Devidas Chavan the mukadam, who sends out labourers by the day: the brick house south of the
  // chowk, its door facing east onto the open ground by the well, with a board beside the door
  const mukadam = (() => {
    const doorOf = (h: Extract<Structure, { kind: "house" }>) => {
      const [sx, sz] = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[h.door];
      return { x: h.x0 + h.w / 2 + sx * (h.w / 2 + 1), z: h.z0 + h.d / 2 + sz * (h.d / 2 + 1), facing: Math.atan2(sx, sz) };
    };
    const doors = structures.filter((s): s is Extract<Structure, { kind: "house" }> => s.kind === "house").map(doorOf);
    const d = doors.sort((a, b) => Math.hypot(a.x - 102, a.z - 135.5) - Math.hypot(b.x - 102, b.z - 135.5))[0];
    const y = height[col(Math.floor(d.x), Math.floor(d.z))] + 1;
    // to the left of the door as you face it, a step out from the wall
    const lx = Math.cos(d.facing), lz = -Math.sin(d.facing);
    plate(d.x - lx * 2.1 - Math.sin(d.facing) * 0.7, d.z - lz * 2.1 - Math.cos(d.facing) * 0.7, y, d.facing, ["मुकादम · मजूर मिळतील", "Majoor · labourers by the day", "Devidas Chavan"], "#6b3a1f");
    return { x: d.x, y, z: d.z, facing: d.facing };
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
    return (t === B.GRASS || t === B.RED_SOIL) && height[col(x, z)] > WATER_LEVEL;
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
  banyan(98, 120); // the chowk's great banyan, where the tanda sits in the evenings
  for (const [bx, bz] of [
    [57, 100], // by the vihir
    [150, 140],
  ])
    if (canTree(bx, bz, 1)) banyan(bx, bz);
  for (let gz = 2; gz < D - 2; gz += 7)
    for (let gx = 2; gx < W - 2; gx += 7) {
      if (treeRng() > 0.42) continue;
      const x = gx + Math.floor(treeRng() * 5);
      const z = gz + Math.floor(treeRng() * 5);
      if (canTree(x, z, 2)) neem(x, z);
    }
  neem(pir.x + 6, pir.z + 2); // the pir's tree
  // neem trees along the lanes and the main road, as the satellite shows
  for (const r of UKHALI_ROADS)
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let t = 4; t < len; t += 11) {
        const x = ax + ((bx - ax) * t) / len, z = az + ((bz - az) * t) / len;
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (const sgn of [1, -1]) {
          const X = Math.round(x + nx * 4 * sgn), Z = Math.round(z + nz * 4 * sgn);
          if (treeRng() < 0.6 && canTree(X, Z, 1)) neem(X, Z);
        }
      }
    }

  /* ---------- 7b. behind the school: the kabaddi maidan, and the talav beyond it ----------
   * The maidan is cut level into the foot of the tekdi. The talav sits a little higher, in a hollow
   * where the tekdi's rain runs off, held on the maidan side by an earthen bund. This runs after the
   * trees so the rest of the village keeps exactly the trees it had; any tree standing here goes. */
  const playground = (() => {
    const M = MAIDAN, P = TALAV;
    const RIM = P.floor + 2; // the dry bank round the water (top block y; you stand just above the water)
    // ground that belongs to something else stays as it is: fields, and the pads of the school, the tank and the Hanuman mandir
    const pads: [number, number, number, number][] = [];
    for (const s of structures) {
      if (s.kind === "school") pads.push([s.x0 - 4, s.z0 - 2, s.x0 + s.w + 1, s.z0 + s.d + 3]);
      if (s.kind === "tank") pads.push([s.x - 3, s.z - 3, s.x + 3, s.z + 3]);
      if (s.kind === "hanuman") pads.push([s.x0 - 1, s.z0 - 1, s.x0 + 5, s.z0 + 5]);
    }
    const keep = (x: number, z: number) => plotMap[col(x, z)] >= 0 || roadCells[col(x, z)] > 0 || pads.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d);
    const outM = (x: number, z: number) => Math.hypot(Math.max(M.x0 - x, 0, x - M.x1), Math.max(M.z0 - z, 0, z - M.z1));
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const changed: number[] = [];
    for (let z = M.z0 - 6; z <= Math.ceil(P.z + P.rz) + 8; z++)
      for (let x = M.x0 - 6; x <= Math.ceil(P.x + P.rx) + 9; x++) {
        if (x < 1 || z < 1 || x >= W - 1 || z >= D - 1 || keep(x, z)) continue;
        const c = col(x, z);
        let h = height[c], t = top[c];
        const dm = outM(x, z);
        if (dm === 0) {
          h = M.y;
          t = B.DIRT;
        } else if (dm < 5) h = Math.round(clamp(h, M.y - dm * 1.2, M.y + dm * 1.4)); // banks down to the maidan
        const dp = talavOut(x + 0.5, z + 0.5);
        if (dp < 0) {
          // the water: shallow at the edge, a little deeper in the middle
          h = dp < -1.4 ? P.floor : P.floor + 1;
          t = dp < -1.4 ? B.DIRT : B.SAND;
        } else if (dp < 1.2) {
          h = RIM;
          if (t !== B.GRASS && t !== B.RED_SOIL) t = B.GRASS;
        } else if (dp < 8 && dm > 0) h = Math.round(clamp(h, RIM - (dp - 1.2) * 1.4, RIM + (dp - 1.2) * 2)); // the bund, and the hill behind
        if (h === height[c] && t === top[c] && dp >= 0) continue;
        height[c] = h;
        top[c] = t;
        changed.push(c);
      }
    // trees that stood on ground that moved go, canopy and all
    const moved = new Uint8Array(W * D);
    for (const c of changed) moved[c] = 1;
    for (let i = trees.length - 1; i >= 0; i--) {
      const tr = trees[i];
      if (!tr.trunks.some(([x, z]) => moved[col(x, z)])) continue;
      trees.splice(i, 1);
      const r = Math.ceil(tr.r) + 1, x0 = Math.floor(tr.x), z0 = Math.floor(tr.z);
      for (let y = tr.y; y < Math.min(H, tr.y + tr.h + 4); y++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++) {
            const b = get(x0 + dx, y, z0 + dz);
            if (b === B.LEAVES || b === B.BANYAN_LEAVES || b === B.LOG) set(x0 + dx, y, z0 + dz, B.AIR);
          }
    }
    // rewrite the columns: rock, earth, the surface, water in the talav, open air above
    for (const c of changed) {
      const x = c % W, z = Math.floor(c / W), h = height[c];
      const wet = talavOut(x + 0.5, z + 0.5) < 0;
      for (let y = 1; y < H; y++) set(x, y, z, y < h - 3 ? B.STONE : y < h ? B.DIRT : y === h ? top[c] : wet && y < P.level ? B.WATER : B.AIR);
      reserved[c] = 1;
    }
    const y = M.y + 1;
    structures.push({ kind: "kabaddi", x0: M.x0, z0: M.z0, x1: M.x1, z1: M.z1, y });
    structures.push({ kind: "talav", x: P.x, z: P.z, rx: P.rx, rz: P.rz, level: P.level, y: P.floor + 1 });
    plate(M.x0 - 0.4, COURT.mid + 4.5, y, -Math.PI / 2, ["कबड्डी मैदान", "Kabaddi Maidan"], "#b45309");
    plate(P.x - P.rx - 0.9, P.z - P.rz + 0.2, RIM + 1, -Math.PI * 0.62, ["उखळी तलाव", "Ukhali Talav"], "#1d6a8a"); // at the bund's north end
    return {
      kabaddi: { x: M.x0 + 0.5, y, z: COURT.mid - 3 }, // the west touchline, on the raiders' half
      talav: { x: P.x - P.rx - 1.1, y: RIM + 1, z: P.z }, // on the bund, facing the water
    };
  })();

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
  return {
    seed,
    voxels: vox,
    plots,
    plotMap,
    chowk: SQUARE,
    trees,
    structures,
    landmarks: {
      spawn: { x: 109.5, y: SQUARE.y + 1, z: 116.5, label: "The chowk" },
      temple: lm(temple, "Sevalal Maharaj mandir"),
      hanuman: lm(hanuman, "Hanuman mandir"),
      school: lm(school, "Z.P. school"),
      pir: lm(pir, "Pir Baba"),
      tank: lm(tank, "Water tank"),
      home: lm(wada, "Rathod Bhuvan"),
      trader: lm(trader, "Trader"),
      seedShop: lm(seedShop, "Seed & tool shop"),
      landOffice: lm(landOffice, "Naik's kacheri"),
      bank: lm(bank, "Cooperative bank"),
      well: lm(well, "Well"),
      market: lm(market, "Town market"),
      ghat: { ...vihir, label: "Vihir (field well)" },
      kabaddi: lm(playground.kabaddi, "Kabaddi maidan"),
      talav: lm(playground.talav, "Talav (pond)"),
      mukadam: lm({ x: mukadam.x, y: mukadam.y, z: mukadam.z }, "Mukadam Devidas Chavan"),
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
