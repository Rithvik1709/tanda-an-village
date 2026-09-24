import { B } from "../../shared/blocks";
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

  constructor(parent: HTMLElement, private world: World) {
    this.el = document.createElement("div");
    this.el.className = "mapview";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="map-card"><button class="x" title="Close (M)">✕</button><h2>Ukhali Tanda <small>उखळी तांडा · the tanda map</small></h2><canvas></canvas>
      <div class="map-legend"><span><i style="background:#3fbf5a"></i>your land</span><span><i style="background:#f0a030"></i>for sale</span><span><i style="background:#5a8fe0"></i>you listed</span><span><i style="background:#ffffff"></i>other farms</span><span>▲ you</span></div><div class="map-credit">Roads: © OpenStreetMap contributors</div></div>`;
    parent.appendChild(this.el);
    this.canvas = this.el.querySelector("canvas")!;
    this.el.querySelector(".x")!.addEventListener("click", () => this.close());
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

  show(save: Save, day: number, player: { x: number; z: number; yaw: number }) {
    this.open = true;
    this.el.hidden = false;
    const S = 3;
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
      if (sale) label(g, `₹${askingPrice(p, day).toLocaleString("en-IN")}`, cx, cz + 12, "#ffd98a");
      if (mine) label(g, listed ? "listed" : "yours", cx, cz + 12, listed ? "#bcd4ff" : "#c8f5c0");
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
      [L.pir, "Pir Baba", 6, 4, "left"],
      [L.market, "Town mandi (to Jalna)", 6, -10, "left"],
      [L.ghat, "Vihir", 8, 4, "left"],
    ];
    for (const [lm, text, dx, dz, align] of pins) {
      const px = (lm.x + 0.5) * S, pz = (lm.z + 0.5) * S;
      g.fillStyle = "#fff";
      g.strokeStyle = "rgba(20,14,10,0.8)";
      g.lineWidth = 2;
      g.beginPath();
      g.arc(px, pz, 3.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.textAlign = align;
      label(g, text, px + dx, pz + dz, "#ffffff", true);
      g.textAlign = "center";
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
