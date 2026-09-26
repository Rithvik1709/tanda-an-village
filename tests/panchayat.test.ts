import { describe, expect, it } from "vitest";
import { YEAR_DAYS } from "../src/shared/festivals";
import { bondOf } from "../src/shared/neighbours";
import { deskOn, GRANT, REQUESTS_A_DAY, requestsFor } from "../src/shared/panchayat";
import { apply, type Action } from "../src/shared/rules";
import { newSave, type Save } from "../src/shared/save";
import { atHour } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
let now = atHour(40, 11);
const ok = (s: Save, a: Action) => {
  const r = apply(world, s, a, now);
  if (!r.ok) throw new Error(`${a.t}: ${r.error}`);
  return r;
};
const no = (s: Save, a: Action) => {
  const r = apply(world, s, a, now);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.error;
};
const sarpanch = () => {
  const s = newSave("p", world, now);
  s.perks.push("sarpanch");
  return s;
};

describe("the panchayat desk", () => {
  it("brings three different requests a day, the same for everyone", () => {
    for (let d = 0; d < 30; d++) {
      const r = requestsFor(d);
      expect(r).toHaveLength(REQUESTS_A_DAY);
      expect(new Set(r.map((x) => x.key)).size).toBe(REQUESTS_A_DAY);
      expect(requestsFor(d)).toEqual(r);
    }
  });

  it("is only the Sarpanch's, and only in office hours", () => {
    now = atHour(40, 11);
    const s = newSave("p", world, now);
    const req = requestsFor(40)[0];
    expect(no(s, { t: "panchayat", slot: 0, choice: req.choices[0].id })).toMatch(/Only the Sarpanch/);
    s.perks.push("sarpanch");
    now = atHour(40, 20);
    expect(no(s, { t: "panchayat", slot: 0, choice: req.choices[0].id })).toMatch(/closed/);
  });

  it("settles each request once, spending the fund and moving ★ and hearts", () => {
    now = atHour(40, 11);
    const s = sarpanch();
    const reqs = requestsFor(40);
    for (const req of reqs) {
      const ch = req.choices[0];
      const rep = s.rep, money = s.money, fund = deskOn(s.panchayat, 40, (d) => Math.floor(d / YEAR_DAYS)).fund;
      const bonds = Object.fromEntries(Object.keys(ch.effect.bonds ?? {}).map((id) => [id, bondOf(s, id as never).pts]));
      ok(s, { t: "panchayat", slot: req.slot, choice: ch.id });
      expect(s.panchayat!.fund).toBe(fund + (ch.effect.fund ?? 0));
      expect(s.money).toBe(money + (ch.effect.money ?? 0));
      expect(s.rep).toBe(Math.max(0, rep + (ch.effect.rep ?? 0)));
      for (const [id, n] of Object.entries(ch.effect.bonds ?? {})) expect(bondOf(s, id as never).pts).toBe(Math.max(0, bonds[id] + n!));
      expect(no(s, { t: "panchayat", slot: req.slot, choice: ch.id })).toMatch(/already settled/);
    }
    // the next day, fresh requests
    now = atHour(41, 11);
    ok(s, { t: "panchayat", slot: 0, choice: requestsFor(41)[0].choices[0].id });
  });

  it("can't spend more than the fund holds, and gets a grant every year", () => {
    const d = YEAR_DAYS * 3 + 2;
    now = atHour(d, 11);
    const s = sarpanch();
    const req = requestsFor(d).find((r) => r.choices.some((c) => (c.effect.fund ?? 0) < 0));
    if (req) {
      const ch = req.choices.find((c) => (c.effect.fund ?? 0) < 0)!;
      s.panchayat = { fund: 100, year: 3, day: d, done: [] };
      expect(no(s, { t: "panchayat", slot: req.slot, choice: ch.id })).toMatch(/fund has only ₹100/);
    }
    expect(deskOn({ fund: 100, year: 3, day: d, done: [0] }, d + YEAR_DAYS, (x) => Math.floor(x / YEAR_DAYS))).toEqual({ fund: 100 + GRANT, year: 4, day: d + YEAR_DAYS, done: [] });
    expect(deskOn(undefined, d, (x) => Math.floor(x / YEAR_DAYS)).fund).toBe(GRANT);
  });
});
