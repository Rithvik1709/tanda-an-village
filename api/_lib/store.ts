/**
 * Storage for players, sessions, saves and the leaderboard.
 *   Production: Supabase (Postgres) through its REST API, used only by these server functions with
 *   the service key — the browser never talks to the database.
 *   Local dev: JSON files under .data/. Tests: memory. Same interface, same contract tests.
 *
 * Saves are versioned: every write says which `rev` it read, and fails if someone else wrote in
 * between (two devices playing at once). The caller reloads and replays — see updateSave().
 */
export type BoardEntry = {
  id: string;
  name: string;
  worth: number;
  title: string;
  missions: number; // missions completed
  sarpanch: boolean;
  updatedAt: number;
};

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
  /** Read a value with its revision (0 for values written before revisions existed). */
  getVersioned<T>(key: string): Promise<{ value: T; rev: number } | null>;
  /** Write only if the stored revision is still `rev` (null = only if it doesn't exist yet). */
  setVersioned<T>(key: string, value: T, rev: number | null): Promise<boolean>;
  boardUpsert(e: BoardEntry): Promise<void>;
  boardTop(n: number): Promise<BoardEntry[]>;
  /** How many players are worth more than `worth`, and how many are on the board. */
  boardRank(worth: number): Promise<{ above: number; total: number }>;
}

const sortBoard = (xs: BoardEntry[]) => xs.sort((a, b) => b.worth - a.worth || a.updatedAt - b.updatedAt);

/* ---------------- Supabase (PostgREST) ---------------- */

type Fetch = typeof fetch;
export class SupabaseStore implements Store {
  constructor(private url: string, private key: string, private fetchFn: Fetch = fetch) {}

