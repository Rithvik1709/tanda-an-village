// U2: a quiet HUD — only the mission card, the cluster and the hotbar at first; the rest when it matters.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const shown = (sel) => { const e = document.querySelector(sel); return !!e && !e.hidden && getComputedStyle(e).display !== "none" && e.offsetParent !== null; };
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory(); g.autoSkipStory(false);
  g.setHour(10);
  const L = g.landmarks();
  g.teleport(L.spawn.x, 17, L.spawn.z, 0.25, -0.15);
  await wait(900);
  log.first = { info: document.querySelector(".info")?.innerText.replace(/\s+/g, " "), goods: shown(".goods"), kaam: shown(".kaam") };
  await window.__shot("u2-first");
  // after Mission 1: the kaam chip appears, folded
  await g.jumpMission(1, 0);
  await wait(900);
  g.skipStory();
  await wait(700);
  log.after1 = { kaam: shown(".kaam"), kaamText: document.querySelector(".kaam")?.innerText.replace(/\s+/g, " ") };
  // carrying produce: the counts appear
  g.tamperLocal("onion", 12);
  await wait(700);
  log.carrying = { goods: shown(".goods"), text: document.querySelector(".goods")?.innerText.replace(/\s+/g, " "), info: document.querySelector(".info")?.innerText.replace(/\s+/g, " ") };
  await window.__shot("u2-carrying");
  document.querySelector(".kaam")?.click();
  await wait(300);
  log.kaamOpened = document.querySelector(".kaam")?.classList.contains("open");
  await window.__shot("u2-kaam-open");
  document.querySelector(".kaam")?.click();
  return log;
})()
