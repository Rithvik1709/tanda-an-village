// Missions 1–3 through the real UI: story dialogue → objectives → reward dialogue → next mission.
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const dlg = () => document.querySelector(".dialogue");
  const clickDlg = async () => { const b = document.querySelector(".dialogue button"); if (b) { b.click(); await wait(200); return true; } return false; };
  const card = () => document.querySelector(".goal")?.innerText.replace(/\s+/g, " ");
  const log = { steps: [] };
  g.setHour(9.5);
  g.setView("first");
  const lo = g.landmarks().landOffice;
  g.teleport(lo.x + 3, lo.y, lo.z + 1.5, Math.PI / 2, -0.05);
  await wait(900);
  log.steps.push({ story1: dlg()?.innerText.slice(0, 120) });
  await window.__shot("mi-story1");
  await clickDlg();
  log.steps.push({ card1: card() });
  await window.__shot("mi-card1");
  g.openStall("land");
  await wait(200);
  g.closePanel();
  // walk into Aamrai (the plot-entry hook reports the visit) and plough 6
  const p = g.starterPlot(), y = p.y;
  g.teleport(p.x0 + 2.5, y, p.z0 + 2.5, 0, -0.9);
  await wait(900);
  g.select(1);
  for (let i = 0; i < 6; i++) {
    const c = [p.x0 + 2 + i, y, p.z0 + 4];
    const sx = c[0] + 0.5, sz = c[2] - 1.5, e = { x: sx, y: y + 1.62, z: sz };
    const dx = c[0] + 0.5 - e.x, dy = c[1] + 0.9 - e.y, dz = c[2] + 0.5 - e.z;
    g.teleport(sx, y, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(60);
    await g.right();
  }
  await wait(1200);
  log.steps.push({ reward1: dlg()?.innerText.slice(0, 160), money: g.money() });
  await window.__shot("mi-reward1");
  await clickDlg();
  await wait(900);
  log.steps.push({ story2: dlg()?.innerText.slice(0, 100) });
  await clickDlg();
  log.steps.push({ card2: card() });
  await window.__shot("mi-card2");
  await g.sync();
  const s = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { mission: s.save.missions.i, money: s.save.money, onionSeeds: s.save.inv["seed:onion"] };
  return log;
})()
