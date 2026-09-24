import { netWorth, TITLES, titleFor } from "../src/shared/bank";
import { type Action, apply } from "../src/shared/rules";
import { clock } from "../src/shared/time";
import { authed, json, loadSave, readJson, serverNow, unauthorized, world, writeSave } from "./_lib/game";

export const MAX_BATCH = 256;
const MAX_EDITS = 60_000;

/**
 * POST /api/act { actions: Action[] } → { results, save, serverNow }
 * Every action is re-validated with the shared rules against the stored save and the SERVER clock.
 * Rejected actions change nothing; the client replaces its optimistic state with the returned save.
 */
export async function POST(req: Request): Promise<Response> {
  const id = await authed(req);
  if (!id) return unauthorized();
  const body = await readJson(req);
  const actions = body?.actions;
  if (!Array.isArray(actions) || actions.length > MAX_BATCH) return json({ error: "bad request" }, 400);
  const save = await loadSave(id);
  if (!save) return unauthorized();
  const w = world();
  const results = actions.map((a: Action) => {
    if (Object.keys(save.edits).length >= MAX_EDITS && (a?.t === "dig" || a?.t === "place")) return { ok: false, error: "Your land can't take more changes." };
    const r = apply(w, save, a, serverNow(save));
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  });
  if (results.some((r) => r.ok)) {
    // titles are earned on the server too, so the ceremony can't be faked
    const now = serverNow(save);
    const t = TITLES.findIndex((x) => x.name === titleFor(netWorth(w, save, now, clock(now).day).total).name);
    if (t > save.bestTitle) save.bestTitle = t;
    await writeSave(save);
  }
  return json({ results, save, serverNow: serverNow(save) });
}
