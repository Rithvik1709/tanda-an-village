/*
 * Sign-in with Supabase Auth (Google, or a magic link by email), talked to over its REST API so the
 * browser needs no Supabase library and no keys. Supabase only tells us *who* someone is; the farm
 * itself stays in our own store, linked by `account:<supabase user id>` → player id.
 *
 * Both flows end with Supabase sending the player back to the game with `#access_token=…` in the
 * URL; the game posts that token to /api/auth, and we ask Supabase whose it is before trusting it.
 */
export type AuthUser = { id: string; email: string; provider: string; name: string };
export type Account = { userId: string; email: string; provider: string; linkedAt: number };

type Fetch = typeof fetch;
let fetchFn: Fetch = (...a) => fetch(...a);
/** Tests swap in a fake Supabase. */
export const setAuthFetchForTests = (f: Fetch) => (fetchFn = f);

const conf = () => {
  const url = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url, key } : null;
};
export const authConfigured = () => !!conf();

/** Where Google sign-in starts: Supabase's authorize URL, returning to `back`. */
export function googleUrl(back: string): string | null {
  const c = conf();
  if (!c) return null;
  return `${c.url}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(back)}`;
}

/** Email a magic link that signs in (creating the Supabase user the first time). */
export async function sendMagicLink(email: string, back: string): Promise<string | null> {
  const c = conf();
  if (!c) return "Sign-in isn't set up on this server.";
  const r = await fetchFn(`${c.url}/auth/v1/otp?redirect_to=${encodeURIComponent(back)}`, {
    method: "POST",
    headers: { apikey: c.key, authorization: `Bearer ${c.key}`, "content-type": "application/json" },
    body: JSON.stringify({ email, create_user: true }),
  });
  if (r.ok) return null;
  if (r.status === 429) return "Too many emails just now. Please try again in a few minutes.";
  const body = (await r.json().catch(() => ({}))) as { msg?: string; error_description?: string };
  console.error("[auth] otp", r.status, body.msg ?? body.error_description ?? "");
  return "Couldn't send the email. Check the address and try again.";
}

/** Who does this Supabase access token belong to? null if it's invalid or expired. */
export async function userFor(accessToken: string): Promise<AuthUser | null> {
  const c = conf();
  if (!c || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(accessToken)) return null;
  const r = await fetchFn(`${c.url}/auth/v1/user`, { headers: { apikey: c.key, authorization: `Bearer ${accessToken}` } });
  if (!r.ok) return null;
  const u = (await r.json().catch(() => null)) as {
    id?: string;
    email?: string;
    app_metadata?: { provider?: string };
    user_metadata?: { full_name?: string; name?: string };
  } | null;
  if (!u?.id || !u.email) return null;
  return { id: u.id, email: u.email, provider: u.app_metadata?.provider ?? "email", name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? "" };
}

export const validEmail = (e: unknown): e is string => typeof e === "string" && e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
