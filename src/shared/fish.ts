import { hash2, hashStr } from "./rng.js";

/*
 * Fishing in the talav. Which fish takes the bait is decided by the save (its id and how many times
 * you've cast), so the client can show the right fight and the server gives exactly that fish —
 * nobody can pick their catch. A cast that gets away still counts, and the talav gives only so
 * many bites a day.
 */
export type FishId = "chilapi" | "rohu" | "mrigal" | "katla" | "maral";
export type FishDef = { id: FishId; name: string; local: string; price: number; chance: number; fight: number; kg: [number, number]; note: string };

export const FISH: Record<FishId, FishDef> = {
  chilapi: { id: "chilapi", name: "Chilapi", local: "चिलापी", price: 25, chance: 0.38, fight: 0.2, kg: [0.2, 0.6], note: "tilapia: small and everywhere" },
  rohu: { id: "rohu", name: "Rohu", local: "रोहू", price: 45, chance: 0.27, fight: 0.42, kg: [0.6, 1.8], note: "silver carp, the village favourite" },
  mrigal: { id: "mrigal", name: "Mrigal", local: "मृगळ", price: 40, chance: 0.18, fight: 0.36, kg: [0.5, 1.5], note: "a bottom feeder, sweet in a curry" },
  katla: { id: "katla", name: "Katla", local: "कटला", price: 70, chance: 0.12, fight: 0.65, kg: [1.5, 4.5], note: "a big-headed carp that pulls hard" },
  maral: { id: "maral", name: "Maral", local: "मरळ", price: 130, chance: 0.05, fight: 0.9, kg: [1, 3], note: "the murrel: rare, fierce, and prized" },
};
export const FISH_IDS = Object.keys(FISH) as FishId[];
export const isFish = (s: string): s is FishId => s in FISH;

/** Casts a day before the talav goes quiet, and what one basket holds. */
export const CASTS_PER_DAY = 12;
export const BASKET = 20;
export const FISH_SEED = 0x7a1a;

/** The fish that takes the bait on your n-th cast (n counts every cast you've ever made). */
export function biteFor(saveId: string, n: number): { fish: FishId; kg: number } {
  const r = hash2(n, hashStr(saveId), FISH_SEED);
  let acc = 0;
  let fish: FishId = "chilapi";
  for (const id of FISH_IDS) {
    acc += FISH[id].chance;
    if (r < acc) {
      fish = id;
      break;
    }
  }
  const [lo, hi] = FISH[fish].kg;
  const kg = Math.round((lo + (hi - lo) * hash2(n, hashStr(saveId), FISH_SEED + 1)) * 10) / 10;
  return { fish, kg };
}

/** What Ganpat pays for one fish today: the base price, give or take 15%. */
export const fishPrice = (id: FishId, day: number) => Math.round(FISH[id].price * (0.85 + 0.3 * hash2(day, hashStr(id), FISH_SEED + 2)));

export const fishCount = (inv: Record<string, number>) => FISH_IDS.reduce((a, id) => a + (inv[`fish:${id}`] ?? 0), 0);
