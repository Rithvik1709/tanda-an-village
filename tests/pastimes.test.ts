import { beforeAll, describe, expect, it } from "vitest";
import { B } from "../src/shared/blocks";
import { biteFor, CASTS_PER_DAY, FISH, FISH_IDS, fishCount } from "../src/shared/fish";
import { jobsFor } from "../src/shared/jobs";
import { apply } from "../src/shared/rules";
import { newSave } from "../src/shared/save";
import { clock, DAY_MS, EPOCH } from "../src/shared/time";
import { COURT, generateWorld, idx, MAIDAN, TALAV, talavOut, type World } from "../src/shared/world";

let world: World;
beforeAll(() => {
  world = generateWorld();
});
const T0 = EPOCH + 3 * DAY_MS + 0.3 * DAY_MS;
const fresh = () => newSave("pastime-test", world, T0);

describe("the maidan and the talav", () => {
  it("the maidan is level earth behind the school, with the court on it", () => {
    for (let z = MAIDAN.z0; z <= MAIDAN.z1; z++)
      for (let x = MAIDAN.x0; x <= MAIDAN.x1; x++) {
        expect(world.voxels[idx(x, MAIDAN.y, z)]).toBe(B.DIRT);
        expect(world.voxels[idx(x, MAIDAN.y + 1, z)]).toBe(B.AIR);
      }
    const school = world.structures.find((s) => s.kind === "school")!;
    expect(MAIDAN.x0).toBeGreaterThan((school as { x0: number; w: number }).x0 + (school as { w: number }).w); // east of it: behind the verandah
    expect(COURT.x0).toBeGreaterThanOrEqual(MAIDAN.x0);
    expect(COURT.z1).toBeLessThanOrEqual(MAIDAN.z1 + 1);
  });
  it("the talav holds water and sits beyond the maidan", () => {
    const x = Math.floor(TALAV.x), z = Math.floor(TALAV.z);
    expect(world.voxels[idx(x, TALAV.floor + 1, z)]).toBe(B.WATER);
    expect(world.voxels[idx(x, TALAV.floor, z)]).not.toBe(B.WATER);
    expect(TALAV.x - TALAV.rx).toBeGreaterThan(MAIDAN.x1);
    // the bank all round is above the water
    for (let a = 0; a < Math.PI * 2; a += 0.2) {
      const bx = Math.floor(TALAV.x + Math.cos(a) * (TALAV.rx + 0.9)), bz = Math.floor(TALAV.z + Math.sin(a) * (TALAV.rz + 0.9));
      if (talavOut(bx + 0.5, bz + 0.5) < 0) continue;
      let y = 40;
      while (y > 0 && world.voxels[idx(bx, y, bz)] === B.AIR) y--;
      expect(y + 1).toBeGreaterThan(TALAV.level);
    }
    expect(world.landmarks.talav.label).toMatch(/Talav/);
    expect(world.landmarks.kabaddi.label).toMatch(/Kabaddi/);
  });
  it("a can fills at the talav, even while the village well is closed to you", () => {
    const s = fresh();
    s.inv.water = 0;
    const r = apply(world, s, { t: "refill", x: Math.floor(TALAV.x), y: TALAV.floor + 1, z: Math.floor(TALAV.z) }, T0);
    expect(r.ok).toBe(true);
    expect(s.inv.water).toBe(24);
  });
});

