import { describe, expect, it } from "vitest";
import { CARRY, creditLimit, isOverdue, type Loan, netWorth, owed, rentFor, TITLES, titleFor } from "../src/shared/bank";
import { apply } from "../src/shared/rules";
import { migrate, newSave, type Save } from "../src/shared/save";
import { clock, DAY_MS, EPOCH } from "../src/shared/time";
import { generateWorld } from "../src/shared/world";

const world = generateWorld();
const T0 = EPOCH + 10 * DAY_MS + DAY_MS * 0.2;
const day0 = clock(T0).day;
const loan = (o: Partial<Loan> = {}): Loan => ({ id: 1, lender: "bank", principal: 10000, rate: 0.01, takenAt: 0, dueAt: 8 * DAY_MS, paid: 0, ...o });

describe("interest", () => {
  it("bank: 1% a day simple interest on time", () => {
    expect(owed(loan(), 0)).toBe(10000);
    expect(owed(loan(), DAY_MS)).toBe(10100);
    expect(owed(loan(), 8 * DAY_MS)).toBe(10800);
    expect(owed(loan({ paid: 800 }), 8 * DAY_MS)).toBe(10000);
  });
  it("late: a one-off fee and double the rate from the due date", () => {
    // 8 days on time (+800), then 2 days late: 5% fee (+500) and 2% a day (+400)
    expect(owed(loan(), 10 * DAY_MS)).toBe(11700);
    expect(isOverdue(loan(), 10 * DAY_MS)).toBe(true);
    expect(isOverdue(loan({ paid: 20000 }), 10 * DAY_MS)).toBe(false);
  });
  it("sahukar: 5% a day, due in 4 days, 20% late fee", () => {
    const l = loan({ lender: "sahukar", rate: 0.05, dueAt: 4 * DAY_MS, principal: 2000 });
    expect(owed(l, 4 * DAY_MS)).toBe(2400);
    expect(owed(l, 5 * DAY_MS)).toBe(2400 + 400 + 200);
  });
});

describe("borrowing and repaying through the rules", () => {
  it("the bank lends against land, the sahukar without", () => {
    const s = newSave("t", world, T0);
    const bankLimit = creditLimit(world, s, "bank", T0, day0);
    const sahLimit = creditLimit(world, s, "sahukar", T0, day0);
    expect(bankLimit).toBeGreaterThan(3000); // 40% of the starter plot
    expect(sahLimit).toBeGreaterThan(bankLimit / 2);
    expect(apply(world, s, { t: "borrow", lender: "bank", amount: bankLimit + 100 }, T0).ok).toBe(false);
    expect(apply(world, s, { t: "borrow", lender: "bank", amount: 4000 }, T0).ok).toBe(true);
    expect(s.money).toBe(4500);
    expect(creditLimit(world, s, "bank", T0, day0)).toBe(Math.floor((bankLimit - 4000) / 100) * 100);
    // repay part, then all, 3 days later
    const t = T0 + 3 * DAY_MS;
    expect(apply(world, s, { t: "repay", loan: 1, amount: 1000 }, t).ok).toBe(true);
    expect(owed(s.loans[0], t)).toBe(4120 - 1000);
    expect(apply(world, s, { t: "repay", loan: 1, amount: 99999 }, t)).toMatchObject({ ok: true, msg: expect.stringMatching(/paid off/) });
    expect(s.loans).toEqual([]);
    expect(s.money).toBe(4500 - 4120);
    expect(s.ledger.map((l) => l.kind)).toEqual(["borrow", "repay", "repay"]);
  });

  it("a defaulter can't borrow again until they pay", () => {
    const s = newSave("t", world, T0);
    apply(world, s, { t: "borrow", lender: "sahukar", amount: 1000 }, T0);
    const late = T0 + 6 * DAY_MS;
    expect(apply(world, s, { t: "borrow", lender: "bank", amount: 500 }, late)).toMatchObject({ ok: false, error: expect.stringMatching(/overdue/) });
    const due = owed(s.loans[0], late);
    expect(due).toBe(1000 + 200 + 200 + 200); // 4 days × 5%, then fee 20% and 2 days × 10%
    s.money = 5000;
    apply(world, s, { t: "repay", loan: s.loans[0].id, amount: due }, late);
    expect(apply(world, s, { t: "borrow", lender: "bank", amount: 500 }, late).ok).toBe(true);
  });

  it("refuses junk", () => {
    const s = newSave("t", world, T0);
    const no = (a: object) => expect(apply(world, s, a as never, T0).ok).toBe(false);
    no({ t: "borrow", lender: "bank", amount: 150 }); // not in hundreds
    no({ t: "borrow", lender: "bank", amount: -500 });
    no({ t: "borrow", lender: "uncle", amount: 500 });
    no({ t: "repay", loan: 42, amount: 100 });
    for (let i = 0; i < 3; i++) apply(world, s, { t: "borrow", lender: "sahukar", amount: 100 }, T0);
    no({ t: "borrow", lender: "sahukar", amount: 100 }); // a fourth
  });
});

