// U3: the smart hand — plough, sow, water and harvest one tile with only the hand selected.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = { steps: [] };
  const phone = document.body.classList.contains("is-touch");
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  const p = g.starterPlot();
  g.select(0);
  g.teleport(p.x0 + 5.5, p.y + 1, p.z0 + 7.5, 0, -1.1); // looking down at the soil in front
  await wait(800);
  const t0 = g.target();
  log.target = t0 && [t0.x, t0.y, t0.z, t0.block];
  const use = async () => {
    if (phone) {
      const b = document.querySelector(".t-use");
      log.steps.push({ label: b.textContent });
      b.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true, touches: [], changedTouches: [] }));
      b.dispatchEvent(new TouchEvent("touchend", { bubbles: true }));
      await wait(250);
    } else {
      log.steps.push({ tip: document.querySelector(".tip")?.textContent });
      await g.right();
    }
    await wait(500);
    log.steps[log.steps.length - 1].after = g.target()?.block;
  };
  await use(); // plough
  await use(); // sow
  await use(); // water
  await g.skip(40 * 60 * 1000); // let it ripen
  await wait(900);
  await use(); // harvest
  await window.__shot(phone ? "u3p-after" : "u3-after");
  log.inv = Object.fromEntries(Object.entries(g.inv()).filter(([k]) => ["onion", "jowar", "water", "seed:onion"].includes(k)));
  await g.sync();
  log.net = g.netStatus();
  return log;
})()
