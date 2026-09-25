// F8: offering buttons stop at the count and say so; the rules refuse more.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  await g.jumpMission(5, 0); await wait(600); g.skipStory(); await wait(300);
  g.setHour(10);
  // grow real produce (the server checks what you carry): 14 jowar, 4 onions
  const p = g.starterPlot();
  const row = (z, n) => Array.from({ length: n }, (_, i) => ({ x: p.x0 + 1 + i, y: p.y, z }));
  const J = row(p.z0 + 2, 7).concat(row(p.z0 + 4, 7)), O = row(p.z0 + 6, 4);
  await g.grant(500); g.act({ t: "buy", item: "seed:jowar", n: 14 });
  J.forEach((c) => { g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "jowar" }); g.act({ t: "water", ...c }); });
  O.forEach((c) => { g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "onion" }); g.act({ t: "water", ...c }); });
  await g.skip(4 * 24 * 3600e3 / 48); await wait(300);
  document.querySelector(".summary [data-go]")?.click();
  [...J, ...O].forEach((c) => g.act({ t: "harvest", ...c })); await g.sync(); await wait(300);
  g.setHour(10);
  log.have = { jowar: g.inv().jowar, onion: g.inv().onion, mission: g.local().missions.i };
  g.openStall("mandir"); await wait(400);
  const btns = () => [...document.querySelectorAll(".panel tbody button")].map((b) => `${b.textContent}${b.disabled ? " (off)" : ""}`);
  log.mission = document.querySelector(".panel h2")?.textContent;
  log.before = btns();
  document.querySelector('.panel [data-do="deliver:mandir:jowar"]')?.click(); await wait(300);
  document.querySelector('.panel [data-do="deliver:mandir:onion"]')?.click(); await wait(300);
  log.after = btns(); log.inv = { jowar: g.local().inv.jowar, onion: g.local().inv.onion ?? 0 };
  log.rows = [...document.querySelectorAll(".panel tbody tr")].map((r) => r.innerText.replace(/\s+/g, " "));
  await window.__shot("f8-mandir");
  return log;
})()
