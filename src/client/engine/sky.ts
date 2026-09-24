import { Q } from "../quality";
import * as THREE from "three";
import { fbm } from "../../shared/noise";

/*
 * Sky dome, sun, fog, lights and clouds driven by the hour of the day. The sun rises in the east
 * (+x) and sets over the river in the west, so evenings in the village look toward the water.
 */

type Key = { h: number; top: string; horizon: string; sun: string; sunI: number; hemiSky: string; hemiGround: string; hemiI: number; cloud: string };
const KEYS: Key[] = [
  { h: 0, top: "#0a0f24", horizon: "#1b2240", sun: "#8090c0", sunI: 0.0, hemiSky: "#5a6aa0", hemiGround: "#1a1a24", hemiI: 0.35, cloud: "#2a3050" },
  { h: 5.2, top: "#1c2552", horizon: "#6a4a6a", sun: "#ff9a70", sunI: 0.0, hemiSky: "#6a70a8", hemiGround: "#2a2228", hemiI: 0.4, cloud: "#5a4a68" },
  { h: 6.4, top: "#4f6fae", horizon: "#f0a878", sun: "#ffb080", sunI: 0.55, hemiSky: "#c0b0d0", hemiGround: "#5a4636", hemiI: 0.7, cloud: "#f6c6a6" },
  { h: 8.5, top: "#5f97d0", horizon: "#e8d8c0", sun: "#fff0d8", sunI: 0.95, hemiSky: "#e0ecf4", hemiGround: "#6a5a44", hemiI: 0.95, cloud: "#fbf4ea" },
  { h: 12, top: "#3f82d0", horizon: "#d6e6f0", sun: "#fffaf0", sunI: 1.05, hemiSky: "#eef4fa", hemiGround: "#6f604a", hemiI: 1.0, cloud: "#ffffff" },
  { h: 16, top: "#4f86cc", horizon: "#f0dcb8", sun: "#fff0d0", sunI: 0.95, hemiSky: "#eaeef2", hemiGround: "#6f5e46", hemiI: 0.95, cloud: "#fff6ea" },
  { h: 17.6, top: "#6f86c4", horizon: "#f2c49a", sun: "#ffc27a", sunI: 0.9, hemiSky: "#ecd6c6", hemiGround: "#6a4e38", hemiI: 0.9, cloud: "#ffe0bc" },
  { h: 18.5, top: "#4a4e92", horizon: "#e89a70", sun: "#ff9a5c", sunI: 0.55, hemiSky: "#c09cb0", hemiGround: "#4a3432", hemiI: 0.7, cloud: "#eab0a0" },
  { h: 19.6, top: "#161c40", horizon: "#4a3558", sun: "#8070a0", sunI: 0.0, hemiSky: "#6a6aa0", hemiGround: "#22202a", hemiI: 0.42, cloud: "#40385a" },
  { h: 24, top: "#0a0f24", horizon: "#1b2240", sun: "#8090c0", sunI: 0.0, hemiSky: "#5a6aa0", hemiGround: "#1a1a24", hemiI: 0.35, cloud: "#2a3050" },
];

const c = (s: string) => new THREE.Color(s);
function sample(h: number) {
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  const t = (h - a.h) / (b.h - a.h);
  const lc = (x: string, y: string) => c(x).lerp(c(y), t);
  return {
    top: lc(a.top, b.top),
    horizon: lc(a.horizon, b.horizon),
    sun: lc(a.sun, b.sun),
    sunI: a.sunI + (b.sunI - a.sunI) * t,
    hemiSky: lc(a.hemiSky, b.hemiSky),
    hemiGround: lc(a.hemiGround, b.hemiGround),
    hemiI: a.hemiI + (b.hemiI - a.hemiI) * t,
    cloud: lc(a.cloud, b.cloud),
  };
}

export function sunDirection(h: number): THREE.Vector3 {
  // 6:00 rises east, 12:00 overhead (tilted south), 18:00 sets west
  const a = ((h - 6) / 12) * Math.PI;
  return new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize();
}

