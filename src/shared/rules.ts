import { B, block, isCropBlock } from "./blocks";
import { advance, CAN_MAX, CROPS, type CropId, isCrop, stageOf, WET_MS, yieldOf } from "./crops";
import { hash2 } from "./rng";
import type { Save } from "./save";
import { clock, DAY_MS } from "./time";
import { D, H, idx, W, type World } from "./world";

/*
 * The rules of the game: the ONLY way a save changes. The client runs these for instant feedback;
 * the server runs the same code against the stored save and its own clock, so a tampered client
 * gains nothing. `apply` mutates the save in place — callers clone first if they need to roll back.
 */

export type Action =
  | { t: "dig"; x: number; y: number; z: number }
  | { t: "place"; x: number; y: number; z: number; b: number }
  | { t: "till"; x: number; y: number; z: number }
  | { t: "plant"; x: number; y: number; z: number; crop: CropId }
  | { t: "water"; x: number; y: number; z: number }
  | { t: "refill"; x: number; y: number; z: number }
  | { t: "harvest"; x: number; y: number; z: number };

export type Result = { ok: true; msg?: string; gained?: Record<string, number> } | { ok: false; error: string };

/** Blocks a player may build with. */
export const BUILDING_BLOCKS: readonly number[] = [B.PLANKS, B.BRICK, B.WHITEWASH, B.THATCH, B.COBBLE, B.FENCE, B.ROOF_TILE, B.HAY, B.DIRT];

const inside = (x: number, y: number, z: number) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z) && x >= 0 && z >= 0 && y >= 0 && x < W && z < D && y < H;
const key = (x: number, y: number, z: number) => String(idx(x, y, z));

/** The block that is really at a position, given the save (crop blocks report their current stage). */
export function blockAt(world: World, save: Save, x: number, y: number, z: number, now: number): number {
  if (!inside(x, y, z)) return y >= H ? B.AIR : B.BEDROCK;
  const k = key(x, y, z);
  const cell = save.farm[k];
  if (cell) return cell.wetUntil > now ? B.TILLED_WET : B.TILLED;
  if (y > 0) {
    const below = save.farm[key(x, y - 1, z)];
    if (below?.plant) return CROPS[below.plant.crop].stages[stageOf(advance(below.plant, below.wetUntil, now).progress)];
  }
  return save.edits[k] ?? world.voxels[idx(x, y, z)];
}

export function plotAt(world: World, x: number, z: number) {
  if (x < 0 || z < 0 || x >= W || z >= D) return undefined;
  const id = world.plotMap[x + W * z];
  return id >= 0 ? world.plots[id] : undefined;
}

/** A column the player may change: inside a plot they own. */
function ownedPlot(world: World, save: Save, x: number, z: number) {
  const p = plotAt(world, x, z);
  return p && save.plots.includes(p.id) ? p : undefined;
}

const fail = (error: string): Result => ({ ok: false, error });

/** Soil quality of a freshly tilled block: soil type, the plot's land, and a little per-block variety. */
export function soilQuality(world: World, x: number, z: number, soilBlock: number): number {
  const typeQ = soilBlock === B.BLACK_SOIL ? 1 : soilBlock === B.RED_SOIL ? 0.85 : 0.7;
  const land = plotAt(world, x, z)?.soil ?? 0.6;
  const q = typeQ * (0.8 + 0.2 * land) + (hash2(x, z, world.seed ^ 0x5011) - 0.5) * 0.08;
  return Math.round(Math.max(0.3, Math.min(1, q)) * 1000) / 1000;
}

