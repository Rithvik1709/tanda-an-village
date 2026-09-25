import { B, block } from "./blocks.js";
import { CROP_IDS, CROPS, type CropId } from "./crops.js";
import { hash2, hashStr } from "./rng.js";
import { SEASON_DAYS, SEASONS, type Season } from "./time.js";

/*
 * Prices. Every crop has one "mandi" price per game day, the same for every player, computed from
 * the day number alone — so the server never stores prices and the chart can show any past day.
 *   price = base × season scarcity × monsoon × random walk × market event
 */
export const PRICE_SEED = 0x6d616e64; // "mand"

export const seasonOfDay = (day: number): Season => SEASONS[((Math.floor(day / SEASON_DAYS) % 3) + 3) % 3];

/** A standard normal-ish number, deterministic per (crop, day). */
function shock(crop: CropId, day: number) {
  const h = hashStr(crop);
  let s = 0;
  for (let i = 0; i < 4; i++) s += hash2(day, h + i * 7919, PRICE_SEED);
  return (s - 2) * 1.7; // sum of 4 uniforms ≈ normal, sd ≈ 1
}

/** Mean-reverting random walk as an exact weighted sum of recent shocks (consistent day to day). */
function walk(crop: CropId, day: number) {
  let x = 0;
  for (let k = 0, w = 1; k < 24; k++, w *= 0.78) x += w * shock(crop, day - k);
  return Math.exp(x * 0.045);
}

export type MarketEvent = { kind: "glut" | "shortage"; mult: number; headline: string };
const EVENT_BLOCK = 5; // days

/** Now and then the mandi floods or runs dry for a crop: three days of crash or boom. */
export function eventFor(crop: CropId, day: number): MarketEvent | null {
  const b = Math.floor(day / EVENT_BLOCK);
  const roll = hash2(b, hashStr(crop), PRICE_SEED ^ 0xe7);
  if (roll > 0.16) return null;
  const start = b * EVENT_BLOCK + Math.floor(hash2(b, hashStr(crop), PRICE_SEED ^ 0x51) * 2);
  const i = day - start;
  if (i < 0 || i > 2) return null;
  const glut = roll < 0.09;
  const strength = [0.7, 1, 0.55][i];
  const name = CROPS[crop].name.toLowerCase();
  return glut
    ? { kind: "glut", mult: 1 - 0.38 * strength, headline: `Too much ${name} at the mandi — prices are down` }
    : { kind: "shortage", mult: 1 + 0.5 * strength, headline: `${CROPS[crop].name} is scarce — traders are paying more` };
}

/** The day's mandi price for one unit of produce, in ₹ (one decimal). */
export function marketPrice(crop: CropId, day: number): number {
  const c = CROPS[crop];
  const season = seasonOfDay(day);
  const scarcity = 1 + (1 - c.season[season]) * 0.8; // grows badly this season → scarce → dearer
  const monsoon = season === "kharif" && crop === "onion" ? 1.1 : 1; // stored onions rot in the rains
  const ev = eventFor(crop, day)?.mult ?? 1;
  return Math.round(c.basePrice * scarcity * monsoon * walk(crop, day) * ev * 10) / 10;
}

/** What each buyer pays, as a share of the mandi price. The town market (by cart) comes in M7. */
export const BUYERS = { village: 0.85, town: 1.1 } as const;
export type Buyer = keyof typeof BUYERS;
export const buyerPrice = (crop: CropId, day: number, where: Buyer) => Math.round(marketPrice(crop, day) * BUYERS[where] * 10) / 10;

export const news = (day: number) => CROP_IDS.map((c) => eventFor(c, day)).filter((e): e is MarketEvent => !!e);

// ---- the seed & tool shop ----
export type ShopItem = { id: string; name: string; price: number; note?: string; max?: number };
const blockItem = (id: number, price: number): ShopItem => ({ id: `block:${id}`, name: block(id).name, price });
export const SHOP: ShopItem[] = [
  ...CROP_IDS.map((c) => ({ id: `seed:${c}`, name: `${CROPS[c].name} seeds`, price: CROPS[c].seedPrice, note: `ripens in ${CROPS[c].growDays} days when watered` })),
  { id: "bigcan", name: "Brass watering can", price: 300, note: "holds 48 waterings instead of 24", max: 1 },
  { id: "plough", name: "Wooden plough (nangar)", price: 500, note: "with your bulls: Shift + right click with the hoe tills a row of 8", max: 1 },
  { id: "bulls", name: "Khillari bull pair — Sarja & Raja", price: 2500, note: "they follow you, plough, and pull the cart", max: 1 },
  { id: "cart", name: "Bullock cart (bailgaadi)", price: 1500, note: "carry up to 200 to the town mandi for a better price", max: 1 },
  { id: "fodder", name: "Fodder (kadba)", price: 5, note: "one bundle: +30 stamina, a happier pair" },
  { id: "gotha", name: "Gotha — a cattle shed behind your house", price: 800, note: "tie your bulls under a roof with a trough: they get hungry half as fast", max: 1 },
  { id: "rod", name: "Bamboo fishing rod (gal)", price: 150, note: "fish in the talav behind the Z.P. school", max: 1 },
  { id: "gerua", name: "Gerua horn paint", price: 100, note: "for decorating your bulls at Pola" },
  { id: "drip", name: "Drip irrigation set with electric motor", price: 3000, note: "installs on one field: its soil stays watered, day and night" },
  blockItem(B.PLANKS, 3),
  blockItem(B.BRICK, 4),
  blockItem(B.WHITEWASH, 4),
  blockItem(B.THATCH, 2),
  blockItem(B.COBBLE, 3),
  blockItem(B.FENCE, 5),
  blockItem(B.ROOF_TILE, 5),
  blockItem(B.HAY, 6),
];
export const shopItem = (id: string) => SHOP.find((s) => s.id === id);

export const LEDGER_DAYS = 14;
