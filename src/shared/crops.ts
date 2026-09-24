import { B } from "./blocks.js";
import { DAY_MS, type Season } from "./time.js";

/*
 * Crop definitions and the growth model. Growth is integrated from timestamps, so a field keeps
 * growing while you're away and the server can recompute it exactly from the save.
 */
export type CropId = "jowar" | "onion" | "sugarcane";
export type CropDef = {
  id: CropId;
  name: string; // English
  local: string; // Marathi
  growDays: number; // game days to ripen when kept wet on perfect soil, in season
  yield: number; // produce per plant at best
  seedPrice: number; // ₹ per seed packet (one plant)
  basePrice: number; // ₹ per unit of produce, a typical market day
  season: Record<Season, number>; // growth-speed multiplier per season
  stages: [number, number, number, number]; // block ids per growth stage
};

export const CROPS: Record<CropId, CropDef> = {
  jowar: {
    id: "jowar", name: "Jowar", local: "ज्वारी", growDays: 2, yield: 14, seedPrice: 6, basePrice: 10,
    season: { kharif: 1.1, rabi: 1.0, unhala: 0.7 },
    stages: [B.JOWAR_0, B.JOWAR_1, B.JOWAR_2, B.JOWAR_3],
  },
  onion: {
    id: "onion", name: "Onion", local: "कांदा", growDays: 1.5, yield: 10, seedPrice: 5, basePrice: 12,
    season: { kharif: 0.8, rabi: 1.15, unhala: 0.9 },
    stages: [B.ONION_0, B.ONION_1, B.ONION_2, B.ONION_3],
  },
  sugarcane: {
    id: "sugarcane", name: "Sugarcane", local: "ऊस", growDays: 4, yield: 20, seedPrice: 15, basePrice: 16,
    season: { kharif: 1.15, rabi: 0.9, unhala: 0.85 },
    stages: [B.CANE_0, B.CANE_1, B.CANE_2, B.CANE_3],
  },
};
export const CROP_IDS = Object.keys(CROPS) as CropId[];
export const isCrop = (s: string): s is CropId => s in CROPS;

/** Dry soil still grows a crop, just slowly. */
export const DRY_RATE = 0.5;
/** How long one watering keeps the soil wet, by season (the monsoon keeps it damp longer). */
export const WET_MS: Record<Season, number> = { kharif: DAY_MS * 1.2, rabi: DAY_MS * 0.9, unhala: DAY_MS * 0.6 };
export const CAN_MAX = 24;

export type Planting = {
  crop: CropId;
  plantedAt: number;
  progress: number; // 0..1, 1 = ripe
  wetMs: number; // growing time spent in wet soil
  dryMs: number; // growing time spent in dry soil
  updatedAt: number;
  speed: number; // season × soil multiplier, fixed at sowing
};

/** Growth rate per ms in wet soil. */
export const wetRate = (p: Pick<Planting, "crop" | "speed">) => p.speed / (CROPS[p.crop].growDays * DAY_MS);

/**
 * Advance a planting to `now`, given the soil stays wet until `wetUntil`. Pure: returns a new object.
 * Only time before ripening counts toward the wet/dry share that sets the yield.
 */
export function advance(p: Planting, wetUntil: number, now: number): Planting {
  if (now <= p.updatedAt || p.progress >= 1) return { ...p, updatedAt: Math.max(now, p.updatedAt) };
  const r = wetRate(p);
  let { progress, wetMs, dryMs } = p;
  let t = p.updatedAt;
  // wet segment first (watering is always "from now on"), then dry
  const wetEnd = Math.min(now, Math.max(t, wetUntil));
  if (wetEnd > t) {
    const need = (1 - progress) / r;
    const used = Math.min(wetEnd - t, need);
    progress = used >= need ? 1 : progress + used * r; // exactly 1 when it ripens (no 0.9999…)
    wetMs += used;
    t += used;
  }
  if (progress < 1 && now > t) {
    const need = (1 - progress) / (r * DRY_RATE);
    const used = Math.min(now - t, need);
    progress = used >= need ? 1 : progress + used * r * DRY_RATE;
    dryMs += used;
  }
  return { ...p, progress: Math.min(1, progress), wetMs, dryMs, updatedAt: now };
}

export const stageOf = (progress: number) => (progress >= 1 ? 3 : progress >= 0.5 ? 2 : progress >= 0.2 ? 1 : 0);

/** Produce from a ripe plant: full yield when kept wet on good soil. */
export function yieldOf(p: Planting, quality: number): number {
  const total = p.wetMs + p.dryMs;
  const wetShare = total > 0 ? p.wetMs / total : 0;
  // a dry crop still gives two-thirds; good soil adds up to a fifth
  return Math.max(1, Math.round(CROPS[p.crop].yield * (0.65 + 0.35 * wetShare) * (0.8 + 0.2 * quality)));
}

/** Milliseconds until ripe if kept wet from now (for the tooltip). */
export const msToRipe = (p: Planting) => (p.progress >= 1 ? 0 : (1 - p.progress) / wetRate(p));
