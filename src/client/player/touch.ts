import { t } from "../i18n";
import type { Controls } from "./controls";

/*
 * Phone and tablet controls (landscape): a joystick under the left thumb to walk, a look pad under
 * the right thumb (or drag anywhere on the right) to turn and look up and down, and three action
 * buttons in an arc above it. Everything else — cart, feed, tie, plough, talk — appears as one
 * tappable hint only when it can be done.
 */
/** Is the game turned sideways (phone upright)? Screen deltas then map to game axes: x = dy, y = −dx. */
const turned = () => document.documentElement.classList.contains("rotated");
const toGame = (dx: number, dy: number) => (turned() ? { x: dy, y: -dx } : { x: dx, y: dy });

export const isTouch = () => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;

export class TouchControls {
  readonly el: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private lookId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private pad: HTMLElement;
  private padKnob: HTMLElement;
  private padOrigin = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  move = { forward: 0, right: 0 };
  run = false;
  onMenu: () => void = () => {};

  constructor(parent: HTMLElement, private c: Controls) {
    this.el = document.createElement("div");
    this.el.className = "touch";
    this.el.innerHTML = `
      <div class="t-look"></div>
      <div class="t-move"></div>
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-pad"><div class="t-pad-knob"></div><span>${t("look")}</span></div>
      <button data-a="use" class="t-act t-use">Use</button>
      <button data-a="harvest" class="t-act t-harvest">Harvest</button>
      <button data-a="jump" class="t-act t-jump">${t("Jump")}</button>
      <div class="t-top">
        <button data-a="map" class="t-map">${t("Map")}</button>
        <button data-a="menu" class="t-menu">☰</button>
      </div>`;
    parent.appendChild(this.el);
    this.stick = this.el.querySelector(".t-stick")!;
    this.knob = this.el.querySelector(".t-knob")!;
    const look = this.el.querySelector(".t-look") as HTMLElement;
    this.pad = this.el.querySelector(".t-pad")!;
    this.padKnob = this.el.querySelector(".t-pad-knob")!;

    // the joystick: touch anywhere in its zone, drag to walk; push to the edge to run
    this.stick.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      this.stickId = t.identifier;
      const r = this.stick.getBoundingClientRect();
      this.stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.onStick(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    // or anywhere on the left third: the stick comes to your thumb, and goes home when you let go
    const moveZone = this.el.querySelector(".t-move") as HTMLElement;
    moveZone.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      this.stickId = t.identifier;
      const home = this.stick.getBoundingClientRect(), zone = this.el.getBoundingClientRect();
      // (in the turned layout the screen is rotated, so place the stick in the game's own axes)
      const p = turned() ? { x: t.clientY - zone.top, y: zone.right - t.clientX } : { x: t.clientX - zone.left, y: t.clientY - zone.top };
      const hx = turned() ? home.top - zone.top + home.height / 2 : home.left - zone.left + home.width / 2;
      const hy = turned() ? zone.right - home.right + home.width / 2 : home.top - zone.top + home.height / 2;
      this.stick.style.translate = `${p.x - hx}px ${p.y - hy}px`;
      this.stickOrigin = { x: t.clientX, y: t.clientY };
      this.stick.classList.add("floating");
      this.onStick(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    // look: drag on the pad (or anywhere free on the right) like a trackpad
    for (const zone of [look, this.pad])
      zone.addEventListener("touchstart", (e) => {
        const t = e.changedTouches[0];
        this.lookId = t.identifier;
        this.last = { x: t.clientX, y: t.clientY };
        this.padOrigin = { x: t.clientX, y: t.clientY };
        this.pad.classList.add("on");
        e.preventDefault();
      }, { passive: false });
    window.addEventListener("touchmove", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) this.onStick(t.clientX, t.clientY);
        if (t.identifier === this.lookId) {
          const d = toGame(t.clientX - this.last.x, t.clientY - this.last.y);
          this.c.look(d.x * 1.8, d.y * 1.8);
          this.last = { x: t.clientX, y: t.clientY };
          // the pad's knob shows which way you're dragging
          const o = toGame(t.clientX - this.padOrigin.x, t.clientY - this.padOrigin.y), r = Math.hypot(o.x, o.y), R = 30, k = r > R ? R / r : 1;
          this.padKnob.style.transform = `translate(${o.x * k}px, ${o.y * k}px)`;
        }
      }
    }, { passive: true });
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) {
          this.stickId = null;
          this.move = { forward: 0, right: 0 };
          this.run = false;
          this.knob.style.transform = "";
          this.stick.style.translate = "";
          this.stick.classList.remove("floating");
        }
        if (t.identifier === this.lookId) this.endLook();
      }
    };
    window.addEventListener("touchend", end);
    window.addEventListener("touchcancel", end);

    // buttons
    this.el.querySelectorAll<HTMLButtonElement>("button[data-a]").forEach((b) => {
      const a = b.dataset.a!;
      if (a === "jump") {
        b.addEventListener("touchstart", (e) => (e.preventDefault(), this.c.held.add("Space")), { passive: false });
        b.addEventListener("touchend", () => this.c.held.delete("Space"));
        return;
      }
      b.addEventListener("touchstart", (e) => {
        e.preventDefault();
        b.classList.add("down");
        if (a === "use") c.useHeld = true;
        ({ use: c.onPlace, harvest: c.onDig, talk: c.onInteract, map: c.onMap, view: c.onView, torch: c.onTorch, cart: c.onRide, feed: c.onFeed, board: c.onBoard, help: c.onHelp, menu: this.onMenu, plough: c.onPloughField, tie: c.onTie } as Record<string, () => void>)[a]?.call(c);
      }, { passive: false });
      b.addEventListener("touchend", () => {
        b.classList.remove("down");
        if (a === "use") c.useHeld = false;
      });
      b.addEventListener("touchcancel", () => a === "use" && (c.useHeld = false));
    });
  }

  private endLook() {
    this.lookId = null;
    this.pad.classList.remove("on");
    this.padKnob.style.transform = "";
  }

  private useLabel = "";
  private tagLabel: string | null = "";
  /** The Use button says what it will do ("Plough", "Sow onion", "Water", "Harvest"). */
  setUse(label: string) {
    if (label === this.useLabel) return;
    this.useLabel = label;
    const b = this.el.querySelector(".t-use") as HTMLElement;
    b.textContent = label;
    b.classList.toggle("long", label.length > 6);
  }
  /** The second action button only when there's a second action (a kabaddi tag). */
  setTag(label: string | null) {
    if (label === this.tagLabel) return;
    this.tagLabel = label;
    const b = this.el.querySelector(".t-harvest") as HTMLElement;
    b.hidden = !label;
    if (label) b.textContent = label;
  }

  /** The action hint ("R Load the cart…") becomes a button: tapping it presses that key. */
  bindHint(hint: HTMLElement) {
    // looked up at tap time: the game sets these handlers after the touch controls are made
    const keys: Record<string, () => void> = { E: () => this.c.onInteract(), R: () => this.c.onRide(), G: () => this.c.onTie(), P: () => this.c.onPloughField(), F: () => this.c.onFeed(), T: () => this.c.onTorch(), Z: () => this.c.onSleep() };
    hint.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const k = hint.querySelector("kbd")?.textContent?.trim() ?? "";
      hint.classList.add("down");
      keys[k]?.();
    }, { passive: false });
    hint.addEventListener("touchend", () => hint.classList.remove("down"));
  }

  private onStick(x: number, y: number) {
    const R = 40;
    const g = toGame(x - this.stickOrigin.x, y - this.stickOrigin.y);
    let dx = g.x, dy = g.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx *= R / d;
      dy *= R / d;
    }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const k = Math.min(1, d / R);
    this.move = { forward: (-dy / R) * (k > 0.15 ? 1 : 0), right: (dx / R) * (k > 0.15 ? 1 : 0) };
    this.run = k > 0.95;
  }

  set visible(v: boolean) {
    if (this.el.hidden === !v) return;
    this.el.hidden = !v;
    if (!v) {
      // let go of everything: a window opened under the player's thumbs
      this.stickId = null;
      this.endLook();
      this.move = { forward: 0, right: 0 };
      this.run = false;
      this.knob.style.transform = "";
      this.c.held.delete("Space");
    }
  }
}
