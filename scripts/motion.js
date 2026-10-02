// Motion: run up the road while turning, shooting mid-stride (third person, golden hour).
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.play(); g.setHour(16.8); if (g.skipStory) { g.skipStory(); g.skipStory(); }
  for (let i = 0; i < 6; i++) {
    await wait(400);
    document.querySelectorAll(".dialogue button, .welcome [data-go]").forEach((b) => b.click());
  }
  await wait(400);
  const p = g.player();
  p.yaw += Math.PI; // away from Sitabai's stall, down the open lane
  g.look(p.yaw, -0.18);
  const tag = window.__tag || "now";
  g.hold("KeyW", 2600);
  await wait(800);
  for (let i = 0; i < 3; i++) { await window.__shot(`motion-${tag}-walk${i}`); }
  g.hold("ShiftLeft", 1400);
  let yaw = p.yaw;
  const turn = setInterval(() => g.look((yaw += 0.03), -0.18), 30);
  await wait(700);
  await window.__shot(`motion-${tag}-run-turn`);
  clearInterval(turn);
  await wait(700);
  g.hold("KeyW", 900); await wait(250); g.hold("Space", 120); await wait(220);
  await window.__shot(`motion-${tag}-jump`);
  await wait(900);
  return g.player();
})()