describe("kaam: the day's jobs", () => {
  it("are the same for everyone on a day, three of them, and change with the day", () => {
    const a = jobsFor(10), b = jobsFor(10), c = jobsFor(11);
    expect(a).toEqual(b);
    expect(a.map((j) => j.slot)).toEqual([0, 1, 2]);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(c));
    for (let d = 0; d < 40; d++) for (const j of jobsFor(d)) expect(j.pay).toBeGreaterThan(0);
  });
  it("a produce job takes the produce, pays better than the trader, and can be done once", () => {
    const s = fresh();
    const day = clock(T0).day;
    const job = jobsFor(day).find((j) => j.kind === "produce")!;
    if (job.kind !== "produce") throw new Error("no produce job");
    expect(apply(world, s, { t: "job", slot: job.slot }, T0).ok).toBe(false); // nothing to give yet
    s.inv[job.item] = job.n + 3;
    const m0 = s.money, rep0 = s.rep;
    expect(apply(world, s, { t: "job", slot: job.slot }, T0)).toMatchObject({ ok: true });
    expect(s.inv[job.item]).toBe(3);
    expect(s.money - m0).toBe(job.pay);
    expect(s.rep - rep0).toBe(job.rep);
    expect(apply(world, s, { t: "job", slot: job.slot }, T0).ok).toBe(false);
    // tomorrow is a new day of jobs
    expect(s.jobs?.done).toEqual([job.slot]);
  });
  it("every kind of errand checks what it needs", () => {
    // find days that have each kind of errand
    const dayWith = (kind: string) => {
      for (let d = 0; d < 200; d++) if (jobsFor(d).some((j) => j.kind === kind)) return d;
      throw new Error(kind);
    };
    const at = (d: number) => EPOCH + d * DAY_MS + 0.3 * DAY_MS;
    // water: needs a full enough can
    {
      const d = dayWith("water"), s = fresh();
      s.inv.water = 5;
      expect(apply(world, s, { t: "job", slot: 0 }, at(d)).ok).toBe(false);
      s.inv.water = 24;
      expect(apply(world, s, { t: "job", slot: 0 }, at(d)).ok).toBe(true);
      expect(s.inv.water).toBe(12);
    }
    // parcel: collect first, then deliver
    {
      const d = dayWith("parcel"), s = fresh();
      expect(apply(world, s, { t: "job", slot: 0 }, at(d)).ok).toBe(false);
      expect(apply(world, s, { t: "job", slot: 0, step: "take" }, at(d)).ok).toBe(true);
      expect(s.jobs?.carrying).toBe(0);
      expect(apply(world, s, { t: "job", slot: 0 }, at(d)).ok).toBe(true);
      expect(s.jobs?.carrying).toBeUndefined();
    }
    // fish: any fish will do, the cheapest go first
    {
      const d = dayWith("fish"), s = fresh();
      const job = jobsFor(d).find((j) => j.kind === "fish")!;
      s.inv["fish:maral"] = 1;
      s.inv["fish:chilapi"] = job.n;
      expect(apply(world, s, { t: "job", slot: job.slot }, at(d)).ok).toBe(true);
      expect(s.inv["fish:maral"]).toBe(1);
      expect(s.inv["fish:chilapi"]).toBeUndefined();
    }
    // a job from another day is refused
    {
      const s = fresh();
      s.jobs = { day: clock(T0).day - 1, done: [0, 1, 2] };
      s.inv.water = 24;
      const r = apply(world, s, { t: "job", slot: 9 }, T0);
      expect(r.ok).toBe(false);
    }
  });
});

describe("fishing", () => {
  it("needs a rod; the catch is decided by the save, not the client", () => {
    const s = fresh();
    expect(apply(world, s, { t: "fish", got: true }, T0).ok).toBe(false);
    expect(apply(world, s, { t: "buy", item: "rod", n: 1 }, T0).ok).toBe(true);
    const expected = biteFor(s.id, 0).fish;
    expect(apply(world, s, { t: "fish", got: true }, T0).ok).toBe(true);
    expect(s.inv[`fish:${expected}`]).toBe(1);
    // one that got away still used the cast, and the next bite is the next fish in line
    expect(apply(world, s, { t: "fish", got: false }, T0).ok).toBe(true);
    expect(s.fishing?.n).toBe(2);
  });
  it("the talav gives only so many bites a day, then again tomorrow", () => {
    const s = fresh();
    s.inv.rod = 1;
    for (let i = 0; i < CASTS_PER_DAY; i++) expect(apply(world, s, { t: "fish", got: true }, T0 + i * 1000).ok).toBe(true);
    expect(apply(world, s, { t: "fish", got: true }, T0 + 20_000).ok).toBe(false);
    expect(fishCount(s.inv)).toBe(CASTS_PER_DAY);
    expect(apply(world, s, { t: "fish", got: true }, T0 + DAY_MS).ok).toBe(true);
  });
  it("fish sell at Ganpat's; rare fish are rarer and dearer", () => {
    const s = fresh();
    s.inv["fish:rohu"] = 2;
    const m0 = s.money;
    expect(apply(world, s, { t: "sellFish", item: "rohu", n: 2 }, T0).ok).toBe(true);
    expect(s.money).toBeGreaterThan(m0 + 60);
    expect(apply(world, s, { t: "sellFish", item: "rohu", n: 1 }, T0).ok).toBe(false);
    const counts = Object.fromEntries(FISH_IDS.map((f) => [f, 0]));
    for (let n = 0; n < 4000; n++) counts[biteFor("someone", n).fish]++;
    expect(counts.chilapi).toBeGreaterThan(counts.maral * 4);
    expect(FISH.maral.price).toBeGreaterThan(FISH.chilapi.price * 3);
  });
});

describe("kabaddi", () => {
  it("the day's first win pays ₹101; later games are for the joy of it", () => {
    const s = fresh();
    const m0 = s.money;
    expect(apply(world, s, { t: "kabaddi", won: true }, T0).ok).toBe(true);
    expect(s.money).toBe(m0 + 101);
    expect(apply(world, s, { t: "kabaddi", won: true }, T0 + 60_000).ok).toBe(true);
    expect(s.money).toBe(m0 + 101);
    expect(s.kabaddi).toMatchObject({ played: 2, wins: 2 });
    const rep = s.rep;
    expect(apply(world, s, { t: "kabaddi", won: false }, T0 + DAY_MS).ok).toBe(true);
    expect(s.rep).toBe(rep + 1);
  });
});
