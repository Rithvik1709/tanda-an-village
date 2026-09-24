import * as THREE from "three";
import { mergeBoxes } from "./merge";

/** A blocky villager standing at a stall: dhoti, kurta, a topi or pheta. Turns to face the player. */
export type NpcLook = { kurta: string; dhoti: string; hat: string; hatTall?: boolean; skin?: string };

export class Npc {
  readonly group = new THREE.Group();
  private head: THREE.Group;
  private t = Math.random() * 10;

  constructor(look: NpcLook, x: number, y: number, z: number, private facing: number) {
    const mat = (c: string) => new THREE.MeshLambertMaterial({ color: c });
    const box = (w: number, h: number, d: number, c: string, px: number, py: number, pz: number, parent: THREE.Object3D = this.group) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
      m.position.set(px, py, pz);
      parent.add(m);
      return m;
    };
    const skin = look.skin ?? "#a8704a";
    box(0.22, 0.75, 0.24, look.dhoti, -0.12, 0.375, 0); // legs in a dhoti
    box(0.22, 0.75, 0.24, look.dhoti, 0.12, 0.375, 0);
    box(0.24, 0.08, 0.3, "#3a2a1c", -0.12, 0.04, 0.03); // chappals
    box(0.24, 0.08, 0.3, "#3a2a1c", 0.12, 0.04, 0.03);
    box(0.5, 0.65, 0.3, look.kurta, 0, 1.07, 0); // kurta
    box(0.16, 0.6, 0.18, look.kurta, -0.34, 1.07, 0); // arms
    box(0.16, 0.6, 0.18, look.kurta, 0.34, 1.07, 0);
    box(0.14, 0.12, 0.16, skin, -0.34, 0.71, 0);
    box(0.14, 0.12, 0.16, skin, 0.34, 0.71, 0);
    this.head = new THREE.Group();
    this.head.position.set(0, 1.4, 0);
    this.group.add(this.head);
    box(0.38, 0.38, 0.36, skin, 0, 0.19, 0, this.head);
    box(0.28, 0.05, 0.02, "#2a1c14", 0, 0.12, 0.185, this.head); // moustache
    box(0.07, 0.05, 0.02, "#1a1210", -0.09, 0.24, 0.185, this.head); // eyes
    box(0.07, 0.05, 0.02, "#1a1210", 0.09, 0.24, 0.185, this.head);
    if (look.hatTall) {
      box(0.42, 0.18, 0.4, look.hat, 0, 0.44, 0, this.head); // pheta (turban)
      box(0.3, 0.12, 0.3, look.hat, 0, 0.58, 0, this.head);
      box(0.08, 0.3, 0.06, look.hat, 0.17, 0.3, -0.22, this.head); // its tail
    } else box(0.4, 0.14, 0.26, look.hat, 0, 0.44, 0, this.head); // Gandhi topi
    this.group.position.set(x, y, z);
    this.group.rotation.y = facing;
    mergeBoxes(this.group);
  }

  /** Idle sway; the head turns toward the player when they're close. */
  update(dt: number, player: THREE.Vector3) {
    this.t += dt;
    this.group.position.y += Math.sin(this.t * 1.7) * 0.0006;
    const dx = player.x - this.group.position.x;
    const dz = player.z - this.group.position.z;
    const near = dx * dx + dz * dz < 64;
    let want = near ? Math.atan2(dx, dz) - this.facing : Math.sin(this.t * 0.4) * 0.3;
    want = Math.atan2(Math.sin(want), Math.cos(want));
    want = Math.max(-1.1, Math.min(1.1, want));
    this.head.rotation.y += (want - this.head.rotation.y) * Math.min(1, dt * 4);
  }
}
