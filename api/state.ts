import { authed, json, loadSave, type Player, serverNow, unauthorized } from "./_lib/game.js";
import { store } from "./_lib/store.js";
import type { Account } from "./_lib/auth.js";

/** GET /api/state → { save, recoveryCode, serverNow, account } for the signed-in farmer (account: who it's saved to, if anyone). */
export async function GET(req: Request): Promise<Response> {
  const id = await authed(req);
  if (!id) return unauthorized();
  const save = await loadSave(id);
  const player = await store().get<Player>(`player:${id}`);
  if (!save || !player) return unauthorized();
  const acct = await store().get<Account>(`acct:${id}`);
  return json({ save, recoveryCode: player.recoveryCode, serverNow: serverNow(save), account: acct ? { email: acct.email, provider: acct.provider } : null });
}
