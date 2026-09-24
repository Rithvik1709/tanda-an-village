// The election mission through the UI: candidates, gram sabha, the choice dialogue, the vote.
(async () => { localStorage.setItem("tanda.mission.election", "1");
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  g.setHour(11);
  g.setView("third");
  await g.jumpMission(9, 60);
  await g.grant(3000);
  const closeStory = async () => { for (let i = 0; i < 10; i++) { const d = document.querySelector(".dialogue"); if (d && /Let's do it/.test(d.innerText)) { d.querySelector("button").click(); } await wait(150); } };
  await closeStory();
  const sc = g.landmarks().school;
  g.teleport(sc.x - 1, sc.y, sc.z - 6, Math.PI / 2 + 0.3, -0.1);
  await wait(900);
  await window.__shot("el-kamla");
  g.key("KeyE");
  await wait(300);
  await window.__shot("el-kamla-panel");
  g.closePanel();
  g.teleport(sc.x - 1, sc.y, sc.z + 6.5, Math.PI / 2, -0.1);
  await wait(500);
  g.key("KeyE");
  await wait(200);
  g.closePanel();
  g.teleport(sc.x + 0.3, sc.y, sc.z, Math.PI / 2 - 0.4, -0.1);
  await wait(700);
  log.hint1 = document.querySelector(".interact")?.textContent;
  // the gram sabha meets by day (server clock): wait for morning if need be
  for (let i = 0; i < 24; i++) {
    g.key("KeyE");
    await wait(400);
    if (!/9 am and 6 pm/.test([...document.querySelectorAll(".toast")].map((t) => t.textContent).join(" "))) break;
    await g.skip(25000);
    document.querySelectorAll(".toast").forEach((t) => t.remove());
  }
  await wait(1200);
  log.choice = document.querySelector(".dialogue")?.innerText.slice(0, 200);
  await window.__shot("el-choice");
  const self = [...document.querySelectorAll(".dialogue button")].find((b) => /Stand/.test(b.textContent));
  self?.click();
  await wait(500);
  log.hint2 = document.querySelector(".interact")?.textContent;
  g.key("KeyE"); // vote
  await wait(1500);
  log.result = document.querySelector(".dialogue")?.innerText.slice(0, 220);
  await window.__shot("el-result");
  document.querySelector(".dialogue button")?.click();
  await g.sync();
  const s = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { mission: s.save.missions.i, perks: s.save.perks, rep: s.save.rep };
  return log;
})()
