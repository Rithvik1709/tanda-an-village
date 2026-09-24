/*
 * Pure movement physics and voxel raycasting. No Three.js, no DOM — unit tested directly.
 * The player is an axis-aligned box (0.6 × 1.8 × 0.6) whose position is the centre of its feet.
 */

export type Vec3 = { x: number; y: number; z: number };
export type Query = (x: number, y: number, z: number) => boolean;

export const PLAYER = { half: 0.3, height: 1.8, eye: 1.62 } as const;
export const MOVE = { walk: 4.3, sprint: 6.6, jump: 8.2, gravity: 26, swim: 2.2, reach: 6 } as const;

export type Body = { pos: Vec3; vel: Vec3; onGround: boolean; inWater: boolean };

/** True when the player's box at `p` overlaps any solid block. */
export function boxHits(p: Vec3, solid: Query, height: number = PLAYER.height): boolean {
  const h = PLAYER.half - 1e-4;
  const x0 = Math.floor(p.x - h), x1 = Math.floor(p.x + h);
  const y0 = Math.floor(p.y + 1e-4), y1 = Math.floor(p.y + height - 1e-4);
  const z0 = Math.floor(p.z - h), z1 = Math.floor(p.z + h);
  for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (solid(x, y, z)) return true;
  return false;
}

/**
 * Move one axis at a time and clamp to the block face on contact (the classic voxel sweep).
 * Steps are subdivided so a fast fall never tunnels through a floor.
 */
function sweepAxis(b: Body, axis: "x" | "y" | "z", d: number, solid: Query): boolean {
  const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.25));
  const s = d / steps;
  for (let i = 0; i < steps; i++) {
    const before = b.pos[axis];
    b.pos[axis] = before + s;
    if (!boxHits(b.pos, solid)) continue;
    // back off to the touching face
    if (axis === "y") b.pos.y = s > 0 ? Math.floor(b.pos.y + PLAYER.height) - PLAYER.height - 1e-3 : Math.floor(b.pos.y) + 1;
    else b.pos[axis] = s > 0 ? Math.floor(b.pos[axis] + PLAYER.half) - PLAYER.half - 1e-3 : Math.floor(b.pos[axis] - PLAYER.half) + 1 + PLAYER.half + 1e-3;
    if (boxHits(b.pos, solid)) b.pos[axis] = before; // corner case: stay put
    return true;
  }
  return false;
}

export type Input = { forward: number; right: number; jump: boolean; sprint: boolean };

/** Advance the body by dt seconds. `yaw` is the look direction around +y (0 = facing −z). */
export function step(b: Body, input: Input, yaw: number, dt: number, solid: Query, water: Query) {
  const eyeY = b.pos.y + 1.2;
  b.inWater = water(Math.floor(b.pos.x), Math.floor(b.pos.y + 0.4), Math.floor(b.pos.z)) || water(Math.floor(b.pos.x), Math.floor(eyeY), Math.floor(b.pos.z));
  let speed = input.sprint ? MOVE.sprint : MOVE.walk;
  if (b.inWater) speed *= 0.55;

  // wish direction in world space
  const len = Math.hypot(input.forward, input.right) || 1;
  const f = input.forward / len, r = input.right / len;
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const wx = -sin * f + cos * r;
  const wz = -cos * f - sin * r;

  // snappy on the ground, a little floaty in the air
  const accel = b.onGround ? 14 : b.inWater ? 6 : 3.5;
  const k = 1 - Math.exp(-accel * dt);
  b.vel.x += (wx * speed - b.vel.x) * k;
  b.vel.z += (wz * speed - b.vel.z) * k;

  if (b.inWater) {
    b.vel.y -= MOVE.gravity * 0.18 * dt;
    b.vel.y *= Math.exp(-2.5 * dt);
    if (input.jump) b.vel.y = Math.max(b.vel.y, MOVE.swim);
  } else {
    b.vel.y -= MOVE.gravity * dt;
    if (input.jump && b.onGround) b.vel.y = MOVE.jump;
  }
  b.vel.y = Math.max(b.vel.y, -40);

  if (sweepAxis(b, "x", b.vel.x * dt, solid)) b.vel.x = 0;
  if (sweepAxis(b, "z", b.vel.z * dt, solid)) b.vel.z = 0;
  const falling = b.vel.y <= 0;
  const hitY = sweepAxis(b, "y", b.vel.y * dt, solid);
  b.onGround = hitY && falling;
  if (hitY) b.vel.y = 0;
  // treading water at the surface: a jump out onto a bank needs a little extra lift
  if (b.inWater && input.jump && (b.vel.x !== 0 || b.vel.z !== 0)) {
    const ahead = { x: b.pos.x + Math.sign(wx) * 0.35, y: b.pos.y, z: b.pos.z + Math.sign(wz) * 0.35 };
    if (boxHits(ahead, solid)) b.vel.y = Math.max(b.vel.y, 5.5);
  }
}

export type Hit = { x: number; y: number; z: number; nx: number; ny: number; nz: number; dist: number };

/**
 * Amanatides–Woo voxel traversal from `o` along unit direction `d`. Returns the first cell for which
 * `pick` is true, plus the face normal it was entered through.
 */
export type Box = [number, number, number, number, number, number]; // cell-local x0 y0 z0 x1 y1 z1
export function raycast(o: Vec3, d: Vec3, maxDist: number, pick: Query, box?: (x: number, y: number, z: number) => Box | null): Hit | null {
  // a cell with a smaller hitbox (a plant) only counts if the ray actually passes through that box
  const inBox = (x: number, y: number, z: number): boolean => {
    const b = box?.(x, y, z);
    if (!b) return true;
    let t0 = 0, t1 = maxDist;
    const os = [o.x - x, o.y - y, o.z - z], ds = [d.x, d.y, d.z];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(ds[i]) < 1e-9) {
        if (os[i] < b[i] || os[i] > b[i + 3]) return false;
        continue;
      }
      let a = (b[i] - os[i]) / ds[i], c = (b[i + 3] - os[i]) / ds[i];
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 > t1) return false;
    }
    return true;
  };
  const hit = (x: number, y: number, z: number) => pick(x, y, z) && inBox(x, y, z);
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z);
  const tdx = sx ? Math.abs(1 / d.x) : Infinity, tdy = sy ? Math.abs(1 / d.y) : Infinity, tdz = sz ? Math.abs(1 / d.z) : Infinity;
  const frac = (v: number, s: number) => (s > 0 ? Math.floor(v) + 1 - v : v - Math.floor(v));
  let tx = sx ? frac(o.x, sx) * tdx : Infinity, ty = sy ? frac(o.y, sy) * tdy : Infinity, tz = sz ? frac(o.z, sz) * tdz : Infinity;
  let nx = 0, ny = 0, nz = 0, t = 0;
  if (hit(x, y, z)) return { x, y, z, nx, ny, nz, dist: 0 };
  while (t <= maxDist) {
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
    else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    if (t > maxDist) break;
    if (hit(x, y, z)) return { x, y, z, nx, ny, nz, dist: t };
  }
  return null;
}
