import { bullsNow } from "./bulls.js";
import { CROP_IDS, CROPS, type CropId } from "./crops.js";
import { marketPrice, shopItem } from "./economy.js";
import { landValue, valuePlot } from "./land.js";
import type { Save } from "./save.js";
import { DAY_MS } from "./time.js";
import type { World } from "./world.js";

/*
 * Money tools: loans from the cooperative bank (cheap, secured by your land) or the sahukar
 * (fast, no questions, dear), the godown (store produce beyond what you can carry), net worth
 * and the titles it earns. Like everything else, all of it is recomputed from timestamps.
 */
export type Lender = "bank" | "sahukar";
export type Loan = { id: number; lender: Lender; principal: number; rate: number; takenAt: number; dueAt: number; paid: number };

export const LENDERS: Record<Lender, { name: string; rate: number; termDays: number; lateFee: number; lateRateMult: number }> = {
  bank: { name: "Sahakari Bank", rate: 0.01, termDays: 8, lateFee: 0.05, lateRateMult: 2 },
  sahukar: { name: "Sahukar Motilal", rate: 0.05, termDays: 4, lateFee: 0.2, lateRateMult: 2 },
};

/** How much you owe on a loan right now: simple interest by the day, doubled and fined once overdue. */
export function owed(l: Loan, now: number): number {
  const L = LENDERS[l.lender];
  const onTime = Math.min(now, l.dueAt) - l.takenAt;
  const late = Math.max(0, now - l.dueAt);
  const rate = l.rate ?? L.rate;
  let total = l.principal * (1 + rate * (onTime / DAY_MS));
  if (late > 0) total += l.principal * (L.lateFee + rate * L.lateRateMult * (late / DAY_MS));
  return Math.max(0, Math.ceil(total - l.paid));
}
export const isOverdue = (l: Loan, now: number) => now > l.dueAt && owed(l, now) > 0;
export const totalDebt = (s: Save, now: number) => s.loans.reduce((a, l) => a + owed(l, now), 0);

/** The bank lends up to 40% of the land you own, less what you already owe it. The sahukar asks nothing. */
export function creditLimit(world: World, s: Save, lender: Lender, now: number, day: number): number {
  const land = s.plots.reduce((a, id) => a + landValue(world.plots[id], day), 0);
  const cap = lender === "bank" ? land * 0.4 : (3000 + land * 0.15) * (s.perks?.includes("sahukarRaj") ? 1.5 : 1);
  const used = s.loans.filter((l) => l.lender === lender).reduce((a, l) => a + owed(l, now), 0);
  return Math.max(0, Math.floor((cap - used) / 100) * 100);
}

// ---- carrying and the godown ----
/** Produce you can carry at once (the rest goes to the godown or the cart). */
export const CARRY = 200;
export const GODOWN_CAPACITY = 2000;
export const GODOWN_RENT = 0.1; // ₹ per unit per game day, paid when you take it out
export type GodownLot = { n: number; since: number };

export const carried = (s: Save) => CROP_IDS.reduce((a, c) => a + (s.inv[c] ?? 0), 0);
export const stored = (s: Save) => Object.values(s.godown).reduce((a, g) => a + g.n, 0);
export const rentFor = (lot: GodownLot, n: number, now: number) => Math.ceil(n * GODOWN_RENT * Math.max(0, (now - lot.since) / DAY_MS));

// ---- net worth and titles ----
export type Worth = { money: number; land: number; goods: number; livestock: number; debt: number; total: number };

export function netWorth(world: World, s: Save, now: number, day: number): Worth {
  const land = s.plots.reduce((a, id) => a + valuePlot(world, s, world.plots[id], now, day).total, 0);
  const goods = Math.round(
    CROP_IDS.reduce((a, c: CropId) => a + ((s.inv[c] ?? 0) + (s.godown[c]?.n ?? 0) + (s.trip?.load[c] ?? 0)) * marketPrice(c, day), 0),
  );
  const resale = (id: string) => (s.inv[id] ? (shopItem(id)?.price ?? 0) * 0.6 : 0);
  const fit = s.bulls ? 0.8 + 0.2 * (bullsNow(s.bulls, now).mood / 100) : 1;
  const livestock = Math.round(resale("bulls") * fit + resale("cart") + resale("plough") + resale("bigcan"));
  const debt = totalDebt(s, now);
  return { money: s.money, land, goods, livestock, debt, total: s.money + land + goods + livestock - debt };
}

export const TITLES = [
  { min: -Infinity, name: "Small farmer", local: "अल्पभूधारक" },
  { min: 25_000, name: "Kisan", local: "किसान" },
  { min: 100_000, name: "Bada Kisan", local: "बडा किसान" },
  { min: 400_000, name: "Zamindar", local: "जमीनदार" },
] as const;
export function titleFor(worth: number) {
  let t: (typeof TITLES)[number] = TITLES[0];
  for (const x of TITLES) if (worth >= x.min) t = x;
  const next = TITLES[TITLES.indexOf(t) + 1];
  return { ...t, next: next ? { name: next.name, at: next.min } : null };
}
export const CROP_NAMES = Object.fromEntries(CROP_IDS.map((c) => [c, CROPS[c].name]));
