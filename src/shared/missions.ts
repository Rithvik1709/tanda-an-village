import { bullsNow } from "./bulls.js";
import type { Save } from "./save.js";
import { clock, DAY_MS } from "./time.js";
import type { World } from "./world.js";

/*
 * The story of Ukhali Tanda, in ten missions. Progress is read from the save (state checks) and
 * from event counters the rules keep (`save.missions.c`). Counters are measured from a baseline
 * taken when each mission starts, so earlier play doesn't count. The server grants rewards only
 * when every objective really is complete.
 */
export type MissionState = {
  i: number; // current mission index (MISSIONS.length when the story is done)
  startedAt: number;
  base: Record<string, number>; // counters when this mission began
  prevBase?: Record<string, number>; // counters when the PREVIOUS mission began — work done then counts too
  c: Record<string, number>; // lifetime event counters
  flags: Record<string, boolean>;
  choice?: string; // the choice made in the current mission, if it has one
  seen: boolean; // has the opening dialogue been shown?
};

export type Ctx = { world: World; now: number };
/** `how`: one line on how to do it, shown under the objective while it's the current one. */
export type Objective = { id: string; text: string; need: number; have: (s: Save, c: Ctx) => number; how?: string };
export type Reward = { money?: number; items?: Record<string, number>; rep?: number; perk?: string; text: string };
export type Mission = {
  id: string;
  title: string;
  local: string; // Marathi / Banjari title
  who: string; // who gives it
  story: string; // the opening dialogue
  done: string; // the closing line
  objectives: Objective[];
  reward: Reward;
  deadlineDays?: number; // if set, missing it restarts the mission
  choices?: { id: string; label: string; effect: string }[];
};

/**
 * Progress on a counter for the current mission. Anything done since the previous mission began
 * counts, so a player who got ahead (harvested onions while still on mission 1) isn't made to redo it.
 */
export const since = (s: Save, key: string) => (s.missions.c[key] ?? 0) - ((s.missions.prevBase ?? {})[key] ?? 0);
const starter = (w: World) => w.plots.find((p) => p.starter)!;
const harvested6 = (s: Save) => Math.max(since(s, "harvestN:onion"), since(s, "harvest:onion")) >= 6;
const cellsIn = (s: Save, w: World, plotId: number) => {
  const p = w.plots[plotId];
  return Object.entries(s.farm).filter(([k]) => {
    const i = Number(k), x = i % 192, z = Math.floor(i / 192) % 192;
    return x >= p.x0 && x <= p.x1 && z >= p.z0 && z <= p.z1;
  });
};
export const BANDH_PLOT = 8; // the field by the vihir

