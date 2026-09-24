import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as authGet, POST as auth } from "../api/auth";
import { setAuthFetchForTests } from "../api/_lib/auth";
import { MemoryStore, setStoreForTests } from "../api/_lib/store";
import { POST as session } from "../api/session";
import { GET as state } from "../api/state";

/* Sign-in against a fake Supabase: two users with access tokens, and a record of emails sent. */
const USERS: Record<string, { id: string; email: string; app_metadata: { provider: string }; user_metadata: { full_name?: string } }> = {
  "aaa.bbb.ccc": { id: "u-gajanan", email: "g@example.com", app_metadata: { provider: "google" }, user_metadata: { full_name: "Gajanan Rathod" } },
  "ddd.eee.fff": { id: "u-sita", email: "sita@example.com", app_metadata: { provider: "email" }, user_metadata: {} },
};
let mails: { url: string; body: string }[] = [];
const fakeSupabase: typeof fetch = async (input, init) => {
  const url = String(input);
  if (url.includes("/auth/v1/user")) {
    const tok = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? "";
    return USERS[tok] ? Response.json(USERS[tok]) : new Response("{}", { status: 401 });
  }
  if (url.includes("/auth/v1/otp")) {
    mails.push({ url, body: String(init?.body) });
    return Response.json({});
  }
  return new Response("{}", { status: 404 });
};

const SITE = "https://tanda.example";
const post = (body: unknown, token?: string) =>
  new Request(`${SITE}/api/auth`, { method: "POST", body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} });
const get = (path: string, token?: string) => new Request(`${SITE}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
const guest = async () => (await (await session(new Request(`${SITE}/api/session`, { method: "POST", body: "{}" }))).json()) as { token: string; id: string };

beforeEach(() => {
  setStoreForTests(new MemoryStore());
  process.env.SUPABASE_URL = "https://proj.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
  setAuthFetchForTests(fakeSupabase);
  mails = [];
});
afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe("sign-in", () => {
  it("says whether it's available, and sends Google sign-ins to Supabase and back here only", async () => {
    expect(await (await authGet(get("/api/auth"))).json()).toEqual({ enabled: true });
    const r = await authGet(get(`/api/auth?go=google&back=${encodeURIComponent(SITE + "/")}`));
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe(`https://proj.supabase.co/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(SITE + "/")}`);
    // never an open redirect to someone else's site
    expect((await authGet(get(`/api/auth?go=google&back=${encodeURIComponent("https://evil.example/")}`))).status).toBe(400);
  });

  it("emails a magic link, once a minute per address, only to real-looking addresses", async () => {
    const r = await auth(post({ email: "Sita@Example.com", back: SITE + "/" }));
    expect(await r.json()).toEqual({ sent: true });
    expect(mails).toHaveLength(1);
    expect(mails[0].url).toContain(`redirect_to=${encodeURIComponent(SITE + "/")}`);
    expect(JSON.parse(mails[0].body)).toEqual({ email: "sita@example.com", create_user: true });
    expect((await auth(post({ email: "sita@example.com", back: SITE + "/" }))).status).toBe(429);
    expect((await auth(post({ email: "not an email", back: SITE + "/" }))).status).toBe(400);
    expect((await auth(post({ email: "x@y.com", back: "https://evil.example/" }))).status).toBe(400);
    expect(mails).toHaveLength(1);
  });

  it("links this device's farm to the account, then brings it back on another device", async () => {
    const phone = await guest();
    const first = await (await auth(post({ accessToken: "aaa.bbb.ccc" }, phone.token))).json();
    expect(first).toMatchObject({ id: phone.id, email: "g@example.com", switched: false });
    const s1 = await (await state(get("/api/state", phone.token))).json();
    expect(s1.account).toEqual({ email: "g@example.com", provider: "google" });
    expect(s1.save.name).toBe("Gajanan"); // first name for the leaderboard

    // a laptop starts as a new guest; signing in hands it the phone's farm
    const laptop = await guest();
    const back = await (await auth(post({ accessToken: "aaa.bbb.ccc" }, laptop.token))).json();
    expect(back).toMatchObject({ id: phone.id, switched: true });
    const s2 = await (await state(get("/api/state", back.token))).json();
    expect(s2.save.id).toBe(phone.id);
    // signing in again on the phone changes nothing
    expect(await (await auth(post({ accessToken: "aaa.bbb.ccc" }, phone.token))).json()).toMatchObject({ id: phone.id, switched: false });
  });

  it("an email link opened in another browser (a phone's mail app) saves the farm that asked for it", async () => {
    const safari = await guest();
    await auth(post({ email: "sita@example.com", back: SITE + "/" }, safari.token));
    const mailApp = await guest(); // the link opens here, with a different, empty guest farm
    const r = await (await auth(post({ accessToken: "ddd.eee.fff" }, mailApp.token))).json();
    expect(r).toMatchObject({ id: safari.id, switched: true });
    expect((await (await state(get("/api/state", safari.token))).json()).account.email).toBe("sita@example.com");
  });

  it("refuses bad tokens, and won't move a farm that's already someone else's", async () => {
    const p = await guest();
    expect((await auth(post({ accessToken: "forged.token.here" }, p.token))).status).toBe(401);
    expect((await auth(post({ accessToken: "not a jwt" }, p.token))).status).toBe(401);
    await auth(post({ accessToken: "aaa.bbb.ccc" }, p.token));
    const r = await auth(post({ accessToken: "ddd.eee.fff" }, p.token));
    expect(r.status).toBe(409);
    const s = await (await state(get("/api/state", p.token))).json();
    expect(s.account.email).toBe("g@example.com");
  });

  it("is off when Supabase isn't configured", async () => {
    delete process.env.SUPABASE_URL;
    expect(await (await authGet(get("/api/auth"))).json()).toEqual({ enabled: false });
    expect((await authGet(get(`/api/auth?go=google&back=${encodeURIComponent(SITE + "/")}`))).status).toBe(503);
  });
});
