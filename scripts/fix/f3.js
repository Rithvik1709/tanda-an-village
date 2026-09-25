// F3: K opens and folds the kaam list; it starts open.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
  const log = {};
  localStorage.removeItem("tanda.kaam.open");
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  await g.jumpMission(1, 0); await wait(600); g.skipStory(); await wait(800);
  const el = () => document.querySelector(".kaam");
  log.visible = !el().hidden; log.startsOpen = el().classList.contains("open"); log.key = el().querySelector(".kaam-key")?.textContent;
  await window.__shot("f3-open");
  key("KeyK"); await wait(200); log.afterK = el().classList.contains("open"); log.saved = localStorage.getItem("tanda.kaam.open");
  await window.__shot("f3-folded");
  key("KeyK"); await wait(200); log.afterKK = el().classList.contains("open");
  return log;
})()