export const MISSIONS: Mission[] = [
  {
    id: "homecoming", title: "Ghar Wapsi", local: "घर वापसी · Homecoming", who: "Naik Dhavlu",
    story: "Ram Ram, beta! After all these years in the city, you're back. Your Dada's field, Aamrai, has been lying fallow. Come, see me at the kacheri by the chowk, then go and wake that black soil up.",
    done: "The whole tanda saw you ploughing today. Dada would be proud.",
    objectives: [
      { id: "talk", text: "Talk to Naik Dhavlu at his kacheri (press E near him)", need: 1, have: (s) => since(s, "talk:naik"), how: "Follow the golden marker to his door on the chowk, then press E." },
      { id: "visit", text: "Walk to your field, Aamrai", need: 1, have: (s) => since(s, "visit:aamrai"), how: "It's just north-west of the chowk. Follow the marker, or press M for the map." },
      { id: "till", text: "Plough 6 patches of Aamrai's soil", need: 6, have: (s, c) => cellsIn(s, c.world, starter(c.world).id).length, how: "Pick the hoe (2), look at the soil and right-click." },
    ],
    reward: { money: 500, items: { "seed:onion": 10 }, text: "₹500 and 10 onion seeds" },
  },
  {
    id: "firstcrop", title: "Pehli Fasal", local: "पहिली फसल · The first crop", who: "Ganpat Seth",
    story: "Onions, eh? Grow them and bring them to me. But a clever farmer checks the prices first — they change every day, and I don't always pay the best.",
    done: "Not bad for a city kid! Here — my old sickle. It'll bring in more from every plant.",
    objectives: [
      // (sowing and watering were added later: a farmer who has already harvested counts them done)
      { id: "sow", text: "Sow 6 onions in your ploughed soil", need: 6, have: (s) => (harvested6(s) ? 6 : since(s, "plant:onion")), how: "Pick the onion seeds (5), look at ploughed soil and right-click." },
      { id: "wet", text: "Water them", need: 6, have: (s) => (harvested6(s) ? 6 : since(s, "water")), how: "Pick the can (3). Fill it at the well by the chowk (right-click the water), then right-click each sown patch." },
      { id: "harvest", text: "Harvest 6 onions", need: 6, have: (s) => Math.max(since(s, "harvestN:onion"), since(s, "harvest:onion")), how: "Watered onions ripen in 15–20 minutes; dry ones take twice as long. Left-click a ripe one." }, // (older saves only counted harvests, not onions)
      { id: "prices", text: "Check today's prices at Ganpat's stall (Prices tab)", need: 1, have: (s) => since(s, "visit:prices"), how: "Ganpat's stall is on the chowk. Press E and open the Prices tab." },
      { id: "sell", text: "Sell 6 onions", need: 6, have: (s) => since(s, "sell:onion"), how: "Sell on Ganpat's Sell tab." },
    ],
    reward: { items: { sickle: 1 }, text: "Ganpat's sickle (+1 produce from every harvest)" },
  },
  {
    id: "water", title: "Vihir ka Paani", local: "विहिरीचं पाणी · Water from the vihir", who: "Sitabai",
    story: "Summer has come early. The village well is running low and there's a queue of matkas from dawn. Don't fight over it — take your can to the old vihir out in the fields, west of the village.",
    done: "Good — you didn't let the crop go thirsty. Take this brass can; it holds twice as much.",
    objectives: [
      { id: "vihir", text: "Fill your can at the vihir in the fields", need: 1, have: (s) => since(s, "refill:vihir"), how: "The vihir is west of the village, by the big banyan. Pick the can (3) and right-click the water." },
      { id: "water", text: "Water your crops 16 times", need: 16, have: (s) => since(s, "water"), how: "Right-click sown soil with the can. Dark soil is already wet." },
    ],
    reward: { items: { bigcan: 1 }, text: "A brass watering can (holds 48)" },
  },
  {
    id: "order", title: "Sitabai ki Maang", local: "सीताबाईंची मागणी · Sitabai's order", who: "Sitabai",
    story: "Teej is coming and the tanda will feast. I need 20 jowar for bhakri — can you grow it in three days? Bring it to my stall.",
    done: "Twenty, exactly as promised. From now on, my seeds cost you a fifth less.",
    objectives: [{ id: "deliver", text: "Deliver 20 jowar to Sitabai (at her stall, E)", need: 20, have: (s) => since(s, "deliver:sitabai:jowar") }],
    deadlineDays: 3,
    reward: { rep: 10, perk: "discount", text: "20% off seeds at Sitabai's · +10 reputation" },
  },
  {
    id: "bulls", title: "Sarja aur Raja", local: "सर्जा-राजा · Sarja and Raja", who: "Sitabai",
    story: "A Khillari pair from Mhaswad is for sale — Sarja and Raja, strong as the ghats. ₹2,500. If you're short, the Sahakari Bank lends cheap… the sahukar lends fast, and dear. Choose wisely.",
    done: "Look at them! A farmer with a pair of bulls is a farmer no longer alone.",
    objectives: [
      { id: "buy", text: "Buy the bull pair (Sitabai's stall)", need: 1, have: (s) => (s.bulls ? 1 : 0) },
      { id: "feed", text: "Feed them kadba (F near the bulls)", need: 1, have: (s) => since(s, "feed") },
      { id: "plough", text: "Plough with them: press P in your field (needs a plough)", need: 1, have: (s) => since(s, "plough") },
    ],
    reward: { rep: 5, money: 500, text: "₹500 · +5 reputation" },
  },
  {
    id: "teej", title: "Teej", local: "तीज · The festival of Teej", who: "the girls of the tanda",
    story: "For Teej, the unmarried girls of the tanda grow wheat sprouts in baskets and sing to Sevalal Maharaj. Bring an offering of your harvest to the mandir, and come to the gathering after dark — the whole tanda will be there.",
    done: "The songs went on till midnight. The tanda knows your name now.",
    objectives: [
      { id: "offerJ", text: "Offer 10 jowar at the Sevalal mandir (E at the mandir)", need: 10, have: (s) => since(s, "deliver:mandir:jowar") },
      { id: "offerO", text: "Offer 10 onions at the mandir", need: 10, have: (s) => since(s, "deliver:mandir:onion") },
      { id: "night", text: "Join the gathering at the mandir after dark (after 7 pm)", need: 1, have: (s) => since(s, "visit:teej") },
    ],
    reward: { rep: 20, items: { jhool: 1 }, text: "A mirror-work jhool for your bulls · +20 reputation" },
  },
  {
    id: "caravan", title: "Tandyacha Karwan", local: "तांड्याचा कारवाँ · The caravan", who: "Naik Dhavlu",
    story: "Our grandfathers crossed the Deccan with a thousand oxen carrying salt and grain. You have two. Load your cart and reach the Jalna mandi before it closes at two o'clock — word is, a glut is coming.",
    done: "The old caravan blood runs in you. Haribhau at the mandi says he'll pay you better from now on.",
    objectives: [{ id: "town", text: "Sell 50 produce at the Jalna mandi before 2 pm (load the cart with R)", need: 50, have: (s) => since(s, "town:early") }],
    reward: { perk: "townContact", rep: 10, text: "Haribhau pays you 15% more at the mandi · +10 reputation" },
  },
  {
    id: "debt", title: "Sahukarache Karz", local: "सावकाराचं कर्ज · The moneylender's debt", who: "Ramu kaka",
    story: "Ramu kaka is in tears at the chowk. He borrowed ₹1,500 from Motilal for his daughter's wedding, and now the sahukar wants his field. He's too proud to ask — but you could pay it.",
    done: "",
    objectives: [{ id: "choose", text: "Decide: pay Ramu kaka's debt, or keep your money", need: 1, have: (s) => (s.missions.choice ? 1 : 0) }],
    choices: [
      { id: "help", label: "Pay the ₹1,500", effect: "−₹1,500 · +30 reputation" },
      { id: "refuse", label: "It's not my business", effect: "−10 reputation" },
    ],
    reward: { text: "Your choice decides it" },
  },
  {
    id: "land", title: "Zameen ka Sauda", local: "जमिनीचा सौदा · The land deal", who: "Naik Dhavlu",
    story: "Bandh — the field by the vihir — is for sale. Good water, good soil. But Deshmukh saheb from Jalna has his eye on it too. Buy it within six days, or it's his.",
    done: "Two fields! You're becoming a real farmer of Ukhali.",
    objectives: [
      {
        id: "buy", text: "Buy a second field (Bandh, by the vihir — before Deshmukh saheb does)", need: 1,
        have: (s) => (s.plots.length >= 2 ? 1 : 0),
      },
    ],
    reward: { rep: 15, money: 1000, text: "₹1,000 from the Naik for the paperwork · +15 reputation" },
  },
  {
    id: "election", title: "Gram Panchayat Nivadnuk", local: "ग्रामपंचायत निवडणूक · The panchayat election", who: "Naik Dhavlu",
    story: "The panchayat election is on, and the tanda is split. Shankar Pawar has Sahukar Motilal's money behind him and promises a new road — and a note in every hand. Kamlabai Jadhav, who runs the women's self-help group, promises taps in every lane from the tanki and a proper teacher for the Z.P. school. Hear them both, come to the gram sabha at the school, and then decide. Folk say you could even stand yourself — if the tanda trusts you.",
    done: "",
    objectives: [
      { id: "kamla", text: "Hear Kamlabai Jadhav's promises (outside the Z.P. school)", need: 1, have: (s) => since(s, "talk:kamlabai") },
      { id: "shankar", text: "Hear Shankar Pawar's promises (outside the Z.P. school)", need: 1, have: (s) => since(s, "talk:shankar") },
      { id: "sabha", text: "Attend the gram sabha at the Z.P. school (E at the school, 9 am – 6 pm)", need: 1, have: (s) => since(s, "visit:gramsabha") },
      { id: "choose", text: "Decide whom you back (at the school)", need: 1, have: (s) => (s.missions.choice ? 1 : 0) },
      { id: "vote", text: "Cast your vote at the polling booth in the school (E)", need: 1, have: (s) => since(s, "visit:vote") },
    ],
    choices: [
      { id: "kamlabai", label: "Back Kamlabai", effect: "taps and a teacher · drip sets half price · +15 reputation" },
      { id: "shankar", label: "Take Shankar's envelope", effect: "+₹2,000 now · −15 reputation · the sahukar grows stronger" },
      { id: "self", label: "Stand for sarpanch yourself", effect: "needs ★ 50 reputation and ₹1,000 deposit · become Sarpanch" },
    ],
    reward: { text: "Depends on how Ukhali votes" },
  },
  {
    id: "pola", title: "Bail Pola", local: "बैल पोळा · The festival of bulls", who: "the whole tanda",
    story: "Pola! Today the bulls rest and are honoured. Feed Sarja and Raja till they're content, paint their horns with gerua, dress them — then lead them to the chowk for the procession.",
    done: "Sarja and Raja led the procession! Ukhali Tanda will talk about this for years.",
    objectives: [
      { id: "happy", text: "Make your bulls happy (mood 80+: feed them)", need: 1, have: (s, c) => (s.bulls && bullsNow(s.bulls, c.now).mood >= 80 ? 1 : 0) },
      { id: "paint", text: "Paint their horns with gerua (buy at Sitabai's, then F near the bulls)", need: 1, have: (s) => (s.missions.flags.decorated ? 1 : 0) },
      { id: "procession", text: "Lead them into the chowk for the procession", need: 1, have: (s) => since(s, "visit:pola") },
    ],
    reward: { money: 5000, rep: 25, perk: "polaChampion", text: "₹5,000 prize · the Pola champion's garland · +25 reputation" },
  },
];

