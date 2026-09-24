import * as THREE from "three";
import { T, TILE_COUNT } from "../../shared/blocks";
import { mulberry32 } from "../../shared/rng";

/*
 * Pixel-art texture atlas painted in code: 16×16 tiles, warm Deccan palette, no external images.
 * Tile order must match T in shared/blocks.ts.
 */

import { ATLAS_COLS, ATLAS_ROWS, TILE } from "./uv";
export { tileUV } from "./uv";

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

type Px = (x: number, y: number, r: () => number) => RGB | null; // null = transparent

const speckle = (base: string, dark: string, light: string, dAmt = 0.18, lAmt = 0.12): Px => {
  const b = hex(base);
  const d = hex(dark);
  const l = hex(light);
  return (_x, _y, r) => {
    const v = r();
    return v < dAmt ? mix(b, d, 0.6 + r() * 0.4) : v > 1 - lAmt ? mix(b, l, 0.5 + r() * 0.5) : mix(b, d, r() * 0.15);
  };
};

const PAINTERS: Px[] = [];
PAINTERS[T.GRASS_TOP] = speckle("#6f9a3c", "#557a2c", "#8fb552", 0.22, 0.14);
PAINTERS[T.GRASS_SIDE] = (x, y, r) => {
  const edge = 3 + ((x * 7) % 3 === 0 ? 1 : 0);
  if (y < edge) return mix(hex("#6f9a3c"), hex("#557a2c"), r() * 0.5);
  return speckle("#8a6a48", "#6d5237", "#a07e59")(x, y, r);
};
PAINTERS[T.DIRT] = speckle("#8a6a48", "#6d5237", "#a07e59");
PAINTERS[T.BLACK_SOIL] = speckle("#4a3f3a", "#342c29", "#62554f", 0.25, 0.12);
PAINTERS[T.BLACK_SOIL_SIDE] = speckle("#433935", "#2e2724", "#5a4d47", 0.25, 0.08);
PAINTERS[T.TILLED] = (x, y, r) => {
  const furrow = y % 4 < 2;
  return mix(hex(furrow ? "#2e2724" : "#4a3f3a"), hex("#1f1a18"), r() * 0.25 + (furrow && x % 5 === 0 ? 0.2 : 0));
};
PAINTERS[T.TILLED_WET] = (x, y, r) => {
  const furrow = y % 4 < 2;
  return mix(hex(furrow ? "#1d1917" : "#2e2724"), hex("#3c4a55"), furrow && r() < 0.3 ? 0.35 : r() * 0.12 + (x % 7 === 0 ? 0.1 : 0));
};
PAINTERS[T.STONE] = speckle("#8d8a83", "#6f6c66", "#a7a49c", 0.2, 0.14);
PAINTERS[T.SAND] = speckle("#d8c28e", "#c1a974", "#e8d6a6", 0.16, 0.14);
PAINTERS[T.WATER] = (x, y, r) => mix(hex("#3f8ea0"), hex("#6fb3bf"), (Math.sin(x * 0.9 + y * 0.4) + 1) * 0.18 + r() * 0.12);
PAINTERS[T.LOG_SIDE] = (x, _y, r) => mix(hex(x % 4 === 0 ? "#4a3a2a" : "#6a5238"), hex("#3a2c1f"), r() * 0.3);
PAINTERS[T.LOG_TOP] = (x, y, r) => {
  const d = Math.hypot(x - 7.5, y - 7.5);
  return mix(hex(Math.floor(d) % 3 === 0 ? "#8a6c48" : "#a88458"), hex("#6a5238"), d > 6.8 ? 0.8 : r() * 0.15);
};
PAINTERS[T.LEAVES] = (_x, _y, r) => (r() < 0.12 ? null : mix(hex("#3f6b2c"), r() < 0.5 ? hex("#2d5020") : hex("#5f8a3c"), r() * 0.8));
PAINTERS[T.BANYAN_LEAVES] = (_x, _y, r) => (r() < 0.08 ? null : mix(hex("#35602a"), r() < 0.5 ? hex("#244319") : hex("#4f7d33"), r() * 0.8));
PAINTERS[T.PLANKS] = (x, y, r) => {
  const seam = y % 4 === 3 || (x + (Math.floor(y / 4) % 2) * 8) % 16 === 0;
  return mix(hex("#b58a58"), hex("#8a6640"), seam ? 0.7 : r() * 0.2);
};
PAINTERS[T.THATCH] = (x, y, r) => mix(hex("#c9a45c"), hex(r() < 0.5 ? "#a07f3d" : "#e0c27e"), ((x * 3 + y) % 5 === 0 ? 0.6 : 0) + r() * 0.3);
PAINTERS[T.WHITEWASH] = speckle("#ece4d4", "#d6ccb9", "#f7f1e6", 0.12, 0.1);
PAINTERS[T.BRICK] = (x, y, r) => {
  const row = Math.floor(y / 4);
  const mortar = y % 4 === 3 || (x + (row % 2) * 4) % 8 === 0;
  return mortar ? mix(hex("#cdbfa8"), hex("#b7a88f"), r() * 0.4) : mix(hex("#b5563a"), hex("#8f3f29"), r() * 0.4);
};
PAINTERS[T.ROAD] = speckle("#a8906c", "#8a7556", "#c4ad88", 0.25, 0.18);
PAINTERS[T.FENCE] = (x, y, _r) => {
  const post = x === 1 || x === 2 || x === 13 || x === 14;
  const rail = y === 4 || y === 5 || y === 10 || y === 11;
  if (!post && !rail) return null;
  return hex(post ? "#7a5c3c" : "#946f47");
};
PAINTERS[T.ROOF_TILE] = (x, y, r) => {
  const ridge = y % 4 === 0;
  return mix(hex("#b8553a"), hex(ridge ? "#7f3524" : "#cf6c4c"), ridge ? 0.6 : ((x + y * 2) % 6 === 0 ? 0.3 : 0) + r() * 0.2);
};
PAINTERS[T.COBBLE] = (x, y, r) => {
  const c = (Math.floor(x / 5) * 7 + Math.floor(y / 5) * 13) % 4;
  const edge = x % 5 === 0 || y % 5 === 0;
  return mix(hex(["#9a958c", "#8a857c", "#aaa59b", "#7f7a72"][c]), hex("#5f5b55"), edge ? 0.55 : r() * 0.15);
};
PAINTERS[T.SAFFRON] = (x, y, r) => mix(hex("#e8892c"), hex("#c96a18"), (x + y) % 4 === 0 ? 0.4 : r() * 0.2);
PAINTERS[T.BLUE_WOOD] = (x, y, r) => mix(hex("#3f7fb0"), hex("#2e6390"), y % 8 === 0 || x % 8 === 0 ? 0.6 : r() * 0.2);
PAINTERS[T.MARIGOLD] = (x, y, r) => {
  const stem = x === 8 && y > 6;
  const leaf = (x === 6 || x === 10) && y === 11;
  const d = Math.hypot(x - 8, y - 5);
  if (d < 3.4) return mix(hex("#f0a01e"), hex("#e0701a"), d / 3.4 + r() * 0.2);
  if (stem || leaf) return hex("#4e7a2c");
  return null;
};
PAINTERS[T.TALL_GRASS] = (x, y, r) => {
  const blade = (x * 5 + 3) % 7 === 0 || (x * 3) % 11 === 0;
  if (!blade || y < 3 + ((x * 7) % 5)) return null;
  return mix(hex("#6f9a3c"), hex("#4f7a2c"), r() * 0.5 + y / 32);
};
PAINTERS[T.BEDROCK] = speckle("#4a4744", "#2f2d2b", "#5f5b57", 0.3, 0.2);
PAINTERS[T.RED_SOIL] = speckle("#9a4a2e", "#7a3822", "#b85e3c", 0.22, 0.12);
PAINTERS[T.HAY_TOP] = (x, y, r) => mix(hex("#d9b35a"), hex("#b8903a"), (Math.hypot(x - 7.5, y - 7.5) % 3 < 1 ? 0.4 : 0) + r() * 0.2);
PAINTERS[T.HAY_SIDE] = (x, y, r) => mix(hex("#d9b35a"), hex(y === 4 || y === 11 ? "#7a5c2a" : "#b8903a"), y === 4 || y === 11 ? 0.8 : ((x * 3) % 4 === 0 ? 0.3 : 0) + r() * 0.2);

