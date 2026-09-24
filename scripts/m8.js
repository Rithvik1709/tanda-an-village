// M8 scripted: bank loan + sahukar loan → grow onions → store them in the godown → rent on the way
// out → let the sahukar loan go overdue (bank refuses) → repay everything → net worth and a new title.
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (sel) => { const b = document.querySelector(sel); if (!b) throw new Error("no " + sel); b.click(); await wait(120); };
  const DAY = 10 * 60 * 1000;
  const log = { errors: [] };
  const toastText = () => [...document.querySelectorAll(".toast")].map((t) => t.textContent);
  g.setHour(10.5);
  const visit = async (kind, x, y, z) => { g.teleport(x, y, z, 0, -0.05); await wait(250); g.openStall(kind); await wait(150); };
  const bank = g.landmarks().bank;

  // 1) borrow the most the bank allows, and a little from the sahukar
  await visit("bank", bank.x + 0.5, bank.y, bank.z - 2.5);
  const m0 = g.money();
  await click('[data-do^="borrow:bank:"]');
  log.bankLoan = g.money() - m0;
  await window.__shot("m8-bank");
  g.closePanel();
  await visit("sahukar", 108.5, g.player().y, 107);
  const m1 = g.money();
  document.querySelector("input[data-borrow]").value = "1000";
  await click('[data-do="borrow:sahukar"]');
  log.sahukarLoan = g.money() - m1;
  await window.__shot("m8-sahukar");
  g.closePanel();
  await g.sync();

  // 2) grow a row of onions for the godown
  const p = g.starterPlot(), y = p.y;
  const cells = [3, 4, 5, 6, 7, 8].map((d) => [p.x0 + d, y, p.z0 + 4]);
  for (const [slot, list] of [[1, cells], [4, [...cells].reverse()], [2, cells]])
    for (const c of list) {
      g.select(slot);
      const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 2.62, z: sz };
      const dx = c[0] + 0.5 - e.x, dy = c[1] + (slot === 2 ? 1.1 : 0.9) - e.y, dz = c[2] + 0.5 - e.z;
      g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      await wait(50);
      const r = await g.right();
      if (!r?.ok) log.errors.push(r);
    }
  await g.sync();
  await g.skip(7 * DAY);
  g.select(0);
  for (const c of cells) {
    const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 2.62, z: sz };
    const dx = c[0] + 0.5 - e.x, dy = c[1] + 1.2 - e.y, dz = c[2] + 0.5 - e.z;
    g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(50);
    const r = await g.left();
    if (!r?.ok) log.errors.push(r);
  }
  log.onions = g.inv().onion;
  log.overdueAfterWeek = g.worth().loans.map((l) => l.lender);

  // 3) the godown: store all, a day passes, take ten out (rent)
  await visit("bank", bank.x + 0.5, bank.y, bank.z - 2.5);
  await click('[data-do="tab:godown"]');
  await click('[data-do="store:onion:all"]');
  log.stored = g.worth().godown;
  await g.skip(DAY);
  g.openStall("bank", "godown");
  await wait(150);
  const m2 = g.money();
  document.querySelector('input[data-gd="onion"]').value = "10";
  await click('[data-do="withdraw:onion"]');
  log.rentPaid = m2 - g.money();
  await window.__shot("m8-godown");
  // 4) overdue: the bank won't lend to a defaulter
  await click('[data-do="tab:loans"]');
  const borrowBtn = document.querySelector('[data-do^="borrow:"]');
  log.bankRefusesDefaulter = !borrowBtn && !!document.querySelector(".news.glut");
  await window.__shot("m8-overdue");
  g.closePanel();
  await wait(700);
  log.hudOverdue = !!document.querySelector(".info .debt");
  // 5) pay everyone back
  await g.grant(20000);
  for (const kind of ["sahukar", "bank"]) {
    g.openStall(kind);
    await wait(150);
    for (const b of [...document.querySelectorAll('[data-do$=":all"][data-do^="repay:"]')]) { b.click(); await wait(120); }
    g.closePanel();
  }
  log.loansLeft = g.worth().loans.length;
  await g.sync();
  // 6) become a Bada Kisan
  const before = g.worth();
  log.before = { title: before.title, total: before.total };
  await g.grant(90000);
  g.openStall("bank", "godown");
  await wait(150);
  await click('[data-do="store:onion:all"]'); // any accepted action lets the server confirm the title
  g.closePanel();
  await g.sync();
  await wait(800);
  const after = g.worth();
  log.after = { title: after.title, bestTitle: after.bestTitle, total: after.total };
  log.toasts = toastText();
  await window.__shot("m8-title");
  g.openStall("bank", "worth");
  await wait(150);
  await window.__shot("m8-worth");
  g.closePanel();
  g.openStall("trader", "ledger");
  await wait(150);
  await window.__shot("m8-ledger");
  g.closePanel();
  const server = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { money: server.save.money, local: g.money(), loans: server.save.loans.length, bestTitle: server.save.bestTitle, godown: server.save.godown };
  return log;
})()
