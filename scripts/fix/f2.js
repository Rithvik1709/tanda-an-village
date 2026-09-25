// F2: story cards continue with E (not only Enter); choice cards take 1/2/3.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = (code) => { const o = { code, bubbles: true }; window.dispatchEvent(new KeyboardEvent("keydown", o)); document.dispatchEvent(new KeyboardEvent("keyup", o)); };
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.play(); await wait(1500);
  log.storyFoot = document.querySelector(".dialogue .panel-foot")?.textContent;
  log.storyOpen = !!document.querySelector(".dialogue");
  await window.__shot("f2-story");
  key("KeyE"); await wait(400);
  log.closedByE = !document.querySelector(".dialogue");
  // a neighbour with a job: two buttons
  g.setHour(10);
  const sp = g.jobs().spots ?? [];
  const k = g.landmarks().well;
  g.teleport(k.x + 3.4, k.y, k.z + 2.4, Math.PI, -0.1); await wait(700);
  g.interact(); await wait(400);
  log.jobButtons = [...document.querySelectorAll(".dialogue .big-acts button")].map((b) => b.textContent);
  log.jobFoot = document.querySelector(".dialogue .panel-foot")?.textContent;
  await window.__shot("f2-choice");
  key("KeyE"); await wait(300);
  log.eIgnoredOnChoice = !!document.querySelector(".dialogue");
  key("Digit2"); await wait(400);
  log.closedBy2 = !document.querySelector(".dialogue");
  return log;
})()
