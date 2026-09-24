import * as THREE from "three";
import { CHUNK, D, W } from "../../shared/world";
import type { ChunkMesh, MeshData } from "./mesher";

/** Owns the chunk meshes: requests meshing from the worker and swaps geometry in when it arrives. */
export class WorldRenderer {
  readonly group = new THREE.Group();
  private meshes = new Map<string, THREE.Mesh[]>();
  private pending = new Map<number, (m: ChunkMesh & { ms: number }) => void>();
  private req = 0;
  readonly materials: { opaque: THREE.Material; cutout: THREE.Material; water: THREE.Material };
  lastMeshMs = 0;
  /** Round-trip time (edit → new geometry on screen) of the latest block edit. */
  lastEditMs = 0;
  private dirty = new Set<string>();

  constructor(private worker: Worker, atlas: THREE.Texture) {
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide }),
      water: new THREE.MeshLambertMaterial({ map: atlas, vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false, side: THREE.DoubleSide }),
    };
    worker.addEventListener("message", (e: MessageEvent) => {
      if (e.data.type !== "mesh") return;
      this.apply(e.data as ChunkMesh);
      this.lastMeshMs = e.data.ms;
      this.pending.get(e.data.req)?.(e.data);
      this.pending.delete(e.data.req);
    });
  }

  static chunkCount() {
    return (W / CHUNK) * (D / CHUNK);
  }

  mesh(cx: number, cz: number): Promise<ChunkMesh & { ms: number }> {
    const req = ++this.req;
    return new Promise((resolve) => {
      this.pending.set(req, resolve);
      this.worker.postMessage({ type: "mesh", cx, cz, req });
    });
  }

  meshAll(): Promise<unknown> {
    const jobs: Promise<unknown>[] = [];
    for (let cz = 0; cz < D / CHUNK; cz++) for (let cx = 0; cx < W / CHUNK; cx++) jobs.push(this.mesh(cx, cz));
    return Promise.all(jobs);
  }

  /**
   * Change one block: tell the worker, then remesh its chunk plus any neighbour whose faces or
   * ambient occlusion can see the change (the block sits on that chunk's border).
   */
  setBlock(vox: Uint8Array, x: number, y: number, z: number, b: number) {
    vox[x + W * (z + D * y)] = b;
    this.worker.postMessage({ type: "set", x, y, z, b });
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const dxs = [0, lx === 0 ? -1 : lx === CHUNK - 1 ? 1 : 0];
    const dzs = [0, lz === 0 ? -1 : lz === CHUNK - 1 ? 1 : 0];
    for (const dx of new Set(dxs)) for (const dz of new Set(dzs)) {
      const nx = cx + dx, nz = cz + dz;
      if (nx >= 0 && nz >= 0 && nx < W / CHUNK && nz < D / CHUNK) this.dirty.add(`${nx},${nz}`);
    }
  }

  /** Remesh every chunk touched since the last flush (called once per frame, so edits batch up). */
  flush(): Promise<unknown> | null {
    if (!this.dirty.size) return null;
    const t0 = performance.now();
    const jobs = [...this.dirty].map((k) => {
      const [cx, cz] = k.split(",").map(Number);
      return this.mesh(cx, cz);
    });
    this.dirty.clear();
    return Promise.all(jobs).then(() => (this.lastEditMs = performance.now() - t0));
  }

  private geometry(d: MeshData) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.positions, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(d.normals, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(d.uvs, 2));
    g.setAttribute("color", new THREE.BufferAttribute(d.colors, 3));
    g.setIndex(new THREE.BufferAttribute(d.indices, 1));
    g.computeBoundingSphere();
    return g;
  }

  private apply(cm: ChunkMesh) {
    const key = `${cm.cx},${cm.cz}`;
    for (const m of this.meshes.get(key) ?? []) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    const out: THREE.Mesh[] = [];
    for (const [data, mat, order] of [
      [cm.opaque, this.materials.opaque, 0],
      [cm.cutout, this.materials.cutout, 1],
      [cm.water, this.materials.water, 2],
    ] as const) {
      if (!data.indices.length) continue;
      const mesh = new THREE.Mesh(this.geometry(data), mat);
      mesh.renderOrder = order;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      out.push(mesh);
    }
    this.meshes.set(key, out);
  }
}
