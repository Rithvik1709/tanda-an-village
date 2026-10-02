import { B } from "../../shared/blocks";
import { advance } from "../../shared/crops";
import { askingPrice, forSale } from "../../shared/land";
import type { Save } from "../../shared/save";
import { UKHALI_ROADS, type RoadKind } from "../../shared/ukhali-osm";
import { D, H, riverCenter, riverHalfWidth, W, type Landmark, type World } from "../../shared/world";

/**
 * The village map (M): an illustrated sheet of the tanda, painted once onto an offscreen canvas
 * (paper, land, fields, water, roads, trees and roofs), then drawn under a live layer of plot
 * ownership, places, jobs, the mission marker and you. Drag to pan, wheel or pinch to zoom,
 * tap a place to be guided there.
 */

/** Base-map pixels per block. 192 blocks × 10 = a 1920px sheet. */
const BS = 10;
const SERIF = `Georgia, "Times New Roman", serif`;
const DEVA = `"Noto Sans Devanagari", "Kohinoor Devanagari", "Mangal", system-ui, sans-serif`;
const SANS = `ui-sans-serif, system-ui, sans-serif`;

/** The painted palette: soft earth on cream paper, inked in brown. */
const P = {
  paper: "#efe2c2",
  paperEdge: "#d9c597",
  ink: "#3b2a1a",
  inkSoft: "rgba(59,42,26,0.55)",
  halo: "rgba(246,236,208,0.92)",
  water: "#9cc9cf",
  waterDeep: "#7fb4bf",
  waterInk: "#4d8a9a",
  road: { main: "#e9b980", road: "#f5e6c2", lane: "#f3e5c6", track: "#a5855c" } as Record<RoadKind, string>,
  roadCase: { main: "#8a4f2c", road: "#9a7550", lane: "#a7865e", track: "" } as Record<RoadKind, string>,
  roadW: { main: 2.6, road: 1.9, lane: 1.3, track: 0.55 } as Record<RoadKind, number>,
  tree: "#7d9a55",
  treeDark: "#5e7c3e",
  mission: "#c8432b",
  kaam: "#f0c36a",
  kaamInk: "#4a2f08",
  marker: "#3d8fd6",
  mine: "#3f9f4f",
  sale: "#e0892c",
  listed: "#4a7fd0",
  you: "#10717c",
};

/** Ground colours for the soft land tint (the surface block under any roof or canopy). */
const GROUND: Record<number, [number, number, number]> = {
  [B.GRASS]: [200, 206, 150],
  [B.DIRT]: [222, 200, 156],
  [B.ROAD]: [226, 206, 166],
  [B.BLACK_SOIL]: [176, 160, 128],
  [B.TILLED]: [168, 146, 112],
  [B.TILLED_WET]: [150, 130, 100],
  [B.RED_SOIL]: [218, 168, 124],
  [B.STONE]: [212, 196, 168],
  [B.COBBLE]: [214, 204, 182],
  [B.SAND]: [232, 214, 168],
  [B.WATER]: [156, 201, 207],
};
/** Blocks that belong to things standing on the ground, skipped when looking for the ground itself. */
const NOT_GROUND = new Set<number>([
  B.TALL_GRASS, B.MARIGOLD, B.LOG, B.LEAVES, B.BANYAN_LEAVES, B.PLANKS, B.THATCH, B.WHITEWASH, B.BRICK,
  B.ROOF_TILE, B.FENCE, B.SAFFRON, B.BLUE_WOOD, B.HAY,
]);

type Glyph = "mandir" | "school" | "pir" | "tank" | "well" | "rupee" | "seed" | "scroll" | "bank" | "home" | "court" | "talav" | "mandi" | "people";
type Place = { key: string; lm: Landmark; en: string; mr?: string; glyph: Glyph; color: string; rank: number };
type Pick = { x: number; z: number; label: string; kind: "pin" | "plot"; r: number; x0?: number; z0?: number; x1?: number; z1?: number };
type Pt = { x: number; z: number; label: string };

/** Pointer position in the canvas's own CSS pixels (on an upright phone the whole UI is turned 90°). */
function localPoint(cv: HTMLCanvasElement, clientX: number, clientY: number) {
  const b = cv.getBoundingClientRect();
  const turned = document.documentElement.classList.contains("rotated");
  const fx = turned ? (clientY - b.top) / b.height : (clientX - b.left) / b.width;
  const fy = turned ? 1 - (clientX - b.left) / b.width : (clientY - b.top) / b.height;
  return { x: fx * cv.clientWidth, y: fy * cv.clientHeight };
}

export class MapView {
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private base: HTMLCanvasElement | null = null;
  open = false;
  onClose: () => void = () => {};
  /** A place was picked on the map: guide the player there. */
  onPick: (p: { x: number; z: number; label: string }) => void = () => {};
  /** The waypoint you set, drawn as a blue pin. */
  waypoint: { x: number; z: number } | null = null;

  // what this opening shows
  private save: Save | null = null;
  private day = 0;
  private now = 0;
  private player = { x: 0, z: 0, yaw: 0 };
  private jobs: Pt[] = [];
  private objective: Pt | null = null;
  private picks: Pick[] = [];
  private places: Place[];

  // the view: css px per block, and the world point at the view's centre
  private s = 4;
  private cx = W / 2;
  private cz = D / 2;
  private hover: Pick | null = null;
  private raf = 0;
  private pointers = new Map<number, { x: number; y: number }>();
  private gesture: { moved: number; pinch: boolean; last: { x: number; y: number }; dist: number } | null = null;

