import { CROPS, type CropId } from "./crops.js";
import { marketPrice } from "./economy.js";
import { FISH } from "./fish.js";
import { hash2 } from "./rng.js";

/*
 * Kaam: small jobs the neighbours ask of you, three a day. Everyone in the tanda gets the same three
 * on the same day (like the mandi prices), and each can be done once. They pay a little better than
 * the trader and earn reputation, so there is always something worth doing while the crops grow.
 */
export type GiverId = "kashibai" | "bhimrao" | "tulsa" | "guruji" | "lakshmi" | "savitri";
export const GIVERS: Record<GiverId, { name: string; local: string; about: string }> = {
  kashibai: { name: "Kashibai", local: "काशीबाई", about: "at the village well" },
  bhimrao: { name: "Bhimrao kaka", local: "भीमराव काका", about: "under the banyan in the chowk" },
  tulsa: { name: "Tulsa aaji", local: "तुळसा आजी", about: "on her doorstep, south of the chowk" },
  guruji: { name: "Pawar guruji", local: "पवार गुरुजी", about: "behind the Z.P. school, by the kabaddi maidan" },
  lakshmi: { name: "Lakshmi", local: "लक्ष्मी", about: "behind the Hanuman mandir, by the maidan" },
  savitri: { name: "Savitribai", local: "सावित्रीबाई", about: "by Rathod Bhuvan's aangan" },
};

export type Job =
  | { slot: number; kind: "produce"; who: GiverId; item: CropId; n: number; pay: number; rep: number; ask: string; thanks: string }
  | { slot: number; kind: "fish"; who: GiverId; n: number; pay: number; rep: number; ask: string; thanks: string }
  | { slot: number; kind: "water"; who: GiverId; n: number; pay: number; rep: number; ask: string; thanks: string }
  | { slot: number; kind: "parcel"; who: GiverId; to: GiverId; pay: number; rep: number; ask: string; thanks: string }
  | { slot: number; kind: "goat"; who: GiverId; at: number; pay: number; rep: number; ask: string; thanks: string };

export const JOB_SEED = 0x6b61616d; // "kaam"
/** Where a lost goat can wander off to (open ground; the client nudges it onto a walkable spot). */
export const GOAT_SPOTS: [number, number, string][] = [
  [62, 98, "by the vihir, out in the west fields"],
  [134, 108, "behind the Hanuman mandir"],
  [86, 72, "up the road to the north fields"],
  [70, 126, "in the fields west of the village"],
  [118, 148, "down the lane south of the village"],
  [150, 128, "past the south end of the tekdi"],
];

const pick = <T>(xs: readonly T[], r: number) => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))];
const round5 = (n: number) => Math.round(n / 5) * 5;

const PRODUCE_ASKS: Record<CropId, [string, string]> = {
  onion: ["My daughter's in-laws are coming for dinner and there isn't an onion in the house! Could you bring me {n} onions?", "You've saved my honour tonight, beta. Take this — and come and eat with us sometime."],
  jowar: ["The flour bin is empty and the chakki comes round this afternoon. Could you spare {n} jowar for bhakri?", "Hot bhakri tonight, thanks to you. Here, for your trouble."],
  sugarcane: ["We're making gul for my grandson's naming ceremony. {n} sugarcane would do it — do you have any?", "The whole lane will smell of fresh gul! Take this, and come to the naming."],
};

/** The three jobs for a game day. */
export function jobsFor(day: number): Job[] {
  const r = (k: number) => hash2(day, k, JOB_SEED);
  const jobs: Job[] = [];
  // 1. an errand anyone can do from the first day: water for Aaji, a tiffin to carry, a lost goat
  const errand = pick(["water", "parcel", "goat"] as const, r(1));
  if (errand === "water")
    jobs.push({ slot: 0, kind: "water", who: "tulsa", n: 12, pay: 60, rep: 2, ask: "My knees won't take me to the well any more, and the matka's dry. Bring me a can of water, bala? Twelve pours will do.", thanks: "Shabbas! May your fields always be green. Here, buy yourself a cup of chai." });
  else if (errand === "parcel")
    jobs.push({ slot: 0, kind: "parcel", who: "bhimrao", to: "guruji", pay: 50, rep: 1, ask: "My son teaches at the Z.P. school and he's forgotten his tiffin again. Would you run it up to him? Pawar guruji — you'll find him at the school.", thanks: "Aai's bhakri and thecha! Tell Baba I got it. Here — take something for your walk." });
  else
    jobs.push({ slot: 0, kind: "goat", who: "lakshmi", at: Math.floor(r(2) * GOAT_SPOTS.length), pay: 80, rep: 2, ask: "Chinki, my goat, slipped her rope this morning and I can't find her anywhere! She wanders off towards the fields. Would you look for her? She'll follow you if you call her.", thanks: "Chinki! You naughty thing. Thank you, thank you — here, for finding her." });
  // 2. produce for a neighbour's kitchen
  const crop = pick(["onion", "jowar", "sugarcane"] as const, r(3));
  const n = crop === "sugarcane" ? 4 + Math.floor(r(4) * 5) : 6 + Math.floor(r(4) * 9);
  const [ask, thanks] = PRODUCE_ASKS[crop];
  jobs.push({ slot: 1, kind: "produce", who: r(5) < 0.5 ? "kashibai" : "savitri", item: crop, n, pay: round5(n * marketPrice(crop, day) * 1.5 + 20), rep: 2, ask: ask.replace("{n}", String(n)), thanks });
  // 3. fish from the talav (most days), or more produce
  if (r(6) < 0.7) {
    const f = 1 + Math.floor(r(7) * 3);
    const who = r(8) < 0.5 ? "guruji" : "savitri";
    const ask = who === "guruji" ? `The headmaster from Jalna comes to inspect the school tomorrow, and my wife wants to make him a fish curry. Could you catch ${f === 1 ? "a fish" : `${f} fish`} in the talav for us?` : `My husband's back from the sugar factory tonight and he's been dreaming of fish fry. ${f === 1 ? "One fish" : `${f} fish`} from the talav, bala?`;
    jobs.push({ slot: 2, kind: "fish", who, n: f, pay: round5(f * FISH.rohu.price * 1.4 + 20), rep: 2, ask, thanks: who === "guruji" ? "The inspector will go home happy. Thank you — and study hard! (He laughs.) Old habits." : "Fish fry tonight! You're a good one, bala. Here, take this." });
  } else {
    const c2 = pick(["onion", "jowar"] as const, r(9));
    const n2 = 8 + Math.floor(r(10) * 8);
    jobs.push({ slot: 2, kind: "produce", who: "bhimrao", item: c2, n: n2, pay: round5(n2 * marketPrice(c2, day) * 1.5 + 20), rep: 2, ask: `The dhaba on the Jalna road ran short and asked me to find them ${n2} ${CROPS[c2].name.toLowerCase()}. I'm too old to farm — would you sell me yours?`, thanks: "Good produce, fair price. Here you are." });
  }
  return jobs;
}

/** A job's short line for the job list: who wants what. */
export function jobLine(j: Job): string {
  const who = GIVERS[j.who].name;
  switch (j.kind) {
    case "produce": return `${who}: ${j.n} ${CROPS[j.item].name.toLowerCase()}`;
    case "fish": return `${who}: ${j.n === 1 ? "a fish" : `${j.n} fish`} from the talav`;
    case "water": return `${who}: a can of water (${j.n} pours)`;
    case "parcel": return `${who}: take a tiffin to ${GIVERS[j.to].name}`;
    case "goat": return `${who}: find Chinki the goat`;
  }
}