// ---- crops: four growth stages each, drawn bottom-up so shorter stages sit on the soil ----
const cropH = [5, 9, 13, 16]; // plant height in pixels per stage
const stemGreen = (r: () => number) => mix(hex("#5f8f34"), hex("#3f6b24"), r() * 0.6);

/** Jowar (sorghum): tall blades; the ripe head is a cream-and-rust grain cluster. */
const jowar = (st: number): Px => (x, y, r) => {
  const top = 16 - cropH[st];
  if (y < top) return null;
  const stalk = x === 7 || x === 8;
  const leafL = st > 0 && x < 7 && Math.abs((7 - x) - (y - top - 3) * 0.7) < 0.8 && y > top + 2;
  const leafR = st > 0 && x > 8 && Math.abs((x - 8) - (y - top - 6) * 0.7) < 0.8 && y > top + 5;
  // ripe: a compact oval grain panicle, tan with rust and pale grains, on top of the stalk
  if (st === 3 && y < top + 6 && Math.hypot((x - 7.5) / 1.7, (y - top - 2.6) / 2.9) < 1) {
    const v = r();
    return v < 0.12 ? hex("#a8683a") : v > 0.85 ? hex("#e2cc98") : mix(hex("#c89c5c"), hex("#b3844a"), r() * 0.6);
  }
  if (st === 0) return (x === 6 && y > 12) || (x === 9 && y > 11) || (stalk && y > 13) ? stemGreen(r) : null;
  if (stalk || leafL || leafR) return st === 3 ? mix(hex("#a8a048"), hex("#6f7a34"), r() * 0.5) : stemGreen(r);
  return null;
};

