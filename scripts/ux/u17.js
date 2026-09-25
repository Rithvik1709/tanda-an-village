// U17: analytics events — started, first harvest, first sale, mission done, returned on a later day.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  for (const k of Object.keys(localStorage)) if (k.startsWith("tanda.metric.")) localStorage.removeItem(k);
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  const p = g.starterPlot();
  const cells = Array.from({ length: 3 }, (_, i) => ({ x: p.x0 + 2 + i, y: p.y, z: p.z0 + 3 }));
  cells.forEach((c) => { g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "onion" }); g.act({ t: "water", ...c }); });
  await g.skip(30 * 60 * 1000); await wait(300);
  document.querySelector(".summary [data-go]")?.click();
  cells.forEach((c) => g.act({ t: "harvest", ...c })); await g.sync(); await wait(300);
  g.act({ t: "sell", item: "onion", n: g.inv().onion, where: "village" }); await g.sync(); await wait(300);
  // a second harvest is not a "first"
  cells.forEach((c) => { g.act({ t: "plant", ...c, crop: "onion" }); g.act({ t: "water", ...c }); });
  await g.skip(30 * 60 * 1000); cells.forEach((c) => g.act({ t: "harvest", ...c })); await g.sync(); await wait(300);
  g.jumpMission(2); await g.sync(); await wait(400);
  // same day again: nothing; a later day: returned
  g.arrive();
  const d = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  localStorage.setItem("tanda.metric.firstDay", d(2)); localStorage.setItem("tanda.metric.lastDay", d(1));
  g.arrive(); g.arrive();
  log.events = g.metrics().map((e) => `${e.name}${e.props.mission !== undefined && e.name === "mission_done" ? ":" + e.props.mission : ""}${e.props.days !== undefined ? ":" + e.props.days + "d" : ""}`);
  return log;
})()
