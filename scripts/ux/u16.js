// U16: a gold spark over each ripe crop in your own fields; Settings → Reduce motion stops confetti and bobbing.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory(); g.autoSkipStory(false);
  const p = g.starterPlot();
  const ripe = Array.from({ length: 5 }, (_, i) => ({ x: p.x0 + 2 + i, y: p.y, z: p.z0 + 3 }));
  const young = Array.from({ length: 5 }, (_, i) => ({ x: p.x0 + 2 + i, y: p.y, z: p.z0 + 5 }));
  ripe.forEach((c, i) => { g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: i % 2 ? "jowar" : "onion" }); g.act({ t: "water", ...c }); });
  await g.skip(3 * 24 * 3600e3 / 48); // well past ripe for onion and jowar at game speed
  young.forEach((c) => { g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "onion" }); });
  await g.sync(); await wait(900);
  g.setHour(10);
  log.marks = g.ripeMarks();
  document.querySelector(".summary [data-go]")?.click(); await wait(300);
  g.teleport(p.x0 + 4.5, p.y, p.z0 + 10, 0, -0.35); await wait(1200);
  await window.__shot("u16-sparks");
  // confetti on, then reduce motion
  g.celebrate(); log.confettiOn = g.confetti();
  await wait(100);
  g.openSettings(); await wait(300);
  const box = document.querySelector('.settings input[name="calm"]');
  log.boxFound = !!box;
  box.checked = true; box.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector(".settings [data-close]")?.click();
  log.saved = JSON.parse(localStorage.getItem("bailgaadi.settings")).reduceMotion;
  log.htmlClass = document.documentElement.classList.contains("reduce-motion");
  await wait(6500); // old confetti falls away
  g.celebrate(); log.confettiCalm = g.confetti();
  log.marksStill = g.ripeMarks();
  return log;
})()
