// F5: nobody stands in the bank door; E goes to the nearest person; the neighbours greet you.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  const L = g.landmarks(), b = L.bank;
  log.tulsa = (g.jobs().spots ?? []).find?.((s) => s.id === "tulsa");
  // in the bank's doorway: E is the bank
  g.teleport(b.x - 1.2, b.y, b.z, Math.PI / 2, -0.1); await wait(900);
  log.atBankDoor = { stall: g.nearStall(), hint: document.querySelector(".interact")?.textContent };
  await window.__shot("f5-bank");
  g.teleport(b.x - 7, b.y, b.z, Math.PI / 2, -0.12); await wait(900);
  await window.__shot("f5-bank-wide");
  // at the well: the neighbours say Ram Ram
  const w = L.well;
  g.teleport(w.x - 1.5, w.y, w.z + 1.3, Math.PI, -0.1); await wait(700);
  log.wellHint = document.querySelector(".interact")?.textContent;
  g.interact(); await wait(400);
  log.greet = document.querySelector(".dialogue")?.innerText.replace(/\s+/g, " ").slice(0, 120);
  await window.__shot("f5-greet");
  // the sahukar's counter is in front of him now
  g.teleport(108.5, 17, 124.6, 0, -0.1); await wait(700);
  log.sahukar = { stall: g.nearStall(), hint: document.querySelector(".interact")?.textContent };
  return log;
})()
