import { CROP_IDS, CROPS } from "../../shared/crops";
import { FISH_IDS } from "../../shared/fish";
import { cropName, t } from "../i18n";
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
    this.prompt.innerHTML = `<b>${t("Click to play")}</b><span>${t("Paused · <b>H</b> shows all the controls")}</span>`;
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
    this.paintBell();
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
    // what you carry, only when you carry something (and only the kinds you have)
    const fish = FISH_IDS.reduce((a, f) => a + (inv[`fish:${f}`] ?? 0), 0);
    const html = CROP_IDS.filter((id) => inv[id] > 0).map((id) => `<span><b>${inv[id]}</b> ${cropName(id) || CROPS[id].name}</span>`).join("") + (fish ? `<span><b>${fish}</b> ${t("fish")}</span>` : "");
    if (this.goods.innerHTML !== html) this.goods.innerHTML = html;
    this.goods.hidden = !html;
  }

  setInfo(html: string) {
    this.info.innerHTML = html;
    if (this.moneyShown !== null) this.paintMoney();
  }

  /*
   * The payoff you can see: harvests float up and fly to what you carry; money pops and counts up.
   * Plain DOM and CSS transitions, so it costs nothing on a cheap phone.
   */
  private moneyShown: number | null = null;
  private moneyTarget = 0;
  /** The money figure eases towards `to` instead of jumping. */
  setMoney(to: number) {
    if (this.moneyShown === null) this.moneyShown = to;
    this.moneyTarget = to;
  }
  tickMoney(dt: number) {
    if (this.moneyShown === null || this.moneyShown === this.moneyTarget) return;
    const d = this.moneyTarget - this.moneyShown;
    const step = Math.sign(d) * Math.max(1, Math.abs(d) * Math.min(1, dt * 6));
    this.moneyShown = Math.abs(step) >= Math.abs(d) ? this.moneyTarget : Math.round(this.moneyShown + step);
    this.paintMoney();
  }
  private paintMoney() {
    const el = this.info.querySelector(".money");
    if (el) el.textContent = `₹${this.moneyShown!.toLocaleString("en-IN")}`;
  }
  /** Text that rises from a point on screen (in CSS px of the game area) and flies into `to`. */
  floater(text: string, from: { x: number; y: number }, to: Element | null, kind: "crop" | "money" = "crop") {
    const f = el("div", `floater ${kind}`, this.root);
    f.textContent = text;
    f.style.left = `${from.x}px`;
    f.style.top = `${from.y}px`;
    const rootBox = this.root.getBoundingClientRect();
    const tb = to && !(to as HTMLElement).hidden ? to.getBoundingClientRect() : null;
    requestAnimationFrame(() => {
      f.classList.add("up");
      setTimeout(() => {
        if (tb && !document.documentElement.classList.contains("reduce-motion")) {
          f.style.left = `${tb.left - rootBox.left + tb.width / 2}px`;
          f.style.top = `${tb.top - rootBox.top + tb.height / 2}px`;
          f.classList.add("fly");
        } else f.classList.add("fade");
      }, 420);
    });
    setTimeout(() => {
      f.remove();
      if (to && !(to as HTMLElement).hidden) {
        to.classList.remove("bump");
        void (to as HTMLElement).offsetWidth;
        to.classList.add("bump");
      }
    }, 1150);
  }
  get moneyEl() {
    return this.info.querySelector(".money");
  }
  get carryEl() {
    return this.goods.hidden ? this.info.querySelector(".basket") : this.goods;
  }

  setTip(text: string) {
    this.tip.textContent = text;
    this.tip.hidden = !text;
  }

  /*
   * Every message is also kept in a short log (last 30) you can open again: a bell by the hotbar on a
   * computer, "Recent messages" in the phone menu. Repeats fold into one line with a count.
   */
  readonly log: { msg: string; kind: "ok" | "bad"; at: string; n: number }[] = [];
  /** The game's clock as text, for the log. */
  clockText: () => string = () => "";
  onLog: () => void = () => {};
  private bell?: HTMLElement;
  private unread = 0;
  private logEl?: HTMLElement;
  get logOpen() {
    return !!this.logEl && !this.logEl.hidden;
  }
  showLog() {
    this.logEl ??= (() => {
      const e = el("div", "panel msglog", this.root.parentElement!);
      e.addEventListener("click", (ev) => {
        const t = ev.target as HTMLElement;
        if (t === e || t.closest("[data-close]")) this.closeLog();
      });
      return e;
    })();
    this.logEl.innerHTML = `<div class="panel-card"><button class="x" data-close>✕</button><h2>${t("Recent messages")}</h2>
      ${this.log.length ? `<ul class="log-list">${[...this.log].reverse().map((l) => `<li class="${l.kind}"><time>${l.at}</time><span>${escapeHtml(l.msg)}${l.n > 1 ? ` <em>×${l.n}</em>` : ""}</span></li>`).join("")}</ul>` : `<p class="empty">Nothing yet. Messages from the village show up here.</p>`}</div>`;
    this.logEl.hidden = false;
    this.unread = 0;
    this.paintBell();
  }
  closeLog() {
    if (!this.logOpen) return;
    this.logEl!.hidden = true;
    this.onLog();
  }
  private paintBell() {
    if (!this.bell) {
      this.bell = el("button", "log-bell", this.root);
      this.bell.title = t("Recent messages");
      this.bell.addEventListener("click", () => this.showLog());
    }
    this.bell.innerHTML = `🔔${this.unread ? `<b>${Math.min(99, this.unread)}</b>` : ""}`;
  }
  private record(msg: string, kind: "ok" | "bad") {
    const last = this.log[this.log.length - 1];
    if (last && last.msg === msg) last.n++;
    else this.log.push({ msg, kind, at: this.clockText(), n: 1 });
    if (this.log.length > 30) this.log.shift();
    this.unread++;
    this.paintBell();
  }

  toast(msg: string, kind: "ok" | "bad" = "ok") {
    this.record(msg, kind);
    // the same message again just bumps a counter on the newest toast
    const last = this.toasts.lastElementChild as HTMLElement | null;
    if (last && last.dataset.msg === msg && !last.classList.contains("gone")) {
      last.dataset.n = String(Number(last.dataset.n) + 1);
      last.textContent = `${msg} ×${last.dataset.n}`;
      clearTimeout(Number(last.dataset.timer));
      last.dataset.timer = String(window.setTimeout(() => this.fadeToast(last), 1800));
      return;
    }
    const t = el("div", `toast ${kind}`, this.toasts);
    t.textContent = msg;
    t.dataset.msg = msg;
    t.dataset.n = "1";
    t.dataset.timer = String(window.setTimeout(() => this.fadeToast(t), 1800));
    while (this.toasts.children.length > 3) this.toasts.firstChild!.remove();
  }

  private fadeToast(t: HTMLElement) {
    t.classList.add("gone");
    setTimeout(() => t.remove(), 500);
  }

  get hintEl() {
    return this.hint;
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

  /** Opens the "Save your farm" card. */
  onAccountCard: () => void = () => {};

  /** The pause panel's account box: where the farm is saved, and (folded away) the recovery code. */
  setAccount(code: string, account: { email: string; provider: string } | null = null, authEnabled = false) {
    const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
    const line = account
      ? `<div class="account-line saved">✅ Saved to <b>${esc(account.email)}</b> <button data-acct>Account</button></div>`
      : authEnabled
        ? `<div class="account-line">Your farm is only on this device. <button data-acct>Save your farm</button></div>`
        : "";
    this.account.innerHTML = `${line}
      <details class="code-fold" ${line ? "" : "open"}><summary>Recovery code</summary>
      <div class="code-row">Recovery code <code>${code}</code> <button data-copy>Copy</button></div>
      <form class="restore"><input name="code" placeholder="Have a code? XXXX-XXXX-XXXX" maxlength="16" autocomplete="off" spellcheck="false"><button>Continue that farm</button></form>
      <div class="restore-msg"></div></details>`;
    this.account.querySelector("[data-acct]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onAccountCard();
    });
    this.account.querySelector("summary")?.addEventListener("click", (e) => e.stopPropagation());
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

  private fadeEl?: HTMLElement;
  /** Fade the screen to night (with a line of text) and back. */
  fade(on: boolean, text: string) {
    if (!this.fadeEl) this.fadeEl = el("div", "sleep-fade", this.root);
    this.fadeEl.textContent = text;
    this.fadeEl.classList.toggle("on", on);
  }
  private resume?: HTMLElement;
  /** A small, quiet "click to continue" chip (instead of the full pause panel). */
  setResume(on: boolean) {
    if (!this.resume) {
      this.resume = el("div", "resume-chip", this.root);
      this.resume.textContent = "Click to continue";
    }
    this.resume.hidden = !on;
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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
