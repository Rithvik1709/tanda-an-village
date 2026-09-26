// Majoor: hire a labourer at the mukadam's in the morning, give the order once he's over, and watch them sow.
//   node scripts/shots.mjs --name helpers-end --eval "$(cat scripts/helpers.js)"
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const id of ["homecoming", "firstcrop", "water", "order", "bulls"]) localStorage.setItem("tanda.mission." + id, "1");
  localStorage.setItem("tanda.welcomed", "1");
  const log = {};
  try {
  g.setView("third");
  g.play();
  g.autoSkipStory(true);
  await wait(400);
  g.skipStory();
  await g.grant(20000);
  const EPOCH = Date.UTC(2026, 8, 24), DAY = 600000, HOUR = (0.78 * DAY) / 13.5;
  {
    // to 8 am, whatever the real clock says
    const t = Date.now() + (await g.skip(0));
    await g.skip(EPOCH + (Math.floor((t - EPOCH) / DAY) + 1) * DAY + 2 * HOUR - t);
    await wait(800);
  }
  const click = async (text) => {
    const b = [...document.querySelectorAll(".dialogue button")].find((x) => x.innerText.includes(text));
    if (!b) {
      (log.errors ??= []).push(`no button "${text}" · dialogue: ${document.querySelector(".dialogue")?.innerText?.slice(0, 200)} · hint: ${g.hint()} · pos ${JSON.stringify(g.helpers().crew)}`);
      return;
    }
    b.click();
    await wait(250);
  };
  // one field isn't enough
  const H = g.helpers();
  g.teleport(H.mukadam.x + 1.7, 17, H.mukadam.z + 0.3, Math.atan2(1.7, 0.3), -0.1);
  await wait(900);
  log.mukadamHint = g.hint();
  log.mukadamAt = H.mukadam;
  log.oneField = g.act({ t: "hire", who: "sakharam" });
  // buy a second field
  for (let id = 0; id < g.plots && g.land().owned.length < 2; id++) g.act({ t: "buyPlot", plot: id });
  log.owned = g.land().owned;
  // hoe a few rows of Aamrai
  const p = g.starterPlot();
  let tilled = 0;
  for (let z = p.z0 + 2; z < p.z0 + 5; z++) for (let x = p.x0 + 2; x < p.x0 + 10; x++) if (g.act({ t: "till", x, y: p.y, z }).ok) tilled++;
  log.tilled = tilled;
  g.autoSkipStory(false);
  g.skipStory();
  g.interact();
  await wait(400);
  log.hireDialogue = document.querySelector(".dialogue")?.innerText.slice(0, 400);
  await window.__shot("helpers-mukadam");
  await click("Hire Vithoba");
  log.afterHire = { money: g.money(), hires: g.helpers().hires };
  // hired at 8 am, he walks over the same morning: an hour on, he's in the aangan
  log.onTheWay = g.helpers().crew.find((c) => c.id === "vithoba");
  await wait(3000);
  await window.__shot("helpers-on-the-way");
  await g.skip(HOUR * 1.1);
  await wait(1500);
  const v = g.helpers().crew.find((c) => c.id === "vithoba");
  log.morning = v;
  g.teleport(v.x - 1.4, 17, v.z + 0.8, Math.atan2(-1.4, 0.8), -0.15);
  await wait(1200);
  log.waitingHint = g.hint();
  await window.__shot("helpers-aangan");
  g.interact();
  await wait(300);
  await click("Sow seeds");
  await click("Aamrai");
  log.seedDialogue = document.querySelector(".dialogue")?.innerText.slice(0, 400);
  await window.__shot("helpers-seeds");
  await click("Hand over");
  log.order = g.helpers().hires[0].job;
  // a couple of game hours later
  await wait(3000);
  log.walking = g.helpers().crew.find((c) => c.id === "vithoba");
  await g.skip(HOUR * 1.2);
  await wait(9000);
  const w = g.helpers().crew.find((c) => c.id === "vithoba");
  log.working = { ...w, job: g.helpers().hires[0].job };
  log.plantedCells = Object.values(g.farm()).filter((c) => c.plant).length;
  g.teleport(w.x + 1.2, 17, w.z + 1.2, Math.atan2(1.2, 1.2), -0.3);
  await wait(1500);
  log.workingHint = g.hint();
  await window.__shot("helpers-field");
  await wait(4000);
  const w2 = g.helpers().crew.find((c) => c.id === "vithoba");
  log.later = w2;
  log.laterHint = (g.teleport(w2.x + 1.3, 17, w2.z + 1.3, Math.atan2(1.3, 1.3), -0.35), await wait(1200), g.hint());
  await window.__shot("helpers-sowing");
  await wait(2500); // let the server sync
  log.net = g.netStatus();
  } catch (e) {
    log.fatal = String(e);
  }
  return log;
})();
