import { describe, expect, it } from "vitest";
import { area, askingPrice, forSale, landIndex, landValue, type Listing, offersFor, valuePlot } from "../src/shared/land";
import { apply } from "../src/shared/rules";
import { newSave } from "../src/shared/save";
import { DAY_MS, EPOCH } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const starter = world.plots.find((p) => p.starter)!;
const T = (day: number) => EPOCH + day * DAY_MS + DAY_MS * 0.1;

describe("plot value model", () => {
  it("is pinned for the seeded village", () => {
    expect(world.plots.map((p) => landValue(p, 40))).toMatchInlineSnapshot(`
      [
        11970,
        11180,
        14410,
        18600,
        22360,
        17090,
        26540,
        26420,
        22660,
        10960,
        28610,
        23130,
        46370,
        33500,
        32250,
        29960,
      ]
    `);
  });

  it("rises with area, soil, water and road", () => {
    const base = { ...starter, soil: 0.5, water: 0.5, road: 0.5 };
    const v = (o: Partial<typeof base>) => landValue({ ...base, ...o }, 10);
    expect(v({ x1: base.x1 + 8 })).toBeGreaterThan(v({}));
    expect(v({ soil: 0.9 })).toBeGreaterThan(v({}));
    expect(v({ water: 0.9 })).toBeGreaterThan(v({}));
    expect(v({ road: 0.9 })).toBeGreaterThan(v({}));
    expect(area(starter)).toBe((starter.x1 - starter.x0 + 1) * (starter.z1 - starter.z0 + 1));
  });

  it("the land mood drifts slowly, within ±15%", () => {
    const xs = Array.from({ length: 200 }, (_, d) => landIndex(d));
    expect(Math.min(...xs)).toBeGreaterThan(0.85);
    expect(Math.max(...xs)).toBeLessThan(1.15);
    for (let d = 1; d < 200; d++) expect(Math.abs(xs[d] - xs[d - 1])).toBeLessThan(0.04);
  });

  it("improvements and standing crops add value", () => {
    const s = newSave("t", world, T(3));
    const v0 = valuePlot(world, s, starter, T(3), 3);
    const at = (dx: number) => ({ x: starter.x0 + dx, y: starter.y, z: starter.z0 + 4 });
    for (let i = 2; i < 8; i++) apply(world, s, { t: "till", ...at(i) }, T(3));
    apply(world, s, { t: "plant", ...at(2), crop: "sugarcane" }, T(3));
    apply(world, s, { t: "place", x: starter.x0 + 3, y: starter.y + 1, z: starter.z0 + 8, b: 14 }, T(3));
    const v1 = valuePlot(world, s, starter, T(5), 5);
    expect(v1.tilled).toBe(48);
    expect(v1.buildings).toBeGreaterThan(0);
    expect(v1.crops).toBeGreaterThan(0);
    expect(v1.total).toBeGreaterThan(v0.total);
  });

  it("offers: likelier for a fair price, never above the asking price, expire after 2 days", () => {
    const p = world.plots[3];
    const value = 20000;
    const count = (price: number) => {
      let n = 0;
      for (let nonce = 0; nonce < 200; nonce++) n += offersFor(p, { price, listedDay: 0, nonce }, 2, value).length;
      return n;
    };
    expect(count(19000)).toBeGreaterThan(count(26000));
    const l: Listing = { price: 21000, listedDay: 10, nonce: 7 };
    for (let d = 10; d < 30; d++)
      for (const o of offersFor(p, l, d, value)) {
        expect(o.amount).toBeLessThanOrEqual(21000);
        expect(d - o.day).toBeLessThanOrEqual(2);
        expect(o.day).toBeGreaterThan(10);
      }
    expect(offersFor(p, l, 10, value)).toEqual([]); // nobody comes the day you list
  });

  it("some plots are for sale each week, never the starter", () => {
    for (let d = 0; d < 80; d += 4) {
      const n = world.plots.filter((p) => forSale(p, d)).length;
      expect(n).toBeGreaterThan(2);
      expect(forSale(starter, d)).toBe(false);
    }
  });
});

describe("the land deal, end to end through the rules", () => {
  it("buy a plot → farm it → list it → accept an offer → money and ownership change", () => {
    let day = 0;
    while (!world.plots.some((p) => !p.starter && forSale(p, day))) day++;
    const plot = world.plots.find((p) => !p.starter && forSale(p, day))!;
    const s = newSave("t", world, T(day));
    const cell = { x: plot.x0 + 3, y: plot.y, z: plot.z0 + 3 };
    expect(apply(world, s, { t: "till", ...cell }, T(day)).ok).toBe(false); // not mine yet
    expect(apply(world, s, { t: "buyPlot", plot: plot.id }, T(day))).toMatchObject({ ok: false, error: expect.stringMatching(/costs/) });
    s.money = 100_000;
    const price = askingPrice(plot, day);
    expect(apply(world, s, { t: "buyPlot", plot: plot.id }, T(day)).ok).toBe(true);
    expect(s.money).toBe(100_000 - price);
    expect(s.plots).toContain(plot.id);
    expect(apply(world, s, { t: "till", ...cell }, T(day)).ok).toBe(true); // now it is
    expect(apply(world, s, { t: "plant", ...cell, crop: "jowar" }, T(day)).ok).toBe(true);
    // list below value so buyers come quickly, then wait for an offer
    const value = valuePlot(world, s, plot, T(day), day).total;
    expect(apply(world, s, { t: "listPlot", plot: plot.id, price: Math.round(value * 0.95) }, T(day)).ok).toBe(true);
    let offer = null;
    for (let d = day + 1; d < day + 20 && !offer; d++) {
      const v = valuePlot(world, s, plot, T(d), d).total;
      offer = offersFor(plot, s.listings[String(plot.id)], d, v)[0] ?? null;
      if (offer) day = d;
    }
    expect(offer).not.toBeNull();
    const before = s.money;
    const r = apply(world, s, { t: "acceptOffer", plot: plot.id, day: offer!.day }, T(day));
    expect(r.ok).toBe(true);
    expect(s.money).toBeGreaterThan(before);
    expect(s.plots).not.toContain(plot.id);
    expect(s.listings).toEqual({});
    expect(Object.keys(s.farm)).toHaveLength(0); // the field went with the land
    expect(s.ledger.map((l) => l.item)).toEqual([`plot:${plot.id}`, `plot:${plot.id}`]);
    expect(apply(world, s, { t: "till", ...cell }, T(day)).ok).toBe(false); // not mine any more
  });

  it("refuses land tricks", () => {
    const s = newSave("t", world, T(1));
    s.money = 1e6;
    const notForSale = world.plots.find((p) => !p.starter && !forSale(p, 1))!;
    const no = (a: object) => expect(apply(world, s, a as never, T(1)).ok).toBe(false);
    no({ t: "buyPlot", plot: notForSale.id });
    no({ t: "buyPlot", plot: starter.id }); // already mine
    no({ t: "buyPlot", plot: 99 });
    no({ t: "listPlot", plot: starter.id, price: 20000 }); // my only field
    no({ t: "listPlot", plot: notForSale.id, price: 20000 }); // not mine
    no({ t: "acceptOffer", plot: starter.id, day: 1 }); // not listed
    no({ t: "delist", plot: starter.id });
  });
});
