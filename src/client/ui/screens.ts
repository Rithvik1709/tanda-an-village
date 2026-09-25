import { isEnglish, LANG, LANGS, type Lang, setLang, t, t as tr } from "../i18n";
import { detectTier, graphicsChoice, Q, setGraphicsChoice, type TierChoice } from "../quality";
import type { Save } from "../../shared/save";

/*
 * The screens around the game: the title, settings and the note for
 * phones. Plain DOM; each reports what the player chose through callbacks.
 */
export type Settings = { sensitivity: number; renderDistance: number; volume: number; uiScale: number };
const KEY = "bailgaadi.settings";
const touchDevice = typeof matchMedia !== "undefined" && (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1);
export const DEFAULTS: Settings = { sensitivity: 0.0022, renderDistance: touchDevice ? 90 : 128, volume: 0.8, uiScale: 1 };
/** How big the HUD, cards and buttons are drawn (a setting, for small screens and tired eyes). */
/** On a phone the screen is small: "Large" is as far as it goes before the controls collide. */
const UI_SIZES: [number, string][] = touchDevice ? [[1, "Normal"], [1.2, "Large"]] : [[1, "Normal"], [1.25, "Large"], [1.5, "Largest"]];
export const applyUiScale = (s: Settings) => document.documentElement.style.setProperty("--ui", String(Math.min(s.uiScale || 1, UI_SIZES[UI_SIZES.length - 1][0])));

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}
function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode */
  }
}

function el(tag: string, cls: string, parent: HTMLElement, html = "") {
  const e = document.createElement(tag);
  e.className = cls;
  e.innerHTML = html;
  parent.appendChild(e);
  return e;
}

export class TitleScreen {
  private el: HTMLElement;
  open = true;
  onPlay: () => void = () => {};
  onSettings: () => void = () => {};
  onBoard: () => void = () => {};
  onRestore: (code: string) => Promise<string | null> = async () => null;

