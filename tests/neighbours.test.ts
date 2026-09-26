import { describe, expect, it } from "vitest";
import { FESTIVALS, festivalOn, gher, YEAR_DAYS } from "../src/shared/festivals";
import { jobsFor } from "../src/shared/jobs";
import { bondOf, hearts, NEIGHBOURS } from "../src/shared/neighbours";
import { apply, type Action } from "../src/shared/rules";
import { newSave, type Save } from "../src/shared/save";
import { atHour } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const starter = world.plots.find((p) => p.starter)!;
let now = atHour(3, 10);
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
/** A game day that isn't a festival. */
const plainDay = (from: number) => {
  let d = from;
  while (festivalOn(d)) d++;
  return d;
};

describe("neighbours who remember you", () => {
  it("warm to a Ram Ram once a day, and to a gift a day — more for one they love", () => {
    const d = plainDay(3);
    now = atHour(d, 10);
    const s = newSave("n", world, now);
    ok(s, { t: "greet", who: "tulsa" });
    ok(s, { t: "greet", who: "tulsa" }); // again today: nothing more
    expect(bondOf(s, "tulsa").pts).toBe(2);
    s.inv.sugarcane = 12;
    s.inv.onion = 5;
    const r = ok(s, { t: "gift", who: "tulsa", item: "sugarcane" });
    expect(r.ok && r.msg).toMatch(/loves it/);
    expect(s.inv.sugarcane).toBe(7);
    expect(bondOf(s, "tulsa").pts).toBe(2 + 12);
    expect(no(s, { t: "gift", who: "tulsa", item: "onion" })).toMatch(/already/);
    ok(s, { t: "gift", who: "kashibai", item: "onion" }); // she likes onions
    expect(bondOf(s, "kashibai").pts).toBe(6);
    expect(no(s, { t: "gift", who: "kashibai", item: "hoe" })).toMatch(/produce or a fish/);
    expect(no(s, { t: "greet", who: "nobody" as never })).toMatch(/Who/);
  });

  it("at five hearts, give something of their own, once", () => {
    now = atHour(plainDay(3), 10);
    const s = newSave("n", world, now);
    s.bonds = { savitri: { pts: 98 } };
    const m0 = s.money;
    const r = ok(s, { t: "greet", who: "savitri" });
    expect(hearts(s, "savitri")).toBe(5);
    expect(r.ok && r.msg).toMatch(/a gift/);
    expect(s.money).toBe(m0 + NEIGHBOURS.savitri.gift.money!);
    expect(bondOf(s, "savitri").gave).toBe(true);
    s.bonds.savitri!.pts = 90; // even if it dips and comes back, the gift was once
    now += 12 * 60_000;
    s.inv.jowar = 5;
    ok(s, { t: "gift", who: "savitri", item: "jowar" });
    expect(s.money).toBe(m0 + NEIGHBOURS.savitri.gift.money!);
  });

  it("pay better for kaam the better they know you, and remember the help", () => {
    const d = plainDay(3);
    now = atHour(d, 10);
    const job = jobsFor(d).find((j) => j.kind === "produce")!;
    const s = newSave("n", world, now);
    s.inv[job.kind === "produce" ? job.item : ""] = 50;
    s.bonds = { [job.who]: { pts: 60 } }; // three hearts: 15% more
    const m0 = s.money;
    ok(s, { t: "job", slot: job.slot });
    expect(s.money - m0).toBe(Math.round(job.pay * 1.15));
    expect(bondOf(s, job.who).pts).toBe(68);
  });

  it("Ganpat warms to a steady seller and pays a little more; Sitabai to a good customer", () => {
    const d = plainDay(3);
    now = atHour(d, 10);
    const s = newSave("n", world, now);
    s.inv.onion = 400;
    ok(s, { t: "sell", item: "onion", n: 100, where: "village" }); // 2 points
    expect(bondOf(s, "ganpat").pts).toBe(2);
    ok(s, { t: "sell", item: "onion", n: 300, where: "village" }); // capped at 6 a day
    expect(bondOf(s, "ganpat").pts).toBe(6);
    s.bonds!.ganpat!.pts = 100;
    s.inv.onion = 100;
    const m0 = s.money;
    ok(s, { t: "sell", item: "onion", n: 100, where: "village" });
    const s2 = newSave("m", world, now);
    s2.inv.onion = 100;
    ok(s2, { t: "sell", item: "onion", n: 100, where: "village" });
    expect(s.money - m0).toBeGreaterThan(s2.money - 1000); // 5 hearts: 5% more
    // Sitabai: seeds cost 1% less per heart
    s.money = 10_000;
    s.bonds!.sitabai = { pts: 100, gave: true };
    const before = s.money;
    ok(s, { t: "buy", item: "seed:onion", n: 100 });
    s2.money = 10_000;
    ok(s2, { t: "buy", item: "seed:onion", n: 100 });
    expect(before - s.money).toBeLessThan(10_000 - s2.money);
  });
});

