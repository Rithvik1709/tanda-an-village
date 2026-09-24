import { B, block } from "../../shared/blocks";

/** What a hotbar slot holds. Tools arrive with farming (M3); for now it's the hand and building blocks. */
export type Slot = { kind: "hand" } | { kind: "block"; block: number };

export const DEFAULT_HOTBAR: Slot[] = [
  { kind: "hand" },
  { kind: "block", block: B.PLANKS },
  { kind: "block", block: B.BRICK },
  { kind: "block", block: B.WHITEWASH },
  { kind: "block", block: B.THATCH },
  { kind: "block", block: B.COBBLE },
  { kind: "block", block: B.FENCE },
  { kind: "block", block: B.ROOF_TILE },
  { kind: "block", block: B.HAY },
];

export const slotName = (s: Slot) => (s.kind === "hand" ? "Hand" : block(s.block).name);

export class Hotbar {
  selected = 0;
  constructor(readonly slots: Slot[] = DEFAULT_HOTBAR.slice()) {}
  get current() {
    return this.slots[this.selected];
  }
  select(i: number) {
    if (i >= 0 && i < this.slots.length) this.selected = i;
  }
  scroll(dir: number) {
    const n = this.slots.length;
    this.selected = (((this.selected + dir) % n) + n) % n;
  }
}
