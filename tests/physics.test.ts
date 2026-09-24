import { describe, expect, it } from "vitest";
import { type Body, boxHits, raycast, step } from "../src/client/player/physics";

// a flat floor at y = 10 (blocks y ≤ 9 are solid) with one wall block column at x = 5
const floor = (x: number, y: number, _z: number) => y <= 9 || (x === 5 && y <= 11);
const noWater = () => false;
const still = { forward: 0, right: 0, jump: false, sprint: false };
const body = (x: number, y: number, z: number): Body => ({ pos: { x, y, z }, vel: { x: 0, y: 0, z: 0 }, onGround: false, inWater: false });
const run = (b: Body, input = still, yaw = 0, secs = 1, solid = floor) => {
  for (let t = 0; t < secs; t += 1 / 120) step(b, input, yaw, 1 / 120, solid, noWater);
};

describe("physics", () => {
  it("falls and lands on the floor", () => {
    const b = body(0.5, 20, 0.5);
    run(b, still, 0, 2);
    expect(b.pos.y).toBeCloseTo(10, 5);
    expect(b.onGround).toBe(true);
  });

  it("does not tunnel through the floor from a great height", () => {
    const b = body(0.5, 47, 0.5);
    run(b, still, 0, 4);
    expect(b.pos.y).toBeCloseTo(10, 5);
  });

  it("walks forward (yaw 0 faces −z) and stops at a wall", () => {
    const b = body(0.5, 10, 0.5);
    run(b, { ...still, forward: 1 }, 0, 1);
    expect(b.pos.z).toBeLessThan(-3);
    const w = body(2.5, 10, 0.5);
    run(w, { ...still, right: 1 }, 0, 2); // strafe right = +x, into the wall at x = 5
    expect(w.pos.x).toBeLessThan(5 - 0.3 + 1e-6);
    expect(w.pos.x).toBeGreaterThan(4.6);
    expect(boxHits(w.pos, floor)).toBe(false);
  });

  it("jumps about 1.3 blocks — enough for one step, not two", () => {
    const b = body(0.5, 10, 0.5);
    run(b, still, 0, 0.2);
    let peak = 0;
    for (let t = 0; t < 1; t += 1 / 120) {
      step(b, { ...still, jump: t < 0.05 }, 0, 1 / 120, floor, noWater);
      peak = Math.max(peak, b.pos.y - 10);
    }
    expect(peak).toBeGreaterThan(1.1);
    expect(peak).toBeLessThan(1.6);
  });

  it("raycasts to the first solid block and reports the face", () => {
    const hit = raycast({ x: 0.5, y: 11.6, z: 0.5 }, { x: 1, y: 0, z: 0 }, 6, floor);
    expect(hit).toMatchObject({ x: 5, y: 11, z: 0, nx: -1, ny: 0, nz: 0 });
    const down = raycast({ x: 0.5, y: 11.6, z: 0.5 }, { x: 0, y: -1, z: 0 }, 6, floor);
    expect(down).toMatchObject({ x: 0, y: 9, z: 0, ny: 1 });
    expect(raycast({ x: 0.5, y: 11.6, z: 0.5 }, { x: 0, y: 1, z: 0 }, 6, floor)).toBeNull();
  });
});
