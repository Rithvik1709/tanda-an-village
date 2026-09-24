import { B, block } from "../../shared/blocks";
import { CROPS, type CropId } from "../../shared/crops";

/** What a hotbar slot holds. */
export type Slot =
  | { kind: "hand" }
  | { kind: "tool"; tool: "hoe" | "can" }
  | { kind: "seed"; crop: CropId }
  | { kind: "block"; block: number };

export const DEFAULT_HOTBAR: Slot[] = [
  { kind: "hand" },
  { kind: "tool", tool: "hoe" },
  { kind: "tool", tool: "can" },
  { kind: "seed", crop: "jowar" },
  { kind: "seed", crop: "onion" },
  { kind: "seed", crop: "sugarcane" },
  { kind: "block", block: B.PLANKS },
  { kind: "block", block: B.BRICK },
  { kind: "block", block: B.FENCE },
];

export const slotName = (s: Slot) =>
  s.kind === "hand" ? "Hand" : s.kind === "tool" ? (s.tool === "hoe" ? "Hoe" : "Watering can") : s.kind === "seed" ? `${CROPS[s.crop].name} seeds` : block(s.block).name;

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
