/**
 * Headless real-Chrome screenshots + smoke checks. Fails (exit 1) on page errors or if the game never
 * reports ready. The game exposes window.__bailgaadi with ready flags and optional test hooks.
 *   node scripts/shots.mjs [--url http://localhost:5190] [--name tag] [--eval "js to run after ready"]
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const argv = process.argv;
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const url = opt("--url", "http://localhost:5190");
const name = opt("--name", "shot");
const script = opt("--eval", "");
mkdirSync("out", { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu"] });
const mobile = argv.includes("--mobile");
const landscape = argv.includes("--landscape");
const page = await browser.newPage(
  mobile || landscape ? { viewport: landscape ? { width: 844, height: 390 } : { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 720 } },
);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
// scripts can take extra screenshots mid-run: await window.__shot("name")
await page.exposeFunction("__shot", async (n) => {
  await page.waitForTimeout(250);
  await page.screenshot({ path: `out/${n}.png` });
  console.log(`shot out/${n}.png`);
});
await page.goto(url, { waitUntil: "load" });
await page.waitForFunction(() => window.__bailgaadi?.ready === true, null, { timeout: 60_000 });
if (script) {
  const r = await page.evaluate(script);
  if (r !== undefined) console.log("eval:", JSON.stringify(r));
}
await page.waitForTimeout(500);
await page.screenshot({ path: `out/${name}.png` });
const info = await page.evaluate(() => window.__bailgaadi);
console.log(`shot out/${name}.png`, JSON.stringify(info).slice(0, 300));
await browser.close();
if (errors.length) {
  console.error("PAGE ERRORS:\n" + errors.join("\n"));
  process.exit(1);
}
