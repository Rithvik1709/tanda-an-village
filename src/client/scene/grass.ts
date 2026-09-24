import * as THREE from "three";
import { B } from "../../shared/blocks";
import { fbm } from "../../shared/noise";
import { hash2 } from "../../shared/rng";
import { D, W } from "../../shared/world";
import { NOISE_GLSL } from "./glslNoise";
import type { Heightfield } from "./heightfield";

/*
 * Grass that moves: thousands of tapered blades per 16 × 16 tile, instanced, bent by a travelling
 * wind field in the vertex shader. Blades only grow on grassy ground (never on roads, fields or in
 * the river), turn gold where the land is dry, and a few carry marigold or white flowers.
 * Tiles near the player are drawn at full density, farther ones thinner, then not at all.
 */
const TILE = 16;
const PER_CELL = 34; // blades per block of grassy ground, near the player

export class Grass {
  readonly group = new THREE.Group();
  private tiles: { mesh: THREE.Mesh; geo: THREE.InstancedBufferGeometry; cx: number; cz: number; full: number }[] = [];
  readonly uniforms = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.2) },
    uSunColor: { value: new THREE.Color("#fff0d8") },
    uSky: { value: new THREE.Color("#a0b8d0") },
    uGround: { value: new THREE.Color("#6a5a3c") },
    uPlayer: { value: new THREE.Vector3() },
    uFade: { value: 70 },
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
  };

  constructor(hf: Heightfield, blocked: (x: number, z: number) => boolean, waterY: number) {
    // one blade: 5 vertices up a tapered strip (x across, y up 0..1)
    const blade = new THREE.BufferGeometry();
    const P = [-0.5, 0, 0.5, 0, -0.38, 0.35, 0.38, 0.35, -0.2, 0.7, 0.2, 0.7, 0, 1];
    const pos = new Float32Array((P.length / 2) * 3);
    for (let i = 0; i < P.length / 2; i++) pos.set([P[i * 2], P[i * 2 + 1], 0], i * 3);
    blade.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      side: THREE.DoubleSide,
      fog: true,
      vertexShader: /* glsl */ `
        attribute vec4 aBlade;   // x, y, z, yaw
        attribute vec4 aShape;   // height, width, lean, flower (0 none, 1 marigold, 2 white)
        attribute vec3 aColor;
        uniform float uTime, uFade; uniform vec3 uPlayer;
        varying vec3 vColor; varying float vT; varying float vFlower; varying vec3 vWorld;
        #include <fog_pars_vertex>
        ${NOISE_GLSL}
        void main(){
          float t = position.y;
          float dist = distance(aBlade.xz, uPlayer.xz);
          float shrink = 1.0 - smoothstep(uFade * 0.75, uFade, dist);   // blades sink away at the edge of the grass
          float h = aShape.x * shrink;
          vec2 dir = vec2(sin(aBlade.w), cos(aBlade.w));
          vec3 p = vec3(aBlade.x, aBlade.y, aBlade.z);
          p.xz += vec2(dir.y, -dir.x) * position.x * aShape.y * (1.0 - t * 0.6);
          // wind: a slow gust field rolling across the land, plus a quick flutter
          float gust = bgNoise(aBlade.xz * 0.045 + vec2(uTime * 0.23, uTime * 0.11));
          float flutter = sin(uTime * 3.1 + aBlade.x * 0.7 + aBlade.z * 0.5) * 0.12;
          float bend = (aShape.z + gust * 0.9 + flutter) * t * t;
          // the player parts the grass
          vec2 away = aBlade.xz - uPlayer.xz;
          float push = (1.0 - smoothstep(0.0, 1.1, length(away))) * 0.9;
          vec2 bendDir = normalize(vec2(0.8, 0.35)) * bend + (length(away) > 0.01 ? normalize(away) : vec2(0.0)) * push * t;
          p.xz += bendDir * h;
          p.y += h * t * (1.0 - 0.35 * min(1.0, length(bendDir)));
          vColor = aColor; vT = t; vFlower = aShape.w;
          vec4 wp = vec4(p, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uSunColor, uSky, uGround;
        varying vec3 vColor; varying float vT; varying float vFlower; varying vec3 vWorld;
        #include <fog_pars_fragment>
        void main(){
          vec3 base = vColor * mix(0.45, 1.08, vT);                    // dark at the root, bright at the tip
          if (vFlower > 0.5 && vT > 0.82) base = vFlower > 1.5 ? vec3(0.95, 0.93, 0.85) : vec3(0.95, 0.52, 0.1);
          float sun = max(uSunDir.y, 0.0);
          vec3 light = uSky * 0.7 + uGround * 0.25 + uSunColor * (0.6 + 0.5 * vT) * sun * 1.35;
          vec3 col = base * light;
          col += uSunColor * pow(vT, 3.0) * 0.12 * sun;                 // sunlit tips glow a little (translucency)
          gl_FragColor = vec4(col, 1.0);
          #include <fog_fragment>
        }`,
    });

    const green = new THREE.Color("#6e9a3a"), lush = new THREE.Color("#8ab548"), dry = new THREE.Color("#c9ad62");
    const tmp = new THREE.Color();
    for (let cz = 0; cz < D / TILE; cz++)
      for (let cx = 0; cx < W / TILE; cx++) {
        const blades: number[] = [], shapes: number[] = [], colors: number[] = [];
        for (let z = cz * TILE; z < (cz + 1) * TILE; z++)
          for (let x = cx * TILE; x < (cx + 1) * TILE; x++) {
            if (hf.surfaceAt(x, z) !== B.GRASS || blocked(x, z)) continue;
            const dryness = Math.max(0, Math.min(1, (fbm(x / 30, z / 30, 99, 3) - 0.42) * 2.4));
            const lushness = fbm(x / 9, z / 9, 5, 2);
            const tall = 0.35 + 0.55 * fbm(x / 14, z / 14, 17, 2);
            for (let i = 0; i < PER_CELL; i++) {
              const px = x + hash2(x * 31 + i, z, 1), pz = z + hash2(x, z * 31 + i, 2);
              const y = hf.at(px, pz);
              if (y < waterY + 0.08) continue;
              const r = hash2(x * 7 + i, z * 13 + i, 3);
              blades.push(px, y - 0.02, pz, r * Math.PI * 2);
              const fl = r < 0.012 ? 1 : r > 0.992 ? 2 : 0;
              shapes.push(tall * (0.55 + hash2(i, x + z * 197, 4) * 0.7) * (fl ? 1.15 : 1), 0.035 + r * 0.03, (hash2(i, x, 5) - 0.5) * 0.5, fl);
              tmp.copy(green).lerp(lush, lushness).lerp(dry, dryness * (0.7 + 0.3 * r));
              tmp.offsetHSL((r - 0.5) * 0.03, 0, (hash2(i, z, 6) - 0.5) * 0.08);
              colors.push(tmp.r, tmp.g, tmp.b);
            }
          }
        const n = blades.length / 4;
        if (!n) continue;
        // shuffle, so drawing fewer instances thins the tile evenly instead of cropping it
        for (let i = n - 1; i > 0; i--) {
          const j = Math.floor(hash2(i, cx * 64 + cz, 9) * (i + 1));
          for (const [arr, k] of [[blades, 4], [shapes, 4], [colors, 3]] as const)
            for (let q = 0; q < k; q++) [arr[i * k + q], arr[j * k + q]] = [arr[j * k + q], arr[i * k + q]];
        }
        const geo = new THREE.InstancedBufferGeometry();
        geo.index = blade.index;
        geo.setAttribute("position", blade.getAttribute("position"));
        geo.setAttribute("aBlade", new THREE.InstancedBufferAttribute(new Float32Array(blades), 4));
        geo.setAttribute("aShape", new THREE.InstancedBufferAttribute(new Float32Array(shapes), 4));
        geo.setAttribute("aColor", new THREE.InstancedBufferAttribute(new Float32Array(colors), 3));
        geo.instanceCount = n;
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3((cx + 0.5) * TILE, 15, (cz + 0.5) * TILE), TILE * 0.75 + 2);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.frustumCulled = true;
        this.group.add(mesh);
        this.tiles.push({ mesh, geo, cx, cz, full: n });
      }
  }

  /** Density falls with distance: all blades close by, a thinning share farther out, none past `fade`. */
  update(t: number, player: THREE.Vector3, fade: number, sunDir: THREE.Vector3, sun: THREE.Color, sky: THREE.Color) {
    const u = this.uniforms;
    u.uTime.value = t;
    u.uPlayer.value.copy(player);
    u.uFade.value = fade;
    u.uSunDir.value.copy(sunDir);
    u.uSunColor.value.copy(sun);
    u.uSky.value.copy(sky);
    for (const tile of this.tiles) {
      const d = Math.hypot((tile.cx + 0.5) * TILE - player.x, (tile.cz + 0.5) * TILE - player.z);
      const vis = d < fade + TILE;
      tile.mesh.visible = vis;
      if (vis) tile.geo.instanceCount = Math.max(1, Math.floor(tile.full * Math.min(1, Math.max(0.12, 1 - (d - 24) / (fade * 1.1)))));
    }
  }
}
