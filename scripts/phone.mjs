/**
 * Phone check: taps through the game like a player on a phone, in several screen sizes, and fails if
 * two windows are ever open at once, a window can't be closed, or the controls don't come back.
 *   node scripts/phone.mjs   (dev server on :5190)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("out", { recursive: true });
const url = process.argv.includes("--url") ? process.argv[process.argv.indexOf("--url") + 1] : "http://localhost:5190";
const SIZES = [
  ["iphone-landscape", 874, 402],
  ["small-landscape", 667, 375],
  ["iphone-upright", 402, 874],
];
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal"] });
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
for (const [name, w, h] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1" });
  const p = await ctx.newPage();
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(url);
  await p.waitForFunction(() => window.__bailgaadi?.ready === true, null, { timeout: 60000 });
  const shot = (s) => p.screenshot({ path: `out/phone-${name}-${s}.png` });
  // how many windows are on screen right now?
  const open = () => p.evaluate(() => [...document.querySelectorAll(".panel, .mapview, .fs-gate")].filter((e) => !e.hidden && getComputedStyle(e).display !== "none").map((e) => e.className));
  const touchShown = () => p.evaluate(() => !document.querySelector(".touch")?.hidden);
  const tap = async (sel) => {
    const el = await p.$(sel);
    if (!el) throw new Error("nothing to tap: " + sel);
    await el.tap();
    await p.waitForTimeout(350);
  };
  check((await open()).some((c) => c.includes("fs-gate")), `${name}: the full-screen card greets you`);
  await shot("1-gate");
  await tap(".fs-gate [data-go]");
  await shot("2-title");
  await tap('[data-t="play"]');
  if (await p.$(".welcome")) await tap(".welcome [data-go]");
  await p.waitForTimeout(800);
  if (await p.$(".dialogue")) {
    check((await open()).length === 1, `${name}: the story card is the only thing open`);
    check(!(await touchShown()), `${name}: controls hide behind the story card`);
    await shot("3-story");
    await tap(".dialogue button");
  }
  await p.waitForTimeout(400);
  check((await open()).length === 0 && (await touchShown()), `${name}: back in the game, controls showing`);
  await shot("4-play");
  // every window from the ☰ menu: exactly one at a time, and each closes
  for (const pick of ["map", "board", "help", "settings"]) {
    await tap(".t-menu");
    check((await open()).length === 1, `${name}: menu open alone`);
    await tap(`.phone-menu [data-m="${pick}"]`);
    await p.waitForTimeout(500);
    const o = await open();
    check(o.length === 1, `${name}: ${pick} is the only window (${o.join(" | ")})`);
    await shot(`5-${pick}`);
    const x = (await p.$(".panel:not([hidden]) .x, .mapview:not([hidden]) .x, .panel:not([hidden]) [data-close]"));
    await x.tap();
    await p.waitForTimeout(400);
    check((await open()).length === 0 && (await touchShown()), `${name}: ${pick} closes, controls back`);
  }
  // a shop, then try to open the map on top of it: the map replaces it, never both
  await p.evaluate(() => window.__bailgaadi.openStall("trader"));
  await p.waitForTimeout(300);
  await p.evaluate(() => window.__bailgaadi.key("KeyM"));
  await p.waitForTimeout(400);
  check((await open()).length === 1, `${name}: opening the map over a shop still leaves one window`);
  await p.evaluate(() => window.__bailgaadi.key("Escape"));
  await p.waitForTimeout(300);
  // the Android back gesture closes the window instead of leaving the game
  await tap(".t-menu");
  await p.evaluate(() => history.back());
  await p.waitForTimeout(500);
  check((await open()).length === 0 && p.url().startsWith(url), `${name}: the back gesture closes the window and stays in the game`);
  check(errors.length === 0, `${name}: no page errors ${errors.join(" ")}`);
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} FAILED` : "all phone checks passed");
process.exitCode = failed ? 1 : 0;
