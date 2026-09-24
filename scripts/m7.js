// M7 scripted: buy the bulls, cart and plough → plough a row → grow onions → feed the pair →
// load the cart → ride to the town mandi → sell → the ledger shows the town premium.
(async () => { window.__bailgaadi.setView("first");
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (sel) => { const b = document.querySelector(sel); if (!b) throw new Error("no " + sel); b.click(); await wait(120); };
  const DAY = 10 * 60 * 1000;
  const log = { errors: [] };
  g.setHour(17.3);
  await g.grant(12000);
  const s = g.landmarks().seedShop;
  g.teleport(s.x + 0.5, s.y, s.z + 0.3, 0, -0.08);
  await wait(300);
  g.key("KeyE");
  await wait(150);
  for (const item of ["bulls", "cart", "plough"]) await click(`[data-item="${item}"][data-n="1"]`);
  await click('[data-item="fodder"][data-n="10"]');
  log.bought = g.inv();
  g.key("Escape");
  await g.sync();
  // stand still a moment: the pair walks up
  g.teleport(s.x - 3.5, s.y, s.z + 6.5, 0.5, -0.3);
  await wait(3000);
  const f0 = g.farmyard().pos; // look at the pair
  const me = g.player();
  g.teleport(me.x, me.y, me.z, Math.atan2(-(f0.x - me.x), -(f0.z - me.z)), -0.3);
  await wait(300);
  await window.__shot("m7-bulls");

  // plough a row on the starter plot
  const p = g.starterPlot();
  const y = p.y;
  g.teleport(p.x0 + 2.5, y + 1, p.z0 + 6.5, -Math.PI / 2, -0.95); // facing +x, looking down at the soil in front
  for (let i = 0; i < 40; i++) { // the bulls catch up
    const f = g.farmyard().pos;
    if (Math.hypot(f.x - (p.x0 + 2.5), f.z - (p.z0 + 6.5)) < 5) break;
    await wait(250);
  }
  g.select(1);
  const pr = await g.plough();
  log.plough = pr;
  await g.sync();
  await wait(3000);
  g.teleport(p.x0 + 1.5, y + 1, p.z0 + 2.5, -Math.PI / 2 - 0.55, -0.35);
  await wait(400);
  await window.__shot("m7-plough");

  // sow onions on the ploughed row and let them grow
  const row = Object.keys(g.farm()).map(Number).map((i) => [i % 192, Math.floor(i / (192 * 192)), Math.floor(i / 192) % 192]);
  g.select(4);
  for (const c of row.sort((a, b) => b[0] - a[0])) {
    const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 2.62, z: sz };
    const dx = c[0] + 0.5 - e.x, dy = c[1] + 0.9 - e.y, dz = c[2] + 0.5 - e.z;
    g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(50);
    const r = await g.right();
    if (!r?.ok) log.errors.push(r);
  }
  g.select(2);
  for (const c of row) {
    const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 2.62, z: sz };
    const dx = c[0] + 0.5 - e.x, dy = c[1] + 1.1 - e.y, dz = c[2] + 0.5 - e.z;
    g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(50);
    const r = await g.right();
    if (!r?.ok) log.errors.push(r);
  }
  await g.sync();
  await g.skip(7 * DAY);
  g.select(0);
  for (const c of row) {
    const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 2.62, z: sz };
    const dx = c[0] + 0.5 - e.x, dy = c[1] + 1.2 - e.y, dz = c[2] + 0.5 - e.z;
    g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(50);
    const r = await g.left();
    if (!r?.ok) log.errors.push(r);
  }
  log.onions = g.inv().onion;
  log.bullsAfterWeek = g.farmyard().bulls;

  // feed the hungry pair, then to the cart
  const fy = g.farmyard();
  g.teleport(fy.pos.x + 1.5, fy.pos.y + 0.1, fy.pos.z + 1.5, 0, -0.2);
  await wait(200);
  g.key("KeyF");
  await wait(100);
  g.key("KeyF");
  await wait(100);
  log.bullsFed = g.farmyard().bulls;
  const home = g.farmyard().cartAt;
  g.teleport(home.x + 2.2, g.farmyard().pos.y + 0.2, home.z + 1.2, Math.atan2(2.2, 1.2), -0.25);
  await wait(900);
  log.hint = document.querySelector(".interact")?.textContent;
  await window.__shot("m7-cart");
  g.key("KeyR");
  await wait(200);
  await window.__shot("m7-load");
  await click('[data-do="setOff"]');
  log.trip = g.farmyard().trip;
  await g.sync();
  await wait(9000);
  log.midRide = g.farmyard().riding;
  await window.__shot("m7-ride");
  // wait until the bulls pull into the mandi
  for (let i = 0; i < 60 && g.farmyard().riding; i++) await wait(500);
  await wait(400);
  await window.__shot("m7-town");
  const m0 = g.money();
  await click('[data-do="sellTown"]');
  log.townSale = g.money() - m0;
  await window.__shot("m7-sold");
  g.key("Escape");
  await g.sync();
  g.openStall("trader", "ledger");
  await wait(200);
  await window.__shot("m7-ledger");
  g.closePanel();
  const server = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { money: server.save.money, local: g.money(), trip: server.save.trip, town: server.save.ledger.filter((l) => l.where === "town") };
  return log;
})()
