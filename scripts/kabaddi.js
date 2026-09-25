// A whole kabaddi match played by a simple bot: raid in, tag the nearest defender, sprint home; on their
// raids, stand and tackle. Checks the match ends, the result reaches the server, and the prize is paid once.
//   node scripts/shots.mjs --name kabaddi-end --eval "$(cat scripts/kabaddi.js)"
(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  localStorage.setItem("tanda.welcomed", "1");
  g.setView("third");
  g.play();
  g.autoSkipStory(true);
  await wait(400);
  g.skipStory();
  g.setHour(15);
  const L = g.landmarks();
  const money0 = g.money();
  g.teleport(L.kabaddi.x + 1.5, L.kabaddi.y, L.kabaddi.z, Math.PI, -0.2);
  await wait(800);
  g.interact();
  await wait(400);
  document.querySelector(".dialogue button")?.click(); // Let's play!
  const log = { raids: [] };
  let shots = 0;
  for (let step = 0; step < 900; step++) {
    const k = g.kabaddi();
    if (k.phase === "over" || k.phase === null) break;
    if (k.phase === "raid") {
      const me = g.player();
      const def = k.boys.filter((b) => b.team === "them" && !b.out);
      const near = def.map((b) => ({ b, d: Math.hypot(b.x - me.x, b.z - me.z) })).sort((a, b) => a.d - b.d)[0];
      if (!k.tags && near && near.d > 1.6) {
        // step towards the nearest defender (the camera faces +z; steer with the yaw)
        g.teleport(me.x, me.y, me.z, Math.atan2(-(near.b.x - me.x), -(near.b.z - me.z)), -0.2);
        await g.hold("KeyW", 120);
      } else if (!k.tags && near) {
        g.kabaddiTag();
        await wait(60);
        if (shots++ < 1) await window.__shot("kabaddi-tag");
      } else {
        g.teleport(me.x, me.y, me.z, 0, -0.2); // face home (−z) and sprint
        await Promise.all([g.hold("KeyW", 200), g.hold("ShiftLeft", 200)]);
      }
      continue;
    }
    if (k.phase === "their") {
      g.kabaddiTag();
      await wait(120);
      continue;
    }
    await wait(150);
    if (k.raid !== log.raids.length) log.raids.push(`${k.us}-${k.them}`);
  }
  const end = g.kabaddi();
  log.final = { phase: end.phase, us: end.us, them: end.them };
  await wait(600);
  await window.__shot("kabaddi-final");
  log.toasts = [...document.querySelectorAll(".toast")].map((t) => t.textContent);
  await g.sync();
  const srv = await (await fetch("/api/state", { headers: { authorization: `Bearer ${localStorage.getItem("bailgaadi.token")}` } })).json();
  log.server = { kabaddi: srv.save.kabaddi, money: srv.save.money, gained: srv.save.money - money0, rep: srv.save.rep };
  return log;
})()
