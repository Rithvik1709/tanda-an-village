import { describe, expect, it } from "vitest";
import { apply } from "../src/shared/rules";
import { newSave } from "../src/shared/save";
import { awaySummary, bestPrice, daySummary } from "../src/shared/summary";
import { clock, DAY_MS, EPOCH } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const T0 = EPOCH + 5 * DAY_MS + 0.3 * DAY_MS;
const starter = world.plots.find((p) => p.starter)!;
const cell = (i: number) => ({ x: starter.x0 + 2 + i, y: starter.y, z: starter.z0 + 3 });

describe("the day's summary", () => {
  it("adds up the day's income by source, and its costs", () => {
    const s = newSave("sum", world, T0);
    s.inv.onion = 10;
    s.inv["fish:rohu"] = 2;
    apply(world, s, { t: "sell", item: "onion", n: 10, where: "village" }, T0);
    apply(world, s, { t: "sellFish", item: "rohu", n: 2 }, T0);
    apply(world, s, { t: "kabaddi", won: true }, T0);
    apply(world, s, { t: "buy", item: "seed:onion", n: 4 }, T0);
    const d = daySummary(s, clock(T0).day);
    const sales = s.ledger.filter((l) => l.kind === "sell");
    expect(d.income.crops).toBe(sales.find((l) => l.item === "onion")!.amount);
    expect(d.income.fish).toBe(sales.find((l) => l.item === "fish:rohu")!.amount);
    expect(d.income.kabaddi).toBe(101);
    expect(d.costs).toBe(20);
    expect(d.sold).toBe(12);
    expect(d.net).toBe(d.income.crops + d.income.fish + 101 - 20);
    // another day is empty
    expect(daySummary(s, clock(T0).day + 1).net).toBe(0);
  });
});

describe("while you were away", () => {
  it("counts ripe, thirsty and growing crops in your own fields, and open kaam", () => {
    const s = newSave("away", world, T0);
    for (let i = 0; i < 4; i++) {
      apply(world, s, { t: "till", ...cell(i) }, T0);
      apply(world, s, { t: "plant", ...cell(i), crop: i < 2 ? "onion" : "sugarcane" }, T0);
    }
    apply(world, s, { t: "water", ...cell(0) }, T0);
    apply(world, s, { t: "water", ...cell(1) }, T0);
    const later = T0 + 3 * DAY_MS; // the watered onions are ripe; the sugarcane (4 days, and dry) isn't
    const a = awaySummary(world, s, later);
    expect(a.ripe).toBe(2);
    expect(a.growing).toBe(2);
    expect(a.dry).toBe(2);
    expect(a.openKaam).toBe(3);
    expect(a.best.price).toBeGreaterThan(0);
  });
  it("the best price is the crop furthest above its usual price", () => {
    for (let d = 0; d < 30; d++) expect(["jowar", "onion", "sugarcane"]).toContain(bestPrice(d).crop);
  });
});
