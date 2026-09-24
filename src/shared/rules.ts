import { B, block, isCropBlock } from "./blocks";
import { advance, CAN_MAX, CROPS, type CropId, isCrop, stageOf, WET_MS, yieldOf } from "./crops";
import { type Buyer, buyerPrice, LEDGER_DAYS, shopItem } from "./economy";
import { askingPrice, clearPlot, forSale, offersFor, valuePlot } from "./land";
import { carried, CARRY, creditLimit, GODOWN_CAPACITY, isOverdue, LENDERS, type Lender, type Loan, owed, rentFor, stored } from "./bank";
import { BULL_NAMES, bullsNow, CART_CAPACITY, FEED, MIN_MOOD, newBulls, PLOUGH_COST, PLOUGH_ROW, TRIP_COST, TRIP_MS } from "./bulls";
import { hash2 } from "./rng";
import type { LedgerEntry, Save } from "./save";
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
  | { t: "harvest"; x: number; y: number; z: number }
  | { t: "sell"; item: CropId; n: number; where: Buyer }
  | { t: "buy"; item: string; n: number }
  | { t: "buyPlot"; plot: number }
  | { t: "listPlot"; plot: number; price: number }
  | { t: "delist"; plot: number }
  | { t: "acceptOffer"; plot: number; day: number }
  | { t: "feed" }
  | { t: "plough"; x: number; y: number; z: number; dir: "x+" | "x-" | "z+" | "z-" }
  | { t: "startTrip"; load: Record<string, number> }
  | { t: "sellTown" }
  | { t: "borrow"; lender: Lender; amount: number }
  | { t: "repay"; loan: number; amount: number }
  | { t: "store"; item: CropId; n: number }
  | { t: "withdraw"; item: CropId; n: number };

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

const KNOWN = new Set(["dig", "place", "till", "plant", "water", "refill", "harvest", "sell", "buy", "buyPlot", "listPlot", "delist", "acceptOffer", "feed", "plough", "startTrip", "sellTown", "borrow", "repay", "store", "withdraw"]);

/** The bank, the sahukar and the godown. */
function finance(world: World, save: Save, a: Extract<Action, { t: "borrow" | "repay" | "store" | "withdraw" }>, now: number): Result {
  const day = clock(now).day;
  switch (a.t) {
    case "borrow": {
      const L = LENDERS[a.lender];
      if (!L) return fail("Who from?");
      if (!Number.isInteger(a.amount) || a.amount < 100 || a.amount % 100) return fail("Borrow in hundreds of rupees.");
      if (save.loans.some((l) => isOverdue(l, now))) return fail("Clear your overdue loan first — nobody lends to a defaulter.");
      if (save.loans.filter((l) => l.lender === a.lender).length >= 3) return fail(`${L.name} won't give a fourth loan.`);
      const limit = creditLimit(world, save, a.lender, now, day);
      if (a.amount > limit) return fail(limit ? `${L.name} will lend at most ₹${limit.toLocaleString("en-IN")}.` : `${L.name} won't lend more right now.`);
      const loan: Loan = { id: save.nextLoanId++, lender: a.lender, principal: a.amount, rate: L.rate, takenAt: now, dueAt: now + L.termDays * DAY_MS, paid: 0 };
      save.loans.push(loan);
      save.money += a.amount;
      record(save, { day, kind: "borrow", item: `loan:${a.lender}`, n: 1, amount: a.amount, where: L.name });
      return { ok: true, msg: `Borrowed ₹${a.amount.toLocaleString("en-IN")} from ${L.name} — due in ${L.termDays} days` };
    }
    case "repay": {
      const loan = save.loans.find((l) => l.id === a.loan);
      if (!loan) return fail("No such loan.");
      if (!Number.isInteger(a.amount) || a.amount < 1) return fail("How much?");
      const due = owed(loan, now);
      const pay = Math.min(a.amount, due);
      if (save.money < pay) return fail(`You have ₹${save.money.toLocaleString("en-IN")}.`);
      save.money -= pay;
      loan.paid += pay;
      record(save, { day, kind: "repay", item: `repay:${loan.lender}`, n: 1, amount: pay, where: LENDERS[loan.lender].name });
      if (owed(loan, now) <= 0) {
        save.loans = save.loans.filter((l) => l !== loan);
        return { ok: true, msg: `Loan from ${LENDERS[loan.lender].name} paid off!` };
      }
      return { ok: true, msg: `Repaid ₹${pay.toLocaleString("en-IN")} — ₹${owed(loan, now).toLocaleString("en-IN")} left` };
    }
    case "store": {
      if (!isCrop(a.item) || !qty(a.n)) return fail("Store produce, in whole units.");
      if ((save.inv[a.item] ?? 0) < a.n) return fail(`You don't have ${a.n} ${CROPS[a.item].name.toLowerCase()}.`);
      if (stored(save) + a.n > GODOWN_CAPACITY) return fail("The godown is full.");
      const lot = save.godown[a.item] ?? { n: 0, since: now };
      // one lot per crop: its date is the weighted average, so rent stays fair
      save.godown[a.item] = { n: lot.n + a.n, since: Math.round((lot.since * lot.n + now * a.n) / (lot.n + a.n)) };
      save.inv[a.item] -= a.n;
      if (!save.inv[a.item]) delete save.inv[a.item];
      return { ok: true, msg: `Stored ${a.n} ${CROPS[a.item].name.toLowerCase()} in the godown` };
    }
    case "withdraw": {
      if (!isCrop(a.item) || !qty(a.n)) return fail("Take out produce, in whole units.");
      const lot = save.godown[a.item];
      if (!lot || lot.n < a.n) return fail("Not that much in the godown.");
      if (carried(save) + a.n > CARRY) return fail(`You can carry ${CARRY} at most.`);
      const rent = rentFor(lot, a.n, now);
      if (save.money < rent) return fail(`The rent is ₹${rent}.`);
      save.money -= rent;
      lot.n -= a.n;
      if (!lot.n) delete save.godown[a.item];
      save.inv[a.item] = (save.inv[a.item] ?? 0) + a.n;
      if (rent) record(save, { day, kind: "buy", item: "godown-rent", n: a.n, amount: rent });
      return { ok: true, msg: `Took out ${a.n} ${CROPS[a.item].name.toLowerCase()}${rent ? ` (rent ₹${rent})` : ""}` };
    }
  }
}

