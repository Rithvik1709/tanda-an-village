/*
 * Reeling in a fish: one button. Holding it winds the line in but raises the tension; letting go
 * eases the tension while the fish takes line back. Now and then the fish surges: hold on through a
 * surge and the line may snap. `fight` (0..1) is how strong the fish is. Pure, so it can be tested.
 */
export type Reel = { progress: number; tension: number; surge: number; surgeLen: number; calm: number; t: number };

export const newReel = (): Reel => ({ progress: 0.3, tension: 0.15, surge: 0, surgeLen: 0, calm: 1.2, t: 0 });
/** A surge builds over its first moments (the float starts to thrash), so you can react to it. */
const SURGE_RAMP = 0.35;

/** Advance the fight by dt seconds. `rnd` is a 0..1 random source. */
export function reelStep(r: Reel, holding: boolean, dt: number, fight: number, rnd: () => number): "fighting" | "landed" | "snapped" | "escaped" {
  r.t += dt;
  // the fish's mood: calm spells, then a surge (stronger fish surge longer and more often)
  if (r.surge > 0) {
    r.surge -= dt;
    if (r.surge <= 0) r.calm = 0.9 + rnd() * (1.8 - fight);
  } else {
    r.calm -= dt;
    if (r.calm <= 0) r.surge = r.surgeLen = 0.45 + rnd() * (0.4 + fight * 0.9);
  }
  const surging = r.surge > 0;
  const build = surging ? Math.min(1, (r.surgeLen - r.surge) / SURGE_RAMP) : 0;
  if (holding) {
    r.progress += (surging ? 0.04 : 0.27 - 0.07 * fight) * dt;
    r.tension += (0.22 + fight * 0.32 + build * (0.7 + fight * 0.5)) * dt;
  } else {
    r.tension -= 0.9 * dt;
    r.progress -= (surging ? 0.03 + fight * 0.05 : 0.02 + fight * 0.02) * dt;
  }
  r.tension = Math.max(0, r.tension);
  if (r.tension >= 1) return "snapped";
  if (r.progress >= 1) return "landed";
  if (r.progress <= 0) return "escaped";
  return "fighting";
}

export const isSurging = (r: Reel) => r.surge > 0;