  constructor(parent: HTMLElement, private world: World) {
    const touch = typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
    this.el = document.createElement("div");
    this.el.className = "mapview";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="map-card" role="dialog" aria-label="Village map">
      <header class="map-head"><h2>Ukhali Tanda <small>उखळी तांडा · the tanda map</small></h2>
        <p class="map-tip">${touch ? "Drag to look around · pinch to zoom · tap a place to be guided there" : "Drag to pan · scroll to zoom · click a place to be guided there"}</p>
        <button class="x" title="Close (M)" aria-label="Close map">✕</button></header>
      <div class="map-body">
        <div class="map-stage">
          <canvas aria-label="Map of Ukhali Tanda"></canvas>
          <div class="map-zoom" role="group" aria-label="Zoom">
            <button data-z="in" title="Zoom in (+)" aria-label="Zoom in">+</button>
            <button data-z="out" title="Zoom out (−)" aria-label="Zoom out">−</button>
            <button data-z="me" title="Centre on me (0)" aria-label="Centre on me"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 2 L16 17 L10 13.5 L4 17 Z" fill="currentColor"/></svg></button>
          </div>
          <button class="map-key-btn" aria-expanded="false">Key</button>
        </div>
        <aside class="map-legend" aria-label="Map key">
          <h3>On the map</h3>
          <ul>
            <li><i class="k-you"></i>You, facing</li>
            <li><i class="k-mission"></i>Mission objective</li>
            <li><i class="k-kaam">!</i>Kaam — a job today</li>
            <li><i class="k-pin"></i>Your marker</li>
          </ul>
          <h3>Land</h3>
          <ul>
            <li><i class="k-sw" style="--c:${P.mine}"></i>Your land</li>
            <li><i class="k-sw dash" style="--c:${P.sale}"></i>For sale</li>
            <li><i class="k-sw" style="--c:${P.listed}"></i>You listed</li>
            <li><i class="k-field"></i>Other farms</li>
          </ul>
          <h3>Ways &amp; water</h3>
          <ul>
            <li><i class="k-road main"></i>Main road</li>
            <li><i class="k-road road"></i>Road</li>
            <li><i class="k-road lane"></i>Gali (lane)</li>
            <li><i class="k-road track"></i>Field track</li>
            <li><i class="k-water"></i>River &amp; talav</li>
            <li><i class="k-roof"></i>Houses &amp; wada</li>
          </ul>
          <div class="map-credit">Roads: © OpenStreetMap contributors</div>
        </aside>
      </div></div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector("canvas")!;
    this.el.querySelector(".x")!.addEventListener("click", () => this.close());
    this.el.addEventListener("click", (e) => e.target === this.el && this.close());
    const keyBtn = this.el.querySelector<HTMLButtonElement>(".map-key-btn")!;
    keyBtn.addEventListener("click", () => {
      const on = this.el.classList.toggle("key-open");
      keyBtn.setAttribute("aria-expanded", String(on));
    });
    this.el.querySelectorAll<HTMLButtonElement>(".map-zoom button").forEach((b) =>
      b.addEventListener("click", () => {
        const z = b.dataset.z;
        if (z === "me") this.centreOn(this.player.x, this.player.z);
        else this.zoomAt(z === "in" ? 1.5 : 1 / 1.5, this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
      }),
    );
    this.bindPointer();
    addEventListener("keydown", (e: KeyboardEvent) => {
      if (!this.open) return;
      const k = e.key, w = this.canvas.clientWidth, h = this.canvas.clientHeight, step = 60 / this.s;
      if (k === "+" || k === "=") this.zoomAt(1.4, w / 2, h / 2);
      else if (k === "-" || k === "_") this.zoomAt(1 / 1.4, w / 2, h / 2);
      else if (k === "0") this.centreOn(this.player.x, this.player.z);
      else if (k === "ArrowLeft") this.panBy(-step, 0);
      else if (k === "ArrowRight") this.panBy(step, 0);
      else if (k === "ArrowUp") this.panBy(0, -step);
      else if (k === "ArrowDown") this.panBy(0, step);
      else return;
      e.preventDefault();
    });

    const L = world.landmarks;
    const place = (key: string, lm: Landmark, en: string, mr: string | undefined, glyph: Glyph, color: string, rank: number): Place => ({ key, lm, en, mr, glyph, color, rank });
    this.places = [
      place("temple", L.temple, "Sevalal Maharaj mandir", "संत सेवालाल महाराज मंदिर", "mandir", "#d9622b", 1),
      place("home", L.home, "Rathod Bhuvan", "your home", "home", "#8a5a34", 1),
      place("hanuman", L.hanuman, "Hanuman mandir", "श्री हनुमान मंदिर", "mandir", "#e0782f", 2),
      place("school", L.school, "Z.P. school", "जिल्हा परिषद शाळा", "school", "#2d5fb8", 2),
      place("pir", L.pir, "Pir Baba", "पीर बाबा", "pir", "#2f8a4a", 2),
      place("tank", L.tank, "Water tank", undefined, "tank", "#3c86a8", 3),
      place("market", L.market, "Pathrud market", "पाथरूड बाजार", "mandi", "#8a3a1c", 1),
      place("kabaddi", L.kabaddi, "Kabaddi maidan", "कबड्डी मैदान", "court", "#b9651a", 3),
      place("talav", L.talav, "Talav", "उखळी तलाव", "talav", "#2f7c98", 2),
      place("ghat", L.ghat, "Vihir", "field well", "well", "#5a7f8c", 3),
      place("well", L.well, "Well", undefined, "well", "#5a7f8c", 4),
      place("trader", L.trader, "Ganpat Seth, trader", "गणपत शेठ · व्यापारी", "rupee", "#a8551f", 2),
      place("seedShop", L.seedShop, "Sitabai seeds & tools", "सीताबाई बी-बियाणे", "seed", "#4f8a2c", 2),
      place("landOffice", L.landOffice, "Naik's kacheri", "नायक कचेरी", "scroll", "#7a4b8a", 2),
      place("bank", L.bank, "Sahakari bank", "सहकारी बँक", "bank", "#2f7a52", 3),
    ];

    // paint the sheet while the player is busy with something else, so the first M is instant
    const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    if (idle) idle(() => this.ensureBase(), { timeout: 4000 });
    else setTimeout(() => this.ensureBase(), 1500);
  }

  /* ================= the painted sheet (once) ================= */

  /** The painted sheet (10 px per block), shared with the minimap. */
  sheet() {
    return this.ensureBase();
  }
  private ensureBase() {
    if (!this.base) this.base = this.paintBase();
    return this.base;
  }

  private paintBase() {
    const c = document.createElement("canvas");
    c.width = W * BS;
    c.height = D * BS;
    const g = c.getContext("2d")!;
    const world = this.world;
    const v = world.voxels;

    // 1. ground tint and height, one texel per block, blown up smoothly so it reads as a wash
    const tint = document.createElement("canvas");
    tint.width = W;
    tint.height = D;
    const tg = tint.getContext("2d")!;
    const img = tg.createImageData(W, D);
    const hgt = new Float32Array(W * D);
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        let y = H - 1, id = 0;
        for (; y > 0; y--) {
          id = v[x + W * (z + D * y)];
          if (id && !NOT_GROUND.has(id)) break;
        }
        hgt[z * W + x] = y;
        const col = GROUND[id] ?? GROUND[B.GRASS];
        const i = (z * W + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = 255;
      }
    tg.putImageData(img, 0, 0);
    g.fillStyle = P.paper;
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.globalAlpha = 0.85;
    g.drawImage(tint, 0, 0, c.width, c.height);
    g.globalAlpha = 1;

    // 2. hill shading from the north-west (the tekdi and the river bank read as relief)
    const shade = tg.createImageData(W, D);
    for (let z = 1; z < D - 1; z++)
      for (let x = 1; x < W - 1; x++) {
        const d = hgt[(z - 1) * W + (x - 1)] - hgt[(z + 1) * W + (x + 1)];
        const i = (z * W + x) * 4;
        const k = Math.max(-1, Math.min(1, d / 3));
        if (k < 0) shade.data.set([120, 84, 50, Math.round(-k * 70)], i);
        else shade.data.set([255, 248, 225, Math.round(k * 80)], i);
      }
    tg.putImageData(shade, 0, 0);
    g.drawImage(tint, 0, 0, c.width, c.height);

    const X = (x: number) => x * BS;
    // the gaothan (village site): a warm wash with a dotted edge
    g.save();
    g.beginPath();
    g.ellipse(X(104), X(112), X(29), X(40), 0, 0, Math.PI * 2);
    g.fillStyle = "rgba(236,214,170,0.45)";
    g.fill();
    g.setLineDash([2, 7]);
    g.lineCap = "round";
    g.strokeStyle = "rgba(122,84,48,0.45)";
    g.lineWidth = 2.5;
    g.stroke();
    g.restore();
    // the chowk
    const ch = world.chowk;
    roundRect(g, X(ch.x0), X(ch.z0), X(ch.x1 - ch.x0 + 1), X(ch.z1 - ch.z0 + 1), 14);
    g.fillStyle = "rgba(232,210,166,0.9)";
    g.fill();
    g.strokeStyle = "rgba(140,100,60,0.35)";
    g.lineWidth = 2;
    g.stroke();

    // 3. fields: furrows and a hedge line, each with its own crop wash
    for (const p of world.plots) {
      const x = X(p.x0), z = X(p.z0), w = X(p.x1 - p.x0 + 1), d = X(p.z1 - p.z0 + 1);
      const hue = hash(p.id * 7.3);
      const wash = hue < 0.35 ? "rgba(150,170,90,0.42)" : hue < 0.7 ? "rgba(190,160,100,0.38)" : "rgba(120,100,70,0.32)";
      g.save();
      roundRect(g, x + 3, z + 3, w - 6, d - 6, 6);
      g.fillStyle = wash;
      g.fill();
      g.clip();
      // furrows along the longer side
      g.strokeStyle = "rgba(90,66,40,0.22)";
      g.lineWidth = 1.4;
      g.beginPath();
      const along = w >= d;
      const gap = 5 + Math.floor(hash(p.id * 3.1) * 3);
      if (along) for (let k = z + gap; k < z + d; k += gap) { g.moveTo(x, k); g.lineTo(x + w, k); }
      else for (let k = x + gap; k < x + w; k += gap) { g.moveTo(k, z); g.lineTo(k, z + d); }
      g.stroke();
      g.restore();
      // the bandh (field bund): a dotted green hedge
      roundRect(g, x + 3, z + 3, w - 6, d - 6, 6);
      g.setLineDash([1, 5]);
      g.lineCap = "round";
      g.strokeStyle = "rgba(84,104,52,0.75)";
      g.lineWidth = 3;
      g.stroke();
      g.setLineDash([]);
    }

    // 4. water: the river as one smooth band, and the talav
    g.save();
    g.beginPath();
    for (let z = -2; z <= D + 2; z += 1) g.lineTo(X(riverCenter(z) - riverHalfWidth(z) - 0.3), X(z));
    for (let z = D + 2; z >= -2; z -= 1) g.lineTo(X(riverCenter(z) + riverHalfWidth(z) + 0.3), X(z));
    g.closePath();
    g.fillStyle = P.water;
    g.fill();
    g.strokeStyle = P.waterInk;
    g.lineWidth = 2.5;
    g.stroke();
    // a darker channel and a couple of ripples
    g.beginPath();
    for (let z = -2; z <= D + 2; z += 1) g.lineTo(X(riverCenter(z) + Math.sin(z / 9) * 0.6), X(z));
    g.strokeStyle = "rgba(77,138,154,0.35)";
    g.lineWidth = X(1.6);
    g.stroke();
    g.restore();
    const tl = world.structures.find((s) => s.kind === "talav");
    if (tl && tl.kind === "talav") {
      g.beginPath();
      g.ellipse(X(tl.x), X(tl.z), X(tl.rx + 1.2), X(tl.rz + 1.2), 0, 0, Math.PI * 2);
      g.fillStyle = "rgba(150,130,90,0.4)"; // the bund
      g.fill();
      g.beginPath();
      g.ellipse(X(tl.x), X(tl.z), X(tl.rx), X(tl.rz), 0, 0, Math.PI * 2);
      g.fillStyle = P.water;
      g.fill();
      g.strokeStyle = P.waterInk;
      g.lineWidth = 2.5;
      g.stroke();
      ripples(g, X(tl.x), X(tl.z), X(tl.rx) * 0.5);
    }
    ripples(g, X(riverCenter(60)), X(60), 16);
    ripples(g, X(riverCenter(140)), X(140), 16);

    // 5. roads: casing first (all kinds), then the fills, so junctions merge cleanly
    const order: RoadKind[] = ["track", "lane", "road", "main"];
    const path = (pts: [number, number][]) => {
      g.beginPath();
      pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
    };
    g.lineJoin = "round";
    g.lineCap = "round";
    for (const r of UKHALI_ROADS) {
      if (r.k !== "track") continue;
      path(r.p);
      g.setLineDash([X(0.9), X(0.7)]);
      g.strokeStyle = P.road.track;
      g.lineWidth = X(P.roadW.track);
      g.stroke();
      g.setLineDash([]);
    }
    for (const k of order.slice(1)) {
      for (const r of UKHALI_ROADS) {
        if (r.k !== k) continue;
        path(r.p);
        g.strokeStyle = P.roadCase[k];
        g.lineWidth = X(P.roadW[k]) + 5;
        g.stroke();
      }
    }
    for (const k of order.slice(1)) {
      for (const r of UKHALI_ROADS) {
        if (r.k !== k) continue;
        path(r.p);
        g.strokeStyle = P.road[k];
        g.lineWidth = X(P.roadW[k]);
        g.stroke();
        if (k === "main") {
          g.setLineDash([X(1.4), X(1.4)]);
          g.strokeStyle = "rgba(255,246,222,0.75)";
          g.lineWidth = 1.6;
          g.stroke();
          g.setLineDash([]);
        }
      }
    }

    // 6. kabaddi maidan: a beaten-earth ground with its court lines
    for (const s of world.structures) {
      if (s.kind !== "kabaddi") continue;
      roundRect(g, X(s.x0), X(s.z0), X(s.x1 - s.x0 + 1), X(s.z1 - s.z0 + 1), 8);
      g.fillStyle = "#e3c48e";
      g.fill();
      g.strokeStyle = "rgba(255,250,235,0.9)";
      g.lineWidth = 2;
      g.strokeRect(X(s.x0 + 1), X(s.z0 + 1), X(s.x1 - s.x0 - 1), X(s.z1 - s.z0 - 1));
      g.beginPath();
      g.moveTo(X(s.x0 + 1), X((s.z0 + s.z1 + 1) / 2));
      g.lineTo(X(s.x1), X((s.z0 + s.z1 + 1) / 2));
      g.stroke();
    }

    // 7. trees: canopies with a soft shadow to the south-east
    for (const t of world.trees) {
      const r = X(Math.min(t.r, 7) * (t.kind === "banyan" ? 0.9 : 0.75));
      g.beginPath();
      g.arc(X(t.x) + 3, X(t.z) + 4, r, 0, Math.PI * 2);
      g.fillStyle = "rgba(60,48,30,0.18)";
      g.fill();
      const lobes = t.kind === "banyan" ? 8 : 6;
      const blobs: [number, number, number][] = [[X(t.x), X(t.z), r * 0.62]];
      for (let k = 0; k < lobes; k++) {
        const a = (k / lobes) * Math.PI * 2 + t.x;
        blobs.push([X(t.x) + Math.cos(a) * r * 0.48, X(t.z) + Math.sin(a) * r * 0.48, r * (0.46 + 0.1 * hash(k + t.z))]);
      }
      // an inked rim (the same blobs, a touch bigger and darker), then the canopy
      for (const [fill, grow] of [["rgba(52,70,32,0.85)", 1.5], [t.kind === "banyan" ? P.treeDark : P.tree, 0]] as const) {
        g.beginPath();
        for (const [bx, bz, br] of blobs) {
          g.moveTo(bx + br + grow, bz);
          g.arc(bx, bz, br + grow, 0, Math.PI * 2);
        }
        g.fillStyle = fill;
        g.fill();
      }
      g.beginPath();
      g.arc(X(t.x) - r * 0.25, X(t.z) - r * 0.25, r * 0.38, 0, Math.PI * 2);
      g.fillStyle = "rgba(220,230,170,0.25)";
      g.fill();
    }

    // 8. buildings: footprints with a cast shadow and a roof ridge
    const roof = (x0: number, z0: number, w: number, d: number, fill: string, edge: string, ridge = true) => {
      g.fillStyle = "rgba(60,40,20,0.28)";
      g.fillRect(X(x0) + 4, X(z0) + 5, X(w), X(d));
      g.fillStyle = fill;
      g.fillRect(X(x0), X(z0), X(w), X(d));
      g.strokeStyle = edge;
      g.lineWidth = 2;
      g.strokeRect(X(x0) + 1, X(z0) + 1, X(w) - 2, X(d) - 2);
      if (ridge) {
        g.beginPath();
        if (w >= d) { g.moveTo(X(x0) + 3, X(z0 + d / 2)); g.lineTo(X(x0 + w) - 3, X(z0 + d / 2)); }
        else { g.moveTo(X(x0 + w / 2), X(z0) + 3); g.lineTo(X(x0 + w / 2), X(z0 + d) - 3); }
        g.strokeStyle = "rgba(40,24,12,0.35)";
        g.lineWidth = 1.5;
        g.stroke();
      }
    };
    for (const s of world.structures) {
      switch (s.kind) {
        case "house":
          if (s.roof === "thatch") roof(s.x0, s.z0, s.w, s.d, "#d8b468", "#8a6a30");
          else roof(s.x0, s.z0, s.w, s.d, s.walls === "brick" ? "#b65a3c" : "#c8704a", "#6e3220");
          break;
        case "wada":
          roof(s.x0, s.z0, s.w, s.d, "#9a6a3e", "#4e3018");
          g.strokeStyle = "rgba(255,230,190,0.35)";
          g.lineWidth = 1;
          for (let k = 1; k < 3; k++) {
            g.beginPath();
            const along = s.w >= s.d;
            if (along) { g.moveTo(X(s.x0 + (s.w * k) / 3), X(s.z0) + 2); g.lineTo(X(s.x0 + (s.w * k) / 3), X(s.z0 + s.d) - 2); }
            else { g.moveTo(X(s.x0) + 2, X(s.z0 + (s.d * k) / 3)); g.lineTo(X(s.x0 + s.w) - 2, X(s.z0 + (s.d * k) / 3)); }
            g.stroke();
          }
          break;
        case "stall": {
          roof(s.x0, s.z0, s.w, s.d, s.awning === "saffron" ? "#ee9a48" : "#5b93c4", "#5a3418", false);
          g.save();
          g.beginPath();
          g.rect(X(s.x0), X(s.z0), X(s.w), X(s.d));
          g.clip();
          g.strokeStyle = "rgba(255,248,230,0.65)";
          g.lineWidth = 3;
          for (let k = X(s.x0) + 4; k < X(s.x0 + s.w); k += 9) { g.beginPath(); g.moveTo(k, X(s.z0)); g.lineTo(k, X(s.z0 + s.d)); g.stroke(); }
          g.restore();
          break;
        }
        case "temple": {
          roof(s.x0, s.z0, 9, 9, "#f6efe0", "#9a7a5a", false);
          // the stepped shikhara seen from above: nested squares, saffron at the crown
          for (let k = 1; k <= 3; k++) {
            g.strokeStyle = "rgba(150,110,80,0.6)";
            g.lineWidth = 1.5;
            g.strokeRect(X(s.x0 + k), X(s.z0 + k), X(9 - 2 * k), X(9 - 2 * k));
          }
          g.beginPath();
          g.arc(X(s.x0 + 4.5), X(s.z0 + 4.5), X(1), 0, Math.PI * 2);
          g.fillStyle = "#e8892c";
          g.fill();
          break;
        }
        case "hanuman":
          roof(s.x0, s.z0, 5, 5, "#ee8a3a", "#7a3a14", false);
          g.beginPath();
          g.arc(X(s.x0 + 2.5), X(s.z0 + 2.5), X(1), 0, Math.PI * 2);
          g.fillStyle = "#fff0d8";
          g.fill();
          break;
        case "school":
          // compound wall, then the block with its blue trim
          g.setLineDash([3, 3]);
          g.strokeStyle = "rgba(90,80,70,0.6)";
          g.lineWidth = 2;
          g.strokeRect(X(s.x0 - 4), X(s.z0 - 2), X(s.w + 5), X(s.d + 5));
          g.setLineDash([]);
          roof(s.x0, s.z0, s.w, s.d, "#f3eee4", "#2d5fb8");
          break;
        case "pir":
          g.beginPath();
          g.arc(X(s.x + 0.5), X(s.z + 0.5), X(1.7), 0, Math.PI * 2);
          g.fillStyle = "#e9e3d0";
          g.fill();
          g.strokeStyle = "#2f8a4a";
          g.lineWidth = 2.5;
          g.stroke();
          g.beginPath();
          g.arc(X(s.x + 0.5), X(s.z + 0.5), X(0.8), 0, Math.PI * 2);
          g.fillStyle = "#2f8a4a";
          g.fill();
          break;
        case "tank":
          g.beginPath();
          g.arc(X(s.x + 0.5) + 4, X(s.z + 0.5) + 5, X(2.2), 0, Math.PI * 2);
          g.fillStyle = "rgba(60,40,20,0.25)";
          g.fill();
          g.beginPath();
          g.arc(X(s.x + 0.5), X(s.z + 0.5), X(2.2), 0, Math.PI * 2);
          g.fillStyle = "#cfd6d4";
          g.fill();
          g.strokeStyle = "#5d7a84";
          g.lineWidth = 2.5;
          g.stroke();
          break;
        case "well":
          g.beginPath();
          g.arc(X(s.x + 0.5), X(s.z + 0.5), X(1.5), 0, Math.PI * 2);
          g.fillStyle = "#b9b2a2";
          g.fill();
          g.strokeStyle = "#5e584c";
          g.lineWidth = 2;
          g.stroke();
          g.beginPath();
          g.arc(X(s.x + 0.5), X(s.z + 0.5), X(0.6), 0, Math.PI * 2);
          g.fillStyle = P.waterDeep;
          g.fill();
          break;
        case "hay":
          g.beginPath();
          g.arc(X(s.x + 0.5), X(s.z + 0.5), X(0.7), 0, Math.PI * 2);
          g.fillStyle = "#e2c06a";
          g.fill();
          g.strokeStyle = "rgba(120,90,30,0.6)";
          g.lineWidth = 1;
          g.stroke();
          break;
        case "statue":
          g.beginPath();
          g.arc(X(s.x + 0.5), X(s.z + 0.5), X(0.9), 0, Math.PI * 2);
          g.fillStyle = "#8a6a3a";
          g.fill();
          g.strokeStyle = "#f3e7c8";
          g.lineWidth = 2;
          g.stroke();
          break;
      }
    }

    // 9. the paper: fibres and speckle, multiplied over everything, then a deckled, darkened edge
    const tile = document.createElement("canvas");
    tile.width = tile.height = 192;
    const nt = tile.getContext("2d")!;
    const ni = nt.createImageData(192, 192);
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 192 * 192; i++) {
      const n = 236 + rnd() * 19;
      ni.data.set([n, n - 4, n - 12, 255], i * 4);
    }
    nt.putImageData(ni, 0, 0);
    nt.strokeStyle = "rgba(150,120,80,0.08)";
    for (let k = 0; k < 40; k++) {
      nt.beginPath();
      const x = rnd() * 192, y = rnd() * 192;
      nt.moveTo(x, y);
      nt.quadraticCurveTo(x + rnd() * 20 - 10, y + rnd() * 20 - 10, x + rnd() * 30 - 15, y + rnd() * 30 - 15);
      nt.stroke();
    }
    g.save();
    g.globalCompositeOperation = "multiply";
    g.fillStyle = g.createPattern(tile, "repeat")!;
    g.fillRect(0, 0, c.width, c.height);
    const vg = g.createRadialGradient(c.width / 2, c.height / 2, c.width * 0.35, c.width / 2, c.height / 2, c.width * 0.75);
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(1, "rgba(170,130,80,0.35)");
    g.fillStyle = vg;
    g.fillRect(0, 0, c.width, c.height);
    g.restore();
    // the neat line round the sheet
    g.strokeStyle = "rgba(80,52,28,0.75)";
    g.lineWidth = 6;
    g.strokeRect(3, 3, c.width - 6, c.height - 6);
    g.lineWidth = 1.5;
    g.strokeRect(14, 14, c.width - 28, c.height - 28);

    // 10. the village's name, lettered large across the gaothan
    g.save();
    g.translate(X(84), X(150));
    g.rotate(-0.12);
    g.font = `italic 700 ${X(3.6)}px ${SERIF}`;
    g.fillStyle = "rgba(110,72,38,0.28)";
    g.textAlign = "center";
    g.fillText("Ukhali Tanda", 0, 0);
    g.font = `600 ${X(2.6)}px ${DEVA}`;
    g.fillText("उखळी तांडा", 0, X(3.6));
    g.restore();
    return c;
  }

