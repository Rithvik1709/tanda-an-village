// Bulls at home: buy pair + plough + gotha → P ploughs the field (drone view) → tie them in the gotha →
// water a patch with the can in hand → look into the well.
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.autoSkipStory(true);
  g.play();
  await wait(900);
  g.skipStory();
  g.setHour(10);
  g.setView("third");
  const log = {};
  await g.grant(20000);
  for (const item of ["bulls", "plough", "gotha", "fodder"]) g.act({ t: "buy", item, n: item === "fodder" ? 5 : 1 });
  await g.sync();
  const p = g.starterPlot();
  g.teleport(p.x0 + 3, p.y, p.z0 + 3, Math.PI * 0.75, -0.2);
  await wait(2500);
  log.hintInField = document.querySelector(".interact")?.textContent;
  g.key("KeyP");
  await wait(3200);
  log.ploughing = g.ploughing();
  await window.__shot("bulls-drone");
  await wait(3500);
  log.done = !g.ploughing();
  log.cells = Object.keys(g.farm()).length;
  await window.__shot("bulls-ploughed");
  // take them home and tie them
  const y = g.yard();
  g.teleport(y.x + 1.5, y.y, y.z + 1.5, 0, -0.2);
  await wait(3000);
  log.hintYard = document.querySelector(".interact")?.textContent;
  g.key("KeyG");
  await wait(2500);
  const yf = g.yardFace ? g.yardFace() : 0;
  g.setCamera([y.x - Math.sin(yf) * 5, y.y + 3.4, y.z - Math.cos(yf) * 5], [y.x, y.y + 1, y.z]);
  await wait(600);
  await window.__shot("bulls-gotha");
  g.teleport(y.x + 20, y.y, y.z + 20, 0, 0); // walk away: tied bulls stay put
  await wait(1500);
  log.stayed = Math.hypot(g.farmyard().pos.x - y.x, g.farmyard().pos.z - y.z) < 3;
  // water with the can in hand
  g.select(2);
  const well = g.landmarks().well;
  g.setView("first");
  g.teleport(p.x0 + 5.5, p.y, p.z0 + 3.5, 0, -0.6); // inside the field, facing a ploughed row
  await wait(150);
  log.water = (await g.right())?.ok;
  g.setView("third");
  const me = g.player();
  g.setCamera([me.x + 2.4, me.y + 1.6, me.z - 1.0], [me.x, me.y + 0.8, me.z - 0.8]);
  await wait(120);
  await window.__shot("bulls-can");
  g.setCamera([well.x + 2.6, well.y + 2.2, well.z + 1.2], [well.x + 0.5, well.y, well.z - 1.5]);
  await wait(800);
  await window.__shot("well");
  const s = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { tied: s.save.bulls.tied, sheltered: s.save.bulls.sheltered, farm: Object.keys(s.save.farm).length };
  return log;
})()
