import { describe, expect, it } from "vitest";
import { BANDH_PLOT, complete, current, MISSIONS } from "../src/shared/missions";
import { apply, type Action } from "../src/shared/rules";
import { newSave, type Save } from "../src/shared/save";
import { atHour, DAY_MS, HOUR_MS, msBetween } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const starter = world.plots.find((p) => p.starter)!;
const wells = world.structures.filter((q) => q.kind === "well") as { x: number; y: number; z: number }[];
let now = atHour(4, 9);
const ok = (s: Save, a: Action) => {
  const r = apply(world, s, a, now);
  if (!r.ok) throw new Error(`${a.t}: ${r.error}`);
  return r;
};
const no = (s: Save, a: Action) => expect(apply(world, s, a, now).ok).toBe(false);
const cells = (n: number, row = 4) => Array.from({ length: n }, (_, i) => ({ x: starter.x0 + 2 + i, y: starter.y, z: starter.z0 + row }));
const grow = (s: Save, crop: "onion" | "jowar", n: number, row: number) => {
  s.inv[`seed:${crop}`] = (s.inv[`seed:${crop}`] ?? 0) + n;
  for (const c of cells(n, row)) {
    if (!s.farm[String(c.x + 192 * (c.z + 192 * c.y))]) ok(s, { t: "till", ...c });
    ok(s, { t: "plant", ...c, crop });
  }
  now += 12 * DAY_MS; // long enough even dry
  for (const c of cells(n, row)) ok(s, { t: "harvest", ...c });
};

