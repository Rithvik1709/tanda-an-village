// U10: a neighbour's "!" turns into a green ✓ once you carry what they asked for.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  const J = g.jobs();
  const job = J.today.jobs.find((j) => j.kind === "produce");
  log.job = `${job.who}: ${job.n} ${job.item}`;
  await wait(700);
  log.before = g.jobs().marks;
  // carry what they asked for (the ✓ is worked out on the client, from what you hold)
  g.tamperLocal(job.item, job.n + 2);
  await wait(900);
  log.carrying = g.inv()[job.item];
  log.after = g.jobs().marks;
  const giver = g.jobs().givers.find((x) => x.id === job.who);
  g.teleport(giver.x + 1.6, 17, giver.z + 1.6, Math.atan2(1.6, 1.6), -0.12);
  await wait(900);
  log.hint = g.hint();
  await window.__shot("u10-ready");
  return log;
})()
