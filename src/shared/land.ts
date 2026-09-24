import { isCropBlock } from "./blocks.js";
import { advance, CROPS } from "./crops.js";
import { marketPrice, shopItem } from "./economy.js";
import { hash2 } from "./rng.js";
import type { Save } from "./save.js";
import { D, W, type Plot, type World } from "./world.js";

/*
 * Land: what a plot is worth, which plots the village has for sale, and the offers NPC buyers make
 * on plots you list. Everything is computed from the world, the save and the day — nothing random
 * is stored, so the server can recompute any price or offer and a client can't invent one.
 */
export const LAND_SEED = 0x6c616e64; // "land"
export const RATE_PER_CELL = 40; // ₹ per block of land at average soil, water and road

export const area = (p: Plot) => (p.x1 - p.x0 + 1) * (p.z1 - p.z0 + 1);

/** Slow village-wide land mood: ±~8% over a couple of weeks. */
export function landIndex(day: number) {
  let x = 0;
  for (let k = 0, w = 1; k < 30; k++, w *= 0.9) x += w * (hash2(day - k, 7, LAND_SEED) - 0.5);
  return Math.round(Math.exp(x * 0.05) * 1000) / 1000;
}

/** The land alone: size × soil × water × road × the market mood. */
export function landValue(p: Plot, day: number) {
  const q = (0.6 + 0.6 * p.soil) * (0.8 + 0.3 * p.water) * (0.85 + 0.25 * p.road);
  return Math.round((area(p) * RATE_PER_CELL * q * landIndex(day)) / 10) * 10;
}

export type Valuation = { land: number; tilled: number; buildings: number; crops: number; total: number };

/** What your plot is worth to a buyer today: the land plus what you've put into it. */
export function valuePlot(world: World, save: Save, p: Plot, now: number, day: number): Valuation {
  let tilled = 0, buildings = 0, crops = 0;
  for (const [k, cell] of Object.entries(save.farm)) {
    const i = Number(k), x = i % W, z = Math.floor(i / W) % D;
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
    tilled += 8;
    if (cell.plant) {
      const pl = advance(cell.plant, cell.wetUntil, now);
      crops += pl.progress * CROPS[pl.crop].yield * marketPrice(pl.crop, day) * 0.6;
    }
  }
  for (const [k, b] of Object.entries(save.edits)) {
    const i = Number(k), x = i % W, z = Math.floor(i / W) % D;
    if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1 || isCropBlock(b)) continue;
    const item = shopItem(`block:${b}`);
    if (item && b !== world.voxels[i]) buildings += item.price * 0.8;
  }
  const land = landValue(p, day);
  const r = (n: number) => Math.round(n);
  return { land, tilled: r(tilled), buildings: r(buildings), crops: r(crops), total: r(land + tilled + buildings + crops) };
}

/** Plots the village has on the market this week (a rotating selection), and their asking price. */
export function forSale(p: Plot, day: number): boolean {
  if (p.starter) return false;
  return hash2(p.id, Math.floor(day / 4), LAND_SEED ^ 0xf5) < 0.6;
}
export const askingPrice = (p: Plot, day: number) => Math.round((landValue(p, day) * (1.04 + 0.12 * hash2(p.id, 3, LAND_SEED))) / 50) * 50;

export type Listing = { price: number; listedDay: number; nonce: number };
export type Offer = { day: number; buyer: string; factor: number; amount: number; expires: number };

const BUYERS = ["Patil kaka", "Shinde family", "Jadhav brothers", "Kulkarni sheth", "Pawar tai", "Deshmukh saheb", "Gaikwad co-op", "More anna"];
export const OFFER_DAYS = 2; // an offer stands for this many days

/**
 * Offers on a listing, up to `day`. Each game day after listing a buyer may come by; the more
 * reasonable your price, the likelier. A buyer offers around what the plot is worth, never above your price.
 */
export function offersFor(p: Plot, listing: Listing, day: number, value: number): Offer[] {
  const out: Offer[] = [];
  const ratio = listing.price / Math.max(1, value);
  const chance = Math.max(0.08, Math.min(0.85, 1.35 - ratio));
  for (let d = listing.listedDay + 1; d <= day; d++) {
    if (day - d > OFFER_DAYS) continue;
    const h = hash2(p.id * 131 + d, listing.nonce, LAND_SEED ^ 0x0ff);
    if (h >= chance) continue;
    const factor = Math.round((0.9 + 0.2 * hash2(d, p.id * 17 + listing.nonce, LAND_SEED)) * 1000) / 1000;
    out.push({ day: d, buyer: BUYERS[Math.floor(hash2(d, p.id, LAND_SEED ^ 3) * BUYERS.length)], factor, amount: Math.min(listing.price, Math.round(value * factor)), expires: d + OFFER_DAYS });
  }
  return out;
}

/** Remove everything the player did on a plot (it goes to its new owner as it stands). */
export function clearPlot(save: Save, p: Plot) {
  for (const k of [...Object.keys(save.farm), ...Object.keys(save.edits)]) {
    const i = Number(k), x = i % W, z = Math.floor(i / W) % D;
    if (x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1) {
      delete save.farm[k];
      delete save.edits[k];
    }
  }
}
