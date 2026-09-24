import { beforeEach, describe, expect, it } from "vitest";
import { POST as act } from "../api/act";
import { POST as dev } from "../api/dev";
import { MemoryStore, setStoreForTests } from "../api/_lib/store";
import { POST as session } from "../api/session";
import { GET as state } from "../api/state";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const starter = world.plots.find((p) => p.starter)!;
const other = world.plots.find((p) => !p.starter)!;
const at = (plot = starter, dx = 3, dz = 3) => ({ x: plot.x0 + dx, y: plot.y, z: plot.z0 + dz });
const post = (body: unknown, token?: string) =>
  new Request("http://x/api", { method: "POST", body: JSON.stringify(body), headers: token ? { authorization: `Bearer ${token}` } : {} });
const get = (token?: string) => new Request("http://x/api", { headers: token ? { authorization: `Bearer ${token}` } : {} });

beforeEach(() => setStoreForTests(new MemoryStore()));

async function newPlayer() {
  const r = await session(post({}));
  expect(r.status).toBe(201);
  return (await r.json()) as { token: string; id: string; recoveryCode: string };
}

describe("accounts", () => {
  it("creates a guest with a readable recovery code and restores by it", async () => {
    const p = await newPlayer();
    expect(p.recoveryCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const again = await (await session(post({ recoveryCode: p.recoveryCode.toLowerCase().replace(/-/g, " ") }))).json();
    expect(again.id).toBe(p.id);
    expect(again.token).not.toBe(p.token);
    expect((await session(post({ recoveryCode: "AAAA-BBBB-CCCC" }))).status).toBe(404);
  });

  it("refuses requests without a valid token", async () => {
    expect((await state(get())).status).toBe(401);
    expect((await state(get("f".repeat(48)))).status).toBe(401);
    expect((await act(post({ actions: [] }, "nope"))).status).toBe(401);
  });
});

describe("saves", () => {
  it("persists accepted actions: a reload sees the same field", async () => {
    const p = await newPlayer();
    const r = await (await act(post({ actions: [{ t: "till", ...at() }, { t: "plant", ...at(), crop: "onion" }, { t: "water", ...at() }] }, p.token))).json();
    expect(r.results.map((x: { ok: boolean }) => x.ok)).toEqual([true, true, true]);
    const s = await (await state(get(p.token))).json();
    expect(Object.values(s.save.farm)[0]).toMatchObject({ plant: { crop: "onion" } });
    expect(s.save.inv["seed:onion"]).toBe(11);
    expect(s.recoveryCode).toBe(p.recoveryCode);
    // the same farm from another device
    const other = await (await session(post({ recoveryCode: p.recoveryCode }))).json();
    const s2 = await (await state(get(other.token))).json();
    expect(s2.save).toEqual(s.save);
  });

  it("rejects a tampered client: other people's land, no seeds, unripe harvest, fake blocks, junk", async () => {
    const p = await newPlayer();
    const bad = [
      { t: "till", ...at(other) }, // not my plot
      { t: "dig", x: 96, y: 15, z: 96 }, // the village road
      { t: "plant", ...at(), crop: "onion" }, // untilled
      { t: "harvest", ...at() }, // nothing there
      { t: "place", ...at(starter, 4, 4), y: starter.y + 1, b: 23 }, // bedrock isn't a building block
      { t: "grant", item: "money", n: 1e9 }, // not an action
      { t: "plant", x: "1", y: 2, z: 3, crop: "onion" }, // junk coordinates
      null,
    ];
    const r = await (await act(post({ actions: bad }, p.token))).json();
    expect(r.results.every((x: { ok: boolean }) => !x.ok)).toBe(true);
    expect(r.save.money).toBe(1000);
    // unripe harvest and spending seeds you don't have
    await act(post({ actions: [{ t: "till", ...at() }, { t: "plant", ...at(), crop: "sugarcane" }] }, p.token));
    const r2 = await (await act(post({ actions: [{ t: "harvest", ...at() }] }, p.token))).json();
    expect(r2.results[0]).toMatchObject({ ok: false, error: expect.stringMatching(/not ripe/i) });
    const plant = (i: number) => ({ t: "plant", ...at(starter, 5 + i, 5), crop: "sugarcane" });
    const tills = [0, 1, 2, 3, 4].map((i) => ({ t: "till", ...at(starter, 5 + i, 5) }));
    const r3 = await (await act(post({ actions: [...tills, ...[0, 1, 2, 3, 4].map(plant)] }, p.token))).json();
    // started with 4 cane seeds, one already sown: only 3 more succeed
    expect(r3.results.slice(5).map((x: { ok: boolean }) => x.ok)).toEqual([true, true, true, false, false]);
    expect(r3.save.inv["seed:sugarcane"]).toBeUndefined();
  });

  it("uses the server clock: a dev fast-forward ripens crops; batches are capped", async () => {
    const p = await newPlayer();
    await act(post({ actions: [{ t: "till", ...at() }, { t: "plant", ...at(), crop: "onion" }] }, p.token));
    await dev(post({ skipMs: 10 * 24 * 3600e3 / 144 * 20 }, p.token)); // 20 game days
    const r = await (await act(post({ actions: [{ t: "harvest", ...at() }] }, p.token))).json();
    expect(r.results[0]).toEqual({ ok: true });
    expect(r.save.inv.onion).toBeGreaterThan(0);
    expect((await act(post({ actions: Array(300).fill({ t: "water", ...at() }) }, p.token))).status).toBe(400);
  });
});

describe("two devices and the leaderboard", () => {
  it("two devices acting at the same moment both land (no lost moves)", async () => {
    const p = await newPlayer();
    const other = await (await session(post({ recoveryCode: p.recoveryCode }))).json();
    const a = at(starter, 3, 3), b = at(starter, 6, 3);
    await Promise.all([
      act(post({ actions: [{ t: "till", ...a }] }, p.token)),
      act(post({ actions: [{ t: "till", ...b }] }, other.token)),
    ]);
    const s = await (await state(get(p.token))).json();
    expect(Object.keys(s.save.farm)).toHaveLength(2);
  });

  it("names are validated, and the board ranks farmers by net worth", async () => {
    const { GET: board } = await import("../api/leaderboard");
    const p1 = await newPlayer();
    const p2 = await newPlayer();
    const bad = await (await act(post({ actions: [{ t: "setName", name: "<script>" }] }, p1.token))).json();
    expect(bad.results[0].ok).toBe(false);
    await act(post({ actions: [{ t: "setName", name: "गजानन" }] }, p1.token));
    await dev(post({ money: 50000 }, p2.token));
    await act(post({ actions: [{ t: "setName", name: "Sitaram" }] }, p2.token));
    const r = await (await board(get(p1.token))).json();
    expect(r.top.map((x: { name: string }) => x.name).slice(0, 2)).toEqual(["Sitaram", "गजानन"]);
    expect(r.me).toMatchObject({ rank: 2, total: 2, name: "गजानन" });
    expect(r.top[1].you).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/token|recovery|[a-f0-9]{16}/); // no ids or secrets leak
  });
});
