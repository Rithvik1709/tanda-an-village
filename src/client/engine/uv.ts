import { TILE_COUNT } from "../../shared/blocks";

export const TILE = 16;
export const ATLAS_COLS = 8;
export const ATLAS_ROWS = Math.ceil(TILE_COUNT / ATLAS_COLS);

/** UV rect of a tile, inset half a texel so neighbouring tiles never bleed in. [u0, v0, u1, v1] */
export function tileUV(t: number): [number, number, number, number] {
  const W = ATLAS_COLS * TILE;
  const Hh = ATLAS_ROWS * TILE;
  const u0 = ((t % ATLAS_COLS) * TILE + 0.5) / W;
  const u1 = ((t % ATLAS_COLS) * TILE + TILE - 0.5) / W;
  const top = (Math.floor(t / ATLAS_COLS) * TILE + 0.5) / Hh;
  const bot = (Math.floor(t / ATLAS_COLS) * TILE + TILE - 0.5) / Hh;
  // canvas y grows down, texture v grows up (flipY)
  return [u0, 1 - bot, u1, 1 - top];
}
