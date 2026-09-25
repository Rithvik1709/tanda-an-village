import { B } from "../../shared/blocks";
import { advance } from "../../shared/crops";
import { askingPrice, forSale } from "../../shared/land";
import type { Save } from "../../shared/save";
import { D, H, W, type World } from "../../shared/world";

/** Top-down village map (M): terrain from the surface blocks, plots coloured by who owns them. */
const COLORS: Record<number, string> = {
  [B.GRASS]: "#7ea84a", [B.DIRT]: "#8a6a48", [B.BLACK_SOIL]: "#4d433e", [B.RED_SOIL]: "#9a4a2e", [B.TILLED]: "#3a302b", [B.TILLED_WET]: "#2e2724",
  [B.STONE]: "#8d8a83", [B.SAND]: "#d8c28e", [B.WATER]: "#4f9ab0", [B.LOG]: "#6a5238", [B.LEAVES]: "#3f6b2c", [B.BANYAN_LEAVES]: "#35602a",
  [B.PLANKS]: "#b58a58", [B.THATCH]: "#c9a45c", [B.WHITEWASH]: "#ece4d4", [B.BRICK]: "#b5563a", [B.ROAD]: "#b8a07a", [B.FENCE]: "#7a5c3c",
  [B.ROOF_TILE]: "#b8553a", [B.COBBLE]: "#9a958c", [B.SAFFRON]: "#e8892c", [B.BLUE_WOOD]: "#3f7fb0", [B.HAY]: "#d9b35a",
};

export class MapView {
  private el: HTMLElement;
  private base: HTMLCanvasElement;
  private canvas: HTMLCanvasElement;
  open = false;
  onClose: () => void = () => {};
  /** A place was picked on the map: guide the player there. */
  onPick: (p: { x: number; z: number; label: string }) => void = () => {};
  private picks: { x: number; z: number; label: string; r: number }[] = [];
  /** The waypoint you set, drawn as a blue pin. */
  waypoint: { x: number; z: number } | null = null;
  private S = 3;