/** Bulls and the cart: feeding, and the trip to the town mandi. (Ploughing is with the farm actions.) */
function livestock(save: Save, a: Extract<Action, { t: "feed" | "startTrip" | "sellTown" }>, now: number): Result {
  if (!save.bulls) return fail("You don't have bulls yet — Sitabai at the seed shop sells a fine pair.");
  const b = bullsNow(save.bulls, now);
  save.bulls = b;
  const day = clock(now).day;
  if (a.t === "feed") {
    if (!(save.inv.fodder > 0)) return fail("No fodder — buy kadba at the seed shop.");
    save.inv.fodder--;
    if (!save.inv.fodder) delete save.inv.fodder;
    save.bulls = { ...b, stamina: Math.min(100, b.stamina + FEED.stamina), mood: Math.min(100, b.mood + FEED.mood), fedAt: now };
    return { ok: true, msg: `${BULL_NAMES.join(" & ")} munch happily` };
  }
  if (a.t === "startTrip") {
    if (!save.inv.cart) return fail("You need a bullock cart.");
    if (save.trip) return fail("The cart is already on the road.");
    if (b.mood < MIN_MOOD) return fail("The bulls are sulking — feed them first.");
    if (b.stamina < TRIP_COST) return fail("The bulls are too tired for the road. Let them rest or feed them.");
    const load: Record<string, number> = {};
    let total = 0;
    for (const [item, n] of Object.entries(a.load ?? {})) {
      if (!isCrop(item) || !qty(n)) return fail("Only produce goes in the cart.");
      if ((save.inv[item] ?? 0) < n) return fail(`You don't have ${n} ${CROPS[item].name.toLowerCase()}.`);
      load[item] = n;
      total += n;
    }
    if (!total) return fail("Load something first.");
    if (total > CART_CAPACITY) return fail(`The cart holds ${CART_CAPACITY}.`);
    for (const [item, n] of Object.entries(load)) {
      save.inv[item] -= n;
      if (!save.inv[item]) delete save.inv[item];
    }
    save.bulls = { ...b, stamina: b.stamina - TRIP_COST };
    save.trip = { startedAt: now, load };
    return { ok: true, msg: `Loaded ${total} — off to the town mandi!` };
  }
  // sellTown
  const trip = save.trip;
  if (!trip) return fail("Nothing on the cart.");
  if (now - trip.startedAt < TRIP_MS) return fail("You're still on the road.");
  let total = 0;
  const lines: string[] = [];
  for (const [item, n] of Object.entries(trip.load)) {
    const crop = item as CropId;
    const amount = Math.round(buyerPrice(crop, day, "town") * n);
    const village = Math.round(buyerPrice(crop, day, "village") * n);
    save.money += amount;
    save.stats.earned += amount;
    total += amount;
    record(save, { day, kind: "sell", item, n, amount, where: "town", premium: amount - village });
    lines.push(`${n} ${CROPS[crop].name.toLowerCase()}`);
  }
  save.trip = null;
  return { ok: true, msg: `Sold ${lines.join(", ")} at the town mandi for ₹${total.toLocaleString("en-IN")}`, gained: { money: total } };
}

