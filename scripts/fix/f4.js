// F4: a drip set installs itself when bought (and a spare one on entering the game).
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  await g.grant(8000); await wait(300);
  const p = g.starterPlot();
  const c = { x: p.x0 + 2, y: p.y, z: p.z0 + 2 };
  g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "onion" });
  g.openStall("shop"); await wait(400);
  const btn = document.querySelector('.panel [data-do="buy"][data-item="drip"]');
  log.button = !!btn;
  btn?.click(); await wait(500);
  log.toast = [...document.querySelectorAll(".toast")].map((t) => t.textContent).slice(-2);
  const s = g.local();
  log.drip = s.drip; log.invDrip = s.inv.drip ?? 0;
  const k = Object.keys(s.farm).find((k) => s.farm[k].plant);
  log.wetForever = s.farm[k].wetUntil > Date.now() + 1e12;
  await g.sync(); log.server = (await g.sync()) ?? null;
  await window.__shot("f4-bought");
  return log;
})()
