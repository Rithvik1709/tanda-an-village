/*
 * Graphics quality. The game picks a tier for the device it's on (from the GPU's name, CPU cores,
 * memory and whether it's a phone), the player can override it in Settings, and while playing it
 * watches the frame rate: if the device can't keep up, it first renders fewer pixels, then turns
 * off the costly extras (shadows, bloom), and remembers that for next time.
 */
export type Tier = "low" | "medium" | "high";
export type TierChoice = Tier | "auto";

export type Quality = {
  tier: Tier;
  /** Highest device-pixel ratio we render at (retina Macs are 2; that's 4× the pixels of 1). */
  maxDpr: number;
  shadows: boolean;
  shadowSize: number;
  /** Re-draw the sun's shadow map every n frames (the sun barely moves between frames). */
  shadowEvery: number;
  bloom: boolean;
  /** MSAA samples for the scene render target (canvas antialiasing does nothing under post-processing). */
  msaa: number;
  /** Grass blades per ground cell, and how far grass is drawn (m). */
  grassPerCell: number;
  grassFar: number;
  /** Detail of the tree canopy clumps (icosahedron subdivisions). */
  treeDetail: number;
  /** Warm lights that follow the nearest door bulbs at night. */
  bulbLights: number;
  /** Villagers further than this aren't drawn; nearer than `peopleShadow` they cast shadows. */
  peopleFar: number;
  peopleShadow: number;
};

const TIERS: Record<Tier, Omit<Quality, "tier">> = {
  low: { maxDpr: 1, shadows: false, shadowSize: 1024, shadowEvery: 4, bloom: false, msaa: 0, grassPerCell: 8, grassFar: 45, treeDetail: 1, bulbLights: 2, peopleFar: 45, peopleShadow: 0 },
  medium: { maxDpr: 1.25, shadows: true, shadowSize: 1024, shadowEvery: 3, bloom: true, msaa: 0, grassPerCell: 18, grassFar: 65, treeDetail: 2, bulbLights: 4, peopleFar: 70, peopleShadow: 18 },
  high: { maxDpr: 1.5, shadows: true, shadowSize: 2048, shadowEvery: 2, bloom: true, msaa: 0, grassPerCell: 30, grassFar: 90, treeDetail: 2, bulbLights: 8, peopleFar: 110, peopleShadow: 30 },
};

const KEY = "tanda.graphics";
const LEARNED = "tanda.graphics.learned"; // the tier the frame-rate watcher settled on

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* private mode: fine, we just won't remember */
  }
};

/** A best guess from the hardware. */
export function detectTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 8;
  const touch = matchMedia("(pointer: coarse)").matches || nav.maxTouchPoints > 1;
  let gpu = "";
  try {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    gpu = (ext && gl ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl?.getParameter(gl.RENDERER) ?? "")).toLowerCase();
    if (!gl) return "low";
  } catch {
    return "low";
  }
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(gpu)) return "low";
  let t: Tier;
  if (touch) {
    // phones and tablets: recent iPhones/iPads and flagship Androids manage medium
    if (/apple/.test(gpu)) t = "medium";
    else if (/adreno \(tm\) (6[4-9]\d|7\d\d|8\d\d)|adreno (6[4-9]\d|7\d\d|8\d\d)|mali-g(7[1-9]|[89]\d|7\d\d)|immortalis|xclipse/.test(gpu)) t = "medium";
    else t = "low";
  } else if (/nvidia|geforce|rtx|radeon rx|radeon pro|apple m\d|apple gpu/.test(gpu)) t = "high";
  else if (/intel|iris|uhd|hd graphics|radeon\(tm\) graphics|vega/.test(gpu)) t = /hd graphics [2-5]\d\d\d?|hd graphics$/.test(gpu) ? "low" : "medium";
  else t = "medium";
  // few cores or little memory: one step down
  if ((cores <= 4 || mem <= 4) && t !== "low") t = t === "high" ? "medium" : "low";
  return t;
}

export const graphicsChoice = (): TierChoice => (read(KEY) as TierChoice | null) ?? "auto";
export function setGraphicsChoice(c: TierChoice) {
  write(KEY, c === "auto" ? null : c);
  write(LEARNED, null); // a fresh start for the watcher
}

/** The quality to boot with. */
export function pickQuality(): Quality {
  const choice = graphicsChoice();
  const learned = read(LEARNED) as Tier | null;
  const tier: Tier = choice !== "auto" ? choice : learned && learned in TIERS ? learned : detectTier();
  // (for measuring: individual settings can be overridden with a JSON object in localStorage)
  let tweak: Partial<Quality> = {};
  try {
    tweak = JSON.parse(read(KEY + ".tweak") ?? "{}");
  } catch {
    /* ignore */
  }
  return { tier, ...TIERS[tier], ...tweak };
}
export const tierSettings = (t: Tier): Quality => ({ tier: t, ...TIERS[t] });

/**
 * Watches frame times while playing and nudges quality down (never below what the device can do,
 * and only in auto mode): first the render scale, then shadows and bloom. Call `frame(dt)` every
 * frame; it calls back with what to change.
 */
export class FrameWatch {
  private acc = 0;
  private n = 0;
  private slowRuns = 0;
  private fastRuns = 0;
  scale = 1; // multiplies the tier's pixel ratio
  constructor(
    private q: Quality,
    private apply: (change: { scale?: number; shadows?: boolean; bloom?: boolean }) => void,
  ) {}

  /** dt in seconds; `active` is false while paused, on the title screen or with a window open. */
  frame(dt: number, active: boolean) {
    if (!active || dt > 0.5 || graphicsChoice() !== "auto") return;
    this.acc += dt;
    this.n++;
    if (this.acc < 3) return; // judge every 3 seconds
    const fps = this.n / this.acc;
    this.acc = 0;
    this.n = 0;
    if (fps < 42) {
      this.fastRuns = 0;
      if (++this.slowRuns < 2) return; // one slow patch could be a hiccup (loading, a tab switch)
      this.slowRuns = 0;
      if (this.scale > 0.65) {
        this.scale = Math.max(0.6, this.scale - 0.15);
        this.apply({ scale: this.scale });
      } else if (this.q.shadows) {
        this.q.shadows = false;
        this.apply({ shadows: false });
        write(LEARNED, this.q.tier === "high" ? "medium" : "low");
      } else if (this.q.bloom) {
        this.q.bloom = false;
        this.apply({ bloom: false });
        write(LEARNED, "low");
      }
    } else if (fps > 58) {
      this.slowRuns = 0;
      // plenty of headroom: win back sharpness, slowly
      if (++this.fastRuns >= 3 && this.scale < 1) {
        this.fastRuns = 0;
        this.scale = Math.min(1, this.scale + 0.1);
        this.apply({ scale: this.scale });
      }
    } else this.slowRuns = this.fastRuns = 0;
  }
}

/** The quality this session runs at (the watcher may lower it while playing). */
export const Q: Quality = typeof document !== "undefined" ? pickQuality() : tierSettings("medium");
