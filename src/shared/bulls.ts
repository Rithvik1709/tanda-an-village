import { DAY_MS } from "./time";

/*
 * Your bull pair (a Khillari jodi): stamina for work, mood from care. Both change with time, and
 * like crops they're integrated from timestamps so the server can recompute them exactly.
 */
export type Bulls = { stamina: number; mood: number; fedAt: number; updatedAt: number };
export const BULL_NAMES = ["Sarja", "Raja"] as const;

export const PLOUGH_COST = 2; // stamina per ploughed block
export const PLOUGH_ROW = 8; // blocks per pass
export const TRIP_COST = 20; // stamina for a cart trip to the town mandi
export const MIN_MOOD = 20; // below this they refuse to work
export const FEED = { stamina: 30, mood: 35 };
export const CART_CAPACITY = 200; // units of produce
export const TRIP_MS = 20_000; // the road to the town mandi takes at least this long (real ms)

/** The pair as they are right now: mood sours if unfed for more than a day; rest restores stamina. */
export function bullsNow(b: Bulls, now: number): Bulls {
  if (now <= b.updatedAt) return b;
  const days = (now - b.updatedAt) / DAY_MS;
  const hungryFrom = b.fedAt + DAY_MS;
  const hungryDays = Math.max(0, (now - Math.max(hungryFrom, b.updatedAt)) / DAY_MS);
  const mood = Math.max(0, b.mood - hungryDays * 25);
  const avgMood = (b.mood + mood) / 2;
  const stamina = Math.min(100, b.stamina + days * 40 * (0.3 + 0.7 * (avgMood / 100)));
  return { ...b, mood: round(mood), stamina: round(stamina), updatedAt: now };
}
const round = (n: number) => Math.round(n * 100) / 100;

export const newBulls = (now: number): Bulls => ({ stamina: 100, mood: 80, fedAt: now, updatedAt: now });

export function bullsMoodWord(mood: number) {
  return mood >= 75 ? "happy" : mood >= 45 ? "content" : mood >= MIN_MOOD ? "hungry" : "sulking — feed them";
}