describe("the ten missions", () => {
  it("can be played through in order, with rewards granted only when complete", () => {
    const s = newSave("m", world, now);
    expect(current(s).id).toBe("homecoming");
    no(s, { t: "claimMission" });
    // 1 homecoming
    ok(s, { t: "talk", npc: "naik" });
    ok(s, { t: "visit", place: "aamrai" });
    for (const c of cells(6)) ok(s, { t: "till", ...c });
    const m0 = s.money;
    ok(s, { t: "claimMission" });
    expect(s.money).toBe(m0 + 500);
    // 2 first crop: the sickle adds one to each harvest
    grow(s, "onion", 6, 4);
    ok(s, { t: "visit", place: "prices" });
    ok(s, { t: "sell", item: "onion", n: 6, where: "village" });
    ok(s, { t: "claimMission" });
    expect(s.inv.sickle).toBe(1);
    // 3 water: the village well is queued, the vihir works
    s.inv.water = 0;
    no(s, { t: "refill", x: wells[0].x, y: wells[0].y - 2, z: wells[0].z });
    ok(s, { t: "refill", x: wells[1].x, y: wells[1].y - 2, z: wells[1].z });
    s.inv.water = 32;
    for (let i = 0; i < 16; i++) ok(s, { t: "water", ...cells(6)[i % 6] });
    ok(s, { t: "claimMission" });
    expect(s.inv.bigcan).toBe(1);
    // 4 Sitabai's order — miss the deadline once, then make it
    now += 4 * DAY_MS;
    grow(s, "jowar", 4, 6); // any action after the deadline restarts the mission
    expect(s.missions.flags.missed).toBe(true);
    s.inv.jowar = 20;
    ok(s, { t: "deliver", to: "sitabai", item: "jowar", n: 20 });
    ok(s, { t: "claimMission" });
    expect(s.perks).toContain("discount");
    const before = s.money;
    ok(s, { t: "buy", item: "seed:onion", n: 10 });
    expect(before - s.money).toBe(40); // 20% off ₹50
    // 5 the bulls
    s.money += 10000;
    ok(s, { t: "buy", item: "bulls", n: 1 });
    ok(s, { t: "buy", item: "plough", n: 1 });
    ok(s, { t: "buy", item: "fodder", n: 5 });
    ok(s, { t: "feed" });
    ok(s, { t: "plough", x: starter.x0 + 2, y: starter.y, z: starter.z0 + 10, dir: "x+" });
    ok(s, { t: "claimMission" });
    // 6 Teej: offerings, and the night gathering (refused by day)
    s.inv.jowar = 10;
    s.inv.onion = 10;
    ok(s, { t: "deliver", to: "mandir", item: "jowar", n: 10 });
    ok(s, { t: "deliver", to: "mandir", item: "onion", n: 10 });
    no(s, { t: "visit", place: "teej" });
    now += msBetween(9, 20); // 8 pm
    ok(s, { t: "visit", place: "teej" });
    ok(s, { t: "claimMission" });
    expect(s.inv.jhool).toBe(1);
    // 7 the caravan: sell 50 in town before 2 pm
    now += msBetween(20, 10); // 10 am next day
    s.inv.cart = 1;
    s.inv.jowar = 60;
    ok(s, { t: "feed" });
    ok(s, { t: "startTrip", load: { jowar: 60 } });
    now += 60_000;
    ok(s, { t: "sellTown" });
    ok(s, { t: "claimMission" });
    expect(s.perks).toContain("townContact");
    // 8 the debt: help Ramu kaka
    const rep = s.rep;
    ok(s, { t: "choose", option: "help" });
    no(s, { t: "choose", option: "refuse" }); // decided already
    ok(s, { t: "claimMission" });
    expect(s.rep).toBe(rep + 30);
    // 9 the land deal: Bandh is on sale for this mission, whatever the week
    s.money += 100_000;
    ok(s, { t: "buyPlot", plot: BANDH_PLOT });
    ok(s, { t: "claimMission" });
    // 10 the election: hear both, the gram sabha (by day), decide, vote once
    no(s, { t: "visit", place: "vote" }); // nobody chosen yet
    ok(s, { t: "talk", npc: "kamlabai" });
    ok(s, { t: "talk", npc: "shankar" });
    now += 1 * DAY_MS;
    const h = new Date(now).getUTCHours();
    void h;
    let tries = 0;
    while (apply(world, s, { t: "visit", place: "gramsabha" }, now).ok === false && tries++ < 24) now += HOUR_MS;
    expect(tries).toBeLessThan(24);
    const repBefore = s.rep;
    if (s.rep < 50) s.rep = 50;
    ok(s, { t: "choose", option: "self" });
    ok(s, { t: "visit", place: "vote" });
    no(s, { t: "visit", place: "vote" }); // only once
    ok(s, { t: "claimMission" });
    expect(s.perks).toContain("sarpanch");
    expect(s.rep).toBeGreaterThanOrEqual(Math.max(50, repBefore) + 20);
    // 11 Pola: happy, painted, then the procession
    no(s, { t: "visit", place: "pola" });
    ok(s, { t: "feed" });
    ok(s, { t: "feed" });
    ok(s, { t: "buy", item: "gerua", n: 1 });
    ok(s, { t: "decorate" });
    ok(s, { t: "visit", place: "pola" });
    expect(complete(s, { world, now })).toBe(true);
    ok(s, { t: "claimMission" });
    expect(s.perks).toContain("polaChampion");
    expect(s.missions.i).toBe(MISSIONS.length);
    no(s, { t: "claimMission" });
  });

  it("election: Shankar's envelope pays but costs reputation and strengthens the sahukar; Kamlabai halves drip", () => {
    const s = newSave("e", world, now);
    s.missions.i = 9;
    s.rep = 30;
    ok(s, { t: "talk", npc: "kamlabai" });
    ok(s, { t: "talk", npc: "shankar" });
    let tries = 0;
    while (apply(world, s, { t: "visit", place: "gramsabha" }, now).ok === false && tries++ < 24) now += HOUR_MS;
    no(s, { t: "choose", option: "self" }); // ★ 30 is not enough
    const m0 = s.money;
    ok(s, { t: "choose", option: "shankar" });
    expect(s.money).toBe(m0 + 2000);
    expect(s.rep).toBe(15);
    ok(s, { t: "visit", place: "vote" });
    ok(s, { t: "claimMission" });
    expect(s.perks).toContain("sahukarRaj");
    const k = newSave("k", world, now);
    k.perks.push("dripSubsidy");
    k.money = 10000;
    ok(k, { t: "buy", item: "drip", n: 1 });
    expect(k.money).toBe(8500);
  });

  it("refusing Ramu costs reputation; delivering what nobody asked for is refused", () => {
    const s = newSave("r", world, now);
    s.rep = 20;
    s.missions.i = 7;
    ok(s, { t: "choose", option: "refuse" });
    expect(s.rep).toBe(10);
    s.inv.jowar = 5;
    no(s, { t: "deliver", to: "sitabai", item: "jowar", n: 5 });
  });

  it("drip irrigation keeps a whole field watered", () => {
    const s = newSave("d", world, now);
    s.money = 10000;
    ok(s, { t: "till", ...cells(1)[0] });
    no(s, { t: "installDrip", plot: starter.id }); // no set yet
    ok(s, { t: "buy", item: "drip", n: 1 });
    ok(s, { t: "installDrip", plot: starter.id });
    ok(s, { t: "till", ...cells(2)[1] });
    for (const c of Object.values(s.farm)) expect(c.wetUntil).toBeGreaterThan(now + 1000 * DAY_MS);
    no(s, { t: "installDrip", plot: 0 }); // not my field
  });
});

