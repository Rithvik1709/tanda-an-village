import { NEIGHBOURS, type NeighbourId } from "./neighbours.js";
import { hash2 } from "./rng.js";

/*
 * The ladder to Sarpanch. A tanda is run by its Naik with a Karbhari at his side; the village has
 * its gram panchayat of ward members (panch) and the Sarpanch over them.
 *   Karbhari — Naik Dhavlu asks you once the tanda knows you (★ and a few friends). Each day he has
 *     one duty for you at his kacheri: settle a quarrel, carry his word to someone, or go door to
 *     door for a contribution. Each pays a small honour and earns ★ and hearts.
 *   Panch — after some days as Karbhari, stand for your ward: your lane's neighbours vote for you
 *     if they know you well enough. (The desk at Rathod Bhuvan is the Sarpanch's alone.)
 *   Sarpanch — you can only stand in the panchayat election once you are a Panch.
 */
export type Roles = { karbhari?: number; panch?: number }; // the day each was taken up

export const KARBHARI_REP = 20;
export const KARBHARI_FRIENDS = 2; // neighbours with at least FRIEND_HEARTS
export const FRIEND_HEARTS = 2;
export const PANCH_REP = 35;
export const PANCH_DAYS = 3; // days as Karbhari before you can stand
export const WARD: NeighbourId[] = ["savitri", "tulsa", "kashibai", "bhimrao"]; // your lane's voters
export const PANCH_VOTES = 3; // of the four
export const DUTY_HONOUR = 150; // the Naik's honour for a duty done
export const DUTY_REP = 2;
export const COLLECT_EACH = 50; // each house's contribution (it goes to the Naik, not you)

export type Duty =
  | { kind: "quarrel"; a: NeighbourId; b: NeighbourId; about: string; ask: string }
  | { kind: "message"; to: NeighbourId; text: string }
  | { kind: "collect"; from: NeighbourId[]; forWhat: string };
export type DutyState = { day: number; step?: "carrying" | "collecting"; got: string[]; done?: boolean };

const QUARRELS: [NeighbourId, NeighbourId, string, string][] = [
  ["bhimrao", "savitri", "a goat in the jowar", "Bhimrao kaka's goats got into Savitribai's jowar again. She wants him to pay for the damage; he says her fence has a hole a buffalo could walk through."],
  ["kashibai", "tulsa", "the turn at the well", "Kashibai says Tulsa aaji's grandson jumps the queue at the well every morning. Tulsa aaji says the boy has school and can't wait an hour."],
  ["lakshmi", "guruji", "a broken slate", "Lakshmi's brother broke a slate at the Z.P. school. Pawar guruji wants the family to pay; Lakshmi says it was already cracked."],
  ["sitabai", "ganpat", "a stolen customer", "Sitabai says Ganpat has started selling seed on the side, under her nose. Ganpat says a man can sell what he likes on his own stall."],
];
const MESSAGES: [NeighbourId, string][] = [
  ["guruji", "Tell Pawar guruji the tanda will give the school two days' labour before the rains."],
  ["tulsa", "Tell Tulsa aaji her son's money order has come to the post office in Jalna."],
  ["kashibai", "Tell Kashibai the women's group meets at the mandir on Thursday."],
  ["dagdu", "Tell Dagdu mama the Naik wants a fish for the Teej feast — a big one."],
  ["bhimrao", "Tell Bhimrao kaka the vet comes on Monday for the cattle."],
  ["lakshmi", "Tell Lakshmi's father the Naik has found a buyer for his goats."],
];
const COLLECTIONS = ["new rope for the mandir bell", "oil for the Sevalal mandir's lamp", "the tanda's gift for Kashibai's granddaughter's wedding", "a new pot for the village well's pulley"];
const pick = <T>(xs: readonly T[], r: number) => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))];

/** The Naik's duty for a game day (everyone's Naik asks the same thing that day). */
export function dutyFor(day: number): Duty {
  const r = (k: number) => hash2(day, k, 0x6b617262); // "karb"
  const kind = pick(["quarrel", "message", "collect"] as const, r(1));
  if (kind === "quarrel") {
    const [a, b, about, ask] = pick(QUARRELS, r(2));
    return { kind, a, b, about, ask };
  }
  if (kind === "message") {
    const [to, text] = pick(MESSAGES, r(2));
    return { kind, to, text };
  }
  // three houses, starting from a different one each day
  const ids = Object.keys(NEIGHBOURS).filter((id) => id !== "ganpat" && id !== "sitabai") as NeighbourId[];
  const start = Math.floor(r(2) * ids.length);
  return { kind, from: [0, 1, 2].map((i) => ids[(start + i * 2) % ids.length]), forWhat: pick(COLLECTIONS, r(3)) };
}

/** A quarrel's three ways out, and what each does to the two and to your standing. */
export const verdicts = (d: Extract<Duty, { kind: "quarrel" }>) => [
  { id: "a", label: `${NEIGHBOURS[d.a].name} is right`, bonds: { [d.a]: 8, [d.b]: -6 }, rep: 0 },
  { id: "b", label: `${NEIGHBOURS[d.b].name} is right`, bonds: { [d.b]: 8, [d.a]: -6 }, rep: 0 },
  { id: "both", label: "Each gives a little", bonds: { [d.a]: 3, [d.b]: 3 }, rep: 2 },
];
