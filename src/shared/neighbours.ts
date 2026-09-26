import { type CropId, isCrop } from "./crops.js";
import { FISH, type FishId, isFish } from "./fish.js";
import type { GiverId } from "./jobs.js";

/*
 * Neighbours who remember you. Each neighbour keeps a friendship of 0–100 points, shown as up to
 * five hearts (one per 20). You earn it by helping with their kaam, greeting them once a day, and a
 * gift a day they like; Ganpat and Sitabai also warm to a steady customer. Hearts pay back: kaam
 * pays more, Ganpat pays a little more and Sitabai charges a little less, and at five hearts each
 * neighbour gives you something of their own, once.
 */
export type NeighbourId = GiverId | "ganpat" | "sitabai" | "dagdu";
export type Gift = { items?: Record<string, number>; money?: number; rep?: number; text: string };

export const NEIGHBOURS: Record<NeighbourId, { name: string; local: string; likes: string[]; loves: string; gift: Gift }> = {
  kashibai: { name: "Kashibai", local: "काशीबाई", likes: ["jowar", "onion"], loves: "fish:chilapi", gift: { items: { "seed:jowar": 20 }, text: "20 of her own jowar seed, saved from the best heads" } },
  bhimrao: { name: "Bhimrao kaka", local: "भीमराव काका", likes: ["jowar", "sugarcane"], loves: "fish:rohu", gift: { items: { fodder: 10 }, text: "10 bundles of kadba for Sarja & Raja" } },
  tulsa: { name: "Tulsa aaji", local: "तुळसा आजी", likes: ["onion", "jowar"], loves: "sugarcane", gift: { items: { "seed:onion": 20 }, text: "20 of her prize onion seed, wrapped in an old sari" } },
  guruji: { name: "Pawar guruji", local: "पवार गुरुजी", likes: ["onion", "sugarcane"], loves: "fish:katla", gift: { rep: 10, text: "he tells the whole tanda how you helped the school · ★ +10" } },
  lakshmi: { name: "Lakshmi", local: "लक्ष्मी", likes: ["jowar", "sugarcane"], loves: "onion", gift: { items: { "seed:sugarcane": 8 }, text: "8 sugarcane setts from her father's field" } },
  savitri: { name: "Savitribai", local: "सावित्रीबाई", likes: ["onion", "fish:chilapi"], loves: "jowar", gift: { money: 500, text: "₹500 she put by for you, \"for your fields\"" } },
  ganpat: { name: "Ganpat Seth", local: "गणपत शेठ", likes: ["onion", "jowar"], loves: "sugarcane", gift: { money: 1000, text: "₹1,000 — an advance on your next harvest, no interest" } },
  sitabai: { name: "Sitabai", local: "सीताबाई", likes: ["onion", "jowar"], loves: "fish:rohu", gift: { items: { "seed:onion": 10, "seed:jowar": 10 }, text: "10 onion and 10 jowar seed, on the house" } },
  dagdu: { name: "Dagdu mama", local: "दगडू मामा", likes: ["jowar", "onion"], loves: "sugarcane", gift: { money: 750, rep: 5, text: "₹750 from his old tin, and the story of the maral · ★ +5" } },
};
export const NEIGHBOUR_IDS = Object.keys(NEIGHBOURS) as NeighbourId[];
export const isNeighbour = (x: unknown): x is NeighbourId => typeof x === "string" && x in NEIGHBOURS;

export const HEART = 20; // points per heart
export const MAX_BOND = 100;
export const GREET = 2; // a Ram Ram a day
export const KAAM_BOND = 8; // helping with their kaam (the one who receives a tiffin gets half)
export const GIFT_BOND = { loves: 12, likes: 6, other: 3 };
export const TRADE_CAP = 6; // Ganpat and Sitabai: at most this much a day from trade
/** What a gift is: 5 of a crop, or 1 fish. */
export const giftSize = (item: string) => (isCrop(item) ? 5 : 1);
export const isGiftable = (item: string) => isCrop(item) || (item.startsWith("fish:") && isFish(item.slice(5)));
export const giftName = (item: string) => (isCrop(item) ? `5 ${item}` : `a ${FISH[item.slice(5) as FishId].name.toLowerCase()}`);

export type Bond = { pts: number; greeted?: number; gifted?: number; trade?: { day: number; n: number }; gave?: boolean };
type HasBonds = { bonds?: Partial<Record<NeighbourId, Bond>> };

export const bondOf = (s: HasBonds, id: NeighbourId): Bond => s.bonds?.[id] ?? { pts: 0 };
export const hearts = (s: HasBonds, id: NeighbourId) => Math.min(5, Math.floor(bondOf(s, id).pts / HEART));
export const heartsText = (n: number) => "❤".repeat(n) + "♡".repeat(5 - n);
/** How a neighbour takes a gift of `item`. */
export const giftTaste = (id: NeighbourId, item: string): keyof typeof GIFT_BOND => (NEIGHBOURS[id].loves === item ? "loves" : NEIGHBOURS[id].likes.includes(item) ? "likes" : "other");

/** Kaam pays 5% more per heart with the one who asked. */
export const kaamPay = (s: HasBonds, who: GiverId, pay: number) => Math.round(pay * (1 + 0.05 * hearts(s, who)));
/** Ganpat pays 1% more per heart (on top of your standing with the tanda). */
export const ganpatBonus = (s: HasBonds) => 1 + 0.01 * hearts(s, "ganpat");
/** Sitabai takes 1% off seeds per heart. */
export const sitabaiOff = (s: HasBonds) => 0.01 * hearts(s, "sitabai");

/** A crop the neighbour would love, for the dialogue ("Tulsa aaji loves sugarcane"). */
export const lovesName = (id: NeighbourId) => {
  const l = NEIGHBOURS[id].loves;
  return l.startsWith("fish:") ? FISH[l.slice(5) as FishId].name.toLowerCase() : (l as CropId);
};