/** Buying, listing and selling land at the land office. */
function land(world: World, save: Save, a: Extract<Action, { t: "buyPlot" | "listPlot" | "delist" | "acceptOffer" }>, now: number): Result {
  const p = Number.isInteger(a.plot) ? world.plots[a.plot] : undefined;
  if (!p) return fail("No such plot.");
  const day = clock(now).day;
  const mine = save.plots.includes(p.id);
  const key = String(p.id);
  switch (a.t) {
    case "buyPlot": {
      if (mine) return fail("You already own it.");
      if (!forSale(p, day)) return fail(`${p.name} isn't for sale this week.`);
      const price = askingPrice(p, day);
      if (save.money < price) return fail(`${p.name} costs ₹${price.toLocaleString("en-IN")} — you have ₹${save.money.toLocaleString("en-IN")}.`);
      save.money -= price;
      save.stats.spent += price;
      save.plots.push(p.id);
      clearPlot(save, p); // anything left from a past owner goes with the old deed
      record(save, { day, kind: "buy", item: `plot:${p.id}`, n: 1, amount: price });
      return { ok: true, msg: `${p.name} is yours!` };
    }
    case "listPlot": {
      if (!mine) return fail("That isn't your land.");
      if (save.plots.length - Object.keys(save.listings).length <= 1 && !save.listings[key]) return fail("Keep at least one field to farm.");
      const value = valuePlot(world, save, p, now, day).total;
      if (!Number.isInteger(a.price) || a.price < 100 || a.price > value * 10) return fail("Pick a sensible price.");
      const nonce = Math.floor(hash2(day, p.id, save.stats.planted + save.ledger.length) * 1e9);
      save.listings[key] = { price: a.price, listedDay: day, nonce };
      return { ok: true, msg: `${p.name} listed for ₹${a.price.toLocaleString("en-IN")}` };
    }
    case "delist": {
      if (!save.listings[key]) return fail("It isn't listed.");
      delete save.listings[key];
      return { ok: true, msg: `${p.name} taken off the market` };
    }
    case "acceptOffer": {
      const listing = save.listings[key];
      if (!listing || !mine) return fail("It isn't listed.");
      const value = valuePlot(world, save, p, now, day).total;
      const offer = offersFor(p, listing, day, value).find((o) => o.day === a.day);
      if (!offer) return fail("That offer is gone.");
      save.money += offer.amount;
      save.stats.earned += offer.amount;
      save.plots = save.plots.filter((id) => id !== p.id);
      delete save.listings[key];
      clearPlot(save, p);
      record(save, { day, kind: "sell", item: `plot:${p.id}`, n: 1, amount: offer.amount, where: offer.buyer });
      return { ok: true, msg: `Sold ${p.name} to ${offer.buyer} for ₹${offer.amount.toLocaleString("en-IN")}` };
    }
  }
}
const qty = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 9999;

/** Watering can capacity: the brass can holds twice as much. */
export const canCapacity = (save: Save) => (save.inv.bigcan ? 32 : CAN_MAX);

function record(save: Save, e: LedgerEntry) {
  save.ledger.push(e);
  const oldest = e.day - LEDGER_DAYS + 1;
  if (save.ledger[0]?.day < oldest) save.ledger = save.ledger.filter((l) => l.day >= oldest);
  if (save.ledger.length > 400) save.ledger = save.ledger.slice(-400);
}

/** Buying and selling: no position needed (the client only opens these panels at the stalls). */
function trade(save: Save, a: Extract<Action, { t: "sell" | "buy" }>, now: number): Result {
  if (!qty(a.n)) return fail("Pick how many.");
  const day = clock(now).day;
  if (a.t === "sell") {
    if (!isCrop(a.item)) return fail("The trader doesn't buy that.");
    if (a.where !== "village") return fail("You can only sell here at the village stall."); // the town trip arrives with the cart
    if ((save.inv[a.item] ?? 0) < a.n) return fail(`You don't have ${a.n} ${CROPS[a.item].name.toLowerCase()}.`);
    const amount = Math.round(buyerPrice(a.item, day, a.where) * a.n);
    save.inv[a.item] -= a.n;
    if (!save.inv[a.item]) delete save.inv[a.item];
    save.money += amount;
    save.stats.earned += amount;
    record(save, { day, kind: "sell", item: a.item, n: a.n, amount, where: a.where });
    return { ok: true, msg: `Sold ${a.n} ${CROPS[a.item].name.toLowerCase()} for ₹${amount}`, gained: { money: amount } };
  }
  const item = shopItem(a.item);
  if (!item) return fail("The shop doesn't sell that.");
  if (item.max && (save.inv[item.id] ?? 0) + a.n > item.max) return fail(`You already have the ${item.name.toLowerCase()}.`);
  const amount = item.price * a.n;
  if (save.money < amount) return fail(`That costs ₹${amount} — you have ₹${save.money}.`);
  save.money -= amount;
  save.inv[item.id] = (save.inv[item.id] ?? 0) + a.n;
  if (item.id === "bulls") save.bulls = newBulls(now);
  save.stats.spent += amount;
  record(save, { day, kind: "buy", item: item.id, n: a.n, amount });
  return { ok: true, msg: `Bought ${a.n} × ${item.name.toLowerCase()} for ₹${amount}` };
}

