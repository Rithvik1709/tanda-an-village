import { describe, expect, it } from "vitest";
import { POST as act } from "../api/act";
import { MemoryStore, setStoreForTests } from "../api/lib/store";
import { POST as session } from "../api/session";
import { CROP_IDS, CROPS } from "../src/shared/crops";
import { buyerPrice, eventFor, marketPrice, seasonOfDay, SHOP } from "../src/shared/economy";
import { apply } from "../src/shared/rules";
import { migrate, newSave, type Save } from "../src/shared/save";
import { DAY_MS, EPOCH } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const days = Array.from({ length: 480 }, (_, i) => i);

describe("price model", () => {
  it("is pinned: the same days always give the same prices", () => {
    // if this snapshot changes, every player's price history changes — do it on purpose only
    expect(CROP_IDS.map((c) => [0, 1, 7, 30, 100].map((d) => marketPrice(c, d)))).toMatchInlineSnapshot(`
      [
        [
          4.9,
          5,
          5.5,
          5.4,
          5.1,
        ],
        [
          8.7,
          8.7,
          7,
          8.3,
          12.7,
        ],
        [
          9.1,
          9.3,
          6.1,
          9.8,
          10.5,
        ],
      ]
    `);
  });

  it("stays in a believable band and moves a little each day", () => {
    for (const c of CROP_IDS) {
      const ps = days.map((d) => marketPrice(c, d));
      const base = CROPS[c].basePrice;
      expect(Math.min(...ps)).toBeGreaterThan(base * 0.4);
      expect(Math.max(...ps)).toBeLessThan(base * 2.4);
      const moves = ps.slice(1).map((p, i) => Math.abs(p / ps[i] - 1));
      const median = moves.sort((a, b) => a - b)[Math.floor(moves.length / 2)];
      expect(median).toBeGreaterThan(0.004); // it does move
      expect(median).toBeLessThan(0.08); // but not wildly, outside events
    }
  });

  it("follows the seasons: a crop is dearer in the season it grows badly", () => {
    const avg = (c: (typeof CROP_IDS)[number], s: string) => {
      const ds = days.filter((d) => seasonOfDay(d) === s && !eventFor(c, d));
      return ds.reduce((a, d) => a + marketPrice(c, d), 0) / ds.length;
    };
    expect(avg("jowar", "unhala")).toBeGreaterThan(avg("jowar", "kharif")); // season speed 0.7 vs 1.1
    expect(avg("onion", "kharif")).toBeGreaterThan(avg("onion", "rabi"));
  });

  it("has occasional gluts and shortages, lasting three days", () => {
    for (const c of CROP_IDS) {
      const evs = days.map((d) => eventFor(c, d));
      const share = evs.filter(Boolean).length / days.length;
      expect(share).toBeGreaterThan(0.02);
      expect(share).toBeLessThan(0.2);
      expect(evs.some((e) => e?.kind === "glut")).toBe(true);
      expect(evs.some((e) => e?.kind === "shortage")).toBe(true);
    }
  });

  it("the village trader pays less than the mandi, the town more", () => {
    for (const c of CROP_IDS) {
      expect(buyerPrice(c, 5, "village")).toBeLessThan(marketPrice(c, 5));
      expect(buyerPrice(c, 5, "town")).toBeGreaterThan(marketPrice(c, 5));
    }
  });
});

