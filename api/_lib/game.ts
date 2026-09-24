import { migrate, type Save } from "../../src/shared/save";
import { generateWorld, WORLD_SEED, type World } from "../../src/shared/world";
import { netWorth, titleFor } from "../../src/shared/bank";
import { clock } from "../../src/shared/time";
import { store } from "./store";

/*
 * Server-side helpers shared by the endpoints: the (cached) world, players, tokens and saves.
 * Keys: player:<id> → Player · save:<id> → Save · token:<sha256(token)> → id · recovery:<code> → id
 */
export type Player = { id: string; recoveryCode: string; createdAt: number };

let worldCache: World | null = null;
/** The seeded world, generated once per server instance (~40 ms). Never mutated. */
export const world = () => (worldCache ??= generateWorld(WORLD_SEED));

/** Dev and tests may fast-forward a save's clock; production never can. */
export const devClockAllowed = () => !process.env.VERCEL && process.env.NODE_ENV !== "production";
export const serverNow = (save?: Save & { devSkew?: number }) => Date.now() + (devClockAllowed() ? (save?.devSkew ?? 0) : 0);

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
export const randomHex = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
export async function sha256(s: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))));
}

// no 0/O, 1/I/L: codes get read aloud and typed on phones
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function recoveryCode() {
  const b = crypto.getRandomValues(new Uint8Array(12));
  const c = [...b].map((x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}
export const normalizeCode = (s: unknown) =>
  typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})(.{4})$/, "$1-$2-$3") : "";

export async function issueToken(id: string) {
  const token = randomHex(24);
  await store().set(`token:${await sha256(token)}`, id);
  return token;
}

/** The player behind the request's bearer token, or null. */
export async function authed(req: Request): Promise<string | null> {
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer ([a-f0-9]{48})$/);
  if (!m) return null;
  return store().get<string>(`token:${await sha256(m[1])}`);
}

export type ServerSave = Save & { devSkew?: number };

export async function loadSave(id: string): Promise<ServerSave | null> {
  const s = await store().getVersioned<ServerSave>(`save:${id}`);
  return s ? migrate(s.value) : null;
}

/** Create a brand-new save (fails if one exists). */
export const createSave = (s: Save) => store().setVersioned(`save:${s.id}`, s, null);

/**
 * Load → change → write, safely: if another device wrote in between, reload and run `change`
 * again on the fresh save (the rules are deterministic, so replaying is safe).
 */
export async function updateSave<R>(id: string, change: (s: ServerSave) => R | Promise<R>): Promise<{ save: ServerSave; result: R } | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const cur = await store().getVersioned<ServerSave>(`save:${id}`);
    if (!cur) return null;
    const save = migrate(cur.value) as ServerSave;
    const result = await change(save);
    if (await store().setVersioned(`save:${id}`, save, cur.rev)) {
      await publish(save).catch((e) => console.error("[board]", e)); // the board is best-effort; the save is what matters
      return { save, result };
    }
  }
  throw new Error("save is busy — too many devices writing at once");
}

export const displayName = (s: Save) => s.name?.trim() || `Farmer ${s.id.slice(0, 4).toUpperCase()}`;

/** Put this farmer on the leaderboard (net worth, title, story progress). */
export async function publish(s: Save) {
  const now = serverNow(s);
  const worth = netWorth(world(), s, now, clock(now).day).total;
  await store().boardUpsert({
    id: s.id,
    name: displayName(s),
    worth,
    title: s.perks?.includes("sarpanch") ? "Sarpanch" : titleFor(worth).name,
    missions: s.missions?.i ?? 0,
    sarpanch: !!s.perks?.includes("sarpanch"),
    updatedAt: s.updatedAt,
  });
}

export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
export const unauthorized = () => json({ error: "not signed in" }, 401);

export async function readJson(req: Request, maxBytes = 64_000): Promise<Record<string, unknown> | null> {
  const text = await req.text();
  if (text.length > maxBytes) return null;
  try {
    const v = JSON.parse(text || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
