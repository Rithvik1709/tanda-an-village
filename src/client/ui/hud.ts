import { CROP_IDS, CROPS } from "../../shared/crops";
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
  private hint!: HTMLElement;
  private account: HTMLElement;
  debugOn = false;
  /** Called with a recovery code the player typed; resolves to an error message or null. */
  onRestore: (code: string) => Promise<string | null> = async () => null;

  constructor(parent: HTMLElement, _atlas: HTMLCanvasElement, private hotbar: Hotbar) {
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
    this.prompt.innerHTML = `<b>Click to play</b><span>WASD move · Space jump · Shift run · Left click dig / harvest · Right click use · E talk · M map · V view · T torch · 1–6 / wheel pick</span>`;
    this.account = el("div", "account", this.prompt);
    this.banner = el("div", "banner", this.root);
    this.hint = el("div", "interact", this.root);
    this.hint.hidden = true;
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
    const water = this.hotbar.slots.findIndex((s) => s.kind === "tool" && s.tool === "can");
    if (water >= 0) this.counts[water].title = `${inv.water ?? 0} / ${canMax}`;
    this.hotbar.slots.forEach((s, i) => {
      const c = this.counts[i];
      if (s.kind === "seed") c.textContent = String(inv[`seed:${s.crop}`] ?? 0);
      else if (s.kind === "block") c.textContent = String(inv[`block:${s.block}`] ?? 0);
      else if (s.kind === "tool" && s.tool === "can") c.innerHTML = `<i style="width:${Math.round(((inv.water ?? 0) / canMax) * 100)}%"></i>`;
      c.className = s.kind === "tool" && s.tool === "can" ? "water" : "count";
      c.parentElement!.classList.toggle("empty", (s.kind === "seed" && !(inv[`seed:${s.crop}`] > 0)) || (s.kind === "block" && !(inv[`block:${s.block}`] > 0)));
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

  setHint(html: string) {
    if (this.hint.innerHTML !== html) this.hint.innerHTML = html;
    this.hint.hidden = !html || !this.prompt.hidden; // the pause panel says enough on its own
  }

  private bullsEl?: HTMLElement;
  setBulls(html: string) {
    this.bullsEl ??= el("div", "chip bulls-chip", this.root);
    if (this.bullsEl.innerHTML !== html) this.bullsEl.innerHTML = html;
    this.bullsEl.hidden = !html;
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
    const k = s.kind === "seed" ? `seed-${s.crop}` : s.kind === "tool" ? s.tool : s.kind === "hand" ? "hand" : "hand";
    const d = document.createElement("div");
    d.className = "icon";
    d.innerHTML = ICONS[k] ?? ICONS.hand;
    return d;
  }

}

/** Painted SVG icons for the hotbar — soft shapes, no pixel art. */
const bag = (plant: string) => `<svg viewBox="0 0 48 48"><path d="M13 20 Q12 42 24 43 Q36 42 35 20 Z" fill="#d8c29a" stroke="#8a6a3c" stroke-width="1.5"/><path d="M14 20 Q24 16 34 20" fill="none" stroke="#8a6a3c" stroke-width="2"/><path d="M17 19 Q24 22 31 19" fill="none" stroke="#a0453a" stroke-width="2.5"/>${plant}</svg>`;
const ICONS: Record<string, string> = {
  hand: `<svg viewBox="0 0 48 48"><path d="M16 26 V14 a2.5 2.5 0 0 1 5 0 V24 V10 a2.5 2.5 0 0 1 5 0 V24 V12 a2.5 2.5 0 0 1 5 0 V26 V18 a2.5 2.5 0 0 1 5 0 V30 q0 12 -11 12 q-7 0 -11 -7 l-5 -8 a2.5 2.5 0 0 1 4 -3 z" fill="#c68b5e" stroke="#7a4e30" stroke-width="1.5"/></svg>`,
  hoe: `<svg viewBox="0 0 48 48"><path d="M10 40 L33 12" stroke="#8a6440" stroke-width="4" stroke-linecap="round"/><path d="M29 9 L41 12 L38 20 Q33 15 29 16 Z" fill="#9aa0a8" stroke="#4a4e54" stroke-width="1.5"/></svg>`,
  can: `<svg viewBox="0 0 48 48"><path d="M12 20 H32 V38 Q32 41 29 41 H15 Q12 41 12 38 Z" fill="#c9a24a" stroke="#7a5a1c" stroke-width="1.5"/><path d="M32 24 L43 15" stroke="#c9a24a" stroke-width="4" stroke-linecap="round"/><circle cx="43.5" cy="14.5" r="3" fill="#b08a30"/><path d="M16 20 Q22 9 28 20" fill="none" stroke="#7a5a1c" stroke-width="2.5"/></svg>`,
  "seed-jowar": bag(`<path d="M24 20 V6" stroke="#7a9a3c" stroke-width="2"/><ellipse cx="24" cy="8" rx="4" ry="6" fill="#c8924e"/><path d="M24 16 Q17 12 14 14 M24 13 Q31 9 34 11" stroke="#6f9a3a" stroke-width="2" fill="none"/>`),
  "seed-onion": bag(`<path d="M22 20 Q20 8 18 5 M24 20 V4 M26 20 Q28 8 31 6" stroke="#5a9a45" stroke-width="2" fill="none"/><ellipse cx="24" cy="30" rx="5" ry="4.5" fill="#b0506a" opacity="0.9"/>`),
  "seed-sugarcane": bag(`<path d="M21 20 V4 M27 20 V6" stroke="#a8b84a" stroke-width="3"/><path d="M19 9 H23 M25 12 H29 M19 15 H23" stroke="#556b2a" stroke-width="1.5"/><path d="M21 5 Q14 3 11 7 M27 7 Q34 4 37 8" stroke="#6f9a3a" stroke-width="2" fill="none"/>`),
};

function el(tag: string, cls: string, parent: HTMLElement) {
  const e = document.createElement(tag);
  e.className = cls;
  parent.appendChild(e);
  return e;
}