  private async req(path: string, init: RequestInit & { prefer?: string } = {}) {
    const headers: Record<string, string> = {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      "Content-Type": "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
      ...((init.headers as Record<string, string>) ?? {}),
    };
    const r = await this.fetchFn(`${this.url.replace(/\/$/, "")}/rest/v1/${path}`, { ...init, headers });
    return r;
  }
  private async ok(r: Response, what: string) {
    if (!r.ok) throw new Error(`supabase ${what} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r;
  }
  private q = (k: string) => encodeURIComponent(k);

  async get<T>(key: string) {
    return (await this.getVersioned<T>(key))?.value ?? null;
  }
  async set<T>(key: string, value: T) {
    const r = await this.req("kv?on_conflict=key", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify({ key, value, rev: 0 }) });
    await this.ok(r, "set");
  }
  async del(key: string) {
    await this.ok(await this.req(`kv?key=eq.${this.q(key)}`, { method: "DELETE" }), "del");
  }
  async getVersioned<T>(key: string) {
    const r = await this.ok(await this.req(`kv?key=eq.${this.q(key)}&select=value,rev`), "get");
    const rows = (await r.json()) as { value: T; rev: number }[];
    return rows[0] ? { value: rows[0].value, rev: Number(rows[0].rev) } : null;
  }
  async setVersioned<T>(key: string, value: T, rev: number | null) {
    if (rev === null) {
      const r = await this.req("kv", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ key, value, rev: 1 }) });
      if (r.status === 409) return false;
      await this.ok(r, "insert");
      return true;
    }
    const r = await this.ok(
      await this.req(`kv?key=eq.${this.q(key)}&rev=eq.${rev}`, { method: "PATCH", prefer: "return=representation", body: JSON.stringify({ value, rev: rev + 1 }) }),
      "update",
    );
    return ((await r.json()) as unknown[]).length === 1;
  }
  async boardUpsert(e: BoardEntry) {
    const row = { player_id: e.id, name: e.name, net_worth: Math.round(e.worth), title: e.title, missions: e.missions, sarpanch: e.sarpanch, updated_at: new Date(e.updatedAt).toISOString() };
    await this.ok(await this.req("leaderboard?on_conflict=player_id", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(row) }), "board");
  }
  async boardTop(n: number) {
    const r = await this.ok(await this.req(`leaderboard?select=*&order=net_worth.desc,updated_at.asc&limit=${Math.min(100, n)}`), "top");
    const rows = (await r.json()) as { player_id: string; name: string; net_worth: number; title: string; missions: number; sarpanch: boolean; updated_at: string }[];
    return rows.map((x) => ({ id: x.player_id, name: x.name, worth: Number(x.net_worth), title: x.title, missions: x.missions, sarpanch: x.sarpanch, updatedAt: Date.parse(x.updated_at) }));
  }
  async boardRank(worth: number) {
    const count = async (filter: string) => {
      const r = await this.ok(await this.req(`leaderboard?select=player_id${filter}`, { prefer: "count=exact", headers: { "Range-Unit": "items", Range: "0-0" } }), "rank");
      const m = (r.headers.get("content-range") ?? "").match(/\/(\d+)$/);
      return m ? Number(m[1]) : 0;
    };
    return { above: await count(`&net_worth=gt.${Math.round(worth)}`), total: await count("") };
  }
}

/* ---------------- memory and files (dev, tests) ---------------- */

type Versioned = { __rev: number; value: unknown };
const unwrap = <T>(raw: unknown) => (raw && typeof raw === "object" && "__rev" in (raw as object) ? { value: (raw as Versioned).value as T, rev: (raw as Versioned).__rev } : raw == null ? null : { value: raw as T, rev: 0 });

abstract class LocalStore implements Store {
  protected abstract read(key: string): Promise<unknown | null>;
  protected abstract write(key: string, value: unknown): Promise<void>;
  abstract del(key: string): Promise<void>;
  private locks = new Map<string, Promise<unknown>>();
  /** One writer at a time per key inside this process, so check-and-set is really atomic here. */
  private async locked<T>(key: string, f: () => Promise<T>) {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const run = prev.then(f, f);
    this.locks.set(key, run.catch(() => {}));
    return run;
  }
  async get<T>(key: string) {
    return unwrap<T>(await this.read(key))?.value ?? null;
  }
  async set<T>(key: string, value: T) {
    await this.write(key, value);
  }
  async getVersioned<T>(key: string) {
    return unwrap<T>(await this.read(key));
  }
  async setVersioned<T>(key: string, value: T, rev: number | null) {
    return this.locked(key, async () => {
      const cur = unwrap(await this.read(key));
      if (rev === null ? cur !== null : cur?.rev !== rev) return false;
      await this.write(key, { __rev: (rev ?? 0) + 1, value } satisfies Versioned);
      return true;
    });
  }
  async boardUpsert(e: BoardEntry) {
    await this.locked("__board", async () => {
      const b = ((await this.read("__board")) as Record<string, BoardEntry> | null) ?? {};
      b[e.id] = e;
      await this.write("__board", b);
    });
  }
  async boardTop(n: number) {
    return sortBoard(Object.values(((await this.read("__board")) as Record<string, BoardEntry> | null) ?? {})).slice(0, n);
  }
  async boardRank(worth: number) {
    const all = Object.values(((await this.read("__board")) as Record<string, BoardEntry> | null) ?? {});
    return { above: all.filter((x) => x.worth > worth).length, total: all.length };
  }
}

export class MemoryStore extends LocalStore {
  private m = new Map<string, string>();
  protected async read(key: string) {
    const v = this.m.get(key);
    return v == null ? null : JSON.parse(v);
  }
  protected async write(key: string, value: unknown) {
    this.m.set(key, JSON.stringify(value));
  }
  async del(key: string) {
    this.m.delete(key);
  }
}

export class FileStore extends LocalStore {
  constructor(private dir = ".data") {
    super();
  }
  private path(key: string) {
    return `${this.dir}/${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  }
  protected async read(key: string) {
    const fs = await import("node:fs/promises");
    try {
      return JSON.parse(await fs.readFile(this.path(key), "utf8"));
    } catch {
      return null;
    }
  }
  protected async write(key: string, value: unknown) {
    const fs = await import("node:fs/promises");
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = this.path(key) + "." + Math.random().toString(36).slice(2) + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(value));
    await fs.rename(tmp, this.path(key)); // atomic replace: a crash never leaves half a save
  }
  async del(key: string) {
    const fs = await import("node:fs/promises");
    await fs.rm(this.path(key), { force: true });
  }
}

let cached: Store | null = null;
export function store(): Store {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  // In production a missing database must fail loudly: files on Vercel would silently lose everyone's farm.
  if (!(url && key) && process.env.VERCEL) throw new Error("storage not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  cached = url && key ? new SupabaseStore(url, key) : new FileStore();
  return cached;
}
export function setStoreForTests(s: Store) {
  cached = s;
}
