import { begin } from "../src/shared/missions";
import { authed, devClockAllowed, json, loadSave, readJson, serverNow, unauthorized, writeSave } from "./_lib/game";

/** POST /api/dev { skipMs?, money? } — dev only: fast-forward this save's clock, or grant money for tests. 404 in production. */
export async function POST(req: Request): Promise<Response> {
  if (!devClockAllowed()) return json({ error: "not found" }, 404);
  const id = await authed(req);
  if (!id) return unauthorized();
  const body = await readJson(req, 500);
  const skip = Number(body?.skipMs ?? 0);
  const jump = body?.mission === undefined ? null : Number(body.mission);
  const rep = body?.rep === undefined ? null : Number(body.rep);
  const money = Number(body?.money ?? 0);
  if (!Number.isFinite(skip) || skip < 0 || skip > 30 * 24 * 3600e3 || !Number.isInteger(money) || money < 0 || money > 1e7) return json({ error: "bad request" }, 400);
  const save = await loadSave(id);
  if (!save) return unauthorized();
  save.devSkew = (save.devSkew ?? 0) + skip;
  save.money += money;
  if (jump !== null && Number.isInteger(jump) && jump >= 0) begin(save, jump, serverNow(save));
  if (rep !== null && Number.isFinite(rep)) save.rep = rep;
  await writeSave(save);
  return json({ save, serverNow: serverNow(save) });
}
