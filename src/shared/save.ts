import type { Planting } from "./crops";
import { CAN_MAX } from "./crops";
import type { GodownLot, Loan } from "./bank";
import { type MissionState, newMissions } from "./missions";
import type { Bulls } from "./bulls";
import type { Listing } from "./land";
import type { World } from "./world";

/*
 * The save: everything that differs from the seeded world, plus the player's money and goods.
 * Stored as JSON by the server. Keys of `edits` and `farm` are voxel indices (x + W*(z + D*y)).
 */
export const SAVE_VERSION = 6;

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
  listings: Record<string, Listing>; // plot id → your asking price, while it's on the market
  bulls: Bulls | null; // your bull pair, once bought
  trip: Trip | null; // a loaded cart on the road to the town mandi
  loans: Loan[];
  nextLoanId: number;
  godown: Record<string, GodownLot>; // produce stored at the cooperative's godown
  bestTitle: number; // the highest title reached (index into TITLES), for the ceremony toast
  missions: MissionState; // the story
  rep: number; // reputation with the tanda
  perks: string[]; // earned in missions: discount, townContact, polaChampion
  drip: number[]; // plots with drip irrigation installed
};

export type Trip = { startedAt: number; load: Record<string, number> };

export type LedgerEntry = { day: number; kind: "sell" | "buy" | "borrow" | "repay"; item: string; n: number; amount: number; where?: string; premium?: number };

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
    listings: {},
    bulls: null,
    trip: null,
    loans: [],
    nextLoanId: 1,
    godown: {},
    bestTitle: 0,
    missions: newMissions(now),
    rep: 0,
    perks: [],
    drip: [],
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
  if (s.version === 2) {
    s.listings = {}; // v3: the land market
    s.version = 3;
  }
  if (s.version === 3) {
    s.bulls = null; // v4: bulls and the cart
    s.trip = null;
    s.version = 4;
  }
  if (s.version === 4) {
    Object.assign(s, { loans: [], nextLoanId: 1, godown: {}, bestTitle: 0 }); // v5: money tools
    s.version = 5;
  }
  if (s.version === 5) {
    // v6: the story (existing farmers start at mission 1 too), reputation, drip irrigation
    Object.assign(s, { missions: newMissions(s.updatedAt), rep: 0, perks: [], drip: [] });
    s.version = 6;
  }
  return s;
}

export const cloneSave = (s: Save): Save => structuredClone(s);
