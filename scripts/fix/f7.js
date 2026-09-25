// F7: E by the fire sits you in the circle; moving stands you up; the hint changes after tonight's visit.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (code) => window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  for (let i = 0; i < 80; i++) { const h = g.clockNow().hour; if (h >= 19.5 && h < 22) break; await g.skip(15000); }
  document.querySelector(".summary [data-go]")?.click();
  g.setHour(20);
  const f = g.places().fire;
  g.teleport(f.x + 2.6, f.y, f.z + 0.4, Math.PI / 2 + Math.PI, -0.2); await wait(900);
  log.hintBefore = document.querySelector(".interact")?.textContent;
  g.interact(); await wait(600);
  log.dialogue = !!document.querySelector(".dialogue");
  key("KeyE"); await wait(400);
  log.seated = g.seat(); log.distFire = +Math.hypot(g.player().x - f.x, g.player().z - f.z).toFixed(2);
  log.hintSeated = document.querySelector(".interact")?.textContent;
  g.teleport; await window.__shot("f7-sitting");
  g.setHeld("KeyW", true); await wait(150); g.setHeld("KeyW", false); await wait(500);
  log.afterMove = g.seat();
  log.hintAfter = document.querySelector(".interact")?.textContent;
  g.interact(); await wait(500);
  log.again = { seated: g.seat(), dialogue: !!document.querySelector(".dialogue") };
  return log;
})()