describe("saves from the old map", () => {
  it("an old farm owning plot 5 is moved onto the new Aamrai, keeping money and goods", async () => {
    const { migrate } = await import("../src/shared/save");
    const old = newSave("old", world, now) as Omit<Save, "layout"> & { layout?: number };
    Object.assign(old, { version: 6, plots: [5], farm: { "123": { baseQ: 1, q: 1, wetUntil: 0, restedAt: 0 } }, money: 4321 });
    delete old.layout;
    old.inv.jowar = 9;
    const s = migrate(old as Save);
    expect(s.plots).toEqual([starter.id]);
    expect(world.plots[s.plots[0]].name).toBe("Aamrai");
    expect(s.farm).toEqual({});
    expect(s.money).toBe(4321);
    expect(s.inv.jowar).toBe(9);
    expect(apply(world, s, { t: "till", ...cells(1)[0] }, now).ok).toBe(true); // it really is yours now
  });
});

describe("nights in the tanda", () => {
  it("sleep jumps this farm to 6 am, once a night; crops grow through the night; friends once an evening", async () => {
    const { clock } = await import("../src/shared/time");
    const s = newSave("n", world, now);
    const at = (h: number) => atHour(10, h);
    const t = at(22);
    expect(apply(world, s, { t: "sleep" }, at(14)).ok).toBe(false); // afternoon
    const r = apply(world, s, { t: "sleep" }, t);
    expect(r.ok).toBe(true);
    expect(s.clockOffset).toBe(Math.round(msBetween(22, 6)));
    expect(clock(t + s.clockOffset!).hour).toBeCloseTo(6);
    expect(apply(world, s, { t: "sleep" }, t + s.clockOffset!).ok).toBe(false); // it's morning now
    expect((apply(world, s, { t: "friends" }, at(20)) as { msg?: string }).msg).toMatch(/\+1 reputation/);
    expect((apply(world, s, { t: "friends" }, at(21)) as { msg?: string }).msg).not.toMatch(/reputation/); // only once an evening
    expect(s.rep).toBe(1);
    expect(apply(world, s, { t: "friends" }, at(12)).ok).toBe(false);
  });
});

describe("Pehli Fasal teaches sowing and watering", () => {
  const into2 = () => {
    const s = newSave("p2", world, now);
    ok(s, { t: "talk", npc: "naik" });
    ok(s, { t: "visit", place: "aamrai" });
    for (const c of cells(6)) ok(s, { t: "till", ...c });
    ok(s, { t: "claimMission" });
    return s;
  };
  const got = (s: Save, id: string) => current(s).objectives.find((o) => o.id === id)!.have(s, { world, now });
  it("counts the onions you sow and the waterings, in order before the harvest", () => {
    const s = into2();
    expect(current(s).objectives.map((o) => o.id)).toEqual(["sow", "wet", "harvest", "prices", "sell"]);
    expect(got(s, "sow")).toBe(0);
    for (const c of cells(6)) ok(s, { t: "plant", ...c, crop: "onion" });
    expect(got(s, "sow")).toBe(6);
    expect(got(s, "wet")).toBe(0);
    for (const c of cells(6)) ok(s, { t: "water", ...c });
    expect(got(s, "wet")).toBe(6);
    // every objective carries a line on how to do it
    for (const o of current(s).objectives) expect(o.how?.length ?? 0).toBeGreaterThan(10);
  });
  it("a farmer who harvested before these steps existed isn't sent back to sow", () => {
    const s = into2();
    s.missions.c["harvestN:onion"] = (s.missions.c["harvestN:onion"] ?? 0) + 6; // harvested, but no plant counter yet
    expect(got(s, "sow")).toBe(6);
    expect(got(s, "wet")).toBe(6);
  });
});
