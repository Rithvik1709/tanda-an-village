// F6: up the tanki — E at the ladder's foot climbs, you sit on the roof, moving climbs down.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(17.2);
  const L = g.places().ladder;
  g.teleport(L.x - 1.2, 30, L.z, -Math.PI / 2 + Math.PI, -0.05); await wait(1200);
  log.footHint = document.querySelector(".interact")?.textContent;
  await window.__shot("f6-foot");
  g.interact(); await wait(1500);
  log.climbing = g.seat();
  await window.__shot("f6-climbing");
  await wait(5500);
  log.top = g.seat(); log.topHint = document.querySelector(".interact")?.textContent;
  await window.__shot("f6-top");
  g.setHeld("KeyW", true); await wait(200); g.setHeld("KeyW", false);
  await wait(1000); log.goingDown = g.seat();
  await wait(5000); log.down = g.seat(); log.at = g.player();
  await window.__shot("f6-down");
  return log;
})()