export class Sky {
  readonly dome: THREE.Mesh;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly clouds = new THREE.Group();
  private uniforms = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() },
    sunColor: { value: new THREE.Color() },
    sunVisible: { value: 1 },
  };
  private cloudMats: THREE.SpriteMaterial[] = [];
  private cloudOffset = 0;

  constructor(private scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunVisible;
        varying vec3 vDir;
        void main(){
          float y = clamp(vDir.y, -0.2, 1.0);
          vec3 col = mix(horizon, top, pow(max(y, 0.0), 0.55));
          float d = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
          col += sunColor * (pow(d, 6.0) * 0.35 + pow(d, 60.0) * 0.6) * sunVisible;   // warm halo
          col = mix(col, sunColor * 1.15 + 0.1, smoothstep(0.9975, 0.999, d) * sunVisible); // the disc
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), mat);
    this.dome.renderOrder = -1;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight();
    this.sun = new THREE.DirectionalLight();
    scene.add(this.hemi, this.sun, this.sun.target);
    scene.fog = new THREE.Fog(0xffffff, 70, 240);

    // soft painted clouds: a few canvas-drawn puffs as camera-facing sprites, drifting slowly
    const puff = (seed: number) => {
      const c = document.createElement("canvas");
      c.width = 256;
      c.height = 128;
      const g = c.getContext("2d")!;
      let r = seed;
      const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 22; i++) {
        const x = 40 + rnd() * 176, y = 60 + (rnd() - 0.4) * 34, rad = 18 + rnd() * 34;
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, "rgba(255,255,255,0.55)");
        grd.addColorStop(0.6, "rgba(255,255,255,0.25)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    };
    const textures = [puff(11), puff(29), puff(47), puff(83)];
    for (let i = 0; i < 46; i++) {
      const a = fbm(i * 3.1, 7, 77, 2) * Math.PI * 2 + i * 2.4;
      const d = 90 + (i % 7) * 38;
      const m = new THREE.SpriteMaterial({ map: textures[i % 4], transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
      this.cloudMats.push(m);
      const sp = new THREE.Sprite(m);
      const sz = 70 + (i % 5) * 28;
      sp.scale.set(sz, sz * 0.42, 1);
      sp.position.set(Math.cos(a) * d, 70 + (i % 4) * 14 + fbm(i, 3, 5, 2) * 20, Math.sin(a) * d);
      this.clouds.add(sp);
    }
    scene.add(this.clouds);

    // soft shadows from the sun, in a box that follows the player
    this.sun.castShadow = Q.shadows;
    this.sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
    const sc = this.sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 10;
    sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 3;
  }

  update(hour: number, dt: number, focus: THREE.Vector3) {
    const s = sample(((hour % 24) + 24) % 24);
    const dir = sunDirection(hour);
    this.uniforms.top.value.copy(s.top);
    this.uniforms.horizon.value.copy(s.horizon);
    this.uniforms.sunDir.value.copy(dir);
    this.uniforms.sunColor.value.copy(s.sun);
    this.uniforms.sunVisible.value = dir.y > -0.05 ? 1 : 0;
    this.hemi.color.copy(s.hemiSky);
    this.hemi.groundColor.copy(s.hemiGround);
    this.hemi.intensity = s.hemiI * 0.95;
    this.sun.color.copy(s.sun);
    this.sun.intensity = Math.max(0, s.sunI) * 3.4 * Math.max(0, Math.min(1, dir.y * 4));
    (this.scene.fog as THREE.Fog).color.copy(s.horizon);
    this.dome.position.copy(focus);
    for (const m of this.cloudMats) m.color.copy(s.cloud);
    this.cloudOffset += dt * 0.6;
    this.clouds.position.set(focus.x + Math.sin(this.cloudOffset * 0.01) * 30, 0, focus.z + this.cloudOffset * 0.2 % 60);
    this.clouds.rotation.y = this.cloudOffset * 0.0015;
    // keep the shadow box centred on the player, snapped to shadow texels so edges don't crawl
    const snap = 90 / 2048;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.position.set(fx, focus.y, fz).addScaledVector(dir, 120);
    this.sun.target.position.set(fx, focus.y, fz);
  }
}

/** The current sky colours, for the water's reflection. */
export function skyColors(hour: number) {
  const s = sample(((hour % 24) + 24) % 24);
  return { top: s.top, horizon: s.horizon, sun: s.sun };
}
