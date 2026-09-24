/*
 * The game clock. One game day = 10 real minutes, derived from wall-clock time so the server and every
 * client agree without syncing state. Day 0 began at 06:00 on EPOCH. A year is three 8-day seasons.
 */
export const DAY_MS = 10 * 60 * 1000;
export const HOUR_MS = DAY_MS / 24;
export const EPOCH = Date.UTC(2026, 8, 24, 0, 0, 0);
export const SEASON_DAYS = 8;
export const SEASONS = ["kharif", "rabi", "unhala"] as const;
export type Season = (typeof SEASONS)[number];
export const SEASON_NAMES: Record<Season, string> = { kharif: "Kharif · monsoon", rabi: "Rabi · winter", unhala: "Unhala · summer" };

export type Clock = { day: number; hour: number; season: Season; dayOfSeason: number };

export function clock(ms: number): Clock {
  const d = (ms - EPOCH) / DAY_MS + 0.25; // +6 h: day 0 opens at dawn
  const day = Math.floor(d);
  const s = ((Math.floor(day / SEASON_DAYS) % 3) + 3) % 3;
  return { day, hour: (d - day) * 24, season: SEASONS[s], dayOfSeason: ((day % SEASON_DAYS) + SEASON_DAYS) % SEASON_DAYS };
}

export const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
