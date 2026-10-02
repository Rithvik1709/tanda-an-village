/*
 * The minimap in the bottom-right corner: a north-up window onto the same painted sheet the full map
 * (M) uses, centred on you, with your facing, the mission objective, today's kaam and your marker.
 * The sheet is drawn once by MapView; each frame here is one image crop plus a few markers, and it
 * only redraws a dozen times a second. Clicking it opens the full map.
 */
type Pt = { x: number; z: number };

const SHEET_PX = 10; // the full map's sheet is drawn at 10 px per block
const SPAN = 64; // blocks shown across
const COLORS = { mission: "#e2553d", kaam: "#f0c36a", pin: "#3d8fe0", you: "#fff4dc", youInk: "#10717c" };

export class MiniMap {
  private el: HTMLElement;
  private canvas: HTMLCanvasElement;
  private last = 0;
  onOpen: () => void = () => {};

  constructor(parent: HTMLElement, private sheet: () => HTMLCanvasElement) {
    this.el = document.createElement("div");
    this.el.className = "minimap";
    this.el.hidden = true;
    this.el.innerHTML = `<button class="minimap-stage" aria-label="Open the village map (M)"><canvas></canvas></button><p class="minimap-foot"><kbd>M</kbd> for the full map</p>`;
    this.canvas = this.el.querySelector("canvas")!;
    this.el.querySelector("button")!.addEventListener("click", () => this.onOpen());
    parent.appendChild(this.el);
  }

  set visible(v: boolean) {
    if (this.el.hidden === !v) return;
    this.el.hidden = !v;
    this.last = 0; // draw straight away when it reappears
  }

  update(now: number, player: Pt & { yaw: number }, objective: Pt | null, kaam: () => Pt[], waypoint: Pt | null) {
    if (this.el.hidden || now - this.last < 80) return;
    this.last = now;
    const cv = this.canvas;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w || !h) return;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = w / SPAN; // css px per block
    const ox = w / 2 - player.x * s, oz = h / 2 - player.z * s;
    const at = (p: Pt) => ({ x: ox + p.x * s, y: oz + p.z * s });

    g.fillStyle = "#2a1d12";
    g.fillRect(0, 0, w, h);
    const sheet = this.sheet();
    const src = SPAN * SHEET_PX, srcH = src * (h / w);
    g.drawImage(sheet, player.x * SHEET_PX - src / 2, player.z * SHEET_PX - srcH / 2, src, srcH, 0, 0, w, h);

    // markers: inside the window where they are, or pinned to its edge pointing the way
    const edge = (p: Pt, color: string, r: number, ring = false) => {
      let { x, y } = at(p);
      const pad = r + 4;
      const off = x < pad || y < pad || x > w - pad || y > h - pad;
      x = Math.max(pad, Math.min(w - pad, x));
      y = Math.max(pad, Math.min(h - pad, y));
      g.beginPath();
      g.arc(x, y, off ? r * 0.8 : r, 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
      g.lineWidth = 2;
      g.strokeStyle = "rgba(30, 18, 8, 0.85)";
      g.stroke();
      if (ring && !off) {
        g.beginPath();
        g.arc(x, y, r + 4 + Math.sin(now / 260) * 1.5, 0, Math.PI * 2);
        g.strokeStyle = color;
        g.lineWidth = 1.5;
        g.stroke();
      }
    };
    for (const k of kaam()) edge(k, COLORS.kaam, 5);
    if (waypoint) edge(waypoint, COLORS.pin, 5);
    if (objective) edge(objective, COLORS.mission, 6, true);

    // you: an arrow pointing the way you face (yaw 0 faces north, up the sheet)
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(-player.yaw);
    g.beginPath();
    g.moveTo(0, -9);
    g.lineTo(6.5, 7);
    g.lineTo(0, 3.5);
    g.lineTo(-6.5, 7);
    g.closePath();
    g.fillStyle = COLORS.you;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = COLORS.youInk;
    g.stroke();
    g.restore();

    // north
    g.font = "700 11px Georgia, serif";
    g.textAlign = "center";
    g.fillStyle = "rgba(255, 244, 220, 0.9)";
    g.strokeStyle = "rgba(30, 18, 8, 0.7)";
    g.lineWidth = 3;
    g.strokeText("N", w - 12, 15);
    g.fillText("N", w - 12, 15);
  }
}
