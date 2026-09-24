// A night in Ukhali: wait for evening (server clock), sit with friends, go home, sleep, wake at 6 am.
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (const id of ["homecoming", "firstcrop"]) localStorage.setItem("tanda.mission." + id, "1");
  const log = {};
  g.setView("third");
  g.play();
  await wait(500);
  document.querySelector(".dialogue button")?.click();
  // fast-forward the server clock to about 8:30 pm
  const h0 = g.clockNow().hour;
  await g.skip((((20.5 - h0 + 24) % 24) / 24) * 10 * 60 * 1000);
  log.evening = g.clockNow();
  const { door, fire } = g.home();
  g.teleport(fire.x + 2.2, fire.y, fire.z + 2.4, Math.atan2(2.2, 2.4), -0.2);
  await wait(1200);
  log.fireHint = document.querySelector(".interact")?.textContent;
  g.setView("third");
  g.setCamera([fire.x + 4, fire.y + 2.2, fire.z + 4], [fire.x, fire.y + 0.6, fire.z]);
  await wait(800);
  await window.__shot("night-fire");
  g.teleport(fire.x + 2.2, fire.y, fire.z + 2.4, Math.atan2(2.2, 2.4), -0.2);
  await wait(300);
  g.key("KeyE");
  await wait(600);
  log.fireside = document.querySelector(".dialogue")?.innerText.slice(0, 160);
  await window.__shot("night-friends");
  document.querySelector(".dialogue button")?.click();
  await wait(300);
  // walk to the door and sleep
  g.teleport(door.x, door.y, door.z, 0, -0.1);
  await wait(900);
  log.homeHint = document.querySelector(".interact")?.textContent;
  g.key("KeyE");
  await wait(700);
  await window.__shot("night-door");
  await wait(3500);
  log.morning = g.clockNow();
  log.toasts = [...document.querySelectorAll(".toast")].map((t) => t.textContent);
  await g.sync();
  const s = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { clockOffset: s.save.clockOffset, sleptDay: s.save.sleptDay, rep: s.save.rep, hour: ((s.serverNow - Date.UTC(2026, 8, 24)) / 600000 * 24 + 6) % 24 };
  await wait(300);
  await window.__shot("night-dawn");
  return log;
})()
