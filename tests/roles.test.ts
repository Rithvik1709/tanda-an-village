import { describe, expect, it } from "vitest";
import { bondOf } from "../src/shared/neighbours";
import { requestsFor } from "../src/shared/panchayat";
import { dutyFor, DUTY_HONOUR, type Duty, PANCH_DAYS, WARD } from "../src/shared/roles";
import { apply, type Action, roleNeeds } from "../src/shared/rules";
import { newSave, type Save } from "../src/shared/save";
import { atHour } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
let now = atHour(50, 11);
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
/** The first day from `from` whose duty is of this kind. */
const dayWith = (kind: Duty["kind"], from = 50) => {
  let d = from;
  while (dutyFor(d).kind !== kind) d++;
  return d;
};
const karbhari = (day: number) => {
  now = atHour(day, 11);
  const s = newSave("r", world, now);
  s.rep = 25;
  s.bonds = { tulsa: { pts: 45 }, kashibai: { pts: 45 } };
  ok(s, { t: "role", what: "karbhari" });
  return s;
};

describe("Karbhari, then Panch, then Sarpanch", () => {
  it("the Naik asks you to be Karbhari once the tanda knows you", () => {
    now = atHour(50, 11);
    const s = newSave("r", world, now);
    expect(no(s, { t: "role", what: "karbhari" })).toMatch(/★ 0 of 20/);
    s.rep = 25;
    expect(roleNeeds(s, "karbhari", 50)).toEqual(["0 of 2 neighbours at ❤❤"]);
    s.bonds = { tulsa: { pts: 45 }, kashibai: { pts: 45 } };
    ok(s, { t: "role", what: "karbhari" });
    expect(s.roles!.karbhari).toBe(50);
    expect(s.rep).toBe(30);
    expect(no(s, { t: "role", what: "karbhari" })).toMatch(/already/);
    now = atHour(50, 21);
    expect(no(s, { t: "role", what: "panch" })).toMatch(/closed/);
  });

  it("settles a quarrel: one side warms, the other cools — or both a little", () => {
    const d = dayWith("quarrel");
    const s = karbhari(d);
    const q = dutyFor(d) as Extract<Duty, { kind: "quarrel" }>;
    const a0 = bondOf(s, q.a).pts, b0 = bondOf(s, q.b).pts, m0 = s.money;
    ok(s, { t: "duty", step: "choose", choice: "a" });
    expect(bondOf(s, q.a).pts).toBe(a0 + 8);
    expect(bondOf(s, q.b).pts).toBe(Math.max(0, b0 - 6));
    expect(s.money).toBe(m0 + DUTY_HONOUR);
    expect(no(s, { t: "duty", step: "choose", choice: "b" })).toMatch(/done the Naik's work/);
  });

  it("carries the Naik's word to the right neighbour", () => {
    const d = dayWith("message");
    const s = karbhari(d);
    const m = dutyFor(d) as Extract<Duty, { kind: "message" }>;
    expect(no(s, { t: "duty", step: "deliver", who: m.to })).toMatch(/Take the Naik's word/);
    ok(s, { t: "duty", step: "take" });
    const other = m.to === "tulsa" ? "kashibai" : "tulsa";
    expect(no(s, { t: "duty", step: "deliver", who: other })).toMatch(/for /);
    ok(s, { t: "duty", step: "deliver", who: m.to });
    expect(s.duty!.done).toBe(true);
  });

  it("goes door to door for a contribution, then hands it to the Naik", () => {
    const d = dayWith("collect");
    const s = karbhari(d);
    const c = dutyFor(d) as Extract<Duty, { kind: "collect" }>;
    expect(new Set(c.from).size).toBe(3);
    ok(s, { t: "duty", step: "take" });
    ok(s, { t: "duty", step: "visit", who: c.from[0] });
    expect(no(s, { t: "duty", step: "visit", who: c.from[0] })).toMatch(/already/);
    expect(no(s, { t: "duty", step: "finish" })).toMatch(/2 more/);
    ok(s, { t: "duty", step: "visit", who: c.from[1] });
    ok(s, { t: "duty", step: "visit", who: c.from[2] });
    const m0 = s.money;
    ok(s, { t: "duty", step: "finish" });
    expect(s.money).toBe(m0 + DUTY_HONOUR); // the contributions go to the Naik; the honour to you
  });

  it("stands for Panch after days as Karbhari, with the ward's votes; the desk stays the Sarpanch's", () => {
    const s = karbhari(50);
    now = atHour(50 + PANCH_DAYS - 1, 11);
    s.rep = 40;
    expect(no(s, { t: "role", what: "panch" })).toMatch(/days as Karbhari/);
    now = atHour(50 + PANCH_DAYS, 11);
    expect(no(s, { t: "role", what: "panch" })).toMatch(/ward votes/);
    for (const id of WARD.slice(0, 3)) s.bonds = { ...s.bonds, [id]: { pts: 40 } };
    ok(s, { t: "role", what: "panch" });
    // the desk is the Sarpanch's alone
    const first = requestsFor(50 + PANCH_DAYS)[0];
    expect(no(s, { t: "panchayat", slot: first.slot, choice: first.choices[0].id })).toMatch(/Only the Sarpanch/);
  });
});
