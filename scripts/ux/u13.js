// U13: the new sounds are real (not silent); the bell at 6:30 pm; sleep beats a closed stall at night; a ripe chime.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  const rms = await g.audioSelfTest();
  log.rms = { templebell: rms.templebell, rooster: rms.rooster, ripe: rms.ripe };
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  // a crop in Aamrai, and stand beside it
  const p = g.starterPlot();
  const c = { x: p.x0 + 3, y: p.y, z: p.z0 + 3 };
  g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "onion" }); g.act({ t: "water", ...c });
  g.teleport(p.x0 + 4, p.y + 1, p.z0 + 5, 0, -0.3);
  g.setHour(10);
  await wait(1200);
  await g.skip(30 * 60 * 1000);
  await wait(1500);
  log.ripeToast = [...document.querySelectorAll(".toast")].map((t) => t.textContent).find((t) => t.includes("ripe"));
  // dusk: the bell
  g.setHour(18.3); await wait(700); g.setHour(18.6); await wait(900);
  log.bellToast = [...document.querySelectorAll(".toast")].map((t) => t.textContent).find((t) => t.includes("bell"));
  // night by Sitabai's closed stall
  g.setHour(null);
  for (let i = 0; i < 80; i++) { const h = g.clockNow().hour; if (h >= 20 && h < 23) break; await g.skip(15000); }
  const L = g.landmarks();
  g.teleport(L.seedShop.x + 0.5, 17, L.seedShop.z - 0.5, 0, -0.1);
  await wait(1100);
  log.nightHint = g.hint();
  return log;
})()
