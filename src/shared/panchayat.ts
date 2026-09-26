import type { NeighbourId } from "./neighbours.js";
import { hash2 } from "./rng.js";

/*
 * The gram panchayat office, north of Rathod Bhuvan. Once you are Sarpanch, the tanda brings its
 * troubles to your desk: three requests a day (everyone's desk shows the same three, like the kaam),
 * each settled once with a choice. Choices spend or raise the panchayat fund (₹20,000 a year from
 * the zilla parishad), sometimes your own money, and move the tanda's regard for you (★) and your
 * neighbours' hearts.
 */
export type Effect = { fund?: number; money?: number; rep?: number; bonds?: Partial<Record<NeighbourId, number>> };
export type Choice = { id: string; label: string; effect: Effect; said: string };
export type Request = { slot: number; key: string; who: string; title: string; ask: string; choices: Choice[] };

export const GRANT = 20_000; // the yearly grant, and the fund a new Sarpanch starts with
export const REQUESTS_A_DAY = 3;
export const PANCHAYAT_SEED = 0x70616e63; // "panc"

type Template = Omit<Request, "slot">;
const POOL: Template[] = [
  {
    key: "drain", who: "Tulsa aaji", title: "The lane floods",
    ask: "Sarpanch, every monsoon the water stands knee-deep in my lane. These old legs can't wade through it any more. A small drain, that's all I ask.",
    choices: [
      { id: "build", label: "Build a stone drain", effect: { fund: -4000, rep: 3, bonds: { tulsa: 10 } }, said: "Masons are digging Tulsa aaji's drain · she blesses you from her doorstep" },
      { id: "later", label: "After the next grant", effect: { bonds: { tulsa: -4 } }, said: "Tulsa aaji sighs. \"Next year, then.\"" },
    ],
  },
  {
    key: "pension", who: "Bhimrao kaka", title: "A pension that hasn't come",
    ask: "Three months now and my old-age pension hasn't come. The clerk at the tehsil says 'next week' every week. You're the Sarpanch — they'll listen to you.",
    choices: [
      { id: "go", label: "Go to the tehsil yourself", effect: { money: -300, rep: 4, bonds: { bhimrao: 15 } }, said: "A day in Jalna and ₹300 in bus fare and chai — but Bhimrao kaka's pension is sorted" },
      { id: "letter", label: "Write the tehsildar a letter", effect: { rep: 2, bonds: { bhimrao: 6 } }, said: "The letter goes off with the panchayat stamp · Bhimrao kaka waits, hopeful" },
      { id: "no", label: "Not the panchayat's job", effect: { rep: -2, bonds: { bhimrao: -8 } }, said: "Bhimrao kaka walks off without a word" },
    ],
  },
  {
    key: "mango", who: "Kashibai and Savitribai", title: "Whose mango tree?",
    ask: "Kashibai says the old mango by the well is hers — her father planted it. Savitribai says it grows on her family's side of the line. They haven't spoken in a week.",
    choices: [
      { id: "kashi", label: "It's Kashibai's", effect: { bonds: { kashibai: 10, savitri: -8 } }, said: "Kashibai beams · Savitribai shuts her door on you" },
      { id: "savi", label: "It's Savitribai's", effect: { bonds: { savitri: 10, kashibai: -8 } }, said: "Savitribai beams · Kashibai won't look at you" },
      { id: "share", label: "Share the fruit, half each", effect: { rep: 3, bonds: { kashibai: 3, savitri: 3 } }, said: "Grumbling, they agree — and by evening they're sharing chai" },
    ],
  },
  {
    key: "roof", who: "Pawar guruji", title: "The school roof leaks",
    ask: "When it rains, the children move their slates to the one dry corner of the classroom. The zilla parishad has had my letter for a year.",
    choices: [
      { id: "fix", label: "Repair it from the fund", effect: { fund: -6000, rep: 4, bonds: { guruji: 12 } }, said: "New tiles on the Z.P. school · the children cheer when they see you" },
      { id: "zp", label: "Press the zilla parishad again", effect: { rep: 1, bonds: { guruji: 2 } }, said: "Another letter, with your signature this time" },
    ],
  },
  {
    key: "dogs", who: "Lakshmi", title: "Stray dogs",
    ask: "A pack of strays has been chasing the goats by the maidan. They nearly got Chinki yesterday!",
    choices: [
      { id: "catcher", label: "Call the dog catcher from Jalna", effect: { fund: -1500, bonds: { lakshmi: 8 } }, said: "The dog van comes from Jalna · Lakshmi hugs Chinki" },
      { id: "boys", label: "Ask the kabaddi boys to keep watch", effect: { bonds: { lakshmi: 3 } }, said: "The boys promise to chase the dogs off" },
    ],
  },
  {
    key: "stall", who: "Ganpat Seth", title: "A bigger stall",
    ask: "Business is good, Sarpanch. I'd like to put my scale and sacks out into the chowk — just a little. I'll pay the panchayat a fee, of course.",
    choices: [
      { id: "allow", label: "Allow it, for a ₹1,500 fee", effect: { fund: 1500, rep: -2, bonds: { ganpat: 10 } }, said: "Ganpat's sacks spread into the chowk · some grumble about the space" },
      { id: "refuse", label: "The chowk belongs to everyone", effect: { rep: 3, bonds: { ganpat: -5 } }, said: "Ganpat grumbles, but the tanda likes it" },
    ],
  },
  {
    key: "licence", who: "Sitabai", title: "A fertiliser licence",
    ask: "I want to sell fertiliser too, so farmers needn't go to Jalna for it. The agriculture office needs a letter from the panchayat.",
    choices: [
      { id: "sign", label: "Sign the letter (₹500 fee)", effect: { fund: 500, rep: 1, bonds: { sitabai: 8 } }, said: "Sitabai frames the letter above her counter" },
      { id: "no", label: "Not yet", effect: { bonds: { sitabai: -5 } }, said: "Sitabai purses her lips" },
    ],
  },
  {
    key: "tax", who: "the gram sevak", title: "House tax is due",
    ask: "Sarpanch saheb, the house tax for the year is due. Most families can pay; a few are struggling after the dry spell.",
    choices: [
      { id: "all", label: "Collect from every house", effect: { fund: 3500, rep: -3 }, said: "₹3,500 into the panchayat fund · a few doors close a little harder" },
      { id: "waive", label: "Waive it for the poorest", effect: { fund: 2000, rep: 4 }, said: "₹2,000 collected · the poorest families won't forget it" },
    ],
  },
  {
    key: "light", who: "Kashibai", title: "Dark at the well",
    ask: "The bulb by the well has been dead for a month. The women draw water before dawn, and it's pitch dark.",
    choices: [
      { id: "fix", label: "Fix the light", effect: { fund: -800, rep: 2, bonds: { kashibai: 6 } }, said: "The well is lit again before dawn" },
      { id: "later", label: "When the electrician comes", effect: { bonds: { kashibai: -3 } }, said: "Kashibai shakes her head" },
    ],
  },
  {
    key: "nets", who: "Dagdu mama", title: "Nets in the talav",
    ask: "Boys from Pimpalwadi are dragging nets through our talav at night. In two seasons there won't be a fish left. Ban them, Sarpanch.",
    choices: [
      { id: "ban", label: "Ban nets in the talav", effect: { rep: 2, bonds: { dagdu: 12 } }, said: "A notice goes up at the talav · Dagdu mama nods, satisfied" },
      { id: "fee", label: "Allow them, for a fee", effect: { fund: 1000, bonds: { dagdu: -8 } }, said: "₹1,000 in fees · Dagdu mama won't speak to you" },
    ],
  },
  {
    key: "sahukar", who: "Sahukar Motilal", title: "A word in private",
    ask: "Sarpanch… the Jadhav family owes me, and they won't pay. A letter from the panchayat, saying the field is mine, would settle it. I'd be grateful — ₹2,000 grateful.",
    choices: [
      { id: "refuse", label: "Show him the door", effect: { rep: 6 }, said: "Motilal leaves red-faced · the story is round the tanda by evening" },
      { id: "take", label: "Take the ₹2,000", effect: { money: 2000, rep: -12 }, said: "₹2,000 in your pocket · the Jadhavs lose their field, and people whisper" },
    ],
  },
  {
    key: "nala", who: "Devidas Chavan", title: "Work for the young men",
    ask: "Half the young men will leave for the cane fields in the south next month — there's no work here. If the panchayat started work on the nala, under the rozgar scheme, they'd stay.",
    choices: [
      { id: "start", label: "Start rozgar work on the nala", effect: { fund: -5000, rep: 6 }, said: "Forty men are digging out the nala · the tanda stays together this year" },
      { id: "no", label: "The fund can't stretch that far", effect: { rep: -2 }, said: "The trucks for the cane fields leave at dawn" },
    ],
  },
  {
    key: "mandir", who: "the mandir committee", title: "Paint for the mandir",
    ask: "Sevalal Jayanti is coming, and the mandir's walls are flaking. Could the panchayat pay for paint and a painter?",
    choices: [
      { id: "paint", label: "Pay for it", effect: { fund: -2000, rep: 4 }, said: "The mandir shines saffron and white" },
      { id: "collect", label: "Collect from the tanda instead", effect: { rep: 1 }, said: "Every house gives a little · it takes longer, but it's done" },
    ],
  },
  {
    key: "tanker", who: "the women's group", title: "A water tanker",
    ask: "The well's low and the tanki is dry. Until the rains, could the panchayat bring a tanker twice a week?",
    choices: [
      { id: "tanker", label: "Hire the tanker", effect: { fund: -3000, rep: 5, bonds: { kashibai: 5, tulsa: 5 } }, said: "The tanker comes rumbling up the lane · matkas fill all along it" },
      { id: "vihir", label: "Send them to the vihir", effect: { rep: -3 }, said: "A long walk to the vihir with heavy matkas" },
    ],
  },
];

