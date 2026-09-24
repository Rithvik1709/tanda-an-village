import { netWorth, TITLES, titleFor } from "../src/shared/bank.js";
import { type Action, apply } from "../src/shared/rules.js";
import { clock } from "../src/shared/time.js";
import { authed, json, readJson, serverNow, unauthorized, updateSave, world } from "./_lib/game.js";

export const MAX_BATCH = 256;

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
  const w = world();
  const done = await updateSave(id, (save) => {
    const results = actions.map((a: Action) => {
      const r = apply(w, save, a, serverNow(save));
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    });
    // titles are earned on the server too, so the ceremony can't be faked
    const now = serverNow(save);
    const t = TITLES.findIndex((x) => x.name === titleFor(netWorth(w, save, now, clock(now).day).total).name);
    if (t > save.bestTitle) save.bestTitle = t;
    return results;
  });
  if (!done) return unauthorized();
  const { save, result: results } = done;
  return json({ results, save, serverNow: serverNow(save) });
}
