// U9: pick a place on the map; the arrow guides you there; it clears when you arrive.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const phone = document.body.classList.contains("is-touch");
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  // a ripe crop in Aamrai so the map can show it
  const p = g.starterPlot();
  const c = { x: p.x0 + 3, y: p.y, z: p.z0 + 3 };
  g.act({ t: "till", ...c }); g.act({ t: "plant", ...c, crop: "onion" }); g.act({ t: "water", ...c });
  await g.skip(30 * 60 * 1000);
  const L = g.landmarks();
  g.teleport(L.spawn.x, 17, L.spawn.z, 0.25, -0.15);
  await wait(600);
  g.showMap();
  await wait(600);
  await window.__shot(phone ? "u9p-map" : "u9-map");
  // click the talav on the map
  const cv = document.querySelector(".mapview canvas"), b = cv.getBoundingClientRect();
  const W = 192;
  const tx = b.left + (L.talav.x / W) * b.width, tz = b.top + (L.talav.z / W) * b.height;
  cv.dispatchEvent(new MouseEvent("click", { clientX: tx, clientY: tz, bubbles: true }));
  await wait(700);
  log.mapClosed = document.querySelector(".mapview")?.hidden;
  log.arrow = document.querySelector(".goal-arrow")?.textContent;
  log.toast = [...document.querySelectorAll(".toast")].map((t) => t.textContent).pop();
  await window.__shot(phone ? "u9p-arrow" : "u9-arrow");
  // walk there (teleport close) and it clears
  g.teleport(L.talav.x + 0.5, L.talav.y, L.talav.z, 0, -0.2);
  await wait(900);
  log.arrived = [...document.querySelectorAll(".toast")].map((t) => t.textContent).pop();
  log.arrowAfter = document.querySelector(".goal-arrow")?.textContent;
  return log;
})()
