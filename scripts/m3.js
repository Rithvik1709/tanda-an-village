// M3 scripted farming: till → sow → water → fast-forward → harvest. Run via shots.mjs --eval.
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { errors: [] };
  g.setHour(10);
  const p = g.starterPlot();
  const y = p.y;
  const stand = { x: p.x0 + 2.5, y: y + 1, z: p.z0 + 4.5 };
  // aim at a soil block's top, or (plant = true) at the middle of the plant growing on it
  const aim = async (bx, by, bz, plant = false) => {
    // walk up to the cell like a player would: stand beside its row, on the outside
    stand.x = bx + 0.5;
    stand.z = bz === rows[0] ? bz - 1.5 : bz + 2.5;
    const e = { x: stand.x, y: stand.y + 1.62, z: stand.z };
    const dx = bx + 0.5 - e.x, dy = by + (plant ? 1.15 : 0.9) - e.y, dz = bz + 0.5 - e.z;
    g.teleport(stand.x, stand.y, stand.z, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(40);
    return g.target();
  };
  const use = async (hand, cell, plant = false) => {
    const t = await aim(...cell, plant);
    const r = await (hand === "L" ? g.left() : g.right());
    if (!r?.ok) log.errors.push({ cell, t, r });
    return r;
  };
  // two rows of six in front of us: jowar, onion, sugarcane in pairs
  const rows = [p.z0 + 4, p.z0 + 5];
  const cols = [3, 4, 5, 6, 7, 8].map((d) => p.x0 + d);
  const cells = rows.flatMap((z) => cols.map((x) => [x, y, z]));
  const cropSlot = (x) => 3 + Math.floor((x - cols[0]) / 2); // slots 4,5,6 → index 3,4,5
  g.select(1);
  for (const c of cells) await use("R", c); // hoe
  const far = [...cells].sort((a, b) => b[0] - a[0]); // sow far to near so plants never block the aim
  for (const c of far) {
    g.select(cropSlot(c[0]));
    await use("R", c);
  }
  g.select(2);
  for (const c of cells) await use("R", c); // watering can
  log.afterSow = g.inv();
  g.teleport(p.x0 + 1.5, y + 1, p.z0 + 2.2, -Math.PI / 2 - 0.35, -0.5);
  await window.__shot("m3-sown");
  const refill = async () => {
    const w = g.landmarks().well; // well water sits two blocks down inside the cobble ring
    g.teleport(91.5, 16, 97.6, 0, -0.5); // looking at the well's rim from the path
    await wait(60);
    const t = g.target();
    const r = await g.right();
    if (!r?.ok) log.errors.push({ refill: t, r, w });
    log.refills = (log.refills ?? 0) + 1;
  };
  const waterAll = async () => {
    if ((g.inv().water ?? 0) < cells.length) await refill();
    for (const c of cells) await use("R", c, true);
  };
  await g.skip(0.5 * 10 * 60 * 1000); // half a game day
  await waterAll();
  await g.skip(0.45 * 10 * 60 * 1000);
  g.teleport(p.x0 + 1.5, y + 1, p.z0 + 2.2, -Math.PI / 2 - 0.35, -0.5);
  await window.__shot("m3-growing");
  log.unripe = await (async () => { await aim(...cells[4], true); return g.left(); })(); // sugarcane, far from ripe
  if (log.unripe?.ok) log.errors.push("harvested an unripe crop!");
  // keep watering through two more days so even sugarcane ripens
  // keep watering until the sugarcane (the slowest) is ripe too
  for (let i = 0; i < 16; i++) {
    const unripe = Object.values(g.farm()).some((f) => f.plant && f.plant.progress < 1);
    if (!unripe && i > 0) break;
    await waterAll();
    await g.skip(0.4 * 10 * 60 * 1000);
    log.rounds = i + 1;
  }
  g.teleport(p.x0 + 1.5, y + 1, p.z0 + 2.2, -Math.PI / 2 - 0.35, -0.5);
  await window.__shot("m3-ripe");
  log.tipsAtRipe = [];
  for (const c of [cells[0], cells[2], cells[4]]) { await aim(c[0], c[1], c[2], true); await wait(600); log.tipsAtRipe.push(document.querySelector(".tip").textContent); }
  g.select(0);
  const near = [...cells].sort((a, b) => a[0] - b[0]);
  const harvests = [];
  for (const c of near) {
    const t = await aim(c[0], c[1], c[2], true);
    const r = await g.left();
    harvests.push([c[0], c[2], t && [t.x, t.y, t.z, t.block], r?.ok ? r.msg : r?.error]);
  }
  log.harvests = harvests;
  log.inv = g.inv();
  g.teleport(p.x0 + 1.5, y + 1, p.z0 + 2.2, -Math.PI / 2 - 0.35, -0.5);
  await wait(300);
  return log;
})()
