// U5: sell everything in one tap — a mixed load of produce and fish, and the server agrees.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  // grow a real mixed load (the server must agree, so no tampering): onions and jowar from Aamrai
  const p = g.starterPlot();
  const cells = Array.from({ length: 8 }, (_, i) => ({ x: p.x0 + 2 + i, y: p.y, z: p.z0 + 3 }));
  cells.forEach((c, i) => { g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: i % 2 ? "jowar" : "onion" }); g.act({ t: "water", ...c }); });
  await g.skip(40 * 60 * 1000);
  cells.forEach((c) => g.act({ t: "harvest", ...c }));
  await g.sync();
  const before = { money: g.money(), inv: Object.fromEntries(Object.entries(g.inv()).filter(([k]) => ["onion", "jowar"].includes(k))) };
  log.before = before;
  g.openStall("trader", "sell");
  await wait(500);
  log.button = document.querySelector('[data-do="sellAll"]')?.textContent;
  await window.__shot("u5-sell");
  document.querySelector('[data-do="sellAll"]')?.click();
  await wait(500);
  log.after = { money: g.money(), gained: g.money() - before.money, left: Object.fromEntries(Object.entries(g.inv()).filter(([k]) => ["onion", "jowar"].includes(k))) };
  log.prices = [...document.querySelectorAll(".panel-body tbody tr td:nth-child(3)")].map((td) => td.textContent.trim());
  await window.__shot("u5-sold");
  await g.sync();
  const srv = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { money: srv.save.money, status: g.netStatus() };
  return log;
})()
