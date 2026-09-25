import * as THREE from "three";
import { D, W } from "../../shared/world";
import type { Heightfield } from "./heightfield";
import { NOISE_GLSL } from "./glslNoise";

/*
 * The river: a plane at water level whose shader knows the ground beneath it (a small height
 * texture), so it is clear and pale in the shallows, deep green-blue in the channel, with a soft
 * edge on the banks, moving ripples, sky reflection by angle and a sun glint.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  /** `pond` limits the sheet to one pond, an ellipse (centre x, z and radii); without it the water covers the map. */
  constructor(hf: Heightfield, level: number, pond?: { x: number; z: number; rx: number; rz: number }) {
    const data = new Uint8Array(W * D);
    for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) data[x + W * z] = Math.max(0, Math.min(255, ((hf.at(x + 0.5, z + 0.5) - level + 4) / 8) * 255));
    const tex = new THREE.DataTexture(data, W, D, THREE.RedFormat, THREE.UnsignedByteType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.uniforms = {
      uTime: { value: 0 },
      uGround: { value: tex },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color("#fff2d8") },
      uSky: { value: new THREE.Color("#8fb4d6") },
      uHorizon: { value: new THREE.Color("#e8d8c0") },
      uPond: { value: pond ? new THREE.Vector4(pond.x, pond.z, pond.rx, pond.rz) : new THREE.Vector4(0, 0, 0, 0) },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      fog: true,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        #include <fog_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform sampler2D uGround; uniform vec3 uSunDir, uSunColor, uSky, uHorizon; uniform vec4 uPond;
        varying vec3 vWorld;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main(){
          vec2 uv = vWorld.xz / vec2(${W.toFixed(1)}, ${D.toFixed(1)});
          float ground = texture2D(uGround, uv).r * 8.0 - 4.0;   // ground height relative to the water
          float depth = clamp(-ground, 0.0, 4.0);
          if (depth < 0.02) discard;
          // a pond's sheet stops at its own banks, even where lower ground lies beyond them
          if (uPond.z > 0.0 && length((vWorld.xz - uPond.xy) / uPond.zw) > 1.06) discard;
          // ripples: two drifting noise fields make a gently moving normal
          vec2 p = vWorld.xz;
          float e = 0.15;
          float h0 = bgFbm(p * 0.45 + vec2(uTime * 0.12, uTime * 0.05)) + 0.5 * bgNoise(p * 1.7 - uTime * 0.3);
          float hx = bgFbm((p + vec2(e, 0.0)) * 0.45 + vec2(uTime * 0.12, uTime * 0.05)) + 0.5 * bgNoise((p + vec2(e, 0.0)) * 1.7 - uTime * 0.3);
          float hz = bgFbm((p + vec2(0.0, e)) * 0.45 + vec2(uTime * 0.12, uTime * 0.05)) + 0.5 * bgNoise((p + vec2(0.0, e)) * 1.7 - uTime * 0.3);
          vec3 n = normalize(vec3((h0 - hx) * 0.7, 1.0, (h0 - hz) * 0.7));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          vec3 shallow = vec3(0.42, 0.6, 0.52), deep = vec3(0.11, 0.3, 0.33);
          vec3 body = mix(shallow, deep, smoothstep(0.1, 2.6, depth));
          vec3 refl = mix(uHorizon, uSky, clamp(reflect(-v, n).y * 2.0, 0.0, 1.0));
          vec3 col = mix(body, refl, 0.15 + 0.7 * fres);
          float spec = pow(max(dot(reflect(-normalize(uSunDir), n), v), 0.0), 60.0);
          col += uSunColor * spec * 0.35;
          // a pale line where the water meets the bank
          col = mix(col, vec3(0.85, 0.86, 0.78), (1.0 - smoothstep(0.02, 0.22, depth)) * 0.5);
          float alpha = mix(0.55, 0.92, smoothstep(0.05, 1.2, depth));
          gl_FragColor = vec4(col, alpha);
          #include <fog_fragment>
        }`,
    });
    const [x0, z0, x1, z1] = pond ? [pond.x - pond.rx - 1, pond.z - pond.rz - 1, pond.x + pond.rx + 1, pond.z + pond.rz + 1] : [0, 0, W, D];
    const geo = new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, level, (z0 + z1) / 2);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 3;
    this.mesh.name = "water";
  }

  update(t: number, sunDir: THREE.Vector3, sunColor: THREE.Color, sky: THREE.Color, horizon: THREE.Color) {
    this.uniforms.uTime.value = t;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSky.value.copy(sky);
    this.uniforms.uHorizon.value.copy(horizon);
  }
}
