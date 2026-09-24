// M6 scripted land deal: land office → buy a plot → farm it → list it → wait for an offer → accept.
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code }));
  const click = async (sel) => { const b = document.querySelector(sel); if (!b) throw new Error("no " + sel); b.click(); await wait(100); };
  const DAY = 10 * 60 * 1000;
  const log = { errors: [] };
  g.setHour(16.8);
  await g.grant(60000); // dev only: skip the grind to afford land
  const lo = g.landmarks().landOffice;
  g.teleport(lo.x + 4.2, lo.y, lo.z + 0.5, Math.PI / 2, -0.05);
  await wait(700);
  log.near = g.nearStall();
  await window.__shot("m6-office");
  key("KeyE");
  await wait(150);
  await window.__shot("m6-plots");
  // buy the cheapest plot on offer (the table lists yours first, then for-sale by price)
  const btn = document.querySelector('[data-do^="buyPlot:"]:not([disabled])');
  const plotId = Number(btn.dataset.do.split(":")[1]);
  const m0 = g.money();
  await click(`[data-do="buyPlot:${plotId}"]`);
  log.bought = { plotId, paid: m0 - g.money(), owned: g.land().owned };
  key("KeyE");
  await g.sync();

  // farm the new plot: till and sow a row
  const plot = window.__bailgaadi_plots?.[plotId];
  const info = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  const p = (await import("/src/shared/world.ts")).generateWorld().plots[plotId];
  const y = p.y;
  const cells = [3, 4, 5, 6, 7].map((d) => [p.x0 + d, y, p.z0 + 4]);
  for (const [slot, list] of [[1, cells], [3, cells]])
    for (const c of list) {
      g.select(slot);
      const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 2.62, z: sz };
      const dx = c[0] + 0.5 - e.x, dy = c[1] + 0.9 - e.y, dz = c[2] + 0.5 - e.z;
      g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
      await wait(50);
      const r = await g.right();
      if (!r?.ok) log.errors.push(r);
    }
  await g.sync();
  log.farmedCells = Object.keys(g.farm()).length;

  // list it at its value through the office
  g.teleport(lo.x + 4.2, lo.y, lo.z + 0.5, Math.PI / 2, -0.05);
  await wait(300);
  key("KeyE");
  await click('[data-do="tab:mine"]');
  const input = document.querySelector(`input[data-price="${plotId}"]`);
  log.suggested = input.value;
  input.value = String(Math.round(Number(input.value) / 1.05 / 100) * 100); // ask about what it's worth
  await click(`[data-do="list:${plotId}"]`);
  log.listed = g.land().listings;
  await g.sync();
  await window.__shot("m6-listed");
  key("KeyE");
  // look at our sign from the road by the gate
  const gt = p.gate;
  const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[gt.side];
  const sx = gt.x + 0.5 + out[0] * 4.5 + (out[0] ? 0 : 2.6), sz = gt.z + 0.5 + out[1] * 4.5 + (out[1] ? 0 : 2.6);
  g.teleport(sx, y + 1.2, sz, Math.atan2(out[0], out[1]), -0.12);
  await wait(900);
  await window.__shot("m6-sign");

  // wait game days for a buyer
  for (let d = 0; d < 12; d++) {
    await g.skip(DAY);
    g.teleport(lo.x + 4.2, lo.y, lo.z + 0.5, Math.PI / 2, -0.05);
    await wait(150);
    key("KeyE");
    await click('[data-do="tab:mine"]');
    if (document.querySelector(`[data-do^="accept:${plotId}:"]`)) { log.offerAfterDays = d + 1; break; }
    key("KeyE");
  }
  await window.__shot("m6-offer");
  const m1 = g.money();
  await click(`[data-do^="accept:${plotId}:"]`);
  log.soldFor = g.money() - m1;
  key("KeyE");
  const st = await g.sync();
  const server = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.after = { status: st, owned: g.land().owned, serverOwned: server.save.plots, serverMoney: server.save.money, localMoney: g.money(), farmCells: Object.keys(server.save.farm).length, ledger: server.save.ledger.map((l) => `${l.kind} ${l.item} ₹${l.amount}${l.where ? " to " + l.where : ""}`) };
  g.showMap();
  await wait(200);
  await window.__shot("m6-map");
  g.closeMap();
  return log;
})()
