import { CROP_IDS } from "../shared/crops";
import { FISH_IDS } from "../shared/fish";
import { festivalOn, FESTIVALS } from "../shared/festivals";
import { bondOf, giftName, giftSize, giftTaste, hearts, heartsText, lovesName, NEIGHBOUR_IDS, type NeighbourId, NEIGHBOURS } from "../shared/neighbours";
import { COLLECT_EACH, dutyFor } from "../shared/roles";
import type { Action, Result } from "../shared/rules";
import type { Save } from "../shared/save";
import { clock } from "../shared/time";

/*
 * Talking to a neighbour: the day's Ram Ram (it counts once a day, twice on a festival), what they
 * say — warmer the better they know you — and a gift from what you carry. Also the list of
 * neighbours and their hearts for the kaam card.
 */
type Button = { label: string; sub?: string; onClick: () => void };
export type TalkDeps = {
  save: () => Save;
  now: () => number;
  act: (a: Action) => Result;
  toast: (m: string, k?: "ok" | "bad") => void;
  sound: (name: string) => void;
  dialogue: (who: string, title: string, text: string, buttons: Button[]) => void;
  closeDialogue: () => void;
};

/** What each says: as a stranger (0–1 ❤), a friend (2–3 ❤), and family (4–5 ❤). */
const LINES: Record<NeighbourId, [string, string, string]> = {
  kashibai: ["Ram Ram. You're the Rathod boy back from the city? The well's this way, if you need it.", "Ram Ram, bala! Come, the water's sweet today. How are your onions?", "My boy! Sit, sit — I kept a cup of chai for you. The whole lane says you've done Dada proud."],
  bhimrao: ["Ram Ram. Dhavlu said you'd come back. We'll see if the city left any farmer in you.", "Ah, it's you! Sit under the banyan a while. My son says you're a good sort.", "Beta! Come, the banyan's shade is always yours. Your Dada and I herded cattle on this tekdi, you know."],
  tulsa: ["Ram Ram, bala. These old eyes don't know you yet… Rathod? Ah, Sonu's grandson.", "Come here, let me see you. Eating properly? You look thin.", "My own grandson couldn't do more for me. Here, take a laddoo — don't tell the others."],
  guruji: ["Ram Ram. Pawar, the teacher here. The boys talk about the new farmer.", "Ah, our kabaddi champion! The children ask when you'll come and play again.", "You know, I tell the children about you — the one who came back to the land. You're a lesson, bhau."],
  lakshmi: ["Ram Ram… Chinki, come here! Sorry — she runs off whenever she sees someone new.", "Ram Ram, dada! Chinki knows your step now — look, she's wagging.", "Dada! I told Baba you're the best farmer in the tanda. He laughed, but he agreed!"],
  savitri: ["Ram Ram. We're neighbours now, it seems — Rathod Bhuvan and our house share the wall.", "Ram Ram! I made extra bhakri this morning, come and have some.", "You're like my own son now. Whatever you need — thread, salt, advice — just call over the wall."],
  ganpat: ["Ram Ram. Onions, jowar, cane — I buy them all. Prices on the board.", "Ah, my regular! Sit, have a cutting chai while I weigh.", "For you, bhau, the best scale in Ukhali. And if you ever need an advance, you only have to ask."],
  sitabai: ["Ram Ram. Seeds, fodder, tools — whatever a farmer needs.", "Good morning! The new onion seed came in — I kept some aside for you.", "My best customer! Take a handful extra, it's nothing. Your fields make my seeds look good."],
  dagdu: ["Hm. Ram Ram. The fish don't like noise, boy.", "Ah, it's you. Sit — the float will tell us when it's time.", "Beta, sit by me. One day I'll show you where the maral lives. Not today. One day."],
};

const tier = (h: number) => (h >= 4 ? 2 : h >= 2 ? 1 : 0);

/** The day's Ram Ram: counts once a day. Says what changed (a new heart, Holi's gher), if anything. */
export function greet(d: TalkDeps, id: NeighbourId) {
  const r = d.act({ t: "greet", who: id });
  if (r.ok && r.msg) {
    d.toast(r.msg);
    if (/₹/.test(r.msg)) d.sound("cash");
  }
  karbhariErrand(d, id);
}

