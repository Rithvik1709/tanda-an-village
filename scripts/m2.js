// M2 scripted play: walk, jump, dig a trench, build a little brick pillar. Run via shots.mjs --eval.
(async () => {
  const g = window.__bailgaadi;
  const log = {};
  g.teleport(96.5, 20, 90.5, Math.PI, 0);
  await new Promise((r) => setTimeout(r, 600));
  log.landed = g.player();
  await g.hold("KeyW", 700);
  await new Promise((r) => setTimeout(r, 300));
  log.walked = g.player();
  const y0 = g.player().y;
  g.hold("Space", 120);
  await new Promise((r) => setTimeout(r, 250));
  log.jumpRise = +(g.player().y - y0).toFixed(2);
  await new Promise((r) => setTimeout(r, 700));
  if (!window.M2_EDIT) return log;
  // edits are only allowed on your own land (M3 rules): do the digging in the starter plot
  const sp = g.starterPlot();
  g.teleport(sp.x0 + 4.5, sp.y + 1, sp.z0 + 3.5, Math.PI, 0);
  await new Promise((r) => setTimeout(r, 300));
  const p = g.player();
  // look down at the ground ahead and dig three blocks in a row
  const dug = [];
  for (const pitch of [-0.75, -0.55, -0.42]) {
    g.teleport(p.x, p.y, p.z, Math.PI, pitch);
    await new Promise((r) => setTimeout(r, 60));
    log["t" + pitch] = g.target();
    dug.push((await g.left())?.ok);
  }
  log.dug = dug;
  // then face a little to the left and stack three bricks
  g.select(7);
  const placed = [];
  for (let i = 0; i < 3; i++) {
    g.teleport(p.x, p.y, p.z, Math.PI + 0.5, -0.55 + i * 0.3);
    await new Promise((r) => setTimeout(r, 60));
    placed.push((await g.right())?.ok);
  }
  log.placed = placed;
  log.editMs = g.editMs();
  g.teleport(p.x, p.y, p.z, Math.PI + 0.2, -0.5);
  g.toggleDebug();
  await new Promise((r) => setTimeout(r, 200));
  log.stats = g.stats();
  return log;
})()
