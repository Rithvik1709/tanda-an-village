import { describe, expect, it } from "vitest";
import { B } from "../src/shared/blocks";
import { D, generateWorld, idx, riverCenter, surfaceY, W, WATER_LEVEL } from "../src/shared/world";
import { hashStr } from "../src/shared/rng";

describe("world generation", () => {
  const a = generateWorld();
  it("is deterministic for a seed", () => {
    const b = generateWorld();
    expect(hashStr(String(a.voxels.reduce((h, v, i) => (h * 31 + v * (i % 97)) | 0, 7)))).toBe(hashStr(String(b.voxels.reduce((h, v, i) => (h * 31 + v * (i % 97)) | 0, 7))));
    expect(a.plots).toEqual(b.plots);
  });
  it("differs for another seed", () => {
    const c = generateWorld(123);
    let diff = 0;
    for (let i = 0; i < a.voxels.length; i += 101) if (a.voxels[i] !== c.voxels[i]) diff++;
    expect(diff).toBeGreaterThan(100);
  });
  it("has 16 plots, exactly one starter, none overlapping", () => {
    expect(a.plots).toHaveLength(16);
    expect(a.plots.filter((p) => p.starter)).toHaveLength(1);
    const seen = new Map<number, number>();
    for (const p of a.plots)
      for (let z = p.z0; z <= p.z1; z++)
        for (let x = p.x0; x <= p.x1; x++) {
          const k = x + W * z;
          expect(seen.has(k)).toBe(false);
          seen.set(k, p.id);
        }
  });
  it("plot interiors are farmable soil at the plot height", () => {
    for (const p of a.plots) {
      const x = Math.round((p.x0 + p.x1) / 2);
      const z = Math.round((p.z0 + p.z1) / 2);
      expect([B.BLACK_SOIL, B.RED_SOIL]).toContain(a.voxels[idx(x, p.y, z)]);
      expect(a.plotMap[x + W * z]).toBe(p.id);
    }
  });
  it("the river has water at the water level", () => {
    const z = 60;
    const x = Math.round(riverCenter(z));
    expect(a.voxels[idx(x, WATER_LEVEL, z)]).toBe(B.WATER);
  });
  it("spawn stands on solid ground in the square", () => {
    const s = a.landmarks.spawn;
    expect(surfaceY(a, Math.floor(s.x), Math.floor(s.z))).toBe(s.y - 1);
    expect(D).toBe(192);
  });
});
