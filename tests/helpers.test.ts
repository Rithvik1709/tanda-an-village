import { describe, expect, it } from "vitest";
import { GODOWN_CAPACITY } from "../src/shared/bank";
import { TRIP_COST, TRIP_MS, newBulls } from "../src/shared/bulls";
import { buyerPrice } from "../src/shared/economy";
import { dawnOf, duskOf, helperPhase, patchMs, restMs, sellTimes, WALK_MS } from "../src/shared/helpers";
import { apply, type Action, settleHelpers } from "../src/shared/rules";
import { cloneSave, newSave, type Save } from "../src/shared/save";
import { daySummary } from "../src/shared/summary";
import { atHour, DAY_MS } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const starter = world.plots.find((p) => p.starter)!;
const other = world.plots.find((p) => !p.starter)!;
let now = atHour(4, 14);
const ok = (s: Save, a: Action) => {
  const r = apply(world, s, a, now);
  if (!r.ok) throw new Error(`${a.t}: ${r.error}`);
  return r;
};
const no = (s: Save, a: Action) => {
  const r = apply(world, s, a, now);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
};
/** A farmer with two fields and money to spare, with n patches of the starter field hoed. */
function farmer(n = 12) {
  const s = newSave("h", world, now);
  s.plots.push(other.id);
  s.money = 10_000;
  for (let i = 0; i < n; i++) ok(s, { t: "till", x: starter.x0 + 2 + (i % 8), y: starter.y, z: starter.z0 + 2 + Math.floor(i / 8) });
  return s;
}
const planted = (s: Save) => Object.values(s.farm).filter((c) => c.plant).length;

