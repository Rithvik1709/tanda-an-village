// U11: phone controls — a joystick that comes to your thumb, 47 px hotbar slots, a UI size setting, the arrow kept clear.
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const phone = document.body.classList.contains("is-touch");
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  g.setHour(10);
  const L = g.landmarks();
  g.teleport(L.spawn.x, 17, L.spawn.z, 0.25, -0.15);
  await wait(700);
  const slot = document.querySelector(".hotbar .slot")?.getBoundingClientRect();
  log.slotPx = slot && Math.round(slot.width);
  if (phone) {
    // a thumb lands in the middle of the left side (not on the stick) and pushes up: the farmer walks
    const zone = document.querySelector(".t-move").getBoundingClientRect();
    const x = zone.left + zone.width * 0.6, y = zone.top + zone.height * 0.4;
    const mk = (type, x, y) => new TouchEvent(type, { bubbles: true, cancelable: true, changedTouches: [new Touch({ identifier: 7, target: document.querySelector(".t-move"), clientX: x, clientY: y })] });
    const p0 = g.player();
    document.querySelector(".t-move").dispatchEvent(mk("touchstart", x, y));
    await wait(50);
    window.dispatchEvent(mk("touchmove", x, y - 38));
    await wait(1200);
    log.stickMoved = document.querySelector(".t-stick").style.translate;
    await window.__shot("u11p-stick");
    window.dispatchEvent(mk("touchend", x, y - 38));
    const p1 = g.player();
    log.walked = +Math.hypot(p1.x - p0.x, p1.z - p0.z).toFixed(1);
    log.stickHome = document.querySelector(".t-stick").style.translate === "";
  }
  // the largest UI size
  g.openSettings();
  await wait(300);
  (document.querySelector('.settings input[name="ui"][value="1.5"]') ?? document.querySelector('.settings input[name="ui"][value="1.2"]'))?.click();
  await wait(300);
  log.ui = getComputedStyle(document.documentElement).getPropertyValue("--ui");
  document.querySelector(".settings [data-close]")?.click();
  await wait(500);
  await window.__shot(phone ? "u11p-large" : "u11-large");
  // the arrow never sits on the goal card
  const a = document.querySelector(".goal-arrow")?.getBoundingClientRect(), c = document.querySelector(".goal")?.getBoundingClientRect();
  log.arrowOnCard = !!(a && c && a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top);
  // back to normal
  g.openSettings(); await wait(200);
  document.querySelector('.settings input[name="ui"][value="1"]')?.click();
  document.querySelector(".settings [data-close]")?.click();
  return log;
})()
