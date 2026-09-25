// U12: each language on the title screen, the HUD with a hint and a tip, the kaam list, help and settings.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const phone = document.body.classList.contains("is-touch");
  const lang = document.documentElement.lang;
  const tag = `u12${phone ? "p" : ""}-${lang}`;
  const log = { lang };
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  log.title = document.querySelector(".title-buttons")?.innerText.replace(/\s+/g, " ");
  await window.__shot(`${tag}-title`);
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  await g.jumpMission(1, 0); await wait(600); g.skipStory(); await wait(400);
  const p = g.starterPlot();
  g.select(0);
  g.teleport(p.x0 + 5.5, p.y + 1, p.z0 + 7.5, 0, -1.1);
  await wait(900);
  log.tip = document.querySelector(".tip")?.textContent;
  log.info = document.querySelector(".info")?.innerText.replace(/\s+/g, " ");
  log.slot = document.querySelector(".slot-label")?.textContent;
  const L = g.landmarks();
  g.teleport(L.spawn.x, 17, L.spawn.z, 0.25, -0.15);
  await wait(1200);
  log.hint = g.hint();
  document.querySelector(".kaam")?.classList.add("open");
  await wait(400);
  log.kaam = document.querySelector(".kaam")?.innerText.replace(/\s+/g, " ");
  await window.__shot(`${tag}-hud`);
  g.key("KeyH"); await wait(400);
  log.help = document.querySelector(".help")?.innerText.slice(0, 160).replace(/\s+/g, " ");
  await window.__shot(`${tag}-help`);
  g.key("KeyH"); await wait(300);
  g.openSettings(); await wait(300);
  log.settings = document.querySelector(".settings")?.innerText.slice(0, 220).replace(/\s+/g, " ");
  document.querySelector(".settings [data-close]")?.click();
  return log;
})()
