import { beforeAll, describe, expect, it } from "vitest";
import { B, block } from "../src/shared/blocks";
import { advance, CROPS, DRY_RATE, type Planting, stageOf, yieldOf } from "../src/shared/crops";
import { apply, blockAt } from "../src/shared/rules";
import { newSave, type Save } from "../src/shared/save";
import { DAY_MS, EPOCH, clock } from "../src/shared/time";
import { generateWorld, type World } from "../src/shared/world";

let world: World;
beforeAll(() => {
  world = generateWorld();
});
const T0 = EPOCH + 3 * DAY_MS; // some day in kharif
const fresh = () => newSave("t", world, T0);
const starter = () => world.plots.find((p) => p.starter)!;
const spot = (dx = 3, dz = 3) => ({ x: starter().x0 + dx, y: starter().y, z: starter().z0 + dz });

describe("game clock", () => {
  it("day 0 opens at 06:00 in kharif and seasons roll every 8 days", () => {
    expect(clock(EPOCH)).toMatchObject({ day: 0, season: "kharif" });
    expect(clock(EPOCH).hour).toBeCloseTo(6);
    expect(clock(EPOCH + 8 * DAY_MS).season).toBe("rabi");
    expect(clock(EPOCH + 16 * DAY_MS).season).toBe("unhala");
    expect(clock(EPOCH + 24 * DAY_MS).season).toBe("kharif");
  });
});

describe("crop growth", () => {
  const p0 = (): Planting => ({ crop: "jowar", plantedAt: 0, progress: 0, wetMs: 0, dryMs: 0, updatedAt: 0, speed: 1 });
  it("ripens in growDays when kept wet, and more slowly when dry", () => {
    const days = CROPS.jowar.growDays;
    expect(advance(p0(), Infinity, days * DAY_MS * 0.999).progress).toBeLessThan(1);
    expect(advance(p0(), Infinity, days * DAY_MS).progress).toBe(1);
    const dry = advance(p0(), 0, days * DAY_MS);
    expect(dry.progress).toBeCloseTo(DRY_RATE, 5);
  });
  it("reaches exactly 1 when ripe, whatever the speed (no floating-point 0.9999…)", () => {
    for (const speed of [0.61, 0.7777, 0.913, 1.0351, 1.2]) {
      for (const crop of ["jowar", "onion", "sugarcane"] as const) {
        const p = { ...p0(), crop, speed };
        expect(advance(p, 0, 1e12).progress).toBe(1);
        expect(advance(p, Infinity, 1e12).progress).toBe(1);
        expect(advance(p, DAY_MS * 0.37, 1e12).progress).toBe(1);
      }
    }
  });

  it("splits a wet spell and a dry spell exactly, however often it is sampled", () => {
    const wetUntil = DAY_MS * 0.5;
    const once = advance(p0(), wetUntil, DAY_MS);
    let many = p0();
    for (let t = 0; t <= DAY_MS; t += DAY_MS / 37) many = advance(many, wetUntil, t);
    many = advance(many, wetUntil, DAY_MS);
    expect(many.progress).toBeCloseTo(once.progress, 9);
    expect(once.wetMs).toBeCloseTo(DAY_MS * 0.5);
  });
  it("yields fully when kept wet on good soil and half-ish when dry", () => {
    const wet = advance(p0(), Infinity, 10 * DAY_MS);
    const dry = advance(p0(), 0, 20 * DAY_MS);
    expect(yieldOf(wet, 1)).toBe(CROPS.jowar.yield);
    expect(yieldOf(dry, 1)).toBeLessThan(CROPS.jowar.yield * 0.6);
    expect(stageOf(0)).toBe(0);
    expect(stageOf(0.6)).toBe(2);
    expect(stageOf(1)).toBe(3);
  });
});

