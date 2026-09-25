import { type Action, apply, blockAt, type Result, settleHelpers } from "../shared/rules";
import type { Save } from "../shared/save";
import { H, idx, type World } from "../shared/world";
import type { WorldRenderer } from "./engine/world-renderer";

/**
 * The client's view of the game: the save, the clock, and keeping the voxels in step with both.
 * Every change goes through shared/rules.ts — the same code the server runs.
 */
export class Game {
  /** Dev-only clock offset (fast-forward). Always 0 in production builds. */
  skew = 0;
  private listeners: (() => void)[] = [];

  constructor(
    readonly world: World,
    /** The drawn voxels (a copy of the seeded world with the save applied). */
    readonly vox: Uint8Array,
    public save: Save,
    private renderer: WorldRenderer,
  ) {}

  now() {
    return Date.now() + this.skew;
  }

  onChange(f: () => void) {
    this.listeners.push(f);
  }

  /** Called with every locally accepted action (the network layer sends them to the server). */
  onAct: (a: Action) => void = () => {};

  act(a: Action): Result {
    this.settle();
    const r = apply(this.world, this.save, a, this.now());
    if (r.ok) {
      if ("x" in a) for (const dy of [-1, 0, 1]) this.sync(a.x, a.y + dy, a.z);
      this.onAct(a);
      this.listeners.forEach((f) => f());
    }
    return r;
  }

  /** Re-run actions locally without sending them (rebasing unsent work onto a fresh server save). */
  replay(actions: Action[]) {
    for (const a of actions) apply(this.world, this.save, a, this.now());
  }

  /**
   * Swap in a new save (the server's word is final) and redraw only what differs. This is how a
   * rejected optimistic action is rolled back.
   */
  replaceSave(next: Save) {
    const prev = this.save;
    this.save = next;
    const edits = new Set([...Object.keys(prev.edits), ...Object.keys(next.edits)]);
    const farm = new Set([...Object.keys(prev.farm), ...Object.keys(next.farm)]);
    this.each((x, y, z) => this.sync(x, y, z), [...edits]);
    this.each((x, y, z) => {
      this.sync(x, y, z);
      this.sync(x, y + 1, z);
    }, [...farm]);
    this.listeners.forEach((f) => f());
  }

  /** What's really at a position right now (save + clock over the seeded world). */
  blockAt(x: number, y: number, z: number) {
    return blockAt(this.world, this.save, x, y, z, this.now());
  }

  /** Make the drawn voxel at one position match the game state. */
  sync(x: number, y: number, z: number) {
    if (y < 0 || y >= H) return;
    const want = this.blockAt(x, y, z);
    if (this.vox[idx(x, y, z)] !== want) this.renderer.setBlock(this.vox, x, y, z, want);
  }

  each(f: (x: number, y: number, z: number) => void, keys: string[]) {
    const W = 192, D = 192;
    for (const k of keys) {
      const i = Number(k);
      const x = i % W, z = Math.floor(i / W) % D, y = Math.floor(i / (W * D));
      f(x, y, z);
    }
  }

  /** Apply every edit and farm cell in the save (after load). */
  syncAll() {
    this.each((x, y, z) => this.sync(x, y, z), Object.keys(this.save.edits));
    this.tick();
  }

  /** Hired labourers work on the clock too: bring their day up to now and redraw what they did. */
  settle() {
    this.each((x, y, z) => {
      this.sync(x, y, z);
      this.sync(x, y + 1, z);
    }, settleHelpers(this.world, this.save, this.now()));
  }

  /** Crops grow and soil dries on the clock: refresh every farm cell and the plant above it. */
  tick() {
    this.settle();
    this.each((x, y, z) => {
      this.sync(x, y, z);
      this.sync(x, y + 1, z);
    }, Object.keys(this.save.farm));
  }
}
