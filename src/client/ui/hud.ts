import { block, T } from "../../shared/blocks";
import { CROP_IDS, CROPS } from "../../shared/crops";
import { ATLAS_COLS, TILE } from "../engine/uv";
import { type Hotbar, type Slot, slotName } from "../player/hotbar";

/** The in-game HTML overlay: crosshair, hotbar, info chips, toasts, tooltip, F3 panel, play prompt. */
export class Hud {
  private root: HTMLElement;
  private bar: HTMLElement;
  private label: HTMLElement;
  private debug: HTMLElement;
  private prompt: HTMLElement;
  private info: HTMLElement;
  private goods: HTMLElement;
  private tip: HTMLElement;
  private toasts: HTMLElement;
  private counts: HTMLElement[] = [];
  private labelTimer = 0;
  private banner: HTMLElement;
  private account: HTMLElement;
  debugOn = false;
  /** Called with a recovery code the player typed; resolves to an error message or null. */
  onRestore: (code: string) => Promise<string | null> = async () => null;

  constructor(parent: HTMLElement, private atlas: HTMLCanvasElement, private hotbar: Hotbar) {
    this.root = el("div", "hud", parent);
    el("div", "crosshair", this.root);
    this.tip = el("div", "tip", this.root);
    this.label = el("div", "slot-label", this.root);
    this.bar = el("div", "hotbar", this.root);
    this.info = el("div", "chip info", this.root);
    this.goods = el("div", "chip goods", this.root);
    this.toasts = el("div", "toasts", this.root);
    this.debug = el("pre", "debug", this.root);
    this.debug.hidden = true;
    this.prompt = el("div", "play-prompt", this.root);
    this.prompt.innerHTML = `<b>Click to play</b><span>WASD move · Space jump · Shift run · Left click dig / harvest · Right click use · 1–9 / wheel pick · F3 info</span>`;
    this.account = el("div", "account", this.prompt);
    this.banner = el("div", "banner", this.root);
    this.banner.hidden = true;
    hotbar.slots.forEach((s, i) => {
      const cell = el("div", "slot", this.bar);
      cell.appendChild(this.icon(s));
      el("span", "key", cell).textContent = String(i + 1);
      this.counts.push(el("span", "count", cell));
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

  /** Hotbar badges and the goods chip from the inventory. */
  setInventory(inv: Record<string, number>, canMax: number) {
    this.hotbar.slots.forEach((s, i) => {
      const c = this.counts[i];
      if (s.kind === "seed") c.textContent = String(inv[`seed:${s.crop}`] ?? 0);
      else if (s.kind === "tool" && s.tool === "can") c.innerHTML = `<i style="width:${Math.round(((inv.water ?? 0) / canMax) * 100)}%"></i>`;
      c.className = s.kind === "tool" && s.tool === "can" ? "water" : "count";
      c.parentElement!.classList.toggle("empty", s.kind === "seed" && !(inv[`seed:${s.crop}`] > 0));
    });
    this.goods.innerHTML = CROP_IDS.map((id) => `<span><b>${inv[id] ?? 0}</b> ${CROPS[id].name}</span>`).join("");
  }

  setInfo(html: string) {
    this.info.innerHTML = html;
  }

  setTip(text: string) {
    this.tip.textContent = text;
    this.tip.hidden = !text;
  }

  toast(msg: string, kind: "ok" | "bad" = "ok") {
    // the same message again just bumps a counter on the newest toast
    const last = this.toasts.lastElementChild as HTMLElement | null;
    if (last && last.dataset.msg === msg && !last.classList.contains("gone")) {
      last.dataset.n = String(Number(last.dataset.n) + 1);
      last.textContent = `${msg} ×${last.dataset.n}`;
      clearTimeout(Number(last.dataset.timer));
      last.dataset.timer = String(window.setTimeout(() => this.fade(last), 1800));
      return;
    }
    const t = el("div", `toast ${kind}`, this.toasts);
    t.textContent = msg;
    t.dataset.msg = msg;
    t.dataset.n = "1";
    t.dataset.timer = String(window.setTimeout(() => this.fade(t), 1800));
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  private fade(t: HTMLElement) {
    t.classList.add("gone");
    setTimeout(() => t.remove(), 500);
  }

  setBanner(text: string) {
    this.banner.textContent = text;
    this.banner.hidden = !text;
  }

  /** The pause panel's account box: your recovery code, and a way to continue another farm. */
  setAccount(code: string) {
    this.account.innerHTML = `
      <div class="code-row">Your farm is saved online. Recovery code <code>${code}</code> <button data-copy>Copy</button></div>
      <form class="restore"><input name="code" placeholder="Have a code? XXXX-XXXX-XXXX" maxlength="16" autocomplete="off" spellcheck="false"><button>Continue that farm</button></form>
      <div class="restore-msg"></div>`;
    const msg = this.account.querySelector(".restore-msg") as HTMLElement;
    this.account.querySelector("[data-copy]")!.addEventListener("click", async (e) => {
      e.stopPropagation();
      await navigator.clipboard?.writeText(code).catch(() => {});
      msg.textContent = "Copied. Keep it somewhere safe — it's the key to your farm.";
    });
    this.account.querySelector("form")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = (e.target as HTMLFormElement).code as HTMLInputElement;
      msg.textContent = "Checking…";
      msg.textContent = (await this.onRestore(input.value)) ?? "Loading that farm…";
    });
    // typing a code must not walk the farmer around
    this.account.addEventListener("keydown", (e) => e.stopPropagation());
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

  private icon(s: Slot): HTMLElement {
    if (s.kind === "block") return blockIcon(this.atlas, s.block);
    if (s.kind === "seed") return seedIcon(this.atlas, T.CROP0 + CROP_IDS.indexOf(s.crop) * 4 + 3);
    if (s.kind === "tool") return pixelIcon(s.tool === "hoe" ? HOE : CAN);
    const h = document.createElement("div");
    h.className = "hand-icon";
    h.textContent = "✋";
    return h;
  }
}

function el(tag: string, cls: string, parent: HTMLElement) {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}

const src = (t: number) => [(t % ATLAS_COLS) * TILE, Math.floor(t / ATLAS_COLS) * TILE] as const;

/** A little isometric cube drawn from the block's atlas tiles. */
function blockIcon(atlas: HTMLCanvasElement, id: number): HTMLCanvasElement {
  const S = 48;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const [top, side] = block(id).tiles;
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
  face(top, [w, h, -w, h, cx, cy], 1);
  face(side, [w, h, 0, v, cx - w, cy + h], 0.8);
  face(side, [w, -h, 0, v, cx, cy + 2 * h], 0.64);
  return c;
}

/** A cloth seed bag with the ripe crop peeking over the top. */
function seedIcon(atlas: HTMLCanvasElement, tile: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const [sx, sy] = src(tile);
  g.drawImage(atlas, sx, sy, TILE, 10, 1, 0, 14, 9);
  g.fillStyle = "#c9a870";
  g.fillRect(3, 7, 10, 8);
  g.fillRect(4, 6, 8, 1);
  g.fillStyle = "#8a6a3c";
  g.fillRect(3, 14, 10, 1);
  g.fillRect(5, 9, 6, 1);
  return c;
}

// 16×16 pixel art: '.' clear, letters index the palette
const HOE = { pal: { w: "#8a6440", d: "#5a3f24", m: "#b8bcc4", k: "#6f737a" }, rows: [
  "................", "...........mmm..", "..........mmkkm.", "..........mk.mm.", "..........dm....", ".........wd.....",
  "........wd......", ".......wd.......", "......wd........", ".....wd.........", "....wd..........", "...wd...........",
  "..wd............", ".wd.............", ".d..............", "................"] };
const CAN = { pal: { g: "#6f8f9a", d: "#4a646e", l: "#9ab8c2", b: "#2e434a" }, rows: [
  "................", "................", "......dddd......", ".....d....d.....", "....gggggggg....", "...ggllgggggg..b",
  "...glgggggggg.b.", "...gggggggggggb.", "...ggggggggggb..", "...gggggggggd...", "...gggggggggd...", "...dggggggggd...",
  "....dddddddd....", "................", "................", "................"] };

function pixelIcon(art: { pal: Record<string, string>; rows: string[] }): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = 16;
  const g = c.getContext("2d")!;
  art.rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      g.fillStyle = art.pal[ch];
      g.fillRect(x, y, 1, 1);
    }),
  );
  return c;
}
