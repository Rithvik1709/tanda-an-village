/**
 * Key-value storage for saves. Production: Upstash Redis over its REST API (no SDK needed).
 * Local dev and tests: JSON files under .data/ (or memory). Same interface, same tests.
 */
export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  del(key: string): Promise<void>;
}

class UpstashStore implements Store {
  constructor(private url: string, private token: string) {}
  private async cmd(args: (string | number)[]) {
    const r = await fetch(this.url, { method: "POST", headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error(`upstash ${r.status}`);
    return (await r.json()) as { result: unknown };
  }
  async get<T>(key: string) {
    const { result } = await this.cmd(["GET", key]);
    return result == null ? null : (JSON.parse(result as string) as T);
  }
  async set<T>(key: string, value: T) {
    await this.cmd(["SET", key, JSON.stringify(value)]);
  }
  async del(key: string) {
    await this.cmd(["DEL", key]);
  }
}

export class MemoryStore implements Store {
  private m = new Map<string, string>();
  async get<T>(key: string) {
    const v = this.m.get(key);
    return v == null ? null : (JSON.parse(v) as T);
  }
  async set<T>(key: string, value: T) {
    this.m.set(key, JSON.stringify(value));
  }
  async del(key: string) {
    this.m.delete(key);
  }
}

class FileStore implements Store {
  private dir = ".data";
  private path(key: string) {
    return `${this.dir}/${key.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  }
  async get<T>(key: string) {
    const fs = await import("node:fs/promises");
    try {
      return JSON.parse(await fs.readFile(this.path(key), "utf8")) as T;
    } catch {
      return null;
    }
  }
  async set<T>(key: string, value: T) {
    const fs = await import("node:fs/promises");
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = this.path(key) + ".tmp";
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
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  // In production a missing database must fail loudly: a memory store would silently lose everyone's farm.
  if (!(url && token) && process.env.VERCEL) throw new Error("storage not configured: connect Upstash Redis (KV_REST_API_URL / KV_REST_API_TOKEN)");
  cached = url && token ? new UpstashStore(url, token) : new FileStore();
  return cached;
}
export function setStoreForTests(s: Store) {
  cached = s;
}
