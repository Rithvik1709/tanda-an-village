/** Value noise + fbm in GLSL, shared by the ground, water and grass shaders. */
export const NOISE_GLSL = /* glsl */ `
float bgHash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bgNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bgHash(i), bgHash(i + vec2(1.0, 0.0)), u.x), mix(bgHash(i + vec2(0.0, 1.0)), bgHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float bgFbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * bgNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;
