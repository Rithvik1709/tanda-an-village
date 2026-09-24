/**
 * M4 end-to-end: a guest farms, a tampering client is refused, an optimistic cheat rolls back,
 * and after a full page reload the same farm, money and goods come back from the server.
 *   node scripts/m4.mjs   (dev server on :5190)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("out", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/status of 4\d\d/.test(m.text()) && errors.push(m.text()));
const ready = () => page.waitForFunction(() => window.__bailgaadi?.ready === true, null, { timeout: 60_000 });
const check = (cond, what) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) process.exitCode = 1;
};

await page.goto("http://localhost:5190", { waitUntil: "load" });
await ready();
const first = await page.evaluate(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.setHour(16.5);
  const p = g.starterPlot();
  const y = p.y;
  const aimFrom = async (sx, sz, bx, by, bz) => {
    const e = { x: sx, y: y + 1 + 1.62, z: sz };
    const dx = bx + 0.5 - e.x, dy = by + 0.9 - e.y, dz = bz + 0.5 - e.z;
    g.teleport(sx, y + 1, sz, Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)));
    await wait(50);
  };
  const row = [3, 4, 5, 6, 7].map((d) => [p.x0 + d, y, p.z0 + 4]);
  const out = { code: g.recoveryCode(), steps: [] };
  const act = async (slot, hand, cell) => {
    g.select(slot);
    await aimFrom(cell[0] + 0.5, cell[2] - 1.5, ...cell);
    const r = await (hand === "L" ? g.left() : g.right());
    out.steps.push(r?.ok ?? r);
  };
  for (const c of row) await act(1, "R", c); // hoe
  for (const c of row) await act(4, "R", c); // onion seeds
  for (const c of row.slice(0, 3)) await act(2, "R", c); // water three of them
  // build a little brick marker at the row's end
  await act(7, "R", [p.x0 + 9, y, p.z0 + 4]);
  out.status = await g.sync();
  out.saveBefore = { inv: g.inv(), farm: Object.keys(g.farm()).length };

  // 1) a tampering client talks to the server directly
  const other = g.starterPlot().id === 0 ? 1 : 0;
  out.rawOther = await g.sendRaw({ t: "till", x: 40, y: 15, z: 20 }); // somebody else's field
  out.rawUnripe = await g.sendRaw({ t: "harvest", ...{ x: row[0][0], y, z: row[0][2] } });
  out.rawMoney = await g.sendRaw({ t: "sell", item: "onion", n: 1e6 });
  // 2) a devtools cheat: 50 sugarcane seeds locally, then plant three rows' worth
  g.tamperLocal("seed:sugarcane", 50);
  const cane = [3, 4, 5, 6, 7, 8].map((d) => [p.x0 + d, y, p.z0 + 7]);
  for (const c of cane) await act(1, "R", c);
  for (const c of cane) await act(5, "R", c);
  out.localCaneBefore = Object.values(g.farm()).filter((f) => f.plant?.crop === "sugarcane").length;
  await g.sync();
  await wait(300);
  out.caneAfterServer = Object.values(g.farm()).filter((f) => f.plant?.crop === "sugarcane").length;
  out.caneSeedsAfter = g.inv()["seed:sugarcane"] ?? 0;
  out.saveAfter = { inv: g.inv(), farm: g.farm() };
  out.brick = g.blockAt(p.x0 + 9, y + 1, p.z0 + 4);
  g.teleport(p.x0 + 1.5, y + 1, p.z0 + 1.2, -Math.PI / 2 - 0.5, -0.55);
  await wait(400);
  return out;
});
await page.screenshot({ path: "out/m4-before-reload.png" });

check(first.steps.every((s) => s === true), `all ${first.steps.length} farming/building actions accepted locally (${JSON.stringify(first.steps)})`);
check(first.status === "saved", `sync status after flush: ${first.status}`);
check(first.rawOther.results[0].ok === false, `server refuses tilling someone else's land: "${first.rawOther.results[0].error}"`);
check(first.rawUnripe.results[0].ok === false, `server refuses an unripe harvest: "${first.rawUnripe.results[0].error}"`);
check(first.rawMoney.results[0].ok === false, `server refuses an unknown action: "${first.rawMoney.results[0].error}"`);
check(first.localCaneBefore === 6 && first.caneAfterServer === 4, `cheat rolled back: 6 cane planted locally, ${first.caneAfterServer} survive the server (had 4 seeds)`);
check(first.caneSeedsAfter === 0, `seed count back to the truth: ${first.caneSeedsAfter}`);
check(first.brick === "Brick", "brick placed");

// full reload: same browser profile, so the same guest token
await page.reload({ waitUntil: "load" });
await ready();
const second = await page.evaluate(async () => {
  const g = window.__bailgaadi;
  g.setHour(16.5);
  const p = g.starterPlot();
  g.teleport(p.x0 + 1.5, p.y + 1, p.z0 + 1.2, -Math.PI / 2 - 0.5, -0.55);
  await new Promise((r) => setTimeout(r, 600));
  return { code: g.recoveryCode(), inv: g.inv(), farm: g.farm(), brick: g.blockAt(p.x0 + 9, p.y + 1, p.z0 + 4), crop: g.blockAt(p.x0 + 3, p.y + 1, p.z0 + 4) };
});
await page.screenshot({ path: "out/m4-after-reload.png" });
check(second.code === first.code, `same farmer after reload (${second.code})`);
check(JSON.stringify(second.inv) === JSON.stringify(first.saveAfter.inv), `same inventory after reload ${JSON.stringify(second.inv)}`);
check(Object.keys(second.farm).length === Object.keys(first.saveAfter.farm).length, `same ${Object.keys(second.farm).length} farm cells after reload`);
check(second.brick === "Brick" && /Onion/.test(second.crop), `world edits and crops redrawn: ${second.brick}, ${second.crop}`);

// another device: a fresh browser context restores the farm by recovery code
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const p2 = await ctx2.newPage();
await p2.goto("http://localhost:5190", { waitUntil: "load" });
await p2.waitForFunction(() => window.__bailgaadi?.ready === true, null, { timeout: 60_000 });
const newCode = await p2.evaluate(() => window.__bailgaadi.recoveryCode());
check(newCode !== first.code, "a new device starts as a new guest");
await p2.fill(".restore input", first.code.toLowerCase());
await p2.screenshot({ path: "out/m4-restore-panel.png" });
await p2.click(".restore button");
await p2.waitForEvent("load");
await p2.waitForFunction(() => window.__bailgaadi?.ready === true, null, { timeout: 60_000 });
const third = await p2.evaluate(() => ({ code: window.__bailgaadi.recoveryCode(), farm: Object.keys(window.__bailgaadi.farm()).length }));
check(third.code === first.code && third.farm === Object.keys(first.saveAfter.farm).length, `restored on a second device by code: ${third.code}, ${third.farm} cells`);

await browser.close();
if (errors.length) {
  console.error("PAGE ERRORS:\n" + errors.join("\n"));
  process.exitCode = 1;
}
