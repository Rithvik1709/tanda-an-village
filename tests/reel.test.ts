import { describe, expect, it } from "vitest";
import { FISH, FISH_IDS } from "../src/shared/fish";
import { isSurging, newReel, reelStep } from "../src/client/reel";

/** Play many fights with a simple policy; return the share landed and the average time. */
function play(fight: number, policy: (r: ReturnType<typeof newReel>) => boolean, n = 300, easy = false) {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let landed = 0, time = 0;
  for (let i = 0; i < n; i++) {
    const r = newReel();
    const seen: ReturnType<typeof newReel>[] = [];
    for (let s = 0; s < 60 * 60; s++) {
      // a person reacts about a quarter of a second late
      seen.push({ ...r });
      const out = reelStep(r, policy(seen[Math.max(0, seen.length - 16)]), 1 / 60, fight, rnd, easy);
      if (out === "fighting") continue;
      if (out === "landed") {
        landed++;
        time += r.t;
      }
      break;
    }
  }
  return { share: landed / n, time: time / Math.max(1, landed) };
}

describe("reeling in", () => {
  const careful = (r: ReturnType<typeof newReel>) => !isSurging(r) && r.tension < 0.7;
  it("a careful angler lands every kind of fish, in a few seconds", () => {
    for (const id of FISH_IDS) {
      const { share, time } = play(FISH[id].fight, careful);
      expect(share, id).toBeGreaterThan(0.9);
      expect(time, id).toBeGreaterThan(2);
      expect(time, id).toBeLessThan(14);
    }
  });
  it("holding on through the surges snaps the line", () => {
    for (const id of FISH_IDS) expect(play(FISH[id].fight, () => true).share, id).toBe(0);
    expect(play(FISH.rohu.fight, (r) => r.tension < 0.9).share).toBeLessThan(0.2);
  });
  it("never reeling lets the fish go", () => {
    expect(play(FISH.chilapi.fight, () => false).share).toBe(0);
  });
});

describe("easy fishing", () => {
  it("never snaps, even holding on the whole time, and even the maral comes in", () => {
    for (const id of FISH_IDS) {
      const { share, time } = play(FISH[id].fight, () => true, 200, true);
      expect(share, id).toBe(1);
      expect(time, id).toBeLessThan(20);
    }
  });
});
