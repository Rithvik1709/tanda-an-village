// U8: a missed message can be read again (the bell on a computer, the menu on a phone).
(async () => {
  const g = window.__bailgaadi, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const phone = document.body.classList.contains("is-touch");
  const log = {};
  document.querySelector(".fs-gate")?.setAttribute("hidden", "");
  localStorage.setItem("tanda.welcomed", "1");
  g.autoSkipStory(true); g.play(); await wait(600); g.skipStory();
  const p = g.starterPlot();
  g.select(0);
  g.teleport(p.x0 + 5.5, p.y + 1, p.z0 + 7.5, 0, -1.1);
  await wait(600);
  await g.right(); await wait(200); await g.right(); await wait(200);
  g.teleport(p.x0 + 5.5, p.y + 1, p.z0 + 7.5, 0, -1.1);
  await g.right(); // water
  g.act({ t: "buy", item: "rod", n: 1 }); // refused: not enough money? (₹150 — fine) or bought
  await wait(3000); // the toasts fade
  log.toastsLeft = document.querySelectorAll(".toast:not(.gone)").length;
  log.bell = document.querySelector(".log-bell")?.textContent;
  if (phone) { document.querySelector(".t-menu")?.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, cancelable: true })); await wait(300); document.querySelector('[data-m="log"]')?.click(); }
  else document.querySelector(".log-bell")?.click();
  await wait(400);
  log.list = [...document.querySelectorAll(".log-list li")].map((li) => li.innerText.replace(/\s+/g, " "));
  await window.__shot(phone ? "u8p-log" : "u8-log");
  g.key("Escape");
  await wait(300);
  log.closed = !document.querySelector(".msglog") || document.querySelector(".msglog").hidden;
  return log;
})()
