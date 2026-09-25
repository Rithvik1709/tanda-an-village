// U1: the mission card teaches each step: welcome → plough → sow → water, each with a "how" line.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  const card = () => document.querySelector(".goal")?.innerText.replace(/\s+/g, " ").trim();
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.removeItem("tanda.welcomed");
  document.querySelector(".title-screen button")?.click(); // Start farming
  await wait(900);
  log.welcome = document.querySelector(".welcome")?.innerText.replace(/\s+/g, " ").trim();
  await window.__shot("u1-welcome");
  document.querySelector(".welcome [data-go]")?.click();
  await wait(900);
  document.querySelector(".dialogue button")?.click();
  await wait(500);
  g.play();
  await wait(600);
  log.m1 = card();
  await window.__shot("u1-m1");
  // finish mission 1, into mission 2
  g.act({ t: "talk", npc: "naik" }); g.act({ t: "visit", place: "aamrai" });
  const p = g.starterPlot();
  for (let i = 0; i < 6; i++) g.act({ t: "till", x: p.x0 + 2 + i, y: p.y, z: p.z0 + 3 });
  await wait(1200);
  g.skipStory(); await wait(400); g.skipStory(); await wait(600);
  log.m2start = card();
  g.teleport(p.x0 + 4, p.y + 1, p.z0 + 6, Math.PI, -0.5);
  await wait(700);
  await window.__shot("u1-m2-sow");
  for (let i = 0; i < 6; i++) g.act({ t: "plant", x: p.x0 + 2 + i, y: p.y, z: p.z0 + 3, crop: "onion" });
  await wait(700);
  log.m2water = card();
  for (let i = 0; i < 6; i++) g.act({ t: "water", x: p.x0 + 2 + i, y: p.y, z: p.z0 + 3 });
  await wait(700);
  log.m2harvest = card();
  await g.sync();
  const srv = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { mission: srv.save.missions.i, plant: srv.save.missions.c["plant:onion"], water: srv.save.missions.c.water };
  return log;
})()
