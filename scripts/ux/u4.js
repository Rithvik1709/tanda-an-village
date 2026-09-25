// U4: hold to work a row — plough, sow, water and harvest a row of Aamrai each in one hold, walking along it.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  g.select(0);
  const p = g.starterPlot();
  const z = p.z0 + 6;
  // (the camera sits over the shoulder, so the aimed row may be the one beside the farmer's: count every cell)
  const row = () => Object.entries(g.farm()).map(([k, f]) => ({ i: Number(k), f }));
  const sweep = async () => {
    g.teleport(p.x0 + 1.3, p.y + 1, z + 0.5, -Math.PI / 2, -0.95); // on the row, at its start, looking along it and down
    await wait(500);
    g.look(-Math.PI / 2, -0.95);
    g.useHold(true);
    g.setHeld("KeyW", true);
    await wait(3300);
    g.setHeld("KeyW", false);
    g.useHold(false);
    await wait(500);
  };
  await sweep();
  log.ploughed = row().length;
  log.rows = [...new Set(row().map((c) => Math.floor(c.i / 192) % 192))];
  await window.__shot("u4-ploughed");
  await sweep();
  log.sown = row().filter((c) => c.f.plant).length;
  await sweep();
  log.watered = row().filter((c) => c.f.wetUntil > Date.now()).length;
  await g.skip(40 * 60 * 1000);
  await wait(800);
  const inv0 = g.inv().onion ?? 0;
  await sweep();
  log.harvested = (g.inv().onion ?? 0) - inv0;
  log.leftPlanted = row().filter((c) => c.f.plant).length;
  log.toasts = [...document.querySelectorAll(".toast")].map((t) => t.textContent);
  await g.sync();
  log.net = g.netStatus();
  return log;
})()
