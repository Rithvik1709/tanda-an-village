import { migrate, type Save } from "../../src/shared/save";
import { generateWorld, WORLD_SEED, type World } from "../../src/shared/world";
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

export async function loadSave(id: string): Promise<(Save & { devSkew?: number }) | null> {
  const s = await store().get<Save>(`save:${id}`);
  return s ? migrate(s) : null;
}
export const writeSave = (s: Save) => store().set(`save:${s.id}`, s);

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
