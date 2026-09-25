import type { Input } from "./physics";

/**
 * Keyboard + mouse input. Mouse look and clicks only count while the pointer is locked; the test
 * hooks drive `held` / `look` directly, so headless runs don't need pointer lock.
 */
export class Controls {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  readonly held = new Set<string>();
  /** The use button (right mouse, or Use on a phone) is being held down: work every tile you aim at. */
  useHeld = false;
  locked = false;
  onDig: () => void = () => {};
  onPlace: () => void = () => {};
  onSelect: (slot: number) => void = () => {};
  onScroll: (dir: number) => void = () => {};
  onToggleDebug: () => void = () => {};
  onInteract: () => void = () => {};
  onEscape: () => void = () => {};
  onMap: () => void = () => {};
  onRide: () => void = () => {};
  onFeed: () => void = () => {};
  onView: () => void = () => {};
  onTorch: () => void = () => {};
  onHelp: () => void = () => {};
  onBoard: () => void = () => {};
  onKaam: () => void = () => {};
  onPloughField: () => void = () => {};
  onTie: () => void = () => {};
  onSleep: () => void = () => {};
  onLockChange: (locked: boolean) => void = () => {};

  constructor(el: HTMLElement) {
    el.addEventListener("click", () => {
      if (!this.locked && !this.touch) el.requestPointerLock?.()?.catch?.(() => {});
    });
    document.addEventListener("pointerlockchange", () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) {
        this.held.clear();
        this.useHeld = false;
      }
      this.onLockChange(this.locked);
    });
    document.addEventListener("mousemove", (e) => {
      if (this.locked) this.look(e.movementX, e.movementY);
    });
    document.addEventListener("mousedown", (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.onDig();
      else if (e.button === 2) {
        this.useHeld = true;
        this.onPlace();
      }
    });
    document.addEventListener("mouseup", (e) => e.button === 2 && (this.useHeld = false));
    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener(
      "wheel",
      (e) => {
        if (this.locked && e.deltaY) this.onScroll(Math.sign(e.deltaY));
      },
      { passive: true },
    );
    window.addEventListener("keydown", (e) => {
      if (e.code === "F3") {
        e.preventDefault();
        this.onToggleDebug();
        return;
      }
      if (/^Digit[1-9]$/.test(e.code)) this.onSelect(Number(e.code.slice(5)) - 1);
      if (e.code === "KeyE" && !e.repeat) this.onInteract();
      if (e.code === "Escape") this.onEscape();
      if (e.code === "KeyM" && !e.repeat) this.onMap();
      if (e.code === "KeyR" && !e.repeat) this.onRide();
      if (e.code === "KeyF" && !e.repeat) this.onFeed();
      if (e.code === "KeyV" && !e.repeat) this.onView();
      if (e.code === "KeyT" && !e.repeat) this.onTorch();
      if (e.code === "KeyH" && !e.repeat) this.onHelp();
      if (e.code === "KeyL" && !e.repeat) this.onBoard();
      if (e.code === "KeyK" && !e.repeat) this.onKaam();
      if (e.code === "KeyP" && !e.repeat) this.onPloughField();
      if (e.code === "KeyG" && !e.repeat) this.onTie();
      if (e.code === "KeyZ" && !e.repeat) this.onSleep();
      if (this.locked) {
        this.held.add(e.code);
        if (e.code === "Space") e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.held.delete(e.code));
    window.addEventListener("blur", () => {
      this.held.clear();
      this.useHeld = false;
    });
  }

  look(dx: number, dy: number) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch - dy * this.sensitivity));
  }

  /** Analog input from touch controls (added to the keys). */
  touch: { move: { forward: number; right: number }; run: boolean } | null = null;

  input(): Input {
    const h = this.held;
    const t = this.touch;
    if (t && (t.move.forward || t.move.right)) return { forward: t.move.forward, right: t.move.right, jump: h.has("Space"), sprint: t.run };
    return {
      forward: (h.has("KeyW") || h.has("ArrowUp") ? 1 : 0) - (h.has("KeyS") || h.has("ArrowDown") ? 1 : 0),
      right: (h.has("KeyD") || h.has("ArrowRight") ? 1 : 0) - (h.has("KeyA") || h.has("ArrowLeft") ? 1 : 0),
      jump: h.has("Space"),
      sprint: h.has("ShiftLeft") || h.has("ShiftRight") || h.has("ControlLeft"),
    };
  }
}
