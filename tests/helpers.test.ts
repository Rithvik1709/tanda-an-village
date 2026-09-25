import { describe, expect, it } from "vitest";
import { GODOWN_CAPACITY } from "../src/shared/bank";
import { dawnOf, duskOf, patchMs, WALK_MS } from "../src/shared/helpers";
import { apply, type Action, settleHelpers } from "../src/shared/rules";
import { cloneSave, newSave, type Save } from "../src/shared/save";
import { atHour, DAY_MS } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const starter = world.plots.find((p) => p.starter)!;
const other = world.plots.find((p) => !p.starter)!;
let now = atHour(4, 10);
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
    now = atHour(4, 10);
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
  });

  it("take their order the next morning, once, and sow only the seeds you hand over", () => {
    now = atHour(4, 10);
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

  it("give back unsown seeds at dusk", () => {
    now = atHour(4, 10);
    const s = farmer(5);
    ok(s, { t: "hire", who: "parvati" });
    now = atHour(5, 7);
    const seeds = s.inv["seed:jowar"];
    ok(s, { t: "orderHelper", who: "parvati", job: "plant", plot: starter.id, crop: "jowar", seeds: 10 });
    now = atHour(5, 12);
    settleHelpers(world, s, now);
    expect(planted(s)).toBe(5);
    expect(s.inv["seed:jowar"]).toBe(seeds - 10); // still in their bag
    now = duskOf(5) + 1000;
    ok(s, { t: "setName", name: "Test" }); // any action settles
    expect(s.inv["seed:jowar"]).toBe(seeds - 5);
    // the next day they're gone
    now = atHour(6, 8);
    settleHelpers(world, s, now);
    expect(s.helpers).toBeUndefined();
  });

  it("works the same however often the server looks", () => {
    now = atHour(4, 10);
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
    now = atHour(4, 10);
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
    now = atHour(4, 10);
    const s = farmer(8);
    for (let i = 0; i < 8; i++) ok(s, { t: "plant", x: starter.x0 + 2 + i, y: starter.y, z: starter.z0 + 2, crop: "onion" });
    now += 12 * DAY_MS; // ripe, even dry
    const day = Math.floor((now - atHour(0, 6)) / DAY_MS);
    now = atHour(day, 10);
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
    now = atHour(4, 10);
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
});