  constructor(parent: HTMLElement) {
    this.el = el("div", "title-screen", parent, `
      <div class="title-inner">
        <div class="eyebrow">${t("A farming game from the Deccan")}</div>
        <div class="wordmark">Tanda</div>
        <p class="tagline">${isEnglish ? "Come home to <b>Ukhali Tanda · उखळी तांडा</b>, a Banjara village in Jalna. Plough the black soil, cart your harvest to the mandi the old caravan way, and grow from a small farmer to the Pola champion." : t("tagline")}</p>
        <div class="title-save"></div>
        <div class="title-buttons">
          <button class="primary" data-t="play">${t("Start farming")}</button>
          <div class="title-row">
            <button data-t="board">${t("Leaderboard")}</button>
            <button data-t="about">${t("The village")}</button>
            <button data-t="settings">${t("Settings")}</button>
          </div>
          <button class="link" data-t="restore">${t("Continue a farm from another device")}</button>
          <div class="title-langs" role="group" aria-label="Language">${LANGS.map(([l, name]) => `<button data-lang="${l}" class="${l === LANG ? "on" : ""}" lang="${l}">${name}</button>`).join("")}</div>
        </div>
      </div>
      <aside class="about-card" hidden>
        <button class="x" data-t="about">✕</button>
        <div class="eyebrow">The real village</div>
        <h3>Ukhali Tanda · उखळी तांडा</h3>
        <p>A Banjara settlement in <b>Jalna district, Maharashtra</b> (19.82° N, 76.21° E), in the black-soil country of Marathwada. Its lanes, the Jalna road, the field strips, the red scrub to the east and the old vihir in the fields are laid out from the real map.</p>
        <p>The Banjaras once crossed the Deccan in ox caravans carrying salt and grain. Today the tanda farms jowar, onion and sugarcane with bulls and electric pumps and drip lines. It gathers at the Sevalal Maharaj mandir for Teej, and honours its bulls at Pola.</p>
        <p class="about-note">Roads: © OpenStreetMap contributors. The houses, people and stories are imagined.</p>
      </aside>
      <div class="title-credit">${t("Created by")} <b>Gajanan Rathod</b> <span class="legal">· <a href="/privacy" target="_blank" rel="noopener">Privacy</a> · <a href="/terms" target="_blank" rel="noopener">Terms</a></span></div>
      <div class="title-keys">${isEnglish ? "WASD walk · mouse look · left click harvest · right click use · E talk · M map · V view · T torch · Z sleep · H help" : t("title-keys")}</div>
      <div class="loading">${t("Preparing the village…")}</div>`);
    // shrink the title block to fit short screens (a phone in landscape with the browser's bars)
    const fit = () => {
      const inner = this.el.querySelector(".title-inner") as HTMLElement;
      inner.style.transform = "";
      const room = this.el.clientHeight - 40, h = inner.offsetHeight;
      if (h > room && room > 0) inner.style.transform = `translateY(-50%) scale(${Math.max(0.6, room / h).toFixed(3)})`;
    };
    addEventListener("resize", () => requestAnimationFrame(fit));
    visualViewport?.addEventListener("resize", () => requestAnimationFrame(fit));
    requestAnimationFrame(fit);
    this.el.addEventListener("click", (e) => {
      const lang = (e.target as HTMLElement).closest("[data-lang]") as HTMLElement | null;
      if (lang) return lang.dataset.lang !== LANG && setLang(lang.dataset.lang as Lang);
      const t = (e.target as HTMLElement).closest("[data-t]") as HTMLElement | null;
      if (!t || this.el.classList.contains("busy")) return;
      if (t.dataset.t === "play") this.onPlay();
      if (t.dataset.t === "settings") this.onSettings();
      if (t.dataset.t === "board") this.onBoard();
      if (t.dataset.t === "about") {
        const c = this.el.querySelector(".about-card") as HTMLElement;
        c.hidden = !c.hidden;
      }
      if (t.dataset.t === "restore") {
        t.outerHTML = `<form class="restore title-restore"><input name="code" placeholder="XXXX-XXXX-XXXX" maxlength="16" autocomplete="off" spellcheck="false"><button>${tr("Continue that farm")}</button></form><div class="restore-msg"></div>`;
        const f = this.el.querySelector(".title-restore") as HTMLFormElement;
        (f.code as HTMLInputElement).focus();
        f.addEventListener("submit", async (ev) => {
          ev.preventDefault();
          const msg = this.el.querySelector(".restore-msg")!;
          msg.textContent = "Checking…";
          msg.textContent = (await this.onRestore((f.code as HTMLInputElement).value)) ?? "Loading that farm…";
        });
        f.addEventListener("keydown", (ev) => ev.stopPropagation());
      }
    });
    this.el.classList.add("busy");
  }

  /** Called once the world and the save are ready. */
  ready(save: Save, title: string) {
    this.el.classList.remove("busy");
    const fresh = save.stats.planted === 0 && save.ledger.length === 0;
    (this.el.querySelector('[data-t="play"]') as HTMLElement).textContent = fresh ? tr("Start farming") : tr("Continue your farm");
    this.el.querySelector(".title-save")!.innerHTML = fresh ? "" : `<b>${tr(title)}</b> · ₹${save.money.toLocaleString("en-IN")} · ${tr(save.plots.length > 1 ? "{n} fields" : "{n} field", { n: save.plots.length })}`;
  }

  hide() {
    this.open = false;
    this.el.classList.add("gone");
    setTimeout(() => (this.el.hidden = true), 600);
  }
}

export class SettingsPanel {
  private el: HTMLElement;
  open = false;
  onChange: (s: Settings) => void = () => {};
  onClose: () => void = () => {};

