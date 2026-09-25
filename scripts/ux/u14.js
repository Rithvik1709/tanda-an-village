// U14: picture cards the first time you fish and play kabaddi (once), easy fishing in Settings, hold to tag.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  localStorage.removeItem("tanda.howto.fishing"); localStorage.removeItem("tanda.howto.kabaddi");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory(); g.autoSkipStory(false);
  g.setHour(10);
  await g.grant(500); g.act({ t: "buy", item: "rod", n: 1 }); await g.sync();
  const L = g.landmarks();
  // easy fishing on
  g.openSettings(); await wait(300);
  const box = document.querySelector('.settings input[name="easyfish"]');
  box.checked = true; box.dispatchEvent(new Event("input", { bubbles: true }));
  document.querySelector(".settings [data-close]")?.click();
  log.easySaved = JSON.parse(localStorage.getItem("bailgaadi.settings")).easyFishing;
  // first cast: the card, then the cast
  g.teleport(L.talav.x, L.talav.y, L.talav.z, -Math.PI / 2, -0.25); await wait(700);
  g.interact(); await wait(500);
  log.fishCard = document.querySelector(".howto:not([hidden]) h2")?.textContent;
  await window.__shot("u14-fishcard");
  document.querySelector(".howto [data-go]")?.click(); await wait(800);
  log.castAfterCard = g.fishing().state;
  g.fishPress(); await wait(300); // reel in
  g.teleport(L.talav.x, L.talav.y, L.talav.z, -Math.PI / 2, -0.25); await wait(400);
  g.interact(); await wait(500);
  log.secondTimeCard = !!document.querySelector(".howto:not([hidden])");
  log.secondCast = g.fishing().state;
  g.fishPress(); await wait(300);
  // kabaddi: the card once, then a raid where holding tags
  g.teleport(L.kabaddi.x + 1.5, L.kabaddi.y, L.kabaddi.z, Math.PI, -0.22); await wait(800);
  g.interact(); await wait(500);
  log.kabCard = document.querySelector(".howto:not([hidden]) h2")?.textContent;
  await window.__shot("u14-kabcard");
  document.querySelector(".howto [data-go]")?.click(); await wait(2200);
  g.useHold(true);
  g.setHeld("KeyW", true); await wait(800); g.setHeld("KeyW", false);
  await wait(200);
  const k = g.kabaddi();
  log.raid = { phase: k.phase, crossed: k.crossed, tags: k.tags };
  g.useHold(false);
  return log;
})()