describe("festivals, every year", () => {
  it("come round on the same day each year", () => {
    for (const [id, f] of Object.entries(FESTIVALS)) {
      expect(festivalOn(f.day)).toBe(id);
      expect(festivalOn(f.day + YEAR_DAYS)).toBe(id);
      expect(festivalOn(f.day + 1)).not.toBe(id);
    }
  });

  it("Dawali: the diyas after dark, once a year, and gifts count double", () => {
    const d = FESTIVALS.dawali.day;
    now = atHour(d, 10);
    const s = newSave("n", world, now);
    ok(s, { t: "greet", who: "lakshmi" });
    expect(bondOf(s, "lakshmi").pts).toBe(4); // double
    expect(no(s, { t: "festival", what: "diyas" })).toMatch(/after dark/);
    expect(no(s, { t: "festival", what: "fire" })).toMatch(/Holi/);
    now = atHour(d, 20);
    const rep = s.rep;
    ok(s, { t: "festival", what: "diyas" });
    expect(s.rep).toBe(rep + 5);
    expect(bondOf(s, "lakshmi").pts).toBe(7); // she saw them
    expect(bondOf(s, "tulsa").pts).toBe(0); // a stranger didn't
    expect(no(s, { t: "festival", what: "diyas" })).toMatch(/this year/);
    now = atHour(d + YEAR_DAYS, 20); // next year
    ok(s, { t: "festival", what: "diyas" });
  });

  it("Holi: gher from each neighbour you greet, more from friends; the fire after dark", () => {
    const d = FESTIVALS.holi.day;
    now = atHour(d, 11);
    const s = newSave("n", world, now);
    s.bonds = { bhimrao: { pts: 60 } };
    const m0 = s.money;
    ok(s, { t: "greet", who: "bhimrao" });
    expect(s.money - m0).toBe(gher(3));
    ok(s, { t: "greet", who: "tulsa" });
    expect(s.money - m0).toBe(gher(3) + gher(0));
    now += 60_000;
    ok(s, { t: "greet", who: "bhimrao" }); // once a year
    expect(s.money - m0).toBe(gher(3) + gher(0));
    now = atHour(d, 21);
    ok(s, { t: "festival", what: "fire" });
  });

  it("Sevalal Jayanti: bhog at the mandir, and the blessing waters your fields", () => {
    const d = FESTIVALS.sevalal.day;
    now = atHour(d - 2, 10);
    const s = newSave("n", world, now);
    for (let i = 0; i < 4; i++) ok(s, { t: "till", x: starter.x0 + 2 + i, y: starter.y, z: starter.z0 + 2 });
    now = atHour(d, 10);
    expect(Object.values(s.farm).every((c) => c.wetUntil < now)).toBe(true);
    expect(no(s, { t: "festival", what: "bhog", item: "jowar" })).toMatch(/Bhog is 5/);
    s.inv.jowar = 5;
    ok(s, { t: "festival", what: "bhog", item: "jowar" });
    expect(s.inv.jowar).toBeUndefined();
    expect(Object.values(s.farm).every((c) => c.wetUntil > now)).toBe(true);
  });
});
