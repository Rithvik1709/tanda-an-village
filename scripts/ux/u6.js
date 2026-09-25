// U6: the payoff — harvest floats to the counts, money pops and counts up, the first harvest and sale celebrate.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  const p = g.starterPlot();
  g.select(0);
  g.teleport(p.x0 + 5.5, p.y + 1, p.z0 + 7.5, 0, -1.1);
  await wait(700);
  await g.right(); await wait(300); await g.right(); await wait(300); await g.right();
  await g.skip(40 * 60 * 1000);
  await wait(900);
  const f0 = performance.now();
  await g.right(); // harvest
  await wait(250);
  log.floaters = [...document.querySelectorAll(".floater")].map((f) => f.textContent);
  await window.__shot("u6-harvest");
  await wait(1200);
  log.toasts = [...document.querySelectorAll(".toast")].map((t) => t.textContent);
  g.openStall("trader", "sell");
  await wait(400);
  document.querySelector('[data-do="sellAll"]')?.click();
  g.closePanel();
  await wait(180);
  log.moneyMid = document.querySelector(".info .money")?.textContent;
  log.moneyFloat = [...document.querySelectorAll(".floater.money")].map((f) => f.textContent);
  await window.__shot("u6-money");
  await wait(1500);
  log.moneyEnd = document.querySelector(".info .money")?.textContent;
  log.real = g.money();
  log.toasts2 = [...document.querySelectorAll(".toast")].map((t) => t.textContent);
  log.frameMs = g.stats().medianFrameMs;
  return log;
})()
