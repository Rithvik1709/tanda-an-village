import type { Planting } from "./crops";
import { CAN_MAX } from "./crops";
import type { World } from "./world";

/*
 * The save: everything that differs from the seeded world, plus the player's money and goods.
 * Stored as JSON by the server. Keys of `edits` and `farm` are voxel indices (x + W*(z + D*y)).
 */
export const SAVE_VERSION = 1;

export type FarmCell = {
  baseQ: number; // the soil's natural quality, 0..1
  q: number; // current quality (falls a little each harvest, recovers while resting)
  wetUntil: number; // ms timestamp
  restedAt: number; // last harvest (or tilling), for recovery
  plant?: Planting;
};

export type Save = {
  version: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  money: number;
  inv: Record<string, number>; // "seed:jowar", "jowar", "water", "hoe", "can", …
  plots: number[]; // plot ids owned
  edits: Record<string, number>; // voxel index → block id
  farm: Record<string, FarmCell>; // voxel index of the tilled soil block
  stats: { planted: number; harvested: number; produce: number };
};

export const STARTING_MONEY = 500;

export function newSave(id: string, world: World, now: number): Save {
  const starter = world.plots.find((p) => p.starter)!;
  return {
    version: SAVE_VERSION,
    id,
    createdAt: now,
    updatedAt: now,
    money: STARTING_MONEY,
    inv: { hoe: 1, can: 1, water: CAN_MAX, "seed:jowar": 12, "seed:onion": 12, "seed:sugarcane": 4 },
    plots: [starter.id],
    edits: {},
    farm: {},
    stats: { planted: 0, harvested: 0, produce: 0 },
  };
}

/** Bring an older save up to the current format. v1 is the first; later versions add steps here. */
export function migrate(s: Save): Save {
  if (s.version > SAVE_VERSION) throw new Error(`save version ${s.version} is newer than this game (${SAVE_VERSION})`);
  return s;
}

export const cloneSave = (s: Save): Save => structuredClone(s);