  /* ================= opening, closing, the view ================= */

  /** `jobs`: neighbours who have kaam for you today (gold pins). `objective`: where the current mission wants you. */
  show(save: Save, day: number, player: { x: number; z: number; yaw: number }, jobs: Pt[] = [], now = Date.now(), objective: Pt | null = null) {
    this.ensureBase();
    this.save = save;
    this.day = day;
    this.now = now;
    this.player = { ...player };
    this.jobs = jobs;
    this.objective = objective;
    this.open = true;
    this.el.hidden = false;
    this.el.classList.remove("key-open");
    this.hover = null;
    this.buildPicks();
    // open centred on you, about 90 blocks across the view's shorter side (or the whole sheet, if that's bigger)
    requestAnimationFrame(() => {
      if (!this.open) return;
      this.s = Math.max(this.fitScale(), Math.min(this.canvas.clientWidth, this.canvas.clientHeight) / 90);
      this.centreOn(player.x, player.z);
      this.loop();
    });
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    cancelAnimationFrame(this.raf);
    this.pointers.clear();
    this.gesture = null;
    this.onClose();
  }

  private fitScale() {
    return Math.min(this.canvas.clientWidth / W, this.canvas.clientHeight / D) * 0.96;
  }
  private clampView() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.s = Math.max(this.fitScale(), Math.min(26, this.s));
    // keep the sheet in view: centred when it's smaller than the view, never scrolled off when larger
    const hw = w / 2 / this.s, hh = h / 2 / this.s, m = 6;
    this.cx = hw * 2 >= W + m * 2 ? W / 2 : Math.max(hw - m, Math.min(W + m - hw, this.cx));
    this.cz = hh * 2 >= D + m * 2 ? D / 2 : Math.max(hh - m, Math.min(D + m - hh, this.cz));
  }
  private centreOn(x: number, z: number) {
    this.cx = x;
    this.cz = z;
    this.clampView();
  }
  private panBy(dx: number, dz: number) {
    this.cx += dx;
    this.cz += dz;
    this.clampView();
  }
  private zoomAt(k: number, px: number, py: number) {
    const before = this.toWorld(px, py);
    this.s *= k;
    this.clampView();
    const after = this.toWorld(px, py);
    this.cx += before.x - after.x;
    this.cz += before.z - after.z;
    this.clampView();
  }
  private toWorld(px: number, py: number) {
    return { x: this.cx + (px - this.canvas.clientWidth / 2) / this.s, z: this.cz + (py - this.canvas.clientHeight / 2) / this.s };
  }
  private toScreen(x: number, z: number) {
    return { x: (x - this.cx) * this.s + this.canvas.clientWidth / 2, y: (z - this.cz) * this.s + this.canvas.clientHeight / 2 };
  }

  /* ================= input ================= */

  private bindPointer() {
    const cv = this.canvas;
    cv.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = localPoint(cv, e.clientX, e.clientY);
      this.zoomAt(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018)), p.x, p.y);
    }, { passive: false });
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId);
      const p = localPoint(cv, e.clientX, e.clientY);
      this.pointers.set(e.pointerId, p);
      if (this.pointers.size === 1) this.gesture = { moved: 0, pinch: false, last: p, dist: 0 };
      else if (this.gesture && this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.gesture.pinch = true;
        this.gesture.dist = Math.hypot(a.x - b.x, a.y - b.y);
        this.gesture.last = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      }
    });
    cv.addEventListener("pointermove", (e) => {
      const p = localPoint(cv, e.clientX, e.clientY);
      if (!this.pointers.has(e.pointerId)) {
        // hover: which place is under the pointer
        const h = this.pickAt(p.x, p.y);
        if (h !== this.hover) {
          this.hover = h;
          cv.style.cursor = h ? "pointer" : "grab";
        }
        return;
      }
      this.pointers.set(e.pointerId, p);
      const gs = this.gesture;
      if (!gs) return;
      if (this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (gs.dist > 0) this.zoomAt(dist / gs.dist, mid.x, mid.y);
        this.panBy(-(mid.x - gs.last.x) / this.s, -(mid.y - gs.last.y) / this.s);
        gs.dist = dist;
        gs.last = mid;
        gs.moved += 99;
        return;
      }
      const dx = p.x - gs.last.x, dy = p.y - gs.last.y;
      gs.moved += Math.hypot(dx, dy);
      gs.last = p;
      if (gs.moved > 6) {
        cv.style.cursor = "grabbing";
        this.panBy(-dx / this.s, -dy / this.s);
      }
    });
    const up = (e: PointerEvent) => {
      if (!this.pointers.has(e.pointerId)) return;
      const p = localPoint(cv, e.clientX, e.clientY);
      this.pointers.delete(e.pointerId);
      const gs = this.gesture;
      if (this.pointers.size > 0) {
        // one finger lifted from a pinch: carry on panning with the other, never tap
        if (gs) gs.last = [...this.pointers.values()][0];
        return;
      }
      this.gesture = null;
      cv.style.cursor = this.hover ? "pointer" : "grab";
      if (e.type !== "pointerup" || !gs || gs.pinch || gs.moved > 8) return;
      const hit = this.pickAt(p.x, p.y);
      const w = this.toWorld(p.x, p.y);
      if (!hit && (w.x < 0 || w.z < 0 || w.x > W || w.z > D)) return;
      this.onPick(hit ? { x: hit.x, z: hit.z, label: hit.label } : { x: w.x, z: w.z, label: "your marker" });
      this.close();
    };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
  }

  private buildPicks() {
    const picks: Pick[] = [];
    if (this.objective) picks.push({ ...this.objective, kind: "pin", r: 22 });
    for (const j of this.jobs) picks.push({ ...j, kind: "pin", r: 20 });
    for (const p of this.places) picks.push({ x: p.lm.x + 0.5, z: p.lm.z + 0.5, label: p.en, kind: "pin", r: 18 });
    for (const p of this.world.plots)
      picks.push({ x: (p.x0 + p.x1 + 1) / 2, z: (p.z0 + p.z1 + 1) / 2, label: p.name, kind: "plot", r: 0, x0: p.x0, z0: p.z0, x1: p.x1 + 1, z1: p.z1 + 1 });
    this.picks = picks;
  }

  private pickAt(px: number, py: number): Pick | null {
    let best: Pick | null = null, bd = Infinity;
    for (const p of this.picks) {
      if (p.kind !== "pin") continue;
      const s = this.toScreen(p.x, p.z);
      const d = Math.hypot(s.x - px, s.y - py);
      if (d < p.r && d < bd) {
        bd = d;
        best = p;
      }
    }
    if (best) return best;
    const w = this.toWorld(px, py);
    return this.picks.find((p) => p.kind === "plot" && w.x >= p.x0! && w.x < p.x1! && w.z >= p.z0! && w.z < p.z1!) ?? null;
  }

  /* ================= the live layer ================= */

  private loop = () => {
    if (!this.open) return;
    this.draw(performance.now());
    this.raf = requestAnimationFrame(this.loop);
  };

  private draw(t: number) {
    const cv = this.canvas, dpr = Math.min(2.5, devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      this.clampView();
    }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // the table under the sheet
    g.fillStyle = "#2a1d12";
    g.fillRect(0, 0, w, h);
    const s = this.s, o = this.toScreen(0, 0);
    g.save();
    g.shadowColor = "rgba(0,0,0,0.45)";
    g.shadowBlur = 24;
    g.fillStyle = P.paperEdge;
    g.fillRect(o.x, o.y, W * s, D * s);
    g.restore();
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(this.ensureBase(), o.x, o.y, W * s, D * s);

    const save = this.save!;
    const claimed: Box[] = [];
    const onTop: (() => void)[] = [];
    const pulse = 0.5 + 0.5 * Math.sin(t / 380);

    // ownership over the fields
    for (const p of this.world.plots) {
      const mine = save.plots.includes(p.id);
      const listed = !!save.listings[p.id];
      const sale = !mine && forSale(p, this.day);
      if (!mine && !sale) continue;
      const a = this.toScreen(p.x0 + 0.25, p.z0 + 0.25), bw = (p.x1 - p.x0 + 0.5) * s, bh = (p.z1 - p.z0 + 0.5) * s;
      const col = mine ? (listed ? P.listed : P.mine) : P.sale;
      roundRect(g, a.x, a.y, bw, bh, Math.min(8, s));
      g.fillStyle = hexA(col, mine ? 0.2 : 0.14);
      g.fill();
      g.setLineDash(sale ? [7, 5] : []);
      g.strokeStyle = col;
      g.lineWidth = 2.5;
      g.stroke();
      g.setLineDash([]);
    }

    // markers claim their space first so no label sits on one; drawn last so they sit on top
    const you = this.toScreen(this.player.x, this.player.z);
    claimed.push(box(you.x - 14, you.y - 14, 28, 28));
    const jobsAt = this.jobs.map((j) => ({ j, p: this.toScreen(j.x, j.z) }));
    for (const { p } of jobsAt) claimed.push(box(p.x - 12, p.y - 26, 24, 30));
    const obj = this.objective ? this.toScreen(this.objective.x, this.objective.z) : null;
    if (obj) claimed.push(box(obj.x - 14, obj.y - 34, 28, 38));
    const placeAt = this.places.map((pl) => ({ pl, p: this.toScreen(pl.lm.x + 0.5, pl.lm.z + 0.5) }));
    const badge = s < 5 ? 8 : 10;

    // labels in order of importance; one that would overlap is dropped (its marker stays)
    const label = (lines: { text: string; font: string; color: string }[], px: number, py: number, side: "right" | "left" | "below" | "above", gap: number, plate = false) => {
      const dims = lines.map((l) => {
        g.font = l.font;
        return { w: g.measureText(l.text).width, h: parseFloat(/(\d+(\.\d+)?)px/.exec(l.font)![1]) * 1.15 };
      });
      const tw = Math.max(...dims.map((d) => d.w)), th = dims.reduce((a, d) => a + d.h, 0);
      const tries: ("right" | "left" | "below" | "above")[] = [side, ...(["right", "left", "below", "above"] as const).filter((x) => x !== side)];
      for (const sd of tries) {
        const x = sd === "right" ? px + gap : sd === "left" ? px - gap - tw : px - tw / 2;
        const y = sd === "below" ? py + gap : sd === "above" ? py - gap - th : py - th / 2;
        const bx = box(x - 3, y - 2, tw + 6, th + 4);
        if (bx.x1 < 0 || bx.y1 < 0 || bx.x0 > w || bx.y0 > h) return false;
        if (claimed.some((c) => overlaps(c, bx))) continue;
        claimed.push(bx);
        const paint = () => {
          if (plate) {
            roundRect(g, x - 6, y - 3, tw + 12, th + 6, 6);
            g.fillStyle = "rgba(42,28,16,0.9)";
            g.fill();
            g.strokeStyle = "rgba(255,222,170,0.35)";
            g.lineWidth = 1;
            g.stroke();
          }
          let yy = y;
          g.textBaseline = "top";
          g.textAlign = "left";
          lines.forEach((l, i) => {
            g.font = l.font;
            if (!plate) {
              g.lineJoin = "round";
              g.lineWidth = 4;
              g.strokeStyle = P.halo;
              g.strokeText(l.text, x + (tw - dims[i].w) / 2 * (sd === "below" || sd === "above" ? 1 : 0) + (sd === "left" ? tw - dims[i].w : 0), yy);
            }
            g.fillStyle = l.color;
            g.fillText(l.text, x + (tw - dims[i].w) / 2 * (sd === "below" || sd === "above" ? 1 : 0) + (sd === "left" ? tw - dims[i].w : 0), yy);
            yy += dims[i].h;
          });
        };
        // the mission's and the jobs' plates go on top of everything else, so nothing hides them
        if (plate) onTop.push(paint);
        else paint();
        return true;
      }
      return false;
    };

    if (obj && this.objective) label([{ text: "MISSION", font: `800 9.5px ${SANS}`, color: "#ffb39e" }, { text: this.objective.label, font: `700 13px ${SANS}`, color: "#fff4dc" }], obj.x, obj.y - 22, "right", 16, true);
    for (const { j, p } of jobsAt) label([{ text: "KAAM", font: `800 9.5px ${SANS}`, color: P.kaam }, { text: j.label, font: `700 12px ${SANS}`, color: "#fff0c8" }], p.x, p.y - 12, "right", 16, true);
    // the place badges claim theirs only now: the mission and the jobs may sit over one, never under
    for (const { pl, p } of placeAt) if (pl.rank <= this.rankLimit()) claimed.push(box(p.x - badge, p.y - badge, badge * 2, badge * 2));
    const big = s >= 5.5;
    for (const { pl, p } of [...placeAt].sort((a, b) => a.pl.rank - b.pl.rank)) {
      if (pl.rank > this.rankLimit()) continue;
      const lines = [{ text: pl.en, font: `700 ${big ? 13.5 : 12}px ${SERIF}`, color: P.ink }];
      if (pl.mr && big) lines.push({ text: pl.mr, font: `600 ${11}px ${pl.mr === "your home" || pl.mr === "field well" ? SANS : DEVA}`, color: "#8a4b22" });
      label(lines, p.x, p.y, "right", badge + 4);
    }
    // field names, with what's going on in yours or what one costs
    if (s >= 3.2)
      for (const p of this.world.plots) {
        const mine = save.plots.includes(p.id);
        const listed = !!save.listings[p.id];
        const sale = !mine && forSale(p, this.day);
        const c = this.toScreen((p.x0 + p.x1 + 1) / 2, (p.z0 + p.z1 + 1) / 2);
        const lines = [{ text: p.name, font: `italic 600 ${s >= 6 ? 12.5 : 11}px ${SERIF}`, color: mine ? "#1f5a2a" : sale ? "#7a3f0a" : "rgba(70,52,30,0.85)" }];
        if (sale) lines.push({ text: `for sale · ₹${askingPrice(p, this.day).toLocaleString("en-IN")}`, font: `700 11px ${SANS}`, color: "#9a4a08" });
        if (mine) {
          let ripe = 0;
          for (const [k, cell] of Object.entries(save.farm)) {
            if (!cell.plant) continue;
            const i = Number(k), x = i % W, z = Math.floor(i / W) % D;
            if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
            if (advance(cell.plant, cell.wetUntil, this.now).progress >= 1) ripe++;
          }
          lines.push({ text: ripe ? `${ripe} ripe — harvest` : listed ? "yours · listed" : "yours", font: `700 11px ${SANS}`, color: ripe ? "#8a5a00" : listed ? "#28509a" : "#2a6a34" });
        }
        label(lines, c.x, c.y, "below", -lines.length * 7);
      }

    // the place badges
    for (const { pl, p } of placeAt) {
      if (pl.rank > this.rankLimit()) continue;
      const hov = this.hover && this.hover.x === pl.lm.x + 0.5 && this.hover.z === pl.lm.z + 0.5;
      drawBadge(g, p.x, p.y, hov ? badge + 2 : badge, pl.color, pl.glyph);
    }

    // your marker (blue pin)
    if (this.waypoint) {
      const p = this.toScreen(this.waypoint.x, this.waypoint.z);
      drawPin(g, p.x, p.y, P.marker, "#0b2a44");
      g.beginPath();
      g.arc(p.x, p.y - 20, 3.2, 0, Math.PI * 2);
      g.fillStyle = "#fff";
      g.fill();
    }
    // kaam: gold "!" discs
    for (const { p } of jobsAt) {
      g.beginPath();
      g.arc(p.x, p.y - 12, 11, 0, Math.PI * 2);
      g.fillStyle = P.kaam;
      g.fill();
      g.lineWidth = 2.5;
      g.strokeStyle = P.kaamInk;
      g.stroke();
      g.beginPath();
      g.moveTo(p.x, p.y - 1);
      g.lineTo(p.x - 4, p.y - 4);
      g.lineTo(p.x + 4, p.y - 4);
      g.closePath();
      g.fillStyle = P.kaamInk;
      g.fill();
      g.font = `900 14px ${SANS}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("!", p.x, p.y - 11.5);
    }
    // the mission objective: a red diamond on a stalk, with a pulsing ring on the ground
    if (obj) {
      g.beginPath();
      g.ellipse(obj.x, obj.y, 8 + pulse * 10, (8 + pulse * 10) * 0.55, 0, 0, Math.PI * 2);
      g.strokeStyle = hexA(P.mission, 0.75 - pulse * 0.6);
      g.lineWidth = 2.5;
      g.stroke();
      g.beginPath();
      g.moveTo(obj.x, obj.y);
      g.lineTo(obj.x, obj.y - 14);
      g.strokeStyle = "#5a1a0c";
      g.lineWidth = 2;
      g.stroke();
      g.beginPath();
      g.moveTo(obj.x, obj.y - 32);
      g.lineTo(obj.x + 10, obj.y - 22);
      g.lineTo(obj.x, obj.y - 12);
      g.lineTo(obj.x - 10, obj.y - 22);
      g.closePath();
      g.fillStyle = P.mission;
      g.fill();
      g.strokeStyle = "#fff4e4";
      g.lineWidth = 2;
      g.stroke();
      g.beginPath();
      g.arc(obj.x, obj.y - 22, 3, 0, Math.PI * 2);
      g.fillStyle = "#fff4e4";
      g.fill();
    }
    // you: a cream arrow ringed in teal, the way you face
    g.beginPath();
    g.arc(you.x, you.y, 13 + pulse * 3, 0, Math.PI * 2);
    g.fillStyle = hexA(P.you, 0.18);
    g.fill();
    g.save();
    g.translate(you.x, you.y);
    g.rotate(-this.player.yaw);
    g.beginPath();
    g.moveTo(0, -11);
    g.lineTo(8, 8);
    g.lineTo(0, 4);
    g.lineTo(-8, 8);
    g.closePath();
    g.fillStyle = "#fffaf0";
    g.fill();
    g.lineJoin = "round";
    g.lineWidth = 2.5;
    g.strokeStyle = P.you;
    g.stroke();
    g.restore();

    for (const f of onTop) f();
    // off the edge of the view: a little arrow pointing to the mission and to you
    if (obj && this.objective) edgeArrow(g, obj.x, obj.y - 20, w, h, P.mission);
    edgeArrow(g, you.x, you.y, w, h, P.you);

    // hover: the place's name on a plate under the pointer
    if (this.hover && !this.pointers.size) {
      const p = this.toScreen(this.hover.x, this.hover.z);
      g.font = `700 12px ${SANS}`;
      const text = `Guide me to ${this.hover.label}`;
      const tw = g.measureText(text).width;
      const x = Math.max(6, Math.min(w - tw - 18, p.x - tw / 2 - 6)), y = Math.min(h - 30, p.y + 18);
      roundRect(g, x, y, tw + 12, 22, 6);
      g.fillStyle = "rgba(20,13,8,0.9)";
      g.fill();
      g.fillStyle = "#ffe2a8";
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText(text, x + 6, y + 11.5);
    }

    drawCompass(g, w - 34, 34);
    drawScale(g, 14, h - 18, s);
  }

  /** Zoomed out, only the big places get a badge; the shops and wells come in closer. */
  private rankLimit() {
    return this.s >= 5.5 ? 4 : this.s >= 3.6 ? 3 : 2;
  }
}

/* ================= small drawing helpers ================= */

type Box = { x0: number; y0: number; x1: number; y1: number };
const box = (x: number, y: number, w: number, h: number): Box => ({ x0: x, y0: y, x1: x + w, y1: y + h });
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a))})`;
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function ripples(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.strokeStyle = "rgba(255,255,255,0.55)";
  g.lineWidth = 2;
  g.lineCap = "round";
  for (const [dx, dy] of [[-0.4, -0.3], [0.2, 0.25]]) {
    g.beginPath();
    g.moveTo(x + dx * r * 2 - r * 0.4, y + dy * r * 2);
    g.quadraticCurveTo(x + dx * r * 2 - r * 0.2, y + dy * r * 2 - 4, x + dx * r * 2, y + dy * r * 2);
    g.quadraticCurveTo(x + dx * r * 2 + r * 0.2, y + dy * r * 2 + 4, x + dx * r * 2 + r * 0.4, y + dy * r * 2);
    g.stroke();
  }
}
function drawPin(g: CanvasRenderingContext2D, x: number, y: number, fill: string, ink: string) {
  g.beginPath();
  g.moveTo(x, y);
  g.bezierCurveTo(x - 4, y - 8, x - 9, y - 13, x - 9, y - 20);
  g.arc(x, y - 20, 9, Math.PI, 0);
  g.bezierCurveTo(x + 9, y - 13, x + 4, y - 8, x, y);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = ink;
  g.lineWidth = 2;
  g.stroke();
}
function edgeArrow(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  const m = 22;
  if (x >= 0 && y >= 0 && x <= w && y <= h) return;
  const cx = w / 2, cy = h / 2, a = Math.atan2(y - cy, x - cx);
  const k = Math.min(Math.abs((w / 2 - m) / Math.cos(a) || Infinity), Math.abs((h / 2 - m) / Math.sin(a) || Infinity));
  const ex = cx + Math.cos(a) * k, ey = cy + Math.sin(a) * k;
  g.save();
  g.translate(ex, ey);
  g.rotate(a);
  g.beginPath();
  g.arc(0, 0, 13, 0, Math.PI * 2);
  g.fillStyle = "rgba(30,20,12,0.85)";
  g.fill();
  g.beginPath();
  g.moveTo(8, 0);
  g.lineTo(-4, -6);
  g.lineTo(-1, 0);
  g.lineTo(-4, 6);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.restore();
}
function drawCompass(g: CanvasRenderingContext2D, x: number, y: number) {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.arc(0, 0, 21, 0, Math.PI * 2);
  g.fillStyle = "rgba(246,236,208,0.88)";
  g.fill();
  g.strokeStyle = "rgba(80,52,28,0.8)";
  g.lineWidth = 1.5;
  g.stroke();
  for (let k = 0; k < 4; k++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(0, -16);
    g.lineTo(4, 0);
    g.lineTo(-4, 0);
    g.closePath();
    g.fillStyle = k === 3 ? "#b0442a" : "rgba(80,52,28,0.75)";
    g.fill();
  }
  g.font = `800 9px ${SERIF}`;
  g.fillStyle = "#fff6e0";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("N", 0, -9);
  g.restore();
}
/** A scale bar in metres (1 block is about 4.2 m on the ground). */
function drawScale(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const target = 90; // px, roughly
  const metres = [25, 50, 100, 200, 250, 500].find((m) => (m / 4.2) * s >= target * 0.6) ?? 500;
  const px = (metres / 4.2) * s;
  roundRect(g, x - 6, y - 18, px + 12, 26, 6);
  g.fillStyle = "rgba(246,236,208,0.85)";
  g.fill();
  g.fillStyle = "rgba(59,42,26,0.9)";
  g.fillRect(x, y, px, 3);
  g.fillRect(x, y - 4, 2, 7);
  g.fillRect(x + px - 2, y - 4, 2, 7);
  g.fillRect(x + px / 2 - 1, y - 2, 2, 5);
  g.font = `700 10px ${SANS}`;
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText(`${metres} m`, x + px / 2, y - 5);
}
function drawBadge(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, glyph: Glyph) {
  g.beginPath();
  g.arc(x + 1, y + 2, r, 0, Math.PI * 2);
  g.fillStyle = "rgba(40,24,10,0.35)";
  g.fill();
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "#fbf3e0";
  g.stroke();
  g.save();
  g.translate(x, y);
  const k = r / 10;
  g.scale(k, k);
  g.fillStyle = "#fffaf0";
  g.strokeStyle = "#fffaf0";
  g.lineWidth = 1.6;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.beginPath();
  switch (glyph) {
    case "mandir": // a shikhara with its flag
      g.moveTo(-5, 5); g.lineTo(-5, 1); g.lineTo(0, -5); g.lineTo(5, 1); g.lineTo(5, 5); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, -5); g.lineTo(0, -8); g.stroke();
      g.beginPath(); g.moveTo(0, -8); g.lineTo(4, -7); g.lineTo(0, -6); g.fill();
      break;
    case "school": // an open book
      g.moveTo(0, -3); g.quadraticCurveTo(-3, -5, -6, -4); g.lineTo(-6, 4); g.quadraticCurveTo(-3, 3, 0, 5); g.quadraticCurveTo(3, 3, 6, 4); g.lineTo(6, -4); g.quadraticCurveTo(3, -5, 0, -3); g.fill();
      g.beginPath(); g.strokeStyle = "rgba(0,0,0,0.3)"; g.moveTo(0, -3); g.lineTo(0, 5); g.stroke();
      break;
    case "pir": // a dome with a finial
      g.moveTo(-6, 5); g.lineTo(-6, 2); g.arc(0, 2, 6, Math.PI, 0); g.lineTo(6, 5); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(0, -4); g.lineTo(0, -7); g.stroke();
      break;
    case "tank": // a drop
      g.moveTo(0, -7); g.bezierCurveTo(4, -2, 6, 1, 6, 3); g.arc(0, 3, 6, 0, Math.PI); g.bezierCurveTo(-6, 1, -4, -2, 0, -7); g.fill();
      break;
    case "well":
      g.arc(0, 0, 5, 0, Math.PI * 2); g.lineWidth = 2.4; g.stroke();
      g.beginPath(); g.arc(0, 0, 2, 0, Math.PI * 2); g.fill();
      break;
    case "rupee":
    case "mandi":
      g.font = `900 13px ${SANS}`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("₹", 0, 1);
      break;
    case "seed": // a sprout
      g.moveTo(0, 6); g.lineTo(0, -1); g.lineWidth = 2; g.stroke();
      g.beginPath(); g.ellipse(-3, -2, 3.5, 2, -0.6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(3, -4, 3.5, 2, 0.6, 0, Math.PI * 2); g.fill();
      break;
    case "scroll": // a paper with lines
      g.rect(-4.5, -6, 9, 12); g.fill();
      g.beginPath(); g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 1.2;
      for (const yy of [-3, 0, 3]) { g.moveTo(-2.5, yy); g.lineTo(2.5, yy); }
      g.stroke();
      break;
    case "bank": // columns under a pediment
      g.moveTo(-7, -2); g.lineTo(0, -7); g.lineTo(7, -2); g.closePath(); g.fill();
      g.fillRect(-6, 4, 12, 2);
      for (const xx of [-4.5, -0.75, 3]) g.fillRect(xx, -1, 1.6, 5);
      break;
    case "home":
      g.moveTo(-6, 0); g.lineTo(0, -6); g.lineTo(6, 0); g.lineTo(4.5, 0); g.lineTo(4.5, 6); g.lineTo(-4.5, 6); g.lineTo(-4.5, 0); g.closePath(); g.fill();
      break;
    case "court":
      g.rect(-6, -4, 12, 8); g.lineWidth = 1.8; g.stroke();
      g.beginPath(); g.moveTo(0, -4); g.lineTo(0, 4); g.stroke();
      break;
    case "talav":
      for (const yy of [-2.5, 2.5]) { g.moveTo(-6, yy); g.quadraticCurveTo(-3, yy - 3, 0, yy); g.quadraticCurveTo(3, yy + 3, 6, yy); }
      g.lineWidth = 2; g.stroke();
      break;
    case "people":
      g.arc(0, -3, 3, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(0, 6, 5.5, Math.PI, 0); g.fill();
      break;
  }
  g.restore();
}