/** As Karbhari: talking to the one the Naik's word is for delivers it; on a collection round, they give. */
function karbhariErrand(d: TalkDeps, id: NeighbourId) {
  const s = d.save(), day = clock(d.now()).day, st = s.duty;
  if (s.roles?.karbhari === undefined || st?.day !== day || st.done) return;
  const duty = dutyFor(day);
  const step = duty.kind === "message" && st.step === "carrying" && duty.to === id ? "deliver" : duty.kind === "collect" && st.step === "collecting" && duty.from.includes(id) && !st.got.includes(id) ? "visit" : null;
  if (!step) return;
  const r = d.act({ t: "duty", step, who: id });
  if (!r.ok) return;
  d.toast(r.msg ?? "");
  d.sound("cash");
}

/** The Karbhari's duty for the kaam card, or "". */
export function dutyHtml(s: Save, day: number) {
  if (s.roles?.karbhari === undefined) return "";
  const st = s.duty?.day === day ? s.duty : undefined, d = dutyFor(day);
  const line = st?.done
    ? "✓ done for today"
    : d.kind === "quarrel"
      ? `settle ${d.about} at the kacheri`
      : d.kind === "message"
        ? st?.step === "carrying" ? `take the Naik's word to ${NEIGHBOURS[d.to].name}` : "the Naik has a message to carry"
        : st?.step === "collecting" ? `collect ₹${COLLECT_EACH} each: ${d.from.map((id) => `${st.got.includes(id) ? "✓" : ""}${NEIGHBOURS[id].name}`).join(", ")}${st.got.length === d.from.length ? " — back to the Naik" : ""}` : `a collection for ${d.forWhat}`;
  return `<div class="kaam-friends"><b>🪪 Karbhari · the Naik's duty</b><span>${line}</span></div>`;
}

/** A heading for their dialogue: the name and the hearts. */
export const whoLine = (s: Save, id: NeighbourId) => `${NEIGHBOURS[id].name} · ${NEIGHBOURS[id].local} <span class="hearts" title="How well ${NEIGHBOURS[id].name} knows you">${heartsText(hearts(s, id))}</span>`;

/** Gift buttons: 5 of a crop or a fish you carry — once a day. */
export function giftButtons(d: TalkDeps, id: NeighbourId, back?: () => void): Button[] {
  const s = d.save(), day = clock(d.now()).day;
  if (bondOf(s, id).gifted === day) return [];
  const items = [...CROP_IDS.filter((c) => (s.inv[c] ?? 0) >= giftSize(c)), ...FISH_IDS.map((f) => `fish:${f}`).filter((f) => (s.inv[f] ?? 0) >= 1)];
  if (!items.length) return [];
  const known = hearts(s, id) >= 2; // a friend lets on what they like
  return [
    {
      label: "Give a gift",
      sub: known ? `${NEIGHBOURS[id].name} loves ${lovesName(id)}` : "5 of a crop, or a fish",
      onClick: () =>
        d.dialogue(
          whoLine(s, id),
          "A gift",
          festivalOn(day) ? `On ${FESTIVALS[festivalOn(day)!].name} a gift means twice as much.` : "What will you give?",
          [
            ...items.map((item) => {
              const taste = known ? giftTaste(id, item) : "other";
              return {
                label: `Give ${giftName(item)}`,
                sub: taste === "loves" ? "a favourite!" : taste === "likes" ? "they like this" : `you have ${s.inv[item]}`,
                onClick: () => {
                  d.closeDialogue();
                  const r = d.act({ t: "gift", who: id, item });
                  d.toast(r.ok ? (r.msg ?? "") : r.error, r.ok ? "ok" : "bad");
                },
              };
            }),
            { label: "Back", onClick: back ?? d.closeDialogue },
          ],
        ),
    },
  ];
}

/** Talk with a neighbour who has nothing to ask of you today. */
export function chat(d: TalkDeps, id: NeighbourId, extra = "") {
  greet(d, id);
  const s = d.save();
  const f = festivalOn(clock(d.now()).day);
  const hi = f ? `${FESTIVALS[f].icon} ${FESTIVALS[f].name} chya shubhechha! ` : "";
  d.dialogue(whoLine(s, id), "Ram Ram", `${hi}${LINES[id][tier(hearts(s, id))]}${extra ? ` ${extra}` : ""}`, [...giftButtons(d, id, () => chat(d, id, extra)), { label: "Ram Ram", onClick: d.closeDialogue }]);
}

/** The neighbours you've met and their hearts, for the kaam card. */
export function neighboursHtml(s: Save) {
  const met = NEIGHBOUR_IDS.filter((id) => bondOf(s, id).pts > 0);
  if (!met.length) return "";
  return `<div class="kaam-friends"><b>Neighbours</b>${met.map((id) => `<span>${NEIGHBOURS[id].name} <i class="hearts">${heartsText(hearts(s, id))}</i></span>`).join("")}</div>`;
}

