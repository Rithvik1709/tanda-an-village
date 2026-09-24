// M5 scripted economy: grow onions, sell them to the trader through the panel, check prices and the
// ledger, buy at the seed shop, and confirm the server agrees on the money. Run via shots.mjs --eval.
(async () => { window.__bailgaadi.setView("first");
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code }));
  const click = async (sel) => { const b = document.querySelector(sel); if (!b) throw new Error("no " + sel); b.click(); await wait(80); };
  const log = { errors: [] };
  g.setHour(11);
  const p = g.starterPlot();
  const y = p.y;
  // a row of onions, sown and left to grow (dry soil still grows, just slower)
  const cells = [3, 4, 5, 6, 7, 8].map((d) => [p.x0 + d, y, p.z0 + 4]);
  const at = async (c) => {
    const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 2.62, z: sz };
    const dx = c[0] + 0.5 - e.x, dy = c[1] + 0.9 - e.y, dz = c[2] + 0.5 - e.z;
    g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(50);
  };
  for (const [slot, list] of [[1, cells], [4, cells]]) for (const c of list) { g.select(slot); await at(c); const r = await g.right(); if (!r?.ok) log.errors.push(r); }
  await g.sync();
  await g.skip(10 * 10 * 60 * 1000); // ten game days: enough even for dry soil in summer
  g.select(0);
  for (const c of cells) { await at([c[0], c[1] + 0.3, c[2]]); const r = await g.left(); if (!r?.ok) log.errors.push(r); }
  log.onions = g.inv().onion;
  await g.sync();

  // walk up to Ganpat's stall
  const t = g.landmarks().trader;
  g.teleport(t.x + 0.5, t.y, t.z + 0.3, 0, -0.08);
  await wait(700);
  log.near = g.nearStall();
  log.hint = document.querySelector(".interact")?.textContent;
  await window.__shot("m5-trader");
  key("KeyE");
  await wait(150);
  await window.__shot("m5-sell");
  const before = g.money();
  await click('[data-do="sell:onion:all"]');
  log.sold = g.money() - before;
  log.onionsLeft = g.inv().onion ?? 0;
  await window.__shot("m5-sold");
  await click('[data-do="tab:prices"]');
  await window.__shot("m5-prices");
  await click('[data-do="tab:ledger"]');
  await window.__shot("m5-ledger");
  key("KeyE");
  await wait(100);
  log.closed = !document.querySelector(".panel:not([hidden])");

  // the seed shop
  const s = g.landmarks().seedShop;
  g.teleport(s.x + 0.5, s.y, s.z + 0.3, 0, -0.08);
  await wait(500);
  key("KeyE");
  await wait(150);
  const m0 = g.money();
  await click('[data-item="seed:onion"][data-n="10"]');
  await click('[data-item="fodder"][data-n="10"]');
  log.spent = m0 - g.money();
  await window.__shot("m5-shop");
  key("Escape");
  const status = await g.sync();
  log.syncStatus = status;
  log.localMoney = g.money();
  const serverSave = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.serverMoney = serverSave.save.money;
  log.serverLedger = serverSave.save.ledger.map((l) => `${l.kind} ${l.n} ${l.item} ₹${l.amount}`);
  return log;
})()
