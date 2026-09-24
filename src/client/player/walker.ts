import type { Input } from "./physics";

/*
 * Walking on smooth ground. The terrain is a height function; buildings, walls and fences are the
 * world's non-terrain solid blocks, which block you sideways and can be stepped onto if they're
 * low (a plinth, a verandah step). Water slows you and floats you when it gets deep.
 */
export type Ground = (x: number, z: number) => number;
export type Solid = (x: number, y: number, z: number) => boolean;
export const WALK = { walk: 3.4, run: 6.2, jump: 5.2, gravity: 16, radius: 0.3, height: 1.7, step: 0.55 };

export class Walker {
  pos = { x: 0, y: 0, z: 0 };
  vel = { x: 0, y: 0, z: 0 };
  heading = 0; // the way the body faces (0 = +z)
  onGround = false;
  wading = 0; // water depth at the feet

  constructor(private ground: Ground, private solid: Solid, private waterLevel: number, private bounds: number) {}

  /** The floor under a point: the terrain, or the top of a low solid block you're standing over. */
  floorAt(x: number, z: number, feet: number) {
    let f = this.ground(x, z);
    const xi = Math.floor(x), zi = Math.floor(z);
    for (let y = Math.floor(feet + WALK.step); y >= Math.floor(feet - 1.5) && y + 1 > f; y--) if (this.solid(xi, y, zi)) return Math.max(f, y + 1);
    return f;
  }

  /** True if a body standing at (x, feet, z) would overlap a solid block. */
  private hits(x: number, feet: number, z: number) {
    const r = WALK.radius - 1e-3;
    for (let y = Math.floor(feet + 0.05); y <= Math.floor(feet + WALK.height - 0.05); y++)
      for (const [dx, dz] of [[-r, -r], [r, -r], [-r, r], [r, r], [0, 0]]) if (this.solid(Math.floor(x + dx), y, Math.floor(z + dz))) return true;
    return false;
  }

  step(input: Input, camYaw: number, dt: number) {
    const len = Math.hypot(input.forward, input.right);
    // camera-relative: forward is where the camera looks (yaw 0 looks toward −z)
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
    let wx = 0, wz = 0;
    if (len > 0) {
      wx = (fx * input.forward + rx * input.right) / len;
      wz = (fz * input.forward + rz * input.right) / len;
    }
    this.wading = Math.max(0, this.waterLevel - this.ground(this.pos.x, this.pos.z));
    let speed = input.sprint ? WALK.run : WALK.walk;
    if (this.wading > 0.2) speed *= this.wading > 1.1 ? 0.45 : 0.65;
    const k = 1 - Math.exp(-(this.onGround || this.wading > 1.1 ? 12 : 3) * dt);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    if (len > 0) {
      const want = Math.atan2(wx, wz);
      const d = Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading));
      this.heading += d * Math.min(1, dt * 10);
    }

    // horizontal moves, one axis at a time, with a small step-up
    for (const axis of ["x", "z"] as const) {
      const d = (axis === "x" ? this.vel.x : this.vel.z) * dt;
      if (!d) continue;
      const nx = axis === "x" ? this.pos.x + d : this.pos.x, nz = axis === "z" ? this.pos.z + d : this.pos.z;
      if (nx < 0.4 || nz < 0.4 || nx > this.bounds - 0.4 || nz > this.bounds - 0.4) {
        axis === "x" ? (this.vel.x = 0) : (this.vel.z = 0);
        continue;
      }
      if (!this.hits(nx, this.pos.y, nz)) {
        this.pos.x = nx;
        this.pos.z = nz;
      } else {
        const up = this.floorAt(nx, nz, this.pos.y);
        if (up - this.pos.y <= WALK.step && !this.hits(nx, up, nz)) {
          this.pos.x = nx;
          this.pos.z = nz;
          this.pos.y = up;
        } else axis === "x" ? (this.vel.x = 0) : (this.vel.z = 0);
      }
    }

    // vertical: follow the floor, jump, fall, float
    const floor = this.floorAt(this.pos.x, this.pos.z, this.pos.y);
    const swimY = this.waterLevel - 1.25;
    if (this.wading > 1.4) {
      // deep water: bob at the surface
      this.vel.y += (swimY - this.pos.y) * 8 * dt - this.vel.y * 4 * dt;
      if (input.jump) this.vel.y = Math.max(this.vel.y, 1.5);
    } else {
      this.vel.y -= WALK.gravity * dt;
      if (input.jump && this.onGround) this.vel.y = WALK.jump;
    }
    this.pos.y += this.vel.y * dt;
    if (this.pos.y <= floor + 0.02 && this.vel.y <= 0) {
      // walking down gentle slopes keeps you glued to the ground
      this.pos.y = floor;
      this.vel.y = 0;
      this.onGround = true;
    } else this.onGround = this.pos.y - floor < 0.05;
    if (this.wading <= 1.4 && this.pos.y < floor) this.pos.y = floor;
  }

  /** Would a body standing at (x, z) at the current height overlap a wall? */
  blockedAt(x: number, z: number) {
    return this.hits(x, this.pos.y, z);
  }

  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }
}
