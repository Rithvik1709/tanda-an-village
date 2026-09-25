import * as THREE from "three";
import { banjaraWoman, Figure, type Look } from "../scene/figure";

/** A villager at a stall: the same modelled figure as the farmer, turning to face you when you come near. */
export type NpcLook = { kurta: string; dhoti: string; hat: string; hatTall?: boolean; skin?: string; woman?: boolean };

export class Npc {
  readonly group: THREE.Group;
  private fig: Figure;
  private t = Math.random() * 10;

  constructor(look: NpcLook, x: number, y: number, z: number, private facing: number) {
    const l: Look = look.woman
      ? banjaraWoman(look.dhoti, look.hat)
      : { kurta: look.kurta, dhoti: look.dhoti, hat: look.hat, hatStyle: look.hatTall ? "pheta" : "topi", skin: look.skin ?? "#a06a45" };
    this.fig = new Figure(l);
    this.group = this.fig.root;
    this.group.position.set(x, y, z);
    this.group.rotation.y = facing;
  }

  /** Far-off people needn't cast shadows. */
  setShadow(on: boolean) {
    this.fig.setShadow(on);
  }

  /** Turn toward the player when close; otherwise idle. */
  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    const dx = player.x - this.group.position.x, dz = player.z - this.group.position.z;
    const near = dx * dx + dz * dz < 49;
    const want = near ? Math.atan2(dx, dz) : this.facing + Math.sin(this.t * 0.25) * 0.25;
    const d = Math.atan2(Math.sin(want - this.group.rotation.y), Math.cos(want - this.group.rotation.y));
    this.group.rotation.y += d * Math.min(1, dt * 3);
    this.fig.animate(dt, 0);
  }
}
