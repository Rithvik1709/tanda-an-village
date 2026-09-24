import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FileStore, MemoryStore, type Store, UpstashStore } from "../api/_lib/store";

/** A stand-in for Upstash's REST endpoint: POST [cmd, ...args] → { result }. */
function fakeUpstash(): typeof fetch {
  const db = new Map<string, string>();
  return (async (_url: string, init?: RequestInit) => {
    if (!String(new Headers(init?.headers).get("authorization")).startsWith("Bearer ")) return new Response("no", { status: 401 });
    const [cmd, key, val] = JSON.parse(String(init?.body)) as string[];
    let result: unknown = null;
    if (cmd === "GET") result = db.get(key) ?? null;
    else if (cmd === "SET") (db.set(key, val), (result = "OK"));
    else if (cmd === "DEL") result = db.delete(key) ? 1 : 0;
    return Response.json({ result });
  }) as typeof fetch;
}

const dir = mkdtempSync(join(tmpdir(), "bailgaadi-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const stores: [string, Store][] = [
  ["memory", new MemoryStore()],
  ["file", new FileStore(dir)],
  ["upstash (REST contract)", new UpstashStore("https://example.upstash.io", "t", fakeUpstash())],
];

describe.each(stores)("%s store", (_name, s) => {
  it("round-trips JSON, overwrites, deletes, and misses cleanly", async () => {
    expect(await s.get("save:x")).toBeNull();
    await s.set("save:x", { money: 5, inv: { jowar: 2 }, s: "ज्वारी" });
    expect(await s.get("save:x")).toEqual({ money: 5, inv: { jowar: 2 }, s: "ज्वारी" });
    await s.set("save:x", { money: 6 });
    expect(await s.get("save:x")).toEqual({ money: 6 });
    await s.set("token:abc", "id1");
    expect(await s.get("token:abc")).toBe("id1");
    await s.del("save:x");
    expect(await s.get("save:x")).toBeNull();
  });
});