describe("buying and selling", () => {
  const T = EPOCH + 5 * DAY_MS;
  const fresh = (): Save => newSave("t", world, T);

  it("sells at the village price, buys at shop prices, and writes the ledger", () => {
    const s = fresh();
    s.inv.onion = 10;
    const r = apply(world, s, { t: "sell", item: "onion", n: 4, where: "village" }, T);
    const expected = Math.round(buyerPrice("onion", 5, "village") * 4);
    expect(r.ok).toBe(true);
    expect(s.money).toBe(500 + expected);
    expect(s.inv.onion).toBe(6);
    expect(apply(world, s, { t: "buy", item: "seed:jowar", n: 10 }, T).ok).toBe(true);
    expect(s.money).toBe(500 + expected - 80);
    expect(s.inv["seed:jowar"]).toBe(22);
    expect(s.ledger).toEqual([
      { day: 5, kind: "sell", item: "onion", n: 4, amount: expected, where: "village" },
      { day: 5, kind: "buy", item: "seed:jowar", n: 10, amount: 80 },
    ]);
    expect(s.stats).toMatchObject({ earned: expected, spent: 80 });
  });

  it("refuses bad trades", () => {
    const s = fresh();
    s.inv.onion = 3;
    const no = (a: object) => expect(apply(world, s, a as never, T).ok).toBe(false);
    no({ t: "sell", item: "onion", n: 4, where: "village" }); // don't have 4
    no({ t: "sell", item: "onion", n: 1, where: "town" }); // town needs the cart (M7)
    no({ t: "sell", item: "hoe", n: 1, where: "village" }); // not produce
    no({ t: "sell", item: "onion", n: -5, where: "village" }); // negative
    no({ t: "sell", item: "onion", n: 1.5, where: "village" }); // fractional
    no({ t: "buy", item: "gold", n: 1 }); // not for sale
    no({ t: "buy", item: "seed:sugarcane", n: 26 }); // ₹520 > ₹500
    expect(apply(world, s, { t: "buy", item: "bigcan", n: 1 }, T).ok).toBe(true);
    no({ t: "buy", item: "bigcan", n: 1 }); // only one
    expect(s.money).toBe(50);
    expect(s.inv.onion).toBe(3);
  });

  it("the brass can holds 32; placing uses bricks and digging returns them", () => {
    const s = fresh();
    s.money = 1000;
    apply(world, s, { t: "buy", item: "bigcan", n: 1 }, T);
    s.inv.water = 0;
    const river = { x: 0, y: 11, z: 60 };
    for (let x = 0; x < 40; x++) if (world.voxels[x + 192 * (60 + 192 * 11)] === 8) { river.x = x; break; }
    apply(world, s, { t: "refill", ...river }, T);
    expect(s.inv.water).toBe(32);
    const p = world.plots.find((q) => q.starter)!;
    const spot = { x: p.x0 + 4, y: p.y + 1, z: p.z0 + 4 };
    expect(apply(world, s, { t: "place", ...spot, b: 14 }, T).ok).toBe(true);
    expect(s.inv["block:14"]).toBe(19);
    expect(apply(world, s, { t: "dig", ...spot }, T).ok).toBe(true);
    expect(s.inv["block:14"]).toBe(20);
    s.inv["block:14"] = 0;
    expect(apply(world, s, { t: "place", ...spot, b: 14 }, T)).toMatchObject({ ok: false, error: expect.stringMatching(/shop/) });
  });

  it("keeps only the last 14 days of ledger", () => {
    const s = fresh();
    s.inv.jowar = 100;
    for (let d = 0; d < 20; d++) apply(world, s, { t: "sell", item: "jowar", n: 1, where: "village" }, EPOCH + d * DAY_MS);
    expect(new Set(s.ledger.map((l) => l.day)).size).toBe(14);
    expect(s.ledger[0].day).toBe(6);
  });

  it("upgrades a v1 save", () => {
    const old = { ...fresh(), version: 1 } as Partial<Save>;
    delete old.ledger;
    old.inv = { hoe: 1 };
    old.stats = { planted: 3, harvested: 1, produce: 5 } as Save["stats"];
    const s = migrate(old as Save);
    expect(s.version).toBe(4);
    expect(s.listings).toEqual({});
    expect(s.ledger).toEqual([]);
    expect(s.inv["block:14"]).toBe(20);
    expect(s.stats).toMatchObject({ planted: 3, earned: 0, spent: 0 });
  });

  it("round-trips through the server", async () => {
    setStoreForTests(new MemoryStore());
    const { token } = await (await session(new Request("http://x", { method: "POST", body: "{}" }))).json();
    const post = (actions: unknown[]) => act(new Request("http://x", { method: "POST", body: JSON.stringify({ actions }), headers: { authorization: `Bearer ${token}` } }));
    const r = await (await post([{ t: "buy", item: "seed:onion", n: 5 }, { t: "sell", item: "onion", n: 1, where: "village" }])).json();
    expect(r.results.map((x: { ok: boolean }) => x.ok)).toEqual([true, false]);
    expect(r.save.money).toBe(470);
    expect(r.save.inv["seed:onion"]).toBe(17);
    expect(r.save.ledger).toHaveLength(1);
    expect(SHOP.every((i) => i.price > 0)).toBe(true);
  });
});