describe("the godown", () => {
  it("stores beyond what you carry and charges rent by the day on the way out", () => {
    const s: Save = newSave("t", world, T0);
    s.inv.onion = 150;
    expect(apply(world, s, { t: "store", item: "onion", n: 100 }, T0).ok).toBe(true);
    expect(s.godown.onion).toEqual({ n: 100, since: T0 });
    expect(s.inv.onion).toBe(50);
    apply(world, s, { t: "store", item: "onion", n: 50 }, T0 + DAY_MS); // the lot's date averages
    expect(s.godown.onion.since).toBe(Math.round(T0 + DAY_MS / 3));
    const t = T0 + 4 * DAY_MS;
    const rent = rentFor(s.godown.onion, 40, t);
    expect(rent).toBe(Math.ceil(40 * 0.1 * (4 - 1 / 3)));
    expect(apply(world, s, { t: "withdraw", item: "onion", n: 40 }, t).ok).toBe(true);
    expect(s.money).toBe(500 - rent);
    expect(s.godown.onion.n).toBe(110);
    expect(apply(world, s, { t: "withdraw", item: "onion", n: 999 }, t).ok).toBe(false);
  });

  it("harvest stops when your sacks are full", () => {
    const s = newSave("t", world, T0);
    const p = world.plots.find((q) => q.starter)!;
    const at = { x: p.x0 + 3, y: p.y, z: p.z0 + 3 };
    apply(world, s, { t: "till", ...at }, T0);
    apply(world, s, { t: "plant", ...at, crop: "onion" }, T0);
    s.inv.jowar = CARRY;
    expect(apply(world, s, { t: "harvest", ...at }, T0 + 20 * DAY_MS)).toMatchObject({ ok: false, error: expect.stringMatching(/sacks are full/) });
    apply(world, s, { t: "store", item: "jowar", n: 50 }, T0 + 20 * DAY_MS);
    expect(apply(world, s, { t: "harvest", ...at }, T0 + 20 * DAY_MS).ok).toBe(true);
  });
});

describe("net worth and titles", () => {
  it("counts money, land, goods and livestock, minus debt", () => {
    const s = newSave("t", world, T0);
    const w0 = netWorth(world, s, T0, day0);
    expect(w0.money).toBe(500);
    expect(w0.land).toBeGreaterThan(10000);
    expect(w0.total).toBe(w0.money + w0.land + w0.goods + w0.livestock - w0.debt);
    apply(world, s, { t: "borrow", lender: "bank", amount: 2000 }, T0);
    const w1 = netWorth(world, s, T0, day0);
    expect(w1.total).toBe(w0.total); // borrowing isn't getting richer
    s.inv.jowar = 100;
    expect(netWorth(world, s, T0, day0).goods).toBeGreaterThan(0);
  });

  it("titles climb with net worth", () => {
    expect(titleFor(12000).name).toBe("Small farmer");
    expect(titleFor(25000).name).toBe("Kisan");
    expect(titleFor(150000)).toMatchObject({ name: "Bada Kisan", next: { name: "Zamindar", at: 400000 } });
    expect(titleFor(5e6)).toMatchObject({ name: "Zamindar", next: null });
    expect(TITLES).toHaveLength(4);
  });

  it("upgrades a v4 save", () => {
    const s = { ...newSave("x", world, T0), version: 4 } as Partial<Save>;
    delete s.loans;
    delete s.godown;
    expect(migrate(s as Save)).toMatchObject({ version: 6, loans: [], godown: {}, nextLoanId: 1, bestTitle: 0 });
  });
});
