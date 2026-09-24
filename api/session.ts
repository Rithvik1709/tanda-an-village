import { newSave } from "../src/shared/save";
import { issueToken, json, normalizeCode, type Player, randomHex, readJson, recoveryCode, world, writeSave } from "./lib/game";
import { store } from "./lib/store";

/**
 * POST /api/session
 *   {}                          → a new guest farmer: { token, id, recoveryCode }
 *   { recoveryCode: "ABCD-…" }  → continue that farm on this device: { token, id, recoveryCode }
 */
export async function POST(req: Request): Promise<Response> {
  const body = await readJson(req, 2000);
  if (!body) return json({ error: "bad request" }, 400);
  const s = store();

  if (body.recoveryCode !== undefined) {
    const code = normalizeCode(body.recoveryCode);
    const id = code ? await s.get<string>(`recovery:${code}`) : null;
    if (!id) return json({ error: "That code doesn't match any farm." }, 404);
    return json({ token: await issueToken(id), id, recoveryCode: code });
  }

  const id = randomHex(8);
  let code = recoveryCode();
  while (await s.get(`recovery:${code}`)) code = recoveryCode();
  const now = Date.now();
  const player: Player = { id, recoveryCode: code, createdAt: now };
  await s.set(`player:${id}`, player);
  await s.set(`recovery:${code}`, id);
  await writeSave(newSave(id, world(), now));
  return json({ token: await issueToken(id), id, recoveryCode: code }, 201);
}
