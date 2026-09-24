import type { Planting } from "./crops";
import { CAN_MAX } from "./crops";
import type { World } from "./world";

/*
 * The save: everything that differs from the seeded world, plus the player's money and goods.
 * Stored as JSON by the server. Keys of `edits` and `farm` are voxel indices (x + W*(z + D*y)).
 */
export const SAVE_VERSION = 2;

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
  stats: { planted: number; harvested: number; produce: number; earned: number; spent: number };
  ledger: LedgerEntry[]; // the last LEDGER_DAYS game days of buying and selling
};

export type LedgerEntry = { day: number; kind: "sell" | "buy"; item: string; n: number; amount: number; where?: string };

/** Building blocks every farmer starts with (and v1 saves are given when they upgrade). */
export const STARTER_BLOCKS = { "block:11": 20, "block:14": 20, "block:16": 12 };

export const STARTING_MONEY = 500;

export function newSave(id: string, world: World, now: number): Save {
  const starter = world.plots.find((p) => p.starter)!;
  return {
    version: SAVE_VERSION,
    id,
    createdAt: now,
    updatedAt: now,
    money: STARTING_MONEY,
    inv: { hoe: 1, can: 1, water: CAN_MAX, "seed:jowar": 12, "seed:onion": 12, "seed:sugarcane": 4, ...STARTER_BLOCKS },
    plots: [starter.id],
    edits: {},
    farm: {},
    stats: { planted: 0, harvested: 0, produce: 0, earned: 0, spent: 0 },
    ledger: [],
  };
}

/** Bring an older save up to the current format, one version at a time. */
export function migrate(s: Save): Save {
  if (s.version > SAVE_VERSION) throw new Error(`save version ${s.version} is newer than this game (${SAVE_VERSION})`);
  if (s.version === 1) {
    // v2: building blocks cost money and live in the inventory; the ledger and money stats begin
    for (const [k, n] of Object.entries(STARTER_BLOCKS)) s.inv[k] = (s.inv[k] ?? 0) + n;
    s.stats = { ...s.stats, earned: 0, spent: 0 };
    s.ledger = [];
    s.version = 2;
  }
  return s;
}

export const cloneSave = (s: Save): Save => structuredClone(s);
