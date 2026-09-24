import { cleanName } from "../src/shared/rules.js";
import { type Account, authConfigured, googleUrl, sendMagicLink, userFor, validEmail } from "./_lib/auth.js";
import { authed, issueToken, json, type Player, readJson, updateSave } from "./_lib/game.js";
import { store } from "./_lib/store.js";

/**
 * Sign-in, so a farm follows its farmer to any device (the recovery code still works too).
 *   GET  /api/auth                       → { enabled }
 *   GET  /api/auth?go=google&back=<url>  → 302 to Google (via Supabase), which returns to <url>
 *   POST /api/auth { email, back }       → emails a magic link that returns to <url>
 *   POST /api/auth { accessToken }       → with your guest token: links this farm to that account,
 *        or, if the account already has a farm (signing in on a new device), switches to it:
 *        { token?, id, email, switched }
 *   POST /api/auth { signOut: true }     → unlinks nothing; just says goodbye (the client forgets its token)
 */
const sameOrigin = (req: Request, back: unknown): back is string => {
  if (typeof back !== "string") return false;
  try {
    const b = new URL(back), r = new URL(req.url);
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? r.host;
    return b.host === host && (b.protocol === "https:" || b.hostname === "localhost");
  } catch {
    return false;
  }
};

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  if (u.searchParams.get("go") !== "google") return json({ enabled: authConfigured() });
  const back = u.searchParams.get("back");
  if (!sameOrigin(req, back)) return json({ error: "bad return address" }, 400);
  const to = googleUrl(back);
  if (!to) return json({ error: "Sign-in isn't set up on this server." }, 503);
  return new Response(null, { status: 302, headers: { location: to, "cache-control": "no-store" } });
}

export async function POST(req: Request): Promise<Response> {
  const body = await readJson(req, 4000);
  if (!body) return json({ error: "bad request" }, 400);
  const s = store();

  if (body.email !== undefined) {
    if (!validEmail(body.email)) return json({ error: "That doesn't look like an email address." }, 400);
    if (!sameOrigin(req, body.back)) return json({ error: "bad return address" }, 400);
    const email = body.email.trim().toLowerCase();
    // one email a minute per address, so nobody can use us to flood someone's inbox
    const k = `authmail:${email}`;
    const last = await s.get<number>(k);
    if (last && Date.now() - last < 60_000) return json({ error: "We just sent you a link. Check your inbox (and spam)." }, 429);
    await s.set(k, Date.now());
    // remember which farm asked: on a phone the link often opens in the mail app's own browser,
    // which has a different (empty) guest farm, and it's this one we want saved
    const asker = await authed(req);
    if (asker) await s.set(`pendingmail:${email}`, { id: asker, at: Date.now() });
    const err = await sendMagicLink(email, body.back);
    return err ? json({ error: err }, 502) : json({ sent: true });
  }

  if (typeof body.accessToken === "string") {
    const user = await userFor(body.accessToken);
    if (!user) return json({ error: "That sign-in has expired. Please try again." }, 401);
    const guest = await authed(req);
    const linked = await s.get<string>(`account:${user.id}`);
    // this account already has a farm: carry on with it here (a new phone, or after signing out)
    if (linked && linked !== guest) return json({ token: await issueToken(linked), id: linked, email: user.email, switched: true });
    if (linked) return json({ id: linked, email: user.email, switched: false });
    // first sign-in: the farm that asked for the email link (within the hour), else this device's farm…
    const pend = await s.get<{ id: string; at: number }>(`pendingmail:${user.email.toLowerCase()}`);
    const asked = pend && Date.now() - pend.at < 3600_000 && !(await s.get<Account>(`acct:${pend.id}`)) ? pend.id : null;
    const id = asked ?? guest;
    const already = id ? await s.get<Account>(`acct:${id}`) : null;
    // …unless it already belongs to another account
    if (!id || already) return json({ error: "This farm is already saved to another account. Sign out first, then sign in." }, 409);
    const acct: Account = { userId: user.id, email: user.email, provider: user.provider, linkedAt: Date.now() };
    await s.set(`acct:${id}`, acct);
    await s.set(`account:${user.id}`, id);
    if (pend) await s.del(`pendingmail:${user.email.toLowerCase()}`);
    // a farmer with no name on the board yet goes by their first name
    const first = cleanName(user.name.split(" ")[0] ?? "");
    if (first) await updateSave(id, (sv) => void (sv.name ||= first));
    const player = await s.get<Player>(`player:${id}`);
    // (opened in another browser: that browser now plays the farm that asked)
    if (id !== guest) return json({ token: await issueToken(id), id, email: user.email, switched: true, recoveryCode: player?.recoveryCode });
    return json({ id, email: user.email, switched: false, recoveryCode: player?.recoveryCode });
  }

  if (body.signOut === true) return json({ ok: true });
  return json({ error: "bad request" }, 400);
}
