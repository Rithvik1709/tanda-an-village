import type { Controls } from "./controls";

/*
 * Phone and tablet controls (landscape): a joystick on the left to walk, drag anywhere on the right
 * to look, and thumb buttons for the actions a mouse and keyboard would do.
 */
export const isTouch = () => matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 1;

export class TouchControls {
  readonly el: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private lookId: number | null = null;
  private stickOrigin = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  move = { forward: 0, right: 0 };
  run = false;

  constructor(parent: HTMLElement, private c: Controls) {
    this.el = document.createElement("div");
    this.el.className = "touch";
    this.el.innerHTML = `
      <div class="t-look"></div>
      <div class="t-stick"><div class="t-knob"></div></div>
      <div class="t-buttons">
        <button data-a="use" class="t-big">Use</button>
        <button data-a="harvest" class="t-mid">Harvest</button>
        <button data-a="jump" class="t-sm">Jump</button>
        <button data-a="talk" class="t-sm">Talk</button>
      </div>
      <div class="t-top">
        <button data-a="map">Map</button>
        <button data-a="view">View</button>
        <button data-a="torch">Torch</button>
        <button data-a="cart">Cart</button>
        <button data-a="feed">Feed</button>
        <button data-a="board">🏆</button>
        <button data-a="help">?</button>
      </div>`;
    parent.appendChild(this.el);
    this.stick = this.el.querySelector(".t-stick")!;
    this.knob = this.el.querySelector(".t-knob")!;
    const look = this.el.querySelector(".t-look") as HTMLElement;

    // the joystick: touch anywhere in its zone, drag to walk; push to the edge to run
    this.stick.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      this.stickId = t.identifier;
      const r = this.stick.getBoundingClientRect();
      this.stickOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      this.onStick(t.clientX, t.clientY);
      e.preventDefault();
    }, { passive: false });
    look.addEventListener("touchstart", (e) => {
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this.last = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    }, { passive: false });
    window.addEventListener("touchmove", (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) this.onStick(t.clientX, t.clientY);
        if (t.identifier === this.lookId) {
          this.c.look((t.clientX - this.last.x) * 1.7, (t.clientY - this.last.y) * 1.7);
          this.last = { x: t.clientX, y: t.clientY };
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
        }
        if (t.identifier === this.lookId) this.lookId = null;
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
        ({ use: c.onPlace, harvest: c.onDig, talk: c.onInteract, map: c.onMap, view: c.onView, torch: c.onTorch, cart: c.onRide, feed: c.onFeed, board: c.onBoard, help: c.onHelp } as Record<string, () => void>)[a]?.call(c);
      }, { passive: false });
      b.addEventListener("touchend", () => b.classList.remove("down"));
    });
  }

  private onStick(x: number, y: number) {
    const R = 52;
    let dx = x - this.stickOrigin.x, dy = y - this.stickOrigin.y;
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
    this.el.hidden = !v;
  }
}
