import { authed, json, loadSave, type Player, serverNow, unauthorized } from "./lib/game";
import { store } from "./lib/store";

/** GET /api/state → { save, recoveryCode, serverNow } for the signed-in farmer. */
export async function GET(req: Request): Promise<Response> {
  const id = await authed(req);
  if (!id) return unauthorized();
  const save = await loadSave(id);
  const player = await store().get<Player>(`player:${id}`);
  if (!save || !player) return unauthorized();
  return json({ save, recoveryCode: player.recoveryCode, serverNow: serverNow(save) });
}
