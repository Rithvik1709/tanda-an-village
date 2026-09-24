import { authed, displayName, json, loadSave, publish, serverNow } from "./_lib/game.js";
import { store } from "./_lib/store.js";
import { netWorth } from "../src/shared/bank.js";
import { clock } from "../src/shared/time.js";
import { world } from "./_lib/game.js";

/**
 * GET /api/leaderboard → { top: [...20], me?: { rank, total, entry } }
 * Public top list (names, titles, wealth and what it's made of); your own rank if you send your token.
 * Each farmer's wealth is worked out fresh from their save, so the board is never stale.
 */
type Parts = { cash: number; land: number; goods: number; debt: number };
export async function GET(req: Request): Promise<Response> {
  const s = store();
  const board = await s.boardTop(20);
  const live = await Promise.all(
    board.map(async (e) => {
      const save = await loadSave(e.id).catch(() => null);
      if (!save) return { ...e, parts: null as Parts | null };
      if ((save as { devTouched?: boolean }).devTouched) return null; // a test farm
      const now = serverNow(save);
      const w = netWorth(world(), save, now, clock(now).day);
      return { ...e, worth: w.total, parts: { cash: w.money, land: w.land, goods: w.goods + w.livestock, debt: w.debt } as Parts | null };
    }),
  );
  const list = live.filter((e): e is NonNullable<typeof e> => e !== null).sort((a, b) => b.worth - a.worth || a.updatedAt - b.updatedAt);
  // equal net worth shares a rank (1, 2, 2, 4…), matching "how many are worth more than you"
  const top = list.map((e, i) => ({ rank: list.findIndex((x) => x.worth === e.worth) + 1 || i + 1, name: e.name, worth: e.worth, parts: e.parts, title: e.title, missions: e.missions, sarpanch: e.sarpanch, you: false, id: e.id }));
  let me: { rank: number; total: number; name: string; worth: number; parts: Parts; title: string; missions: number } | undefined;
  const id = await authed(req);
  if (id) {
    const save = await loadSave(id);
    if (save) {
      await publish(save).catch(() => {}); // make sure you're on it, even before your first move today
      const now = serverNow(save);
      const w = netWorth(world(), save, now, clock(now).day);
      const worth = w.total;
      const { above, total } = await s.boardRank(worth);
      me = { rank: above + 1, total, name: displayName(save), worth, parts: { cash: w.money, land: w.land, goods: w.goods + w.livestock, debt: w.debt }, title: "", missions: save.missions?.i ?? 0 };
      for (const t of top) t.you = t.id === id;
    }
  }
  return json({ top: top.map(({ id: _id, ...t }) => t), me });
}