  constructor(parent: HTMLElement, private world: World) {
    this.el = document.createElement("div");
    this.el.className = "mapview";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="map-card"><button class="x" title="Close (M)">✕</button><h2>Ukhali Tanda <small>उखळी तांडा · the tanda map</small></h2><p class="map-tip">${typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches ? "Tap" : "Click"} a place to be guided there</p><canvas></canvas>
      <div class="map-legend"><span><i style="background:#3fbf5a"></i>your land</span><span><i style="background:#f0a030"></i>for sale</span><span><i style="background:#5a8fe0"></i>you listed</span><span><i style="background:#ffffff"></i>other farms</span><span><i style="background:#f2b12e;border-radius:50%"></i>kaam (a job)</span><span>▲ you</span></div><div class="map-credit">Roads: © OpenStreetMap contributors</div></div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector("canvas")!;
    this.el.querySelector(".x")!.addEventListener("click", () => this.close());
    // pick the nearest named place under the pointer (a landmark, a neighbour, a field), else the spot itself
    this.canvas.addEventListener("click", (e) => {
      const b = this.canvas.getBoundingClientRect();
      // (on a phone held upright the whole game is turned; read the pointer in the canvas's own axes)
      const turned = document.documentElement.classList.contains("rotated");
      const fx = turned ? (e.clientY - b.top) / b.height : (e.clientX - b.left) / b.width;
      const fz = turned ? 1 - (e.clientX - b.left) / b.width : (e.clientY - b.top) / b.height;
      const x = fx * W, z = fz * D;
      let best: (typeof this.picks)[number] | null = null, bd = Infinity;
      for (const p of this.picks) {
        const d = Math.hypot(p.x - x, p.z - z) - p.r;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      this.onPick(best && bd < 4 ? best : { x, z, label: "your marker" });
      this.close();
    });
    this.base = this.paintTerrain();
  }

  private paintTerrain() {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = D;
    const g = c.getContext("2d")!;
    const img = g.createImageData(W, D);
    const v = this.world.voxels;
    for (let z = 0; z < D; z++)
      for (let x = 0; x < W; x++) {
        let y = H - 1;
        let id = 0;
        for (; y > 0; y--) {
          id = v[x + W * (z + D * y)];
          if (id && id !== B.TALL_GRASS && id !== B.MARIGOLD) break;
        }
        const hex = COLORS[id] ?? "#7ea84a";
        const shade = 0.82 + (y - 12) * 0.035; // higher ground reads lighter
        const i = (z * W + x) * 4;
        for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, parseInt(hex.slice(1 + k * 2, 3 + k * 2), 16) * shade));
        img.data[i + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  /** `jobs`: neighbours who have kaam for you today (drawn as gold "!" pins). */
  show(save: Save, day: number, player: { x: number; z: number; yaw: number }, jobs: { x: number; z: number; label: string }[] = [], now = Date.now()) {
    this.open = true;
    this.el.hidden = false;
    const S = this.S;
    this.picks = [];
    // labels that would overlap one already drawn are dropped (the dot stays)
    const placed: [number, number, number, number][] = [];
    const room = (x: number, y: number, w: number, h: number) => {
      if (placed.some(([a, b, c, d]) => x < c && x + w > a && y < d && y + h > b)) return false;
      placed.push([x, y, x + w, y + h]);
      return true;
    };
    const cv = this.canvas;
    cv.width = W * S;
    cv.height = D * S;
    const g = cv.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0, W * S, D * S);
    g.font = "600 11px system-ui";
    g.textAlign = "center";
    for (const p of this.world.plots) {
      const mine = save.plots.includes(p.id);
      const listed = !!save.listings[p.id];
      const sale = !mine && forSale(p, day);
      const col = mine ? (listed ? "#5a8fe0" : "#3fbf5a") : sale ? "#f0a030" : "rgba(255,255,255,0.7)";
      g.strokeStyle = col;
      g.lineWidth = mine || sale ? 3 : 1.5;
      g.strokeRect(p.x0 * S + 1, p.z0 * S + 1, (p.x1 - p.x0 + 1) * S - 2, (p.z1 - p.z0 + 1) * S - 2);
      if (mine || sale) {
        g.fillStyle = mine ? "rgba(63,191,90,0.18)" : "rgba(240,160,48,0.16)";
        g.fillRect(p.x0 * S, p.z0 * S, (p.x1 - p.x0 + 1) * S, (p.z1 - p.z0 + 1) * S);
      }
      const cx = ((p.x0 + p.x1 + 1) / 2) * S, cz = ((p.z0 + p.z1 + 1) / 2) * S;
      label(g, p.name, cx, cz - 2);
      placed.push([cx - 40, cz - 14, cx + 40, cz + 16]);
      this.picks.push({ x: (p.x0 + p.x1 + 1) / 2, z: (p.z0 + p.z1 + 1) / 2, label: p.name, r: Math.min(p.x1 - p.x0, p.z1 - p.z0) / 2 });
      if (sale) label(g, `₹${askingPrice(p, day).toLocaleString("en-IN")}`, cx, cz + 12, "#ffd98a");
      if (mine) {
        // how many are ripe here
        let ripe = 0;
        for (const [k, cell] of Object.entries(save.farm)) {
          if (!cell.plant) continue;
          const i = Number(k), x = i % W, z = Math.floor(i / W) % D;
          if (x < p.x0 || x > p.x1 || z < p.z0 || z > p.z1) continue;
          if (advance(cell.plant, cell.wetUntil, now).progress >= 1) ripe++;
        }
        label(g, ripe ? `🌾 ${ripe} ripe` : listed ? "listed" : "yours", cx, cz + 12, ripe ? "#ffe27a" : listed ? "#bcd4ff" : "#c8f5c0");
      }
    }
    // the few places worth finding, nudged so the village square doesn't turn into a pile of text
    const L = this.world.landmarks;
    const pins: [typeof L.trader, string, number, number, CanvasTextAlign][] = [
      [L.temple, "Sevalal mandir", 0, -10, "center"],
      [L.trader, "Trader", 6, -2, "left"],
      [L.seedShop, "Seed shop", 6, 8, "left"],
      [L.landOffice, "Naik (land)", -6, 8, "right"],
      [L.bank, "Bank", 6, -6, "left"],
      [L.hanuman, "Hanuman mandir", 6, -4, "left"],
      [L.school, "Z.P. school", 6, 8, "left"],
      [L.pir, "Pir Baba", -6, 4, "right"],
      [L.tank, "Water tank", 6, 4, "left"],
      [L.market, "Town mandi (to Jalna)", 6, -10, "left"],
      [L.ghat, "Vihir", 8, 4, "left"],
      [L.kabaddi, "Kabaddi maidan", -6, -6, "right"],
      [L.talav, "Talav (fishing)", 8, 10, "left"],
    ];
    // dots and job circles first (they claim their space), then the labels that still fit
    for (const [lm, text] of pins) {
      const px = (lm.x + 0.5) * S, pz = (lm.z + 0.5) * S;
      this.picks.push({ x: lm.x + 0.5, z: lm.z + 0.5, label: text, r: 1 });
      g.fillStyle = "#fff";
      g.strokeStyle = "rgba(20,14,10,0.8)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px, pz, 3.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      placed.push([px - 4, pz - 4, px + 4, pz + 4]);
    }
    for (const j of jobs) {
      const px = j.x * S, pz = j.z * S;
      this.picks.push({ x: j.x, z: j.z, label: j.label, r: 1.5 });
      g.fillStyle = "#f2b12e";
      g.strokeStyle = "#3a2406";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px, pz, 7, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.fillStyle = "#3a2406";
      g.font = "900 11px system-ui";
      g.textAlign = "center";
      g.fillText("!", px, pz + 4);
      placed.push([px - 8, pz - 8, px + 8, pz + 8]);
    }
    /** Try the label's own spot, then above, below, left and right of its point; skip it if none is free. */
    const place = (text: string, px: number, pz: number, dx: number, dz: number, align: CanvasTextAlign, color: string) => {
      g.font = "700 10px system-ui";
      const w = g.measureText(text).width;
      const tries: [number, number, CanvasTextAlign][] = [[dx, dz, align], [0, -9, "center"], [0, 16, "center"], [7, 4, "left"], [-7, 4, "right"]];
      for (const [ox, oz, al] of tries) {
        const lx = al === "left" ? px + ox : al === "right" ? px + ox - w : px + ox - w / 2;
        if (!room(lx - 2, pz + oz - 10, w + 4, 13)) continue;
        g.textAlign = al;
        label(g, text, px + ox, pz + oz, color, true);
        g.textAlign = "center";
        return;
      }
    };
    for (const j of jobs) place(j.label, j.x * S, j.z * S, 0, -11, "center", "#ffd98a");
    for (const [lm, text, dx, dz, align] of pins) place(text, (lm.x + 0.5) * S, (lm.z + 0.5) * S, dx, dz, align, "#ffffff");
    // your waypoint, if you set one
    if (this.waypoint) {
      const wx = this.waypoint.x * S, wz = this.waypoint.z * S;
      g.fillStyle = "#4fb3ff";
      g.strokeStyle = "#0b2a44";
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(wx, wz);
      g.arc(wx, wz - 12, 7, Math.PI * 0.8, Math.PI * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
    }
    // you
    g.save();
    g.translate(player.x * S, player.z * S);
    g.rotate(-player.yaw);
    g.fillStyle = "#fff";
    g.strokeStyle = "#1a1410";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6, 6);
    g.lineTo(-6, 6);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }
}

function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#ffffff", small = false) {
  g.font = small ? "700 10px system-ui" : "700 12px system-ui";
  g.lineWidth = 3;
  g.strokeStyle = "rgba(20,14,10,0.75)";
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}