export function apply(world: World, save: Save, a: Action, now: number): Result {
  if (!a || typeof a !== "object" || !KNOWN.has(a.t)) return fail("Unknown action.");
  if (a.t === "borrow" || a.t === "repay" || a.t === "store" || a.t === "withdraw") {
    const r = finance(world, save, a, now);
    if (r.ok) save.updatedAt = now;
    return r;
  }
  if (a.t === "feed" || a.t === "startTrip" || a.t === "sellTown") {
    const r = livestock(save, a, now);
    if (r.ok) save.updatedAt = now;
    return r;
  }
  if (a.t === "sell" || a.t === "buy" || a.t === "buyPlot" || a.t === "listPlot" || a.t === "delist" || a.t === "acceptOffer") {
    const r = a.t === "sell" || a.t === "buy" ? trade(save, a, now) : land(world, save, a, now);
    if (r.ok) save.updatedAt = now;
    return r;
  }
  if (!inside(a.x, a.y, a.z)) return fail("That's outside the world.");
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
      inv.water = canCapacity(save);
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
      // what you dig, you keep: building blocks come back whole, soil comes back as dirt
      const back = BUILDING_BLOCKS.includes(here) ? here : block(here).farmable || here === B.TILLED || here === B.TILLED_WET ? B.DIRT : null;
      if (back !== null) give(`block:${back}`, 1);
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
      if (!has(`block:${a.b}`)) return fail(`No ${block(a.b).name.toLowerCase()} left — the seed & tool shop sells more.`);
      take(`block:${a.b}`);
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

    case "plough": {
      if (!save.bulls || !has("plough")) return fail("You need bulls and a plough.");
      const bl = bullsNow(save.bulls, now);
      save.bulls = bl;
      if (bl.mood < MIN_MOOD) return fail("The bulls are sulking — feed them first.");
      const d = ({ "x+": [1, 0], "x-": [-1, 0], "z+": [0, 1], "z-": [0, -1] } as const)[a.dir];
      if (!d) return fail("Pick a direction.");
      let done = 0;
      for (let i = 0; i < PLOUGH_ROW; i++) {
        if (save.bulls.stamina < PLOUGH_COST) break;
        const cx = x + d[0] * i, cz = z + d[1] * i;
        if (!inside(cx, y, cz) || !ownedPlot(world, save, cx, cz)) break;
        const ck = key(cx, y, cz);
        const b0 = blockAt(world, save, cx, y, cz, now);
        if (save.farm[ck] || !block(b0).farmable) continue;
        const above = blockAt(world, save, cx, y + 1, cz, now);
        if (above !== B.AIR && !(block(above).shape === "cross" && !isCropBlock(above))) continue;
        if (above !== B.AIR) save.edits[key(cx, y + 1, cz)] = B.AIR;
        const q = soilQuality(world, cx, cz, b0);
        save.farm[ck] = { baseQ: q, q, wetUntil: 0, restedAt: now };
        delete save.edits[ck];
        save.bulls = { ...save.bulls, stamina: save.bulls.stamina - PLOUGH_COST };
        done++;
      }
      if (!done) return fail(save.bulls.stamina < PLOUGH_COST ? "The bulls are tired." : "Nothing to plough there.");
      r = { ok: true, msg: `Ploughed ${done} with ${BULL_NAMES.join(" & ")}`, gained: { ploughed: done } };
      break;
    }

    case "harvest": {
      const cell = save.farm[k];
      if (!cell?.plant) return fail("Nothing to harvest.");
      if (!ownedPlot(world, save, x, z)) return fail("That isn't your field.");
      const p = advance(cell.plant, cell.wetUntil, now);
      if (p.progress < 1) return fail(`Not ripe yet — ${Math.floor(p.progress * 100)}% grown.`);
      const n = yieldOf(p, cell.q);
      if (carried(save) + n > CARRY) return fail(`Your sacks are full (${CARRY}) — sell, load the cart, or store it in the godown.`);
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
