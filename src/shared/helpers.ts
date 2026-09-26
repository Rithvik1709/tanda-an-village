import { atHour, clock, DAY_MS } from "./time.js";

/*
 * Majoor: labourers you hire by the day from Devidas Chavan, the mukadam. Hire in the morning and
 * they walk straight over to the aangan by Rathod Bhuvan; hire later, and they're there at 6 am the
 * next day. Tell them one job on one of your fields and
 * they stick to it until dusk. Their work is laid out on fixed time slots from the moment you give
 * the order, so the server can recompute exactly what they did, however often it looks.
 */
export type HelperId = "sakharam" | "parvati" | "vithoba";
export type HelperJob = "plant" | "water" | "harvest";

export const MUKADAM = { name: "Devidas Chavan", local: "देविदास चव्हाण", title: "the mukadam" };

/** The labourers who work out of the mukadam's house. `perHour`: patches in a game hour of daylight. */
export const HELPERS: Record<HelperId, { name: string; local: string; wage: number; perHour: number; expert: boolean; about: string }> = {
  sakharam: { name: "Sakharam", local: "सखाराम", wage: 750, perHour: 8, expert: false, about: "steady, never in a hurry" },
  parvati: { name: "Parvatibai", local: "पार्वतीबाई", wage: 750, perHour: 8, expert: false, about: "sings as she works the rows" },
  vithoba: { name: "Vithoba mistry", local: "विठोबा मिस्त्री", wage: 1000, perHour: 12, expert: true, about: "thirty harvests behind him — half again as quick" },
};
export const HELPER_IDS = Object.keys(HELPERS) as HelperId[];
export const isHelper = (x: unknown): x is HelperId => typeof x === "string" && x in HELPERS;

export const HELPER_MIN_PLOTS = 2; // you need more land than you can work yourself
export const HIRE_MAX = 2; // labourers a day
export const CANCEL_REFUND = 1; // share of the wage back if you cancel before they come (at 6 am)
export const DUSK_HOUR = 19.5; // they go home at dusk
export const ORDER_BY = 17; // after 5 pm it isn't worth starting
export const SAME_DAY_BY = 12; // hired before noon, they come the same day
/** Real ms in one game hour of daylight (hours run faster at night). */
export const DAYLIGHT_HOUR_MS = atHour(0, 7) - atHour(0, 6);
/** The walk from the aangan out to a field. */
export const WALK_MS = DAYLIGHT_HOUR_MS;
/** Real ms per patch for a labourer. */
export const patchMs = (id: HelperId) => Math.round(DAYLIGHT_HOUR_MS / HELPERS[id].perHour);

/** A labourer you've hired for `day`; `job` once you've told them what to do. */
export type Hire = {
  who: HelperId;
  day: number;
  from?: number; // hired the same morning: when they reach your aangan (otherwise 6 am)
  job?: {
    kind: HelperJob;
    plot: number;
    crop?: string; // planting: the crop whose seeds you handed over
    seeds: number; // seeds still in their bag (back to you at dusk)
    startAt: number; // when they reach the field and begin
    step: number; // time slots used so far (a slot with nothing to do is spent waiting)
    done: number; // patches actually worked
    at?: string; // the farm cell they worked last (where to draw them)
    idle?: boolean; // nothing to do at the last slot: resting at the field's edge
    full?: boolean; // the godown filled up; they stopped harvesting
    over?: boolean; // dusk has come and the day's work is settled
  };
};

/** The game day a hire made now is for: today until noon, then the coming morning. */
export function hireDay(now: number) {
  const c = clock(now);
  return c.hour < SAME_DAY_BY ? c.day : c.day + 1;
}
export const duskOf = (day: number) => atHour(day, DUSK_HOUR);
export const dawnOf = (day: number) => atHour(day, 6);
/** When a labourer reaches your aangan: 6 am, or an hour after a same-morning hire. */
export const arriveAt = (h: Hire) => h.from ?? dawnOf(h.day);

/** What a labourer is up to right now, for drawing them and for the hint line. */
export type HelperPhase = "booked" | "waiting" | "walking" | "working" | "resting" | "home";
export function helperPhase(h: Hire, now: number): HelperPhase {
  if (now < arriveAt(h)) return "booked";
  if (now >= duskOf(h.day) || now >= dawnOf(h.day) + DAY_MS) return "home";
  if (!h.job) return "waiting";
  if (now < h.job.startAt) return "walking";
  return h.job.idle || h.job.full || h.job.over ? "resting" : "working";
}

export const JOB_NAMES: Record<HelperJob, string> = { plant: "sow seeds", water: "water the field", harvest: "harvest the ripe crop" };
