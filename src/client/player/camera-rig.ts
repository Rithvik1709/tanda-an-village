import * as THREE from "three";

/*
 * Third person (default): the camera trails behind and a little over the right shoulder, lifted over
 * any ground in the way. First person (V): at the eyes. Yaw and pitch come from the mouse.
 *
 * How it moves is most of how walking feels:
 *  - The camera's position and its aim are eased separately, the position a little slower. When you
 *    set off, the body pulls ahead and the camera settles back behind it, like a drone following.
 *    (A lagging body under an instantly-snapping aim reads as "swimmy but jerky", so both are eased.)
 *  - The aim leads into the direction of travel, so the camera anticipates rather than chases.
 *  - At a run it drops back and a little lower, the frame takes the footfalls, and the view opens up.
 *  - It banks into turns, scaled by speed, so spinning on the spot never tilts the horizon.
 * The mouse still turns the view directly and the crosshair stays true: only where the camera sits
 * and the point it looks through are smoothed.
 *
 * The follow, run pull-back, bank, field of view and jump follow are SADAK's camera
 * (github.com/mittal-parth/sadak, used with its developer's permission), with its speeds mapped onto
 * ours. Easing in closer when you stand still is our own.
 */
export type View = "third" | "first";

const damp = (k: number, dt: number) => 1 - Math.exp(-k * dt);
/**
 * A critically damped spring toward `target` (Unity's SmoothDamp): it eases in, moves, and eases
 * out over about `time` seconds, never overshooting. `s.v` carries the velocity between frames.
 */
function smoothDamp(cur: number, target: number, s: { v: number }, time: number, dt: number) {
  const w = 2 / time, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, temp = (s.v + w * change) * dt;
  s.v = (s.v - w * temp) * e;
  return target + (change + temp) * e;
}
const WALK = 3.4, RUN = 6.2; // the walker's speeds (m/s)
const TURN_FULL = 2.1; // rad/s of turning that counts as a full-rate turn

export class CameraRig {
  view: View = "third";
  /** Far enough back to see the street around you, not just your back. */
  distance = 6.8;
  /** Standing still, the camera eases in closer: you're looking at what's around you. */
  idleDistance = 4.6;
  /** The camera has been pulled in so close that the body would fill the screen: hide it. */
  tooClose = false;
  private cur = new THREE.Vector3();
  private aim = new THREE.Vector3();
  private reach = 1;
  private sprintFeel = 0;
  private turn = 0;
  private fovKick = 0;
  private zoom = 6.8;
  private zoomV = { v: 0 };
  private stillT = 0;
  private lastYaw = 0;
  private bobT = 0;
  private init = false;
  private readonly baseFov: number;

  constructor(private camera: THREE.PerspectiveCamera, private ground: (x: number, z: number) => number, private solid?: (x: number, y: number, z: number) => boolean) {
    this.baseFov = camera.fov;
  }

