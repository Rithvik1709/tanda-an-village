import * as THREE from "three";
import type { Plot } from "../shared/world";
import { parkedCart, Rig } from "./engine/livestock";
import { along, findPath, groundY, pathLength, type Pt } from "./player/path";

/*
 * Where the bulls and the cart are, and the ride. All of this is presentation: the server only
 * knows you own them, how they feel, and when a loaded trip set off.
 */
export type Park = { x: number; z: number; heading: number };
export type Dest = "town" | "home";

export class Farmyard {
  readonly rig = new Rig();
  readonly cart = parkedCart();
  readonly group = new THREE.Group();
  /** Where the bulls stand (following you) or where the rig is on the road. */
  pos = { x: 0, y: 0, z: 0, heading: 0 };
  cartAt: Park;
  readonly home: Park;
  readonly town: Park = { x: 172.5, z: 96.5, heading: Math.PI / 2 };
  ride: { path: Pt[]; len: number; d: number; speed: number; dest: Dest } | null = null;
  hasBulls = false;
  hasCart = false;
  onArrive: (dest: Dest) => void = () => {};
  private walkTo: { x: number; z: number } | null = null;

  constructor(private vox: Uint8Array, starter: Plot) {
    const g = starter.gate!;
    const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[g.side];
    // park beside the gate, out on the lane, facing away from the fence
    this.home = { x: g.x + 0.5 + out[0] * 3 + (out[0] ? 0 : 5), z: g.z + 0.5 + out[1] * 3 + (out[1] ? 0 : 5), heading: out[0] ? (out[0] > 0 ? Math.PI / 2 : -Math.PI / 2) : out[1] > 0 ? 0 : Math.PI };
    this.cartAt = { ...this.home };
    this.group.add(this.rig.group, this.cart);
    this.rig.group.visible = false;
    this.cart.visible = false;
    this.pos = { x: this.home.x + 2, y: groundY(vox, this.home.x + 2, this.home.z), z: this.home.z, heading: this.home.heading };
  }

  set(hasBulls: boolean, hasCart: boolean) {
    this.hasBulls = hasBulls;
    this.hasCart = hasCart;
    this.rig.group.visible = hasBulls;
    this.cart.visible = hasCart && !this.ride;
  }

  distTo(p: { x: number; z: number }, x: number, z: number) {
    return Math.hypot(p.x - x, p.z - z);
  }

  /** Set off along the road. Returns false if there's no way through. */
  startRide(dest: Dest): boolean {
    const to = dest === "town" ? this.town : this.home;
    const path = findPath(this.vox, this.cartAt, to);
    if (!path || path.length < 2) return false;
    const len = pathLength(path);
    this.ride = { path, len, d: 0, speed: len / Math.max(22, len / 5), dest }; // never shorter than the server's trip time
    this.rig.setHitched(true);
    this.cart.visible = false;
    return true;
  }

  /** Send the bulls to walk to a spot (the end of a ploughed row); they resume following after. */
  walk(x: number, z: number) {
    this.walkTo = { x, z };
  }

  update(dt: number, player: { x: number; z: number }) {
    const before = { ...this.pos };
    if (this.ride) {
      const r = this.ride;
      r.d = Math.min(r.len, r.d + r.speed * dt);
      const p = along(r.path, r.d);
      // the rig's origin is the bulls; the cart trails behind, so lead the path a little
      this.pos.x = p.x;
      this.pos.z = p.z;
      this.pos.heading = lerpAngle(this.pos.heading, p.heading, Math.min(1, dt * 3));
      if (r.d >= r.len) {
        const dest = r.dest;
        const park = dest === "town" ? this.town : this.home;
        this.cartAt = { x: park.x, z: park.z, heading: this.pos.heading };
        this.ride = null;
        this.rig.setHitched(false);
        this.cart.visible = this.hasCart;
        this.onArrive(dest);
      }
    } else if (this.hasBulls) {
      const goal = this.walkTo ?? player;
      const dx = goal.x - this.pos.x, dz = goal.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      const stop = this.walkTo ? 0.4 : 3.2;
      if (dist > 40) {
        // too far behind: they catch up off-screen
        this.pos.x = player.x - 3;
        this.pos.z = player.z - 3;
      } else if (dist > stop) {
        const speed = Math.min(this.walkTo ? 3 : 5.5, (dist - stop) * 2 + 0.5);
        this.pos.x += (dx / dist) * speed * dt;
        this.pos.z += (dz / dist) * speed * dt;
        this.pos.heading = lerpAngle(this.pos.heading, Math.atan2(dx, dz), Math.min(1, dt * 4));
      } else if (this.walkTo) this.walkTo = null;
    }
    const gy = groundY(this.vox, this.pos.x, this.pos.z);
    this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 8);
    if (Math.abs(gy - this.pos.y) > 3) this.pos.y = gy;
    this.rig.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.rig.group.rotation.y = this.pos.heading;
    this.rig.update(dt, Math.hypot(this.pos.x - before.x, this.pos.z - before.z));
    this.cart.position.set(this.cartAt.x, groundY(this.vox, this.cartAt.x, this.cartAt.z), this.cartAt.z);
    this.cart.rotation.y = this.cartAt.heading;
  }

  /** Where the driver sits on a moving cart (world space). */
  seat() {
    const h = this.pos.heading;
    return { x: this.pos.x - Math.sin(h) * 2.7, y: this.pos.y + 1.95, z: this.pos.z - Math.cos(h) * 2.7 };
  }
}

function lerpAngle(a: number, b: number, t: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}
