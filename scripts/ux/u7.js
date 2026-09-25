// U7: the morning card after sleeping, and the welcome-back card after being away.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  // a day's work: a crop harvested and sold, seeds bought, a kabaddi win
  const p = g.starterPlot();
  const cells = Array.from({ length: 6 }, (_, i) => ({ x: p.x0 + 2 + i, y: p.y, z: p.z0 + 3 }));
  cells.forEach((c) => { g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "onion" }); g.act({ t: "water", ...c }); });
  await g.skip(30 * 60 * 1000);
  cells.forEach((c) => g.act({ t: "harvest", ...c }));
  g.act({ t: "sell", item: "onion", n: g.inv().onion, where: "village" });
  g.act({ t: "buy", item: "seed:jowar", n: 5 });
  g.act({ t: "kabaddi", won: true });
  // sow again so the morning has something growing
  cells.forEach((c) => g.act({ t: "plant", ...c, crop: "jowar" }));
  await g.sync();
  // on to the evening, then sleep
  for (let i = 0; i < 80; i++) { const h = g.clockNow().hour; if (h >= 20 && h < 23) break; await g.skip(15000); }
  g.setHour(null);
  g.key("KeyZ");
  await wait(4200);
  log.morning = document.querySelector(".summary")?.innerText.replace(/\s+/g, " ").trim();
  await window.__shot("u7-morning");
  document.querySelector(".summary [data-go]")?.click();
  await wait(400);
  // come back "three hours later"
  g.showAway(3 * 3600e3);
  await wait(1200);
  log.away = document.querySelector(".summary")?.innerText.replace(/\s+/g, " ").trim();
  await window.__shot("u7-away");
  return log;
})()
