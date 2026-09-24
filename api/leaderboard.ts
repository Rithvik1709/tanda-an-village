import { authed, displayName, json, loadSave, publish, serverNow } from "./_lib/game";
import { store } from "./_lib/store";
import { netWorth } from "../src/shared/bank";
import { clock } from "../src/shared/time";
import { world } from "./_lib/game";

/**
 * GET /api/leaderboard → { top: [...20], me?: { rank, total, entry } }
 * Public top list (names, titles, net worth); your own rank if you send your token.
 */
export async function GET(req: Request): Promise<Response> {
  const s = store();
  const list = await s.boardTop(20);
  // equal net worth shares a rank (1, 2, 2, 4…), matching "how many are worth more than you"
  const top = list.map((e, i) => ({ rank: list.findIndex((x) => x.worth === e.worth) + 1 || i + 1, name: e.name, worth: e.worth, title: e.title, missions: e.missions, sarpanch: e.sarpanch, you: false, id: e.id }));
  let me: { rank: number; total: number; name: string; worth: number; title: string; missions: number } | undefined;
  const id = await authed(req);
  if (id) {
    const save = await loadSave(id);
    if (save) {
      await publish(save).catch(() => {}); // make sure you're on it, even before your first move today
      const now = serverNow(save);
      const worth = netWorth(world(), save, now, clock(now).day).total;
      const { above, total } = await s.boardRank(worth);
      me = { rank: above + 1, total, name: displayName(save), worth, title: "", missions: save.missions?.i ?? 0 };
      for (const t of top) t.you = t.id === id;
    }
  }
  return json({ top: top.map(({ id: _id, ...t }) => t), me });
}