describe("farming rules", () => {
  it("till → plant → water → wait → harvest", () => {
    const s: Save = fresh();
    const { x, y, z } = spot();
    expect(block(blockAt(world, s, x, y, z, T0)).farmable).toBe(true);
    expect(apply(world, s, { t: "till", x, y, z }, T0)).toMatchObject({ ok: true });
    expect(blockAt(world, s, x, y, z, T0)).toBe(B.TILLED);
    expect(apply(world, s, { t: "plant", x, y, z, crop: "jowar" }, T0)).toMatchObject({ ok: true });
    expect(s.inv["seed:jowar"]).toBe(11);
    expect(blockAt(world, s, x, y + 1, z, T0)).toBe(B.JOWAR_0);
    expect(apply(world, s, { t: "water", x, y, z }, T0)).toMatchObject({ ok: true });
    expect(blockAt(world, s, x, y, z, T0 + 1000)).toBe(B.TILLED_WET);
    expect(apply(world, s, { t: "harvest", x, y, z }, T0 + DAY_MS * 0.1)).toMatchObject({ ok: false });
    // keep it watered each half day until ripe
    let t = T0;
    for (let i = 0; i < 8; i++) {
      t += DAY_MS * 0.4;
      apply(world, s, { t: "water", x, y, z }, t);
    }
    expect(blockAt(world, s, x, y + 1, z, t)).toBe(B.JOWAR_3);
    const r = apply(world, s, { t: "harvest", x, y, z }, t);
    expect(r.ok).toBe(true);
    expect(s.inv.jowar).toBeGreaterThanOrEqual(5);
    expect(s.farm[Object.keys(s.farm)[0]].plant).toBeUndefined();
    expect(s.stats).toMatchObject({ planted: 1, harvested: 1 });
  });

  it("rejects cheating", () => {
    const s = fresh();
    const { x, y, z } = spot();
    const out = world.plots.find((p) => !p.starter)!;
    expect(apply(world, s, { t: "till", x: out.x0 + 3, y: out.y, z: out.z0 + 3 }, T0).ok).toBe(false); // not my land
    expect(apply(world, s, { t: "dig", x: 96, y: 15, z: 96 }, T0).ok).toBe(false); // the village road
    expect(apply(world, s, { t: "plant", x, y, z, crop: "jowar" }, T0).ok).toBe(false); // untilled
    apply(world, s, { t: "till", x, y, z }, T0);
    s.inv["seed:onion"] = 0;
    expect(apply(world, s, { t: "plant", x, y, z, crop: "onion" }, T0).ok).toBe(false); // no seeds
    expect(apply(world, s, { t: "plant", x, y, z, crop: "gold" as never }, T0).ok).toBe(false);
    expect(apply(world, s, { t: "place", x, y: y + 1, z: z + 1, b: B.BEDROCK }, T0).ok).toBe(false); // not a building block
    s.inv.water = 0;
    expect(apply(world, s, { t: "water", x, y, z }, T0).ok).toBe(false); // empty can
    expect(apply(world, s, { t: "refill", x, y, z }, T0).ok).toBe(false); // not water
    expect(apply(world, s, { t: "dig", x: 1.5, y, z } as never, T0).ok).toBe(false); // fractional coords
  });

  it("refills at the river and uproots with a dig", () => {
    const s = fresh();
    s.inv.water = 0;
    // find a river water block
    let found: [number, number, number] | null = null;
    for (let x = 0; x < 40 && !found; x++) if (world.voxels[x + 192 * (60 + 192 * 11)] === B.WATER) found = [x, 11, 60];
    expect(found).not.toBeNull();
    expect(apply(world, s, { t: "refill", x: found![0], y: found![1], z: found![2] }, T0).ok).toBe(true);
    expect(s.inv.water).toBe(16);
    const { x, y, z } = spot(5, 5);
    apply(world, s, { t: "till", x, y, z }, T0);
    apply(world, s, { t: "plant", x, y, z, crop: "onion" }, T0);
    expect(apply(world, s, { t: "dig", x, y: y + 1, z }, T0)).toMatchObject({ ok: true, msg: "Uprooted" });
    expect(blockAt(world, s, x, y + 1, z, T0)).toBe(B.AIR);
    expect(blockAt(world, s, x, y, z, T0)).toBe(B.TILLED);
  });

  it("harvest wears the soil a little and rest restores it", () => {
    const s = fresh();
    const { x, y, z } = spot(6, 6);
    apply(world, s, { t: "till", x, y, z }, T0);
    const cell = Object.values(s.farm)[0];
    const q0 = cell.q;
    apply(world, s, { t: "plant", x, y, z, crop: "onion" }, T0);
    apply(world, s, { t: "harvest", x, y, z }, T0 + 30 * DAY_MS);
    expect(cell.q).toBeCloseTo(q0 - 0.04, 5);
    apply(world, s, { t: "plant", x, y, z, crop: "onion" }, T0 + 32 * DAY_MS);
    expect(cell.q).toBeCloseTo(q0, 5);
  });
});
