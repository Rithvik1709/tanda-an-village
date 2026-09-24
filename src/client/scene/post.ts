import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/*
 * The film look: a soft bloom on bright sky and sun glints, then a grade — warm highlights, a touch
 * of lift in the shadows, gentle saturation and a vignette — before filmic tone mapping.
 */
const Grade = {
  uniforms: { tDiffuse: { value: null }, uWarm: { value: 0.5 }, uVignette: { value: 0.32 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uWarm, uVignette; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.08);                                         // a little richer colour
      c.rgb += vec3(0.018, 0.012, 0.022) * (1.0 - smoothstep(0.0, 0.35, l));    // lifted, slightly violet shadows
      c.rgb *= mix(vec3(1.0), vec3(1.05, 1.0, 0.92), smoothstep(0.35, 1.2, l) * uWarm); // warm highlights
      vec2 d = vUv - 0.5;
      c.rgb *= 1.0 - uVignette * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));
      gl_FragColor = c;
    }`,
};

export class Post {
  readonly composer: EffectComposer;
  private bloom: UnrealBloomPass;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.16, 0.5, 0.93);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new ShaderPass(Grade));
    this.composer.addPass(new OutputPass());
  }
  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
  }
  render() {
    this.composer.render();
  }
}