  constructor(parent: HTMLElement, private s: Settings) {
    this.el = el("div", "panel settings", parent);
    this.el.hidden = true;
    this.el.addEventListener("input", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "sens") this.s.sensitivity = Number(t.value) / 10000;
      if (t.name === "rd") this.s.renderDistance = Number(t.value);
      if (t.name === "vol") this.s.volume = Number(t.value) / 100;
      if (t.name === "lang") return setLang(t.value as Lang);
      if (t.name === "ui") {
        this.s.uiScale = Number(t.value);
        applyUiScale(this.s);
      }
      if (t.name === "gfx") {
        setGraphicsChoice(t.value as TierChoice);
        const msg = this.el.querySelector(".gfx-msg") as HTMLElement;
        msg.innerHTML = `${tr("Takes effect when the game reloads.")} <button data-reload>${tr("Reload now")}</button>`;
        return;
      }
      saveSettings(this.s);
      this.onChange(this.s);
      this.label();
    });
    this.el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("[data-reload]")) location.reload();
      if ((e.target as HTMLElement).closest("[data-close]")) this.close();
    });
    this.el.addEventListener("keydown", (e) => e.stopPropagation());
  }

  private label() {
    const rd = { 80: tr("Near"), 128: tr("Normal"), 200: tr("Far") } as Record<number, string>;
    this.el.querySelector(".v-sens")!.textContent = (this.s.sensitivity * 1000).toFixed(1);
    this.el.querySelector(".v-rd")!.textContent = rd[this.s.renderDistance] ?? `${this.s.renderDistance}`;
    this.el.querySelector(".v-vol")!.textContent = this.s.volume ? `${Math.round(this.s.volume * 100)}%` : tr("off");
  }

  show() {
    this.open = true;
    this.el.hidden = false;
    this.el.innerHTML = `<div class="panel-card settings-card"><button class="x" data-close>✕</button><h2>${tr("Settings")}</h2>
      <fieldset class="seg"><legend>${tr("Language")}</legend>${LANGS.map(([l, name]) => `<label><input type="radio" name="lang" value="${l}" ${l === LANG ? "checked" : ""}><span lang="${l}">${name}</span></label>`).join("")}</fieldset>
      <label>${tr("Mouse sensitivity")} <b class="v-sens"></b><input type="range" name="sens" min="8" max="50" value="${Math.round(this.s.sensitivity * 10000)}"></label>
      <label>${tr("How far you can see")} <b class="v-rd"></b><input type="range" name="rd" min="80" max="200" step="1" list="rd-stops" value="${this.s.renderDistance}"></label>
      <datalist id="rd-stops"><option value="80"></option><option value="128"></option><option value="200"></option></datalist>
      <label>${tr("Sound")} <b class="v-vol"></b><input type="range" name="vol" min="0" max="100" value="${Math.round(this.s.volume * 100)}"></label>
      <fieldset class="seg"><legend>${tr("Text and buttons")}</legend>${UI_SIZES.map(([v, name]) => `<label><input type="radio" name="ui" value="${v}" ${Math.min(this.s.uiScale || 1, UI_SIZES[UI_SIZES.length - 1][0]) === v ? "checked" : ""}><span>${tr(name)}</span></label>`).join("")}</fieldset>
      <label class="gfx">${tr("Graphics")} <b>${tr("running at {tier}", { tier: tr(Q.tier) })}${Q.shadows ? "" : tr(", no shadows")}</b>
        <select name="gfx">${(["auto", "low", "medium", "high"] as const).map((c) => `<option value="${c}" ${graphicsChoice() === c ? "selected" : ""}>${c === "auto" ? tr("Auto (best for this device: {t})", { t: tr(detectTier()) }) : c === "low" ? tr("Low: smoothest, for older phones and laptops") : c === "medium" ? tr("Medium") : tr("High: shadows, bloom and dense grass")}</option>`).join("")}</select></label>
      <p class="hint gfx-msg">${tr("If the game stutters, choose Low. On Auto, it also lowers itself if your device can't keep up.")}</p>
      <p class="hint">${tr("Settings are kept on this device. Your farm itself is saved online.")}</p>
      <div class="big-acts"><button data-close>${tr("Done")}</button></div></div>`;
    this.label();
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.el.hidden = true;
    this.onClose();
  }
}

/** First-time help: one step at a time, each ticked off by what the save shows you've done. */