  /** `floorY`: the floor under the feet. In a jump the camera follows only 60% of the height, so a
   *  hop reads as vertical movement without the whole frame lurching with it. */
  update(dt: number, feet: { x: number; y: number; z: number }, yaw: number, pitch: number, eyeHeight = 1.58, vel?: { x: number; y: number; z: number }, floorY?: number) {
    const eye = new THREE.Vector3(feet.x, feet.y + eyeHeight, feet.z);
    if (this.view === "first") {
      this.camera.position.copy(eye);
      this.camera.rotation.set(pitch, yaw, 0, "YXZ");
      this.setFov(0, dt);
      this.tooClose = false;
      this.init = false;
      return;
    }
    // SADAK's camera: it sits behind you at a height and always looks at a point just over your head.
    // Moving the mouse up and down raises and lowers it like a drone instead of tipping it, and both
    // where it sits and what it looks at are eased, so swinging the mouse sweeps it round you.
    // Looking down, the point it looks at also sinks toward the ground ahead (our addition), so the
    // crosshair can still reach the soil at your feet.
    const rise = THREE.MathUtils.clamp(-pitch, -0.15, 0.85); // 0 = level; up to 0.85 looking down
    const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)); // behind you
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const speed = vel ? Math.hypot(vel.x, vel.z) : 0;
    const speed01 = Math.min(1, speed / RUN);
    // how far into a run (0 at a walk): the camera drops back and low, and takes the footfalls
    this.sprintFeel += (Math.min(1, Math.max(0, (speed - WALK) / (RUN - WALK))) - this.sprintFeel) * damp(3, dt);
    const base = floorY ?? feet.y; // the floor under you
    const jumpY = Math.max(0, feet.y - base) * 0.6; // in a jump the camera follows 60% of the height

    // how far back: close when you've been standing a moment, out when you walk, further at a run.
    // Eased in and out by a spring, so the zoom never jumps. (Without a velocity, as on the cart,
    // the caller's distance is used as it is.)
    this.stillT = speed < 0.3 ? this.stillT + dt : 0;
    const zoomTo = vel ? (this.stillT > 0.6 ? this.idleDistance : this.distance + this.sprintFeel * 1.4) : this.distance;
    if (!this.init) this.zoom = zoomTo;
    else this.zoom = smoothDamp(this.zoom, zoomTo, this.zoomV, this.stillT > 0.6 ? 1.1 : 0.7, dt);
    const dist = this.zoom;

    // what it looks at: over your head, leading a third of a second into the walk
    const lead = 0.35;
    const aimTarget = new THREE.Vector3(
      feet.x + (vel?.x ?? 0) * lead,
      base + eyeHeight + 0.72 - Math.max(0, rise) * 1.0 + jumpY,
      feet.z + (vel?.z ?? 0) * lead,
    );
    const teleported = !this.init || this.aim.distanceTo(aimTarget) > 5;
    if (teleported) this.aim.copy(aimTarget);
    else {
      this.aim.x += (aimTarget.x - this.aim.x) * damp(7, dt);
      this.aim.z += (aimTarget.z - this.aim.z) * damp(7, dt);
      this.aim.y += (aimTarget.y - this.aim.y) * damp(7, dt);
    }

    // where it sits: back, a little to the right, and up with the mouse
    this.bobT += dt * speed * 1.15;
    const bob = Math.sin(this.bobT) * 0.05 * this.sprintFeel;
    const height = base + eyeHeight + 1.22 - this.sprintFeel * 0.35 + bob + rise * 5 + jumpY;
    const shoulder = 0.7;
    const bx = back.x * dist + right.x * shoulder, bz = back.z * dist + right.z * shoulder;

    // walls between you and the camera pull it in, so it never looks through a house:
    // march out from you and stop short of the first thing in the way
    const from = new THREE.Vector3(feet.x, base + eyeHeight, feet.z);
    let clear = 1;
    if (this.solid) {
      for (let f = 0.06; f <= 1; f += 0.03) {
        const px = feet.x + bx * f, pz = feet.z + bz * f, py = from.y + (height - from.y) * f;
        if (this.solid(Math.floor(px), Math.floor(py), Math.floor(pz)) || py < this.ground(px, pz) + 0.2) {
          clear = Math.max(0.12, f - 0.06);
          break;
        }
      }
    }
    if (teleported) this.reach = clear;
    // in fast (so walls are rarely seen through), out slow (so it glides back instead of popping)
    this.reach += (clear - this.reach) * damp(clear < this.reach ? 18 : 3, dt);
    this.reach = Math.min(this.reach, clear + 0.3 / dist); // never more than 30 cm behind a wall

    const want = new THREE.Vector3(feet.x + bx * this.reach, from.y + (height - from.y) * this.reach, feet.z + bz * this.reach);
    const floor = this.ground(want.x, want.z) + 0.45;
    if (want.y < floor) want.y = floor;
    if (teleported) {
      this.cur.copy(want);
      this.lastYaw = yaw;
      this.init = true;
    }
    // the position follows a little slower than the aim: that gap is the drone-like settle
    this.cur.lerp(want, damp(9, dt));
    // ...but never so far behind that a wall the march cleared ends up between camera and you
    const toYou = this.cur.distanceTo(from), maxD = from.distanceTo(want) + 0.4;
    if (toYou > maxD) this.cur.sub(from).multiplyScalar(maxD / toYou).add(from);
    this.camera.position.copy(this.cur);
    this.camera.lookAt(this.aim);
    this.tooClose = this.cur.distanceTo(from) < 0.9;

    // bank into the turn, eased in and out, scaled by how fast you're actually moving
    const yawRate = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw)) / Math.max(dt, 1e-3);
    this.lastYaw = yaw;
    this.turn += (THREE.MathUtils.clamp(yawRate / TURN_FULL, -1, 1) - this.turn) * damp(11, dt);
    this.camera.rotateZ(-this.turn * (0.035 + 0.03 * this.sprintFeel) * speed01);

    // the view opens up with speed: most of the sense of pace
    this.setFov(speed01 * 7 + this.sprintFeel * 5, dt);
  }

  private setFov(kick: number, dt: number) {
    this.fovKick += (kick - this.fovKick) * damp(4, dt);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** The aiming ray: from the camera through the crosshair. */
  ray() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return { o: this.camera.position.clone(), d };
  }
}