export const newMissions = (now: number): MissionState => ({ i: 0, startedAt: now, base: {}, c: {}, flags: {}, seen: false });

export const current = (s: Save) => MISSIONS[s.missions.i];
export const progress = (s: Save, c: Ctx) => current(s)?.objectives.map((o) => ({ ...o, got: Math.min(o.need, o.have(s, c)) })) ?? [];
export const complete = (s: Save, c: Ctx) => !!current(s) && progress(s, c).every((o) => o.got >= o.need);
export const deadlineAt = (s: Save) => (current(s)?.deadlineDays ? s.missions.startedAt + current(s).deadlineDays! * DAY_MS : null);

/** Count an event (called by the rules). */
export const bump = (s: Save, key: string, n = 1) => (s.missions.c[key] = (s.missions.c[key] ?? 0) + n);

/** Start the next mission: fresh baseline. */
export function begin(s: Save, i: number, now: number) {
  // restarting the same mission (a missed deadline) keeps the counting window; moving on shifts it
  if (s.missions.i !== i) s.missions.prevBase = { ...s.missions.base };
  s.missions.i = i;
  s.missions.startedAt = now;
  s.missions.base = { ...s.missions.c };
  s.missions.choice = undefined;
  s.missions.seen = false;
}

export const hourOf = (now: number) => clock(now).hour;
