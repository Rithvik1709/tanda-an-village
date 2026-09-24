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

/*
 * Days are long and nights short: of each 10-minute day, 6 am to 7:30 pm takes 78% (about 7¾ minutes)
 * and the night, 7:30 pm to 6 am, only 22% (a little over 2 minutes).
 */
const DAY_SHARE = 0.78, DUSK = 19.5;
/** Hour of the day (6 → 30, i.e. 6 am → 6 am) at a fraction f of the real day since dawn. */
const hourAt = (f: number) => (f < DAY_SHARE ? 6 + ((DUSK - 6) * f) / DAY_SHARE : DUSK + ((30 - DUSK) * (f - DAY_SHARE)) / (1 - DAY_SHARE));
/** The inverse: how far through the real day (since dawn) a given hour falls. */
export const dayFraction = (hour: number) => {
  const h = hour < 6 ? hour + 24 : hour;
  return h < DUSK ? ((h - 6) / (DUSK - 6)) * DAY_SHARE : DAY_SHARE + ((h - DUSK) / (30 - DUSK)) * (1 - DAY_SHARE);
};
/** Real milliseconds from one hour to the next time the clock reads another (forward, within a day). */
export const msBetween = (from: number, to: number) => (((dayFraction(to) - dayFraction(from)) % 1) + 1) % 1 * DAY_MS;

/** The real moment of `hour` on game day `day` (hours before 6 am are the night after it). */
export const atHour = (day: number, hour: number) => EPOCH + day * DAY_MS + dayFraction(hour) * DAY_MS;

export function clock(ms: number): Clock {
  const d = (ms - EPOCH) / DAY_MS; // day 0 opens at dawn (6 am); the date turns at midnight
  const since = Math.floor(d), h = hourAt(d - since);
  const day = since + (h >= 24 ? 1 : 0);
  const s = ((Math.floor(day / SEASON_DAYS) % 3) + 3) % 3;
  return { day, hour: h % 24, season: SEASONS[s], dayOfSeason: ((day % SEASON_DAYS) + SEASON_DAYS) % SEASON_DAYS };
}

export const fmtHour = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;
