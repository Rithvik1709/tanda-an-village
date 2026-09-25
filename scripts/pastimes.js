// Pastimes: the maidan and talav behind the school, a job from a neighbour, fishing, and a kabaddi match.
//   node scripts/shots.mjs --name pastimes-end --eval "$(cat scripts/pastimes.js)"
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const id of ["homecoming", "firstcrop", "water", "order", "bulls"]) localStorage.setItem("tanda.mission." + id, "1");
  localStorage.setItem("tanda.welcomed", "1");
  const log = {};
  g.setView("third");
  g.play();
  g.autoSkipStory(true);
  await wait(400);
  g.skipStory();
  g.setHour(10.5);
  const L = g.landmarks();
  // the view from the school's back wall: the maidan, the bund, the talav and the tekdi behind
  const ui = document.getElementById("ui");
  ui.style.display = "none"; // scenery shots without the HUD
  g.setCamera([L.school.x + 6, L.school.y + 14, L.school.z + 22], [L.talav.x - 4, L.talav.y - 4, L.talav.z - 1]);
  await wait(1500);
  await window.__shot("pastimes-overview");
  g.setCamera([L.talav.x + 9, L.talav.y + 6, L.talav.z + 7], [L.kabaddi.x + 2, L.kabaddi.y, L.kabaddi.z + 2]);
  await wait(900);
  await window.__shot("pastimes-from-tekdi");
  g.setCamera([L.kabaddi.x - 3, L.kabaddi.y + 3.2, L.kabaddi.z + 3], [L.kabaddi.x + 5, L.kabaddi.y, L.kabaddi.z + 4]);
  await wait(900);
  await window.__shot("pastimes-court");
  g.setCamera([L.talav.x - 1, L.talav.y + 2.2, L.talav.z - 4.5], [L.talav.x + 5, L.talav.y - 0.6, L.talav.z + 1]);
  await wait(900);
  await window.__shot("pastimes-talav");
  ui.style.display = "";

  // ---- kaam: walk up to a neighbour with a job ----
  const J = g.jobs();
  log.today = J.today.jobs.map((j) => `${j.slot}:${j.kind}:${j.who}:${j.pay}`);
  const first = J.today.jobs[0];
  const giver = J.givers.find((x) => x.id === first.who);
  g.teleport(giver.x + 1.6, 17, giver.z + 1.6, Math.atan2(1.6, 1.6), -0.15);
  await wait(900);
  log.giverHint = g.hint();
  await window.__shot("pastimes-giver");
  g.autoSkipStory(false);
  g.interact();
  await wait(500);
  log.dialogue = document.querySelector(".dialogue")?.innerText.slice(0, 220);
  await window.__shot("pastimes-ask");
  document.querySelector(".dialogue button")?.click();
  await wait(300);
  g.skipStory();
  // the goat, if Chinki is today's job: find her, call her, bring her home
  if (first.kind === "goat") {
    const goat = g.jobs().goat;
    g.teleport(goat.x + 1.5, 17, goat.z + 1.5, Math.atan2(1.5, 1.5), -0.3);
    await wait(900);
    log.goatHint = g.hint();
    await window.__shot("pastimes-goat");
    g.interact();
    await wait(300);
    log.following = g.jobs().goat.following;
    g.teleport(giver.x + 1.6, 17, giver.z + 1.6, Math.atan2(1.6, 1.6), -0.15);
    await wait(1200);
    log.goatBack = g.hint();
    g.interact();
    await wait(400);
    document.querySelector(".dialogue button")?.click(); // Here she is
    await wait(500);
    log.goatThanks = document.querySelector(".dialogue")?.innerText.slice(0, 120);
    await window.__shot("pastimes-goat-home");
    document.querySelector(".dialogue button")?.click();
    await wait(300);
    log.jobsDone = g.jobs().today.done;
    log.moneyAfterGoat = g.money();
  }

  // ---- fishing ----
  await g.grant(2000);
  log.buyRod = g.act({ t: "buy", item: "rod", n: 1 });
  await g.sync();
  g.teleport(L.talav.x, L.talav.y, L.talav.z, -Math.PI / 2, -0.25); // on the bund, looking east over the water
  await wait(800);
  log.fishHint = g.hint();
  g.interact();
  await wait(900);
  log.fishState = g.fishing();
  await window.__shot("pastimes-cast");
  // wait for the bite, strike, and reel carefully (hold, ease off, hold…)
  for (let i = 0; i < 100 && g.fishing().state === "wait"; i++) await wait(100);
  log.biteState = g.fishing().state;
  await window.__shot("pastimes-bite");
  g.fishPress();
  let shot = false;
  for (let i = 0; i < 60 && g.fishing().state === "reel"; i++) {
    const surge = document.querySelector(".fishing.surge");
    const hot = document.querySelector(".tension.hot");
    if (!surge && !hot) await g.hold("Space", 250);
    else await wait(250);
    if (!shot && i > 4) {
      await window.__shot("pastimes-reel");
      shot = true;
    }
  }
  log.afterReel = g.fishing().state;
  await wait(300);
  await window.__shot("pastimes-catch");
  log.fishInv = Object.fromEntries(Object.entries(g.inv()).filter(([k]) => k.startsWith("fish:")));
  log.toasts1 = [...document.querySelectorAll(".toast")].map((t) => t.textContent);
  await wait(2000);

  // ---- kabaddi ----
  g.teleport(L.kabaddi.x + 1.5, L.kabaddi.y, L.kabaddi.z, Math.PI, -0.2);
  await wait(900);
  log.kabHint = g.hint();
  await window.__shot("pastimes-boys");
  g.interact();
  await wait(500);
  log.kabRules = document.querySelector(".dialogue")?.innerText.slice(0, 120);
  document.querySelector(".dialogue button")?.click(); // Let's play!
  await wait(2200);
  log.kabStart = g.kabaddi().phase;
  // raid 1: run straight in, tag whoever is close, run back
  await g.hold("KeyW", 700);
  await window.__shot("pastimes-raid");
  g.kabaddiTag();
  await wait(100);
  const mid = g.kabaddi();
  log.midRaid = { phase: mid.phase, crossed: mid.crossed, tags: mid.tags, breath: mid.breath };
  await Promise.all([g.hold("KeyS", 900), g.hold("ShiftLeft", 900)]); // sprint back over the line
  await wait(1800);
  log.afterRaid1 = (({ phase, raid, us, them }) => ({ phase, raid, us, them }))(g.kabaddi());
  await window.__shot("pastimes-raid-result");
  // their raid: stand and try to tackle
  for (let i = 0; i < 40 && g.kabaddi().phase !== "their"; i++) await wait(100);
  await wait(900);
  await window.__shot("pastimes-defend");
  for (let i = 0; i < 20; i++) {
    g.kabaddiTag();
    await wait(200);
  }
  log.afterRaid2 = (({ phase, raid, us, them }) => ({ phase, raid, us, them }))(g.kabaddi());
  log.prof = (({ calls, triangles, frame }) => ({ calls, triangles, frame: +frame.toFixed(1) }))(g.prof());
  log.stats = g.stats();
  // the server re-checked every job, cast and sale: its save must match ours
  await g.sync();
  const srv = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { status: g.netStatus(), money: srv.save.money, local: g.money(), fish: Object.fromEntries(Object.entries(srv.save.inv).filter(([k]) => k.startsWith("fish:"))), jobs: srv.save.jobs, fishing: srv.save.fishing, rod: srv.save.inv.rod };
  return log;
})()