describe("majoor", () => {
  it("needs two fields and the day's wage, paid up front", () => {
    now = atHour(4, 14);
    const s = newSave("h", world, now);
    s.money = 5000;
    expect(no(s, { t: "hire", who: "sakharam" })).toMatch(/own 2/);
    s.plots.push(other.id);
    ok(s, { t: "hire", who: "sakharam" });
    expect(s.money).toBe(5000 - 750);
    ok(s, { t: "hire", who: "vithoba" });
    expect(s.money).toBe(5000 - 750 - 1000);
    expect(no(s, { t: "hire", who: "parvati" })).toMatch(/at most 2/);
    expect(s.helpers!.every((h) => h.day === 5)).toBe(true);
    const poor = newSave("p", world, now);
    poor.plots.push(other.id);
    poor.money = 900;
    expect(no(poor, { t: "hire", who: "vithoba" })).toMatch(/₹1000/);
  });

  it("can be cancelled for a refund until 6 am, and not after", () => {
    now = atHour(4, 15);
    const s = farmer(0);
    const m0 = s.money;
    ok(s, { t: "hire", who: "vithoba" });
    ok(s, { t: "hire", who: "sakharam" });
    expect(s.money).toBe(m0 - 1750);
    now = atHour(4, 5.5); // the small hours before they come (hours before 6 am belong to the night before)
    ok(s, { t: "cancelHire", who: "vithoba" });
    expect(s.money).toBe(m0 - 750);
    expect(s.helpers!.map((h) => h.who)).toEqual(["sakharam"]);
    expect(no(s, { t: "cancelHire", who: "vithoba" })).toMatch(/isn't coming/);
    now = atHour(5, 6.2);
    expect(no(s, { t: "cancelHire", who: "sakharam" })).toMatch(/too late/);
    expect(s.money).toBe(m0 - 750);
    // the freed slot can be booked again for the day after
    ok(s, { t: "hire", who: "vithoba" });
    // the morning card nets the refund against the wages: 750 + 1000 − 1000 + 1000 over two days
    expect(daySummary(s, 4).costs + daySummary(s, 5).costs).toBe(1750);
    expect(daySummary(s, 4).net).toBe(-1750);
  });

  it("take their order the next morning, once, and sow only the seeds you hand over", () => {
    now = atHour(4, 14);
    const s = farmer(12);
    ok(s, { t: "hire", who: "sakharam" });
    const order: Action = { t: "orderHelper", who: "sakharam", job: "plant", plot: starter.id, crop: "onion", seeds: 8 };
    expect(no(s, order)).toMatch(/come at 6 am|today/);
    now = atHour(5, 7);
    expect(no(s, { ...order, plot: 3 })).toMatch(/own fields/);
    expect(no(s, { ...order, seeds: 99 })).toMatch(/don't have/);
    expect(no(s, { ...order, plot: other.id })).toMatch(/hoe it/);
    const seeds = s.inv["seed:onion"];
    ok(s, order);
    expect(s.inv["seed:onion"]).toBe(seeds - 8); // handed over
    expect(no(s, { ...order, job: "water" })).toMatch(/already/);
    // nothing happens while they walk out; then a patch per slot
    now += WALK_MS - 1;
    settleHelpers(world, s, now);
    expect(planted(s)).toBe(0);
    now += 1 + 3 * patchMs("sakharam");
    settleHelpers(world, s, now);
    expect(planted(s)).toBe(3);
    // by dusk all 8 are sown (4 hoed patches stay empty: the seeds ran out)
    now = duskOf(5) + 1;
    settleHelpers(world, s, now);
    expect(planted(s)).toBe(8);
    expect(s.inv["seed:onion"]).toBe(seeds - 8);
  });

  it("give back unsown seeds as soon as the hoed soil runs out", () => {
    now = atHour(4, 14);
    const s = farmer(5);
    ok(s, { t: "hire", who: "parvati" });
    now = atHour(5, 7);
    const seeds = s.inv["seed:jowar"];
    ok(s, { t: "orderHelper", who: "parvati", job: "plant", plot: starter.id, crop: "jowar", seeds: 10 });
    expect(s.inv["seed:jowar"]).toBe(seeds - 10); // in their bag
    now = atHour(5, 12);
    ok(s, { t: "setName", name: "Test" }); // any action settles
    expect(planted(s)).toBe(5);
    expect(s.inv["seed:jowar"]).toBe(seeds - 5); // the other 5 came back when the job ended
    // the next day they're gone
    now = atHour(6, 8);
    settleHelpers(world, s, now);
    expect(s.helpers).toBeUndefined();
  });

  it("works the same however often the server looks", () => {
    now = atHour(4, 14);
    const a = farmer(20);
    ok(a, { t: "hire", who: "vithoba" });
    now = atHour(5, 6.5);
    ok(a, { t: "orderHelper", who: "vithoba", job: "plant", plot: starter.id, crop: "onion", seeds: 12 });
    const b = cloneSave(a);
    for (let t = now; t < duskOf(5) + DAY_MS / 10; t += 7_919) settleHelpers(world, a, t);
    settleHelpers(world, b, duskOf(5) + DAY_MS / 10);
    expect(a.farm).toEqual(b.farm);
    expect(a.inv).toEqual(b.inv);
  });

  it("water only dry patches, and not drip fields", () => {
    now = atHour(4, 14);
    const s = farmer(6);
    ok(s, { t: "hire", who: "sakharam" });
    now = atHour(5, 7);
    s.drip.push(other.id);
    expect(no(s, { t: "orderHelper", who: "sakharam", job: "water", plot: other.id })).toMatch(/drip/);
    ok(s, { t: "orderHelper", who: "sakharam", job: "water", plot: starter.id });
    now += WALK_MS + 6 * patchMs("sakharam");
    settleHelpers(world, s, now);
    const cells = Object.values(s.farm);
    expect(cells.every((c) => c.wetUntil > now)).toBe(true);
  });

  it("harvest into the godown, and stop when it's full", () => {
    now = atHour(4, 14);
    const s = farmer(8);
    for (let i = 0; i < 8; i++) ok(s, { t: "plant", x: starter.x0 + 2 + i, y: starter.y, z: starter.z0 + 2, crop: "onion" });
    now += 12 * DAY_MS; // ripe, even dry
    const day = Math.floor((now - atHour(0, 6)) / DAY_MS);
    now = atHour(day, 14);
    ok(s, { t: "hire", who: "vithoba" });
    now = dawnOf(day + 1) + 1000;
    const before = s.inv.onion ?? 0;
    // leave room in the godown for only a little
    s.godown.jowar = { n: GODOWN_CAPACITY - 10, since: now };
    ok(s, { t: "orderHelper", who: "vithoba", job: "harvest", plot: starter.id });
    now = duskOf(day + 1) + 1;
    settleHelpers(world, s, now);
    expect(s.inv.onion ?? 0).toBe(before); // nothing in your sacks
    expect(s.godown.onion!.n).toBeGreaterThan(0);
    expect(s.godown.onion!.n).toBeLessThanOrEqual(10);
    expect(planted(s)).toBeGreaterThan(0); // the rest left standing
    expect(s.helpers![0].job!.full).toBe(true);
  });

  it("stop if you sell the field under them", () => {
    now = atHour(4, 14);
    const s = farmer(10);
    ok(s, { t: "hire", who: "sakharam" });
    now = atHour(5, 7);
    const seeds = s.inv["seed:onion"];
    ok(s, { t: "orderHelper", who: "sakharam", job: "plant", plot: starter.id, crop: "onion", seeds: 10 });
    s.plots = s.plots.filter((p) => p !== starter.id);
    now = duskOf(5) + 1;
    settleHelpers(world, s, now);
    expect(planted(s)).toBe(0);
    expect(s.inv["seed:onion"]).toBe(seeds); // every seed comes back
  });

  it("hired in the morning, come the same day after an hour's walk; after noon, the next morning", () => {
    now = atHour(4, 9.25);
    const s = farmer(12);
    const r = ok(s, { t: "hire", who: "vithoba" });
    expect(r.ok && r.msg).toMatch(/on the way/);
    const h = s.helpers![0];
    expect(h.day).toBe(4);
    expect(h.from).toBe(now + WALK_MS);
    expect(no(s, { t: "hire", who: "vithoba" })).toMatch(/coming to you today/);
    const order: Action = { t: "orderHelper", who: "vithoba", job: "plant", plot: starter.id, crop: "onion", seeds: 6 };
    // still walking over from the mukadam's: no orders yet, but he can still be cancelled
    expect(helperPhase(h, now + WALK_MS - 1)).toBe("booked");
    expect(no(s, order)).toMatch(/on the way/);
    now += WALK_MS;
    expect(helperPhase(h, now)).toBe("waiting");
    expect(no(s, { t: "cancelHire", who: "vithoba" })).toMatch(/too late/);
    ok(s, order);
    now = duskOf(4) + 1;
    settleHelpers(world, s, now);
    expect(planted(s)).toBe(6);
    // noon and after: tomorrow at 6 am, as before
    now = atHour(4, 12);
    ok(s, { t: "hire", who: "sakharam" });
    expect(s.helpers!.find((x) => x.who === "sakharam")).toEqual({ who: "sakharam", day: 5 });
  });

  it("can be cancelled on the way over, for the full wage", () => {
    now = atHour(4, 8);
    const s = farmer(0);
    const m0 = s.money;
    ok(s, { t: "hire", who: "parvati" });
    now += WALK_MS / 2;
    const r = ok(s, { t: "cancelHire", who: "parvati" });
    expect(r.ok && r.msg).toMatch(/won't come today/);
    expect(s.money).toBe(m0);
    expect(s.helpers).toBeUndefined();
  });

  it("rest after each job — experts less — and then take the next one", () => {
    now = atHour(4, 14);
    const s = farmer(6);
    ok(s, { t: "hire", who: "sakharam" });
    ok(s, { t: "hire", who: "vithoba" });
    expect(restMs("vithoba")).toBeCloseTo(restMs("sakharam") / 2, -1);
    now = atHour(5, 7);
    ok(s, { t: "orderHelper", who: "sakharam", job: "plant", plot: starter.id, crop: "onion", seeds: 6 });
    const h = s.helpers!.find((x) => x.who === "sakharam")!;
    // 6 patches, then a slot with nothing to do ends the job
    const doneAt = h.job!.startAt + 7 * patchMs("sakharam");
    now = doneAt - 1;
    settleHelpers(world, s, now);
    expect(h.job!.doneAt).toBeUndefined();
    expect(no(s, { t: "orderHelper", who: "sakharam", job: "water", plot: starter.id })).toMatch(/already at work/);
    now = doneAt;
    settleHelpers(world, s, now);
    expect(h.job!.doneAt).toBe(doneAt);
    expect(h.job!.done).toBe(6);
    expect(helperPhase(h, now)).toBe("sleeping");
    expect(no(s, { t: "orderHelper", who: "sakharam", job: "water", plot: starter.id })).toMatch(/resting — up in \d+s/);
    now = doneAt + restMs("sakharam");
    expect(helperPhase(h, now)).toBe("waiting");
    // up again: the next job, on the same field, starts at once (no walk)
    const r = ok(s, { t: "orderHelper", who: "sakharam", job: "water", plot: starter.id });
    expect(r.ok && r.msg).toMatch(/gets up to water/);
    expect(h.job!.startAt).toBe(now);
    expect(h.job!.doneAt).toBeUndefined();
    now += 7 * patchMs("sakharam");
    settleHelpers(world, s, now);
    expect(Object.values(s.farm).every((c) => c.wetUntil > now - 7 * patchMs("sakharam"))).toBe(true);
    expect(h.job!.doneAt).toBeDefined();
  });

  it("won't take a job there's nothing to do in", () => {
    now = atHour(4, 14);
    const s = farmer(4);
    ok(s, { t: "hire", who: "sakharam" });
    now = atHour(5, 7);
    for (const k of Object.keys(s.farm)) s.farm[k].wetUntil = now + DAY_MS;
    expect(no(s, { t: "orderHelper", who: "sakharam", job: "water", plot: starter.id })).toMatch(/watered already/);
    ok(s, { t: "plant", x: starter.x0 + 2, y: starter.y, z: starter.z0 + 2, crop: "onion" });
    expect(no(s, { t: "orderHelper", who: "sakharam", job: "harvest", plot: starter.id })).toMatch(/ripe yet/);
  });

  it("only a mistry takes the cart to the mandi: godown first, then your sacks, paid at the town price", () => {
    now = atHour(4, 14);
    const s = farmer(0);
    ok(s, { t: "hire", who: "vithoba" });
    ok(s, { t: "hire", who: "sakharam" });
    now = atHour(5, 7);
    const sell = (who: "vithoba" | "sakharam", load: Record<string, number>): Action => ({ t: "orderHelper", who, job: "sell", plot: starter.id, load });
    expect(no(s, sell("vithoba", { onion: 10 }))).toMatch(/cart and bulls/);
    s.inv.cart = 1;
    s.bulls = newBulls(now);
    expect(no(s, sell("sakharam", { onion: 10 }))).toMatch(/Vithoba/);
    expect(no(s, sell("vithoba", { onion: 10 }))).toMatch(/don't have 10/);
    s.godown.onion = { n: 30, since: now };
    s.inv.onion = 20;
    expect(no(s, sell("vithoba", { onion: 999 }))).toMatch(/don't have|holds/);
    const m0 = s.money;
    ok(s, sell("vithoba", { onion: 40 }));
    expect(s.godown.onion).toBeUndefined(); // all 30 from the godown…
    expect(s.inv.onion).toBe(10); // …and 10 from the sacks
    expect(s.bulls!.stamina).toBe(100 - TRIP_COST);
    // the cart and bulls are gone till he's back
    expect(no(s, { t: "startTrip", load: { onion: 5 } })).toMatch(/out on the road/);
    const h = s.helpers!.find((x) => x.who === "vithoba")!;
    const { sellAt, backAt } = sellTimes(h.job!, TRIP_MS);
    settleHelpers(world, s, sellAt - 1);
    expect(s.money).toBe(m0);
    now = sellAt;
    settleHelpers(world, s, now);
    const paid = buyerPrice("onion", Math.floor((sellAt - atHour(0, 6)) / DAY_MS), "town") * 40;
    expect(s.money).toBe(m0 + paid);
    expect(h.job!.sold).toBe(paid);
    expect(helperPhase(h, now)).toBe("working"); // still on the road home
    now = backAt;
    settleHelpers(world, s, now);
    expect(h.job!.doneAt).toBe(backAt);
    expect(helperPhase(h, now)).toBe("sleeping");
    ok(s, { t: "startTrip", load: { onion: 5 } }); // the cart is home
    expect(s.money).toBe(m0 + paid); // paid once, however often it's settled
  });
});
