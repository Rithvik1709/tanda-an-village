import * as THREE from "three";

/*
 * Third person (default): the camera trails behind and a little over the right shoulder, eased,
 * lifted over any ground in the way. First person (V): at the eyes. Yaw and pitch come from the mouse.
 */
export type View = "third" | "first";

export class CameraRig {
  view: View = "third";
  distance = 4.2;
  private cur = new THREE.Vector3();
  private init = false;

  constructor(private camera: THREE.PerspectiveCamera, private ground: (x: number, z: number) => number, private solid?: (x: number, y: number, z: number) => boolean) {}

  update(dt: number, feet: { x: number; y: number; z: number }, yaw: number, pitch: number, eyeHeight = 1.58) {
    const eye = new THREE.Vector3(feet.x, feet.y + eyeHeight, feet.z);
    if (this.view === "first") {
      this.camera.position.copy(eye);
      this.camera.rotation.set(pitch, yaw, 0, "YXZ");
      this.init = false;
      return;
    }
    const fwd = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const focus = eye.clone().add(new THREE.Vector3(0, 0.12, 0)).addScaledVector(right, 0.55);
    const want = focus.clone().addScaledVector(fwd, -this.distance);
    // walls between you and the camera pull it in, so it never looks through a house
    if (this.solid) {
      const dir = want.clone().sub(focus);
      const len = dir.length();
      dir.normalize();
      for (let t = 0.3; t < len; t += 0.15) {
        const p = focus.clone().addScaledVector(dir, t);
        if (this.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)) || p.y < this.ground(p.x, p.z) + 0.2) {
          want.copy(focus).addScaledVector(dir, Math.max(0.35, t - 0.3));
          break;
        }
      }
    }
    const floor = this.ground(want.x, want.z) + 0.45;
    if (want.y < floor) want.y = floor;
    if (!this.init) {
      this.cur.copy(want);
      this.init = true;
    }
    // pull in instantly when something gets in the way; ease back out
    if (want.distanceTo(focus) < this.cur.distanceTo(focus) - 0.05) this.cur.copy(want);
    else this.cur.lerp(want, 1 - Math.exp(-dt * 14));
    this.camera.position.copy(this.cur);
    this.camera.lookAt(focus.clone().addScaledVector(fwd, 6));
  }

  /** The aiming ray: from the camera through the crosshair. */
  ray() {
    const d = new THREE.Vector3();
    this.camera.getWorldDirection(d);
    return { o: this.camera.position.clone(), d };
  }
}
