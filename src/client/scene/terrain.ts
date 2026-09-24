import * as THREE from "three";
import { B } from "../../shared/blocks";
import { fbm } from "../../shared/noise";
import { D, W } from "../../shared/world";
import { type Heightfield, RES } from "./heightfield";
import { NOISE_GLSL } from "./glslNoise";

/*
 * The ground as one smooth mesh: vertex colours blend what each spot is made of (grass drying to
 * gold in patches, black and red soil, packed-earth roads, river sand), and the fragment shader adds
 * painterly variation so nothing reads as a flat colour or a grid.
 */
const C = (h: string) => new THREE.Color(h);
const PALETTE: Record<number, THREE.Color> = {
  [B.GRASS]: C("#7d9a47"),
  [B.DIRT]: C("#9a7c56"),
  [B.ROAD]: C("#ad8f66"),
  [B.BLACK_SOIL]: C("#43372e"),
  [B.RED_SOIL]: C("#8e4c30"),
  [B.SAND]: C("#c9b387"),
  [B.STONE]: C("#8b867c"),
  [B.TILLED]: C("#3a2d24"),
  [B.TILLED_WET]: C("#2c221c"),
};
const DRY = C("#b09f5c"); // Deccan grass turning gold
const RIVERBED = C("#6a604c");

export function buildTerrain(hf: Heightfield, waterLevel: number): THREE.Mesh {
  const n = hf.n;
  const pos = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const tmp = new THREE.Color();
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const k = i + n * j;
      const x = i / RES, z = j / RES;
      const y = hf.h[k];
      pos.set([x, y, z], k * 3);
      // average the colours of the columns this vertex touches
      tmp.setRGB(0, 0, 0);
      let c = 0;
      for (const [dx, dz] of [[-0.25, -0.25], [0.25, -0.25], [-0.25, 0.25], [0.25, 0.25]]) {
        const sx = Math.min(W - 1, Math.max(0, Math.floor(x + dx))), sz = Math.min(D - 1, Math.max(0, Math.floor(z + dz)));
        const id = hf.surface[sx + W * sz];
        let base = PALETTE[id] ?? PALETTE[B.GRASS];
        if (id === B.GRASS) base = base.clone().lerp(DRY, Math.max(0, Math.min(1, (fbm(sx / 30, sz / 30, 99, 3) - 0.42) * 2.4)));
        tmp.add(base);
        c++;
      }
      tmp.multiplyScalar(1 / c);
      if (y < waterLevel + 0.4) tmp.lerp(RIVERBED, Math.min(1, (waterLevel + 0.4 - y) / 1.2)); // wet mud down to the riverbed
      col.set([tmp.r, tmp.g, tmp.b], k * 3);
    }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let t = 0;
  for (let j = 0; j < n - 1; j++)
    for (let i = 0; i < n - 1; i++) {
      const a = i + n * j, b = a + 1, c = a + n, d = c + 1;
      idx.set([a, c, b, b, c, d], t);
      t += 6;
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBgWorld;\nvarying vec3 vBgNormal;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvBgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvBgNormal = normal;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBgWorld;\nvarying vec3 vBgNormal;\n" + NOISE_GLSL)
      .replace(
        "#include <color_fragment>",
        /* glsl */ `#include <color_fragment>
        vec2 wp = vBgWorld.xz;
        float broad = bgFbm(wp * 0.06);
        float mid = bgFbm(wp * 0.35 + 7.0);
        float fine = bgNoise(wp * 3.1);
        diffuseColor.rgb *= mix(0.84, 1.12, broad) * mix(0.9, 1.08, mid) * mix(0.94, 1.05, fine);
        // slopes show a little earth through the grass
        float slope = 1.0 - clamp(vBgNormal.y, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.52, 0.42, 0.3), clamp(slope * 2.2, 0.0, 0.45));`,
      );
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  return mesh;
}
