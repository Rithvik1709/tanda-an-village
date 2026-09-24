import { describe, expect, it } from "vitest";
import { bullsNow, newBulls, TRIP_MS } from "../src/shared/bulls";
import { buyerPrice } from "../src/shared/economy";
import { apply } from "../src/shared/rules";
import { migrate, newSave, type Save } from "../src/shared/save";
import { clock, DAY_MS, EPOCH } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const starter = world.plots.find((p) => p.starter)!;
const T0 = EPOCH + 4 * DAY_MS + DAY_MS * 0.1;

function farmer(): Save {
  const s = newSave("t", world, T0);
  s.money = 20000;
  for (const item of ["bulls", "cart", "plough"]) expect(apply(world, s, { t: "buy", item, n: 1 }, T0).ok).toBe(true);
  return s;
}

describe("bull care", () => {
  it("they sulk when unfed for days and recover stamina resting", () => {
    const b = newBulls(0);
    expect(bullsNow(b, DAY_MS * 0.5).mood).toBe(80); // fed today: no change
    const later = bullsNow({ ...b, stamina: 20 }, DAY_MS * 3);
    expect(later.mood).toBe(30); // two hungry days × 25
    expect(later.stamina).toBeGreaterThan(20);
    expect(later.stamina).toBeLessThanOrEqual(100);
    // integration is sample-independent (like crops)
    let step = { ...b, stamina: 20 };
    for (let t = 0; t <= DAY_MS * 3; t += DAY_MS / 10) step = bullsNow(step, t);
    expect(step.mood).toBeCloseTo(later.mood, 1);
  });

  it("feeding costs fodder and cheers them up", () => {
    const s = farmer();
    expect(apply(world, s, { t: "feed" }, T0).ok).toBe(false); // no fodder
    apply(world, s, { t: "buy", item: "fodder", n: 3 }, T0);
    const t = T0 + DAY_MS * 3;
    expect(apply(world, s, { t: "feed" }, t).ok).toBe(true);
    expect(s.bulls!.mood).toBe(Math.min(100, 30 + 35));
    expect(s.inv.fodder).toBe(2);
    expect(s.ledger.some((l) => l.item === "fodder")).toBe(true); // feed shows up as a cost
  });
});

describe("ploughing", () => {
  it("tills a row of 8 on your land in one action, costing stamina", () => {
    const s = farmer();
    const r = apply(world, s, { t: "plough", x: starter.x0 + 2, y: starter.y, z: starter.z0 + 5, dir: "x+" }, T0);
    expect(r).toMatchObject({ ok: true, gained: { ploughed: 8 } });
    expect(Object.keys(s.farm)).toHaveLength(8);
    expect(s.bulls!.stamina).toBe(100 - 16);
    // it stops at the fence line: the row can't leave your land
    const edge = apply(world, s, { t: "plough", x: starter.x1 - 3, y: starter.y, z: starter.z0 + 7, dir: "x+" }, T0);
    expect(edge.ok && edge.gained?.ploughed).toBeLessThanOrEqual(3);
  });

  it("needs bulls, a plough and a willing pair", () => {
    const s = newSave("t", world, T0);
    const a = { t: "plough" as const, x: starter.x0 + 2, y: starter.y, z: starter.z0 + 5, dir: "x+" as const };
    expect(apply(world, s, a, T0).ok).toBe(false);
    const f = farmer();
    f.bulls = { ...f.bulls!, mood: 5 };
    expect(apply(world, f, a, T0)).toMatchObject({ ok: false, error: expect.stringMatching(/sulking/) });
    f.bulls = { ...f.bulls!, mood: 90, stamina: 1 };
    expect(apply(world, f, a, T0)).toMatchObject({ ok: false, error: expect.stringMatching(/tired/) });
  });
});

describe("the cart to the town mandi", () => {
  it("sells at the town price after the journey, and the ledger shows the premium", () => {
    const s = farmer();
    s.inv.jowar = 50;
    s.inv.onion = 30;
    const day = clock(T0).day;
    expect(apply(world, s, { t: "startTrip", load: { jowar: 50, onion: 30 } }, T0).ok).toBe(true);
    expect(s.inv.jowar).toBeUndefined();
    expect(s.trip!.load).toEqual({ jowar: 50, onion: 30 });
    expect(s.bulls!.stamina).toBe(80);
    expect(apply(world, s, { t: "sellTown" }, T0 + 5000)).toMatchObject({ ok: false, error: expect.stringMatching(/road/) }); // too quick
    const money0 = s.money;
    const r = apply(world, s, { t: "sellTown" }, T0 + TRIP_MS);
    expect(r.ok).toBe(true);
    const town = Math.round(buyerPrice("jowar", day, "town") * 50) + Math.round(buyerPrice("onion", day, "town") * 30);
    const village = Math.round(buyerPrice("jowar", day, "village") * 50) + Math.round(buyerPrice("onion", day, "village") * 30);
    expect(s.money - money0).toBe(town);
    expect(town).toBeGreaterThan(village);
    const lines = s.ledger.filter((l) => l.where === "town");
    expect(lines).toHaveLength(2);
    expect(lines.reduce((a, l) => a + (l.premium ?? 0), 0)).toBe(town - village);
    expect(s.trip).toBeNull();
  });

  it("refuses bad trips", () => {
    const s = farmer();
    s.inv.jowar = 300;
    const no = (a: object, t = T0) => expect(apply(world, s, a as never, t).ok).toBe(false);
    no({ t: "startTrip", load: { jowar: 201 } }); // over capacity
    no({ t: "startTrip", load: { hoe: 1 } }); // not produce
    no({ t: "startTrip", load: { onion: 5 } }); // don't have
    no({ t: "startTrip", load: {} }); // empty
    no({ t: "sellTown" }); // no trip
    no({ t: "sell", item: "jowar", n: 5, where: "town" }); // the town price needs the cart
    expect(apply(world, s, { t: "startTrip", load: { jowar: 100 } }, T0).ok).toBe(true);
    no({ t: "startTrip", load: { jowar: 10 } }); // already on the road
    const tired = newSave("t2", world, T0);
    tired.money = 20000;
    for (const item of ["bulls", "cart"]) apply(world, tired, { t: "buy", item, n: 1 }, T0);
    tired.bulls!.stamina = 5;
    tired.inv.onion = 5;
    expect(apply(world, tired, { t: "startTrip", load: { onion: 5 } }, T0)).toMatchObject({ ok: false, error: expect.stringMatching(/tired/) });
  });

  it("upgrades a v3 save", () => {
    const s = { ...newSave("x", world, T0), version: 3 } as Partial<Save>;
    delete s.bulls;
    delete s.trip;
    const m = migrate(s as Save);
    expect(m).toMatchObject({ version: 4, bulls: null, trip: null });
  });
});
