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

  constructor(private camera: THREE.PerspectiveCamera, private ground: (x: number, z: number) => number) {}

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
    const floor = this.ground(want.x, want.z) + 0.45;
    if (want.y < floor) want.y = floor;
    if (!this.init) {
      this.cur.copy(want);
      this.init = true;
    }
    this.cur.lerp(want, 1 - Math.exp(-dt * 14));
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