export function apply(world: World, save: Save, a: Action, now: number): Result {
  if (!a || typeof a !== "object" || !inside(a.x, a.y, a.z)) return fail("That's outside the world.");
  const { x, y, z } = a;
  const k = key(x, y, z);
  const here = blockAt(world, save, x, y, z, now);
  const inv = save.inv;
  const has = (item: string, n = 1) => (inv[item] ?? 0) >= n;
  const take = (item: string, n = 1) => {
    inv[item] = (inv[item] ?? 0) - n;
    if (inv[item] <= 0) delete inv[item];
  };
  const give = (item: string, n: number) => (inv[item] = (inv[item] ?? 0) + n);
  const season = clock(now).season;
  let r: Result;

  switch (a.t) {
    case "refill": {
      if (!has("can")) return fail("You need a watering can.");
      // forgiving: clicking the well's rim or the river bank counts if water is within two blocks
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++)
        for (let dz = -2; dz <= 2 && !near; dz++)
          for (let dx = -2; dx <= 2 && !near; dx++) near = !!block(blockAt(world, save, x + dx, y + dy, z + dz, now)).liquid;
      if (!near) return fail("Fill the can at the river or the well.");
      inv.water = CAN_MAX;
      r = { ok: true, msg: "Can filled" };
      break;
    }

    case "dig": {
      const plot = ownedPlot(world, save, x, z);
      if (!plot) return fail("You can only dig on your own land.");
      if (y < plot.y - 3) return fail("Too deep — that's the bedrock of the village.");
      if (here === B.AIR || block(here).liquid || here === B.BEDROCK) return fail("Nothing to dig.");
      if (isCropBlock(here)) {
        delete save.farm[key(x, y - 1, z)].plant; // uprooting an unripe crop wastes it
        r = { ok: true, msg: "Uprooted" };
        break;
      }
      if (save.farm[k]) delete save.farm[k];
      save.edits[k] = B.AIR;
      const above = blockAt(world, save, x, y + 1, z, now);
      if (y + 1 < H && block(above).shape === "cross") save.edits[key(x, y + 1, z)] = B.AIR;
      r = { ok: true };
      break;
    }

    case "place": {
      const plot = ownedPlot(world, save, x, z);
      if (!plot) return fail("You can only build on your own land.");
      if (!BUILDING_BLOCKS.includes(a.b)) return fail("You can't place that.");
      if (y > plot.y + 10) return fail("Too high to build.");
      if (here !== B.AIR && !block(here).liquid && !(block(here).shape === "cross" && !isCropBlock(here))) return fail("Something is already there.");
      save.edits[k] = a.b;
      r = { ok: true };
      break;
    }

    case "till": {
      if (!has("hoe")) return fail("You need a hoe.");
      if (!ownedPlot(world, save, x, z)) return fail("You can only farm your own land.");
      if (save.farm[k]) return fail("Already tilled.");
      if (!block(here).farmable) return fail("Only soil and grass can be tilled.");
      const above = blockAt(world, save, x, y + 1, z, now);
      if (above !== B.AIR && !(block(above).shape === "cross" && !isCropBlock(above))) return fail("Clear the block above first.");
      if (above !== B.AIR) save.edits[key(x, y + 1, z)] = B.AIR;
      const q = soilQuality(world, x, z, here);
      save.farm[k] = { baseQ: q, q, wetUntil: 0, restedAt: now };
      delete save.edits[k]; // the farm cell now defines this block
      r = { ok: true };
      break;
    }

    case "plant": {
      if (!isCrop(a.crop)) return fail("Unknown crop.");
      const cell = save.farm[k];
      if (!cell) return fail("Till the soil first.");
      if (cell.plant) return fail("Something is already growing here.");
      if (blockAt(world, save, x, y + 1, z, now) !== B.AIR) return fail("No room to grow.");
      if (!has(`seed:${a.crop}`)) return fail(`No ${CROPS[a.crop].name.toLowerCase()} seeds left.`);
      if (!ownedPlot(world, save, x, z)) return fail("You can only farm your own land.");
      take(`seed:${a.crop}`);
      // resting land recovers: +0.05 quality per game day since the last harvest
      cell.q = Math.min(cell.baseQ, cell.q + ((now - cell.restedAt) / DAY_MS) * 0.05);
      const speed = CROPS[a.crop].season[season] * (0.7 + 0.3 * cell.q);
      cell.plant = { crop: a.crop, plantedAt: now, progress: 0, wetMs: 0, dryMs: 0, updatedAt: now, speed };
      save.stats.planted++;
      r = { ok: true, msg: `Sowed ${CROPS[a.crop].name.toLowerCase()}` };
      break;
    }

    case "water": {
      if (!has("can")) return fail("You need a watering can.");
      const cell = save.farm[k];
      if (!cell) return fail("Water tilled soil.");
      if (!has("water")) return fail("The can is empty — fill it at the river or the well.");
      if (cell.plant) cell.plant = advance(cell.plant, cell.wetUntil, now);
      cell.wetUntil = now + WET_MS[season];
      take("water");
      r = { ok: true };
      break;
    }

    case "harvest": {
      const cell = save.farm[k];
      if (!cell?.plant) return fail("Nothing to harvest.");
      if (!ownedPlot(world, save, x, z)) return fail("That isn't your field.");
      const p = advance(cell.plant, cell.wetUntil, now);
      if (p.progress < 1) return fail(`Not ripe yet — ${Math.floor(p.progress * 100)}% grown.`);
      const n = yieldOf(p, cell.q);
      give(p.crop, n);
      cell.q = Math.max(0.45, cell.q - 0.04);
      cell.restedAt = now;
      delete cell.plant;
      save.stats.harvested++;
      save.stats.produce += n;
      r = { ok: true, msg: `+${n} ${CROPS[p.crop].name.toLowerCase()}`, gained: { [p.crop]: n } };
      break;
    }

    default:
      return fail("Unknown action.");
  }
  save.updatedAt = now;
  return r;
}
