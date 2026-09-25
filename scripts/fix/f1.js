// F1: the cart card says why the bulls won't go, and feeds them from the card.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  await g.grant(6000);
  log.bulls = g.act({ t: "buy", item: "bulls", n: 1 }).ok; log.cart = g.act({ t: "buy", item: "cart", n: 1 }).ok;
  await g.sync();
  const s = g.local();
  s.bulls.mood = 10; s.inv.jowar = 60; delete s.inv.fodder;
  g.openStall("cart"); await wait(400);
  const btn = () => document.querySelector('.panel [data-do="setOff"]');
  log.noFodder = { text: btn()?.textContent, disabled: btn()?.disabled, why: document.querySelector(".cart-stuck")?.innerText.replace(/\s+/g, " ") };
  await window.__shot("f1-nofodder");
  s.inv.fodder = 2;
  g.closeWindows?.(); document.querySelector(".panel .x")?.click(); await wait(200);
  g.openStall("cart"); await wait(400);
  await window.__shot("f1-fodder");
  document.querySelector('.panel [data-do="feed"]')?.click(); await wait(400);
  log.afterFeed = { mood: Math.round(g.local().bulls.mood), text: btn()?.textContent, disabled: btn()?.disabled, stuck: !!document.querySelector(".cart-stuck") };
  await window.__shot("f1-fed");
  return log;
})()
