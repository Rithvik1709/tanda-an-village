import { owed } from "./bank.js";
import { advance, CROP_IDS, CROPS, type CropId } from "./crops.js";
import { buyerPrice } from "./economy.js";
import { jobsFor } from "./jobs.js";
import type { Save } from "./save.js";
import { clock, DAY_MS } from "./time.js";
import { W, type World } from "./world.js";

/*
 * Two small reports: how a day went (shown when you wake), and what happened while you were away
 * (shown when you come back). Both are read from the save, like everything else.
 */
export type DaySummary = {
  day: number;
  income: { crops: number; fish: number; kaam: number; kabaddi: number; land: number };
  costs: number;
  net: number;
  sold: number; // produce and fish sold
};

export function daySummary(save: Save, day: number): DaySummary {
  const income = { crops: 0, fish: 0, kaam: 0, kabaddi: 0, land: 0 };
  let costs = 0, sold = 0;
  for (const e of save.ledger) {
    if (e.day !== day) continue;
    if (e.kind === "buy") costs += e.amount;
    if (e.kind !== "sell") continue;
    if (e.item.startsWith("fish:")) {
      income.fish += e.amount;
      sold += e.n;
    } else if (e.item.startsWith("job:")) income.kaam += e.amount;
    else if (e.item === "kabaddi") income.kabaddi += e.amount;
    else if (e.item.startsWith("plot:")) income.land += e.amount;
    else if (e.item in CROPS) {
      income.crops += e.amount;
      sold += e.n;
    }
  }
  const total = income.crops + income.fish + income.kaam + income.kabaddi + income.land;
  return { day, income, costs, net: total - costs, sold };
}

/** The crop that pays best today against its usual price, and what the trader gives for it. */
export function bestPrice(day: number): { crop: CropId; price: number; vsUsual: number } {
  let best = { crop: CROP_IDS[0], price: 0, vsUsual: -Infinity };
  for (const c of CROP_IDS) {
    const price = buyerPrice(c, day, "village");
    const vsUsual = price / (CROPS[c].basePrice * 0.85) - 1;
    if (vsUsual > best.vsUsual) best = { crop: c, price, vsUsual };
  }
  return best;
}

export type Away = { ripe: number; dry: number; growing: number; openKaam: number; loansDueSoon: number; best: ReturnType<typeof bestPrice> };

/** What's waiting for you: ripe and thirsty crops in your fields, open kaam, loans falling due within a day. */
export function awaySummary(world: World, save: Save, now: number): Away {
  let ripe = 0, dry = 0, growing = 0;
  for (const [k, cell] of Object.entries(save.farm)) {
    if (!cell.plant) continue;
    const i = Number(k), x = i % W, z = Math.floor(i / W) % 192;
    if (!save.plots.includes(world.plotMap[x + W * z])) continue;
    const p = advance(cell.plant, cell.wetUntil, now);
    if (p.progress >= 1) ripe++;
    else {
      growing++;
      if (cell.wetUntil <= now) dry++;
    }
  }
  const day = clock(now).day;
  const done = save.jobs?.day === day ? save.jobs.done : [];
  const openKaam = jobsFor(day).filter((j) => !done.includes(j.slot)).length;
  const loansDueSoon = save.loans.filter((l) => l.dueAt - now < DAY_MS && owed(l, now) > 0).length;
  return { ripe, dry, growing, openKaam, loansDueSoon, best: bestPrice(day) };
}
