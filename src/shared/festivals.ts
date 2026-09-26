import { SEASON_DAYS } from "./time.js";

/*
 * Festivals that come round every year (a year is three 8-day seasons). On the day, the tanda is
 * decorated, greetings and gifts count double with your neighbours, and each festival has its own
 * thing to do, rewarded once a year:
 *   Dawali (early Rabi): light the diyas at Rathod Bhuvan after dark; the whole lane sees them.
 *   Sevalal Jayanti (late Rabi): offer bhog at the Sevalal mandir; Maharaj's blessing waters your fields.
 *   Holi (early Unhala): sit by the Holi fire in the chowk after dark, and go round your neighbours
 *   for gher — each gives a little, more the better they know you.
 * (Teej and Pola stay in the story, as missions.)
 */
export type FestivalId = "dawali" | "sevalal" | "holi";
export const YEAR_DAYS = SEASON_DAYS * 3;

export const FESTIVALS: Record<FestivalId, { name: string; local: string; icon: string; day: number; about: string }> = {
  dawali: { name: "Dawali", local: "दिवाळी", icon: "🪔", day: SEASON_DAYS + 1, about: "Light the diyas at Rathod Bhuvan after dark. Greetings and gifts count double today." },
  sevalal: { name: "Sevalal Jayanti", local: "सेवालाल जयंती", icon: "🚩", day: SEASON_DAYS + 6, about: "Offer bhog (5 produce) at the Sevalal mandir for Maharaj's blessing. Greetings and gifts count double today." },
  holi: { name: "Holi", local: "होळी", icon: "🔥", day: SEASON_DAYS * 2 + 1, about: "Go round your neighbours for gher, and sit by the Holi fire in the chowk after dark. Greetings and gifts count double today." },
};
export const FESTIVAL_IDS = Object.keys(FESTIVALS) as FestivalId[];

const dayOfYear = (day: number) => ((day % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS;
export const yearOf = (day: number) => Math.floor(day / YEAR_DAYS);
/** The festival on a game day, if any. */
export const festivalOn = (day: number): FestivalId | null => FESTIVAL_IDS.find((f) => FESTIVALS[f].day === dayOfYear(day)) ?? null;
/** Days until a festival next comes round (0: today). */
export const daysTo = (f: FestivalId, day: number) => (FESTIVALS[f].day - dayOfYear(day) + YEAR_DAYS) % YEAR_DAYS;

/** What each festival rewards, once a year. */
export const DIYA_REP = 5; // Dawali: the diyas lit
export const DIYA_BOND = 3; // …and every neighbour who knows you sees them
export const BHOG_N = 5; // Sevalal Jayanti: produce offered
export const BHOG_REP = 10;
export const HOLIKA_REP = 5; // Holi: the fire
export const gher = (hearts: number) => 20 + 20 * hearts; // Holi: from each neighbour you greet
export const FEST_HOUR = 19; // the evening part (diyas, the fire) is after 7 pm
