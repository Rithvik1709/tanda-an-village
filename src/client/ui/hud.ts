import { block } from "../../shared/blocks";
import { ATLAS_COLS, TILE } from "../engine/uv";
import { type Hotbar, slotName } from "../player/hotbar";

/** The in-game HTML overlay: crosshair, hotbar, F3 debug panel and the click-to-play prompt. */
export class Hud {
  private root: HTMLElement;
  private bar: HTMLElement;
  private label: HTMLElement;
  private debug: HTMLElement;
  private prompt: HTMLElement;
  private labelTimer = 0;
  debugOn = false;

  constructor(parent: HTMLElement, private atlas: HTMLCanvasElement, private hotbar: Hotbar) {
    this.root = el("div", "hud", parent);
    el("div", "crosshair", this.root);
    this.label = el("div", "slot-label", this.root);
    this.bar = el("div", "hotbar", this.root);
    this.debug = el("pre", "debug", this.root);
    this.debug.hidden = true;
    this.prompt = el("div", "play-prompt", this.root);
    this.prompt.innerHTML = `<b>Click to walk</b><span>WASD move · Space jump · Shift run · Left click dig · Right click place · 1–9 / wheel pick · F3 info</span>`;
    hotbar.slots.forEach((s, i) => {
      const cell = el("div", "slot", this.bar);
      cell.appendChild(s.kind === "block" ? blockIcon(this.atlas, s.block) : handIcon());
      el("span", "key", cell).textContent = String(i + 1);
    });
    this.refresh();
  }

  refresh() {
    [...this.bar.children].forEach((c, i) => c.classList.toggle("on", i === this.hotbar.selected));
    this.label.textContent = slotName(this.hotbar.current);
    this.label.classList.add("show");
    clearTimeout(this.labelTimer);
    this.labelTimer = window.setTimeout(() => this.label.classList.remove("show"), 1400);
  }

  setPlaying(on: boolean) {
    this.prompt.hidden = on;
  }

  toggleDebug() {
    this.debugOn = !this.debugOn;
    this.debug.hidden = !this.debugOn;
  }

  setDebug(text: string) {
    if (this.debugOn) this.debug.textContent = text;
  }
}

function el(tag: string, cls: string, parent: HTMLElement) {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

/** A little isometric cube drawn from the block's atlas tiles. */
function blockIcon(atlas: HTMLCanvasElement, id: number): HTMLCanvasElement {
  const S = 48;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const [top, side] = block(id).tiles;
  const src = (t: number) => [(t % ATLAS_COLS) * TILE, Math.floor(t / ATLAS_COLS) * TILE] as const;
  const face = (t: number, m: [number, number, number, number, number, number], shade: number) => {
    g.save();
    g.setTransform(...m);
    const [sx, sy] = src(t);
    g.drawImage(atlas, sx, sy, TILE, TILE, 0, 0, 1, 1);
    if (shade < 1) {
      g.fillStyle = `rgba(0,0,0,${1 - shade})`;
      g.fillRect(0, 0, 1, 1);
    }
    g.restore();
  };
  const w = 20, h = 11, v = 22, cx = 24, cy = 3;
  face(top, [w, h, -w, h, cx, cy], 1); // top rhombus
  face(side, [w, h, 0, v, cx - w, cy + h], 0.8); // left
  face(side, [w, -h, 0, v, cx, cy + 2 * h], 0.64); // right
  return c;
}

function handIcon(): HTMLElement {
  const s = document.createElement("div");
  s.className = "hand-icon";
  s.textContent = "✋";
  return s;
}
