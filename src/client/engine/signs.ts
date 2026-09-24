import * as THREE from "three";
import type { Plot } from "../../shared/world";

/** Wooden boards on posts by a plot's gate: "विक्री आहे · FOR SALE ₹…" or "Listed ₹…". */
export class Signs {
  readonly group = new THREE.Group();
  private signs = new Map<number, { key: string; obj: THREE.Group }>();
  private post = new THREE.MeshLambertMaterial({ color: "#6a5238" });

  /** Show exactly these signs (plot id → text lines); unchanged signs are kept as they are. */
  set(plots: Plot[], wanted: Map<number, { lines: string[]; color: string }>) {
    for (const [id, s] of this.signs)
      if (!wanted.has(id)) {
        this.group.remove(s.obj);
        this.signs.delete(id);
      }
    for (const [id, w] of wanted) {
      const key = w.lines.join("|") + w.color;
      if (this.signs.get(id)?.key === key) continue;
      if (this.signs.has(id)) this.group.remove(this.signs.get(id)!.obj);
      const obj = this.make(plots[id], w.lines, w.color);
      this.group.add(obj);
      this.signs.set(id, { key, obj });
    }
  }

  private make(p: Plot, lines: string[], color: string) {
    const g = new THREE.Group();
    const gate = p.gate!;
    // stand the sign just outside the fence, beside the gate, facing the road
    const out = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[gate.side];
    const side = { N: [1, 0], S: [1, 0], E: [0, 1], W: [0, 1] }[gate.side];
    const x = gate.x + 0.5 + out[0] * 1.2 + side[0] * 2.6;
    const z = gate.z + 0.5 + out[1] * 1.2 + side[1] * 2.6;
    // two posts at the board's edges, behind it, so nothing crosses the lettering
    for (const px of [-0.62, 0.62]) {
      const postMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.85, 0.12), this.post);
      postMesh.position.set(px, 0.925, -0.1);
      g.add(postMesh);
    }
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#e9d6a8";
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = "#8a6a44";
    for (let y = 0; y < 128; y += 32) ctx.fillRect(0, y, 256, 2);
    ctx.strokeStyle = "#6a5238";
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 248, 120);
    ctx.textAlign = "center";
    ctx.fillStyle = color;
    ctx.font = "800 30px system-ui";
    ctx.fillText(lines[0], 128, 44);
    ctx.fillStyle = "#2a2018";
    ctx.font = "700 26px system-ui";
    lines.slice(1).forEach((l, i) => ctx.fillText(l, 128, 80 + i * 30));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 0.06), [
      this.post, this.post, this.post, this.post,
      new THREE.MeshLambertMaterial({ map: tex }),
      new THREE.MeshLambertMaterial({ map: tex }),
    ]);
    board.position.set(0, 1.55, 0);
    g.add(board);
    g.position.set(x, p.y + 1, z);
    g.rotation.y = Math.atan2(out[0], out[1]); // board's +z face looks out toward the road
    return g;
  }
}
