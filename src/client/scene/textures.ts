import * as THREE from "three";
import { mulberry32 } from "../../shared/rng";

/*
 * Painted surface textures, drawn once on canvases: lime plaster, handmade brick, Mangalore roof
 * tiles, straw thatch, weathered wood, dressed stone and striped cloth. Soft and slightly uneven,
 * like the rest of the world — no pixel art.
 */
type Painter = (g: CanvasRenderingContext2D, s: number, r: () => number) => void;
const cache = new Map<string, THREE.Texture>();

function make(name: string, size: number, paint: Painter, repeat: [number, number] = [1, 1]) {
  const key = name + repeat.join("x");
  if (cache.has(key)) return cache.get(key)!;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  paint(g, size, mulberry32(name.length * 7919 + size));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

const blotch = (g: CanvasRenderingContext2D, s: number, r: () => number, n: number, color: string, min: number, max: number) => {
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, rad = min + r() * (max - min);
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, color);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
};

export const TEX = {
  plaster: () =>
    make("plaster", 256, (g, s, r) => {
      g.fillStyle = "#f3ecdc";
      g.fillRect(0, 0, s, s);
      blotch(g, s, r, 40, "rgba(222,205,176,0.18)", 20, 60);
      blotch(g, s, r, 30, "rgba(255,252,244,0.3)", 10, 36);
      // a rain-stained band at the foot of the wall (the texture's bottom)
      const grd = g.createLinearGradient(0, s * 0.72, 0, s);
      grd.addColorStop(0, "rgba(150,120,90,0)");
      grd.addColorStop(1, "rgba(170,130,90,0.28)");
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
    }),
  brick: () =>
    make("brick", 256, (g, s, r) => {
      g.fillStyle = "#cdbca2";
      g.fillRect(0, 0, s, s);
      const bh = s / 8, bw = s / 4;
      for (let row = 0; row < 8; row++)
        for (let col = -1; col < 5; col++) {
          const x = col * bw + (row % 2 ? bw / 2 : 0);
          const shade = 0.85 + r() * 0.3;
          g.fillStyle = `rgb(${Math.floor(170 * shade)},${Math.floor(82 * shade)},${Math.floor(56 * shade)})`;
          g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4);
        }
      blotch(g, s, r, 30, "rgba(80,40,20,0.18)", 8, 30);
    }),
  tiles: () =>
    make("tiles", 256, (g, s, r) => {
      g.fillStyle = "#9c4a30";
      g.fillRect(0, 0, s, s);
      const rows = 8, cols = 6;
      for (let row = 0; row < rows; row++)
        for (let col = 0; col < cols; col++) {
          const x = col * (s / cols) + (row % 2 ? s / cols / 2 : 0), y = row * (s / rows);
          const grd = g.createLinearGradient(x, 0, x + s / cols, 0);
          const k = 0.85 + r() * 0.3;
          grd.addColorStop(0, `rgb(${120 * k},${50 * k},${32 * k})`);
          grd.addColorStop(0.5, `rgb(${196 * k},${96 * k},${62 * k})`);
          grd.addColorStop(1, `rgb(${120 * k},${50 * k},${32 * k})`);
          g.fillStyle = grd;
          g.beginPath();
          g.roundRect(x + 1, y + 1, s / cols - 2, s / rows + 4, 6);
          g.fill();
        }
      blotch(g, s, r, 25, "rgba(60,50,40,0.2)", 10, 40); // weathering
    }),
  thatch: () =>
    make("thatch", 256, (g, s, r) => {
      g.fillStyle = "#b8944f";
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 1400; i++) {
        const x = r() * s, y = r() * s, l = 10 + r() * 26;
        g.strokeStyle = r() < 0.5 ? `rgba(90,66,30,${0.3 + r() * 0.3})` : `rgba(230,200,130,${0.3 + r() * 0.4})`;
        g.lineWidth = 1 + r();
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x + (r() - 0.5) * 4, y + l);
        g.stroke();
      }
    }),
  wood: () =>
    make("wood", 128, (g, s, r) => {
      g.fillStyle = "#7a5a3c";
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        g.strokeStyle = `rgba(${r() < 0.5 ? "50,34,20" : "150,115,80"},${0.2 + r() * 0.3})`;
        g.lineWidth = 1 + r() * 2;
        const y = r() * s;
        g.beginPath();
        g.moveTo(0, y);
        g.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 8, s * 0.6, y + (r() - 0.5) * 8, s, y);
        g.stroke();
      }
    }),
  stone: () =>
    make("stone", 256, (g, s, r) => {
      g.fillStyle = "#8e877b";
      g.fillRect(0, 0, s, s);
      const rows = 5;
      for (let row = 0; row < rows; row++) {
        let x = -r() * 40;
        while (x < s) {
          const w = 40 + r() * 50;
          const k = 0.8 + r() * 0.35;
          g.fillStyle = `rgb(${150 * k},${143 * k},${130 * k})`;
          g.beginPath();
          g.roundRect(x + 2, row * (s / rows) + 2, w - 4, s / rows - 4, 8);
          g.fill();
          x += w;
        }
      }
      blotch(g, s, r, 20, "rgba(60,70,40,0.2)", 8, 30); // a little moss
    }),
  /** Banjara embroidery: bold colour bands, zigzag stitching and small round mirrors. */
  mirrorWork: () =>
    make("mirrorwork", 256, (g, s) => {
      const bands = ["#c8292e", "#1b1b1b", "#e8b830", "#1f7a45", "#1f4fa0", "#e8662a"];
      for (let i = 0; i < 8; i++) {
        g.fillStyle = bands[i % 6];
        g.fillRect(0, i * 32, s, 32);
        g.strokeStyle = bands[(i + 2) % 6];
        g.lineWidth = 3;
        g.beginPath();
        for (let x = 0; x <= s; x += 12) g.lineTo(x, i * 32 + (x % 24 ? 6 : 26));
        g.stroke();
        for (let x = 16; x < s; x += 32) {
          g.fillStyle = "#f2d060";
          g.beginPath();
          g.arc(x, i * 32 + 16, 7, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#eef4f8";
          g.beginPath();
          g.arc(x, i * 32 + 16, 4.5, 0, Math.PI * 2);
          g.fill();
        }
      }
    }),
  cloth: (color: string, stripe: string) =>
    make("cloth" + color, 128, (g, s) => {
      g.fillStyle = color;
      g.fillRect(0, 0, s, s);
      g.fillStyle = stripe;
      for (let x = 0; x < s; x += s / 4) g.fillRect(x, 0, s / 10, s);
      g.fillStyle = "rgba(0,0,0,0.08)";
      for (let y = 0; y < s; y += 4) g.fillRect(0, y, s, 1);
    }),
};

export function mat(map: THREE.Texture, opts: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.92, metalness: 0, ...opts });
}
