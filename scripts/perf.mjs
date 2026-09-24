/**
 * Frame-rate check: plays the game in headless Chrome (on this machine's GPU) at a few screen sizes
 * and reports frames per second, draw calls and triangles, by day and at night.
 *   node scripts/perf.mjs [--url http://localhost:5190] [--dpr 2] [--size 1600x1000]
 */
import { chromium } from "playwright";
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const url = arg("--url", "http://localhost:5190");
const [w, h] = arg("--size", "1600x1000").split("x").map(Number);
const dpr = Number(arg("--dpr", "2"));
const tier = arg("--tier", null); // force low / medium / high (default: auto-detect)
const tweak = arg("--tweak", null); // e.g. '{"shadows":false}' to measure one setting
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-angle=metal", "--enable-gpu", "--disable-gpu-vsync", "--disable-frame-rate-limit"] });
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr });
if (tier) await ctx.addInitScript((t) => localStorage.setItem("tanda.graphics", t), tier);
if (tweak) await ctx.addInitScript((t) => localStorage.setItem("tanda.graphics.tweak", t), tweak);
const p = await ctx.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.goto(url);
await p.waitForFunction(() => window.__bailgaadi?.ready === true, null, { timeout: 60000 });
const out = await p.evaluate(async () => {
  const g = window.__bailgaadi;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  g.autoSkipStory(true); g.play(); await wait(800); g.skipStory();
  const fps = async (ms) => {
    let n = 0, worst = 0, last = performance.now();
    const t0 = last;
    await new Promise((res) => {
      const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    return { fps: Math.round((n / ms) * 1000), worstMs: Math.round(worst) };
  };
  const r = {};
  for (const [name, hour, at] of [["chowk-day", 11, [105, 16, 118, 0.6]], ["village-night", 21, [100, 16, 122, 1.2]], ["fields-day", 15, [66, 16, 128, 2.6]]]) {
    g.setHour(hour); g.teleport(at[0], at[1], at[2], at[3], -0.05);
    await wait(1500);
    r[name] = { ...(await fps(4000)), ...g.prof() };
    for (const k of ["villagers", "frame", "render"]) r[name][k] = Math.round(r[name][k] * 100) / 100;
  }
  return r;
});
const brief = Object.fromEntries(Object.entries(out).map(([k, v]) => [k, `${v.fps} fps (worst ${v.worstMs} ms) · cpu ${v.render} ms · ${v.calls} draws · ${(v.triangles / 1e6).toFixed(2)}M tris · dpr ${v.dpr}`]));
console.log(JSON.stringify({ size: `${w}x${h}@${dpr}`, tier: tier ?? "auto", ...brief, errors }, null, 1));
await browser.close();