/** The requests on the desk on a game day. */
export function requestsFor(day: number): Request[] {
  const picked: Request[] = [];
  const taken = new Set<number>();
  for (let k = 0; picked.length < REQUESTS_A_DAY && k < 40; k++) {
    const i = Math.floor(hash2(day, k, PANCHAYAT_SEED) * POOL.length);
    if (taken.has(i)) continue;
    taken.add(i);
    picked.push({ ...POOL[i], slot: picked.length });
  }
  return picked;
}

export type PanchayatState = { fund: number; year: number; day: number; done: number[] };

/** "₹4,000 from the fund · ★ +3 · Tulsa aaji ❤ +10" — what a choice will do. */
export function effectText(e: Effect, names: (id: NeighbourId) => string) {
  const rs = (n: number) => `₹${Math.abs(n).toLocaleString("en-IN")}`;
  const parts: string[] = [];
  if (e.fund) parts.push(e.fund < 0 ? `${rs(e.fund)} from the fund` : `+${rs(e.fund)} to the fund`);
  if (e.money) parts.push(e.money < 0 ? `${rs(e.money)} of your own` : `+${rs(e.money)} for you`);
  if (e.rep) parts.push(`★ ${e.rep > 0 ? "+" : "−"}${Math.abs(e.rep)}`);
  for (const [id, n] of Object.entries(e.bonds ?? {})) parts.push(`${names(id as NeighbourId)} ${n! > 0 ? "❤ +" : "💔 −"}${Math.abs(n!)}`);
  return parts.join(" · ") || "nothing changes";
}

/** The desk as it stands on `day`: a new Sarpanch starts with the grant, each new year adds one, and each day's requests start fresh. */
export function deskOn(p: PanchayatState | undefined, day: number, yearOf: (day: number) => number, grant = GRANT): PanchayatState {
  const year = yearOf(day);
  const s = p ? { ...p, done: [...p.done] } : { fund: grant, year, day, done: [] };
  if (s.year !== year) Object.assign(s, { fund: s.fund + grant * Math.max(0, year - s.year), year });
  if (s.day !== day) Object.assign(s, { day, done: [] });
  return s;
}
