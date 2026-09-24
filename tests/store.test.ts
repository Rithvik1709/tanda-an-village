import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { FileStore, MemoryStore, type Store, SupabaseStore } from "../api/_lib/store";

/**
 * A stand-in for Supabase's REST API (PostgREST): just the requests SupabaseStore makes, against two
 * in-memory tables, `kv` and `leaderboard`, with the same conflict and filter semantics.
 */
function fakeSupabase(): typeof fetch {
  const kv = new Map<string, { key: string; value: unknown; rev: number }>();
  const board = new Map<string, Record<string, unknown>>();
  return (async (url: string, init: RequestInit = {}) => {
    const h = new Headers(init.headers);
    if (h.get("apikey") !== "service") return new Response("no", { status: 401 });
    const u = new URL(url);
    const table = u.pathname.split("/").pop()!;
    const eq = (k: string) => u.searchParams.get(k)?.replace(/^eq\./, "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    const prefer = h.get("Prefer") ?? "";
    if (table === "kv") {
      const key = eq("key");
      if (method === "GET") return Response.json(key && kv.has(key) ? [{ value: kv.get(key)!.value, rev: kv.get(key)!.rev }] : []);
      if (method === "DELETE") return (kv.delete(key!), new Response(null, { status: 204 }));
      if (method === "POST") {
        if (kv.has(body.key) && !prefer.includes("merge-duplicates")) return new Response("duplicate", { status: 409 });
        kv.set(body.key, body);
        return new Response(null, { status: 201 });
      }
      if (method === "PATCH") {
        const row = kv.get(key!);
        const rev = Number(u.searchParams.get("rev")!.replace(/^eq\./, ""));
        if (!row || row.rev !== rev) return Response.json([]);
        Object.assign(row, body);
        return Response.json([row]);
      }
    }
    if (table === "leaderboard") {
      if (method === "POST") return (board.set(body.player_id, body), new Response(null, { status: 201 }));
      let rows = [...board.values()];
      const gt = u.searchParams.get("net_worth");
      if (gt) rows = rows.filter((r) => (r.net_worth as number) > Number(gt.replace(/^gt\./, "")));
      if (prefer.includes("count=exact")) return new Response("[]", { headers: { "content-range": `0-0/${rows.length}` } });
      rows.sort((a, b) => (b.net_worth as number) - (a.net_worth as number));
      return Response.json(rows.slice(0, Number(u.searchParams.get("limit") ?? 100)));
    }
    return new Response("?", { status: 404 });
  }) as typeof fetch;
}

const dir = mkdtempSync(join(tmpdir(), "tanda-store-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const stores: [string, Store][] = [
  ["memory", new MemoryStore()],
  ["file", new FileStore(dir)],
  ["supabase (REST contract)", new SupabaseStore("https://x.supabase.co", "service", fakeSupabase())],
];

describe.each(stores)("%s store", (_name, s) => {
  it("round-trips JSON, overwrites, deletes, and misses cleanly", async () => {
    expect(await s.get("player:x")).toBeNull();
    await s.set("player:x", { money: 5, s: "ज्वारी" });
    expect(await s.get("player:x")).toEqual({ money: 5, s: "ज्वारी" });
    await s.set("player:x", { money: 6 });
    expect(await s.get("player:x")).toEqual({ money: 6 });
    await s.del("player:x");
    expect(await s.get("player:x")).toBeNull();
  });

  it("versioned writes refuse a stale revision (two devices at once)", async () => {
    expect(await s.setVersioned("save:a", { n: 1 }, null)).toBe(true);
    expect(await s.setVersioned("save:a", { n: 9 }, null)).toBe(false); // already exists
    const v = await s.getVersioned<{ n: number }>("save:a");
    expect(v?.value).toEqual({ n: 1 });
    expect(await s.setVersioned("save:a", { n: 2 }, v!.rev)).toBe(true); // device A
    expect(await s.setVersioned("save:a", { n: 3 }, v!.rev)).toBe(false); // device B, stale
    const w = await s.getVersioned<{ n: number }>("save:a");
    expect(w).toEqual({ value: { n: 2 }, rev: v!.rev + 1 });
    expect(await s.get("save:a")).toEqual({ n: 2 });
  });

  it("keeps a leaderboard ordered by net worth, with ranks", async () => {
    const e = (id: string, worth: number) => ({ id, name: id, worth, title: "Kisan", missions: 1, sarpanch: false, updatedAt: 1 });
    await s.boardUpsert(e("a", 30000));
    await s.boardUpsert(e("b", 90000));
    await s.boardUpsert(e("c", 12000));
    await s.boardUpsert(e("a", 95000)); // a moves up
    expect((await s.boardTop(10)).map((x) => x.id)).toEqual(["a", "b", "c"]);
    expect(await s.boardRank(50000)).toEqual({ above: 2, total: 3 });
    expect((await s.boardTop(2)).length).toBe(2);
  });
});