/** Onion: tufts of hollow green leaves; ripe shows the pink-purple bulb and yellowing tips. */
const onion = (st: number): Px => (x, y, r) => {
  const h = [4, 7, 10, 10][st];
  const top = 16 - h;
  if (st === 3 && y >= 12 && Math.hypot(x - 7.5, (y - 13.5) * 1.3) < 3.2) return mix(hex("#b2506e"), hex("#e08aa0"), r() * 0.4 + (x < 6 ? 0.3 : 0));
  if (y < top) return null;
  for (const lx of st === 0 ? [7] : [4, 7, 10, 12]) {
    const lean = (lx - 7.5) * (16 - y) * 0.06;
    if (Math.abs(x - lx - lean) < 0.7 && y < (st === 3 ? 12 : 16)) {
      const tip = y < top + 2 && st === 3;
      return tip ? mix(hex("#c8b44a"), hex("#a08a30"), r() * 0.4) : mix(hex("#6aa040"), hex("#4a8030"), r() * 0.5);
    }
  }
  return null;
};

/** Sugarcane: jointed stalks, getting thicker and taller; ripe stalks are yellow-green with dry leaves. */
const cane = (st: number): Px => (x, y, r) => {
  const top = 16 - cropH[st];
  if (y < top) return null;
  const stalks = st === 0 ? [7] : st === 1 ? [5, 10] : [3, 7, 11];
  for (const sx of stalks) {
    if (x === sx || (st >= 2 && x === sx + 1)) {
      const joint = (y + sx) % 4 === 0;
      const base = st === 3 ? "#b8b04a" : "#6f9a3a";
      return mix(hex(base), hex(joint ? "#4f5a24" : "#8fb050"), joint ? 0.7 : r() * 0.3);
    }
  }
  const leaf = st > 0 && y < top + 5 && (x + y) % 5 === 0;
  if (leaf) return st === 3 ? mix(hex("#c0a860"), hex("#8a8040"), r() * 0.5) : stemGreen(r);
  return null;
};

[jowar, onion, cane].forEach((f, c) => {
  for (let st = 0; st < 4; st++) PAINTERS[T.CROP0 + c * 4 + st] = f(st);
});

export function buildAtlasCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = ATLAS_COLS * TILE;
  c.height = ATLAS_ROWS * TILE;
  const g = c.getContext("2d")!;
  const img = g.createImageData(c.width, c.height);
  for (let t = 0; t < TILE_COUNT; t++) {
    const paint = PAINTERS[t];
    const r = mulberry32(1000 + t * 7919);
    const ox = (t % ATLAS_COLS) * TILE;
    const oy = Math.floor(t / ATLAS_COLS) * TILE;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const rgb = paint ? paint(x, y, r) : ([255, 0, 255] as RGB);
        const i = ((oy + y) * c.width + ox + x) * 4;
        if (!rgb) {
          img.data[i + 3] = 0;
          continue;
        }
        img.data[i] = rgb[0];
        img.data[i + 1] = rgb[1];
        img.data[i + 2] = rgb[2];
        img.data[i + 3] = 255;
      }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function buildAtlasTexture(): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(buildAtlasCanvas());
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter; // crisp pixels; no mip bleeding across tiles
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
