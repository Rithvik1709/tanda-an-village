import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { UKHALI_ROADS } from "../../shared/ukhali-osm";
import type { Plot } from "../../shared/world";
import { TEX } from "./textures";

/*
 * A modern tanda: concrete electric poles with sagging wires along the roads (and street lamps),
 * brick pump houses where electric motors lift water from the vihir and borewells into cement tanks
 * and field channels, and black drip-irrigation lines along the rows of irrigated fields.
 */
const mat = (c: string, o: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...o });
const concrete = mat("#b9b3a6"), brick = new THREE.MeshStandardMaterial({ map: TEX.brick(), roughness: 0.9 }), pipeBlue = mat("#2f6fb4", { roughness: 0.5 }), black = mat("#1c1c1c", { roughness: 0.6 }), metal = mat("#6b7078", { metalness: 0.6, roughness: 0.4 }), cement = mat("#a9a49a"), tin = mat("#8e949c", { metalness: 0.5, roughness: 0.5 });

/** Flowing water: a strip whose texture scrolls, bright and foamy. */
function waterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uOn: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform float uOn; varying vec2 vUv;
      void main(){
        float s = fract(vUv.y * 3.0 - uTime * 2.4);
        float streak = smoothstep(0.0, 0.5, sin((vUv.x * 9.0 + vUv.y * 2.0 - uTime * 7.0)) * 0.5 + 0.5);
        vec3 c = mix(vec3(0.3, 0.55, 0.68), vec3(0.85, 0.93, 0.98), streak * 0.55 + s * 0.2);
        gl_FragColor = vec4(c, (0.55 + 0.35 * streak) * uOn);
      }`,
  });
}

export class Infrastructure {
  readonly group = new THREE.Group();
  /** Street lamps (on some poles) — the night-light pool uses these like the house bulbs. */
  readonly lamps: THREE.Vector3[] = [];
  /** Where the poles stand (so nobody walks through them). */
  readonly poleSpots: { x: number; z: number }[] = [];
  private water: THREE.ShaderMaterial[] = [];
  private splashes: THREE.Points[] = [];
  private lampMat = new THREE.MeshStandardMaterial({ color: "#fff1d0", emissive: new THREE.Color("#ffc070"), emissiveIntensity: 0 });
  private dripGroup = new THREE.Group();
  private dripKey = "";

  constructor(private ground: (x: number, z: number) => number, private blocked: (x: number, z: number) => boolean, pumps: { x: number; z: number; tankDir: [number, number] }[]) {
    this.group.add(this.dripGroup);
    this.poles();
    for (const p of pumps) this.pumpHouse(p.x, p.z, p.tankDir);
  }

  private poles() {
    const geos: { g: THREE.BufferGeometry; m: THREE.Material }[] = [];
    const wires: number[] = [];
    let n = 0;
    for (const r of UKHALI_ROADS) {
      if (r.k === "track") continue;
      const step = r.k === "lane" ? 13 : 16;
      const pts: THREE.Vector3[] = [];
      let carry = 0;
      for (let i = 1; i < r.p.length; i++) {
        const [ax, az] = r.p[i - 1], [bx, bz] = r.p[i];
        const len = Math.hypot(bx - ax, bz - az);
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (let t = carry; t < len; t += step) {
          const x = ax + ((bx - ax) * t) / len + nx * 2.6, z = az + ((bz - az) * t) / len + nz * 2.6;
          if (x < 1 || z < 1 || x > 191 || z > 191 || this.blocked(x, z)) continue;
          const y = this.ground(x, z);
          pts.push(new THREE.Vector3(x, y, z));
          this.poleSpots.push({ x, z });
        }
        carry = (carry - len) % step;
        if (carry < 0) carry += step;
      }
      pts.forEach((p, i) => {
        const pole = new THREE.CylinderGeometry(0.09, 0.14, 7.5, 6);
        pole.translate(p.x, p.y + 3.75, p.z);
        geos.push({ g: pole, m: concrete });
        const arm = new THREE.BoxGeometry(1.4, 0.1, 0.1);
        const next = pts[i + 1] ?? pts[i - 1] ?? p;
        const ang = Math.atan2(next.x - p.x, next.z - p.z);
        arm.rotateY(ang + Math.PI / 2);
        arm.translate(p.x, p.y + 7.1, p.z);
        geos.push({ g: arm, m: metal });
        if (n++ % 3 === 0) {
          // a street lamp on every third pole
          const lamp = new THREE.SphereGeometry(0.16, 8, 6);
          lamp.translate(p.x + Math.sin(ang + Math.PI / 2) * 0.6, p.y + 6.6, p.z + Math.cos(ang + Math.PI / 2) * 0.6);
          geos.push({ g: lamp, m: this.lampMat });
          this.lamps.push(new THREE.Vector3(p.x + Math.sin(ang + Math.PI / 2) * 0.6, p.y + 6.4, p.z + Math.cos(ang + Math.PI / 2) * 0.6));
        }
        if (i === 0) return;
        const q = pts[i - 1];
        if (q.distanceTo(p) > step * 1.8) return; // a gap (skipped pole): no wire across it
        // three wires, sagging between the poles
        for (const off of [-0.6, 0, 0.6]) {
          const ox = Math.sin(ang + Math.PI / 2) * off, oz = Math.cos(ang + Math.PI / 2) * off;
          const a = new THREE.Vector3(q.x + ox, q.y + 7.15, q.z + oz), b = new THREE.Vector3(p.x + ox, p.y + 7.15, p.z + oz);
          for (let k = 0; k < 10; k++) {
            const t0 = k / 10, t1 = (k + 1) / 10;
            const p0 = a.clone().lerp(b, t0), p1 = a.clone().lerp(b, t1);
            p0.y -= Math.sin(Math.PI * t0) * 0.55;
            p1.y -= Math.sin(Math.PI * t1) * 0.55;
            wires.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z);
          }
        }
      });
    }
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const { g, m } of geos) {
      const q = g.index ? g.toNonIndexed() : g;
      q.deleteAttribute("uv");
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m)!.push(q);
    }
    for (const [m, list] of byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(list)!, m);
      mesh.castShadow = true;
      this.group.add(mesh);
    }
    const wg = new THREE.BufferGeometry();
    wg.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    this.group.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: "#2a2a2a" })));
  }

  /** A brick pump house by a well: an electric motor, a blue delivery pipe gushing into a cement tank, and a channel to the fields. */
  private pumpHouse(x: number, z: number, dir: [number, number]) {
    const g = new THREE.Group();
    const y = this.ground(x, z);
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, px: number, py: number, pz: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(px, py, pz);
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    // the shed, with a tin roof and an open front showing the motor
    add(new THREE.BoxGeometry(1.8, 1.8, 0.14), brick, 0, 0.9, -0.85);
    add(new THREE.BoxGeometry(0.14, 1.8, 1.8), brick, -0.85, 0.9, 0);
    add(new THREE.BoxGeometry(0.14, 1.8, 1.8), brick, 0.85, 0.9, 0);
    const roof = add(new THREE.BoxGeometry(2.2, 0.05, 2.2), tin, 0, 1.9, 0);
    roof.rotation.x = 0.08;
    add(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 12), mat("#2e6fa8", { metalness: 0.4 }), 0, 0.45, -0.1).rotation.z = Math.PI / 2; // the motor
    add(new THREE.BoxGeometry(0.3, 0.4, 0.14), mat("#c9c2b0"), -0.55, 1.2, -0.7); // the starter box
    // the delivery pipe, out and over the tank
    const [dx, dz] = dir;
    const pipe = new THREE.CylinderGeometry(0.08, 0.08, 2.2, 10);
    pipe.rotateZ(Math.PI / 2);
    const pm = add(pipe, pipeBlue, dx * 1.2, 1.05, dz * 1.2);
    pm.rotation.y = Math.atan2(dz, -dx);
    // the cement tank (haud)
    const tx = dx * 2.6, tz = dz * 2.6;
    add(new THREE.BoxGeometry(1.8, 0.6, 1.8), cement, tx, 0.3, tz);
    const surf = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshStandardMaterial({ color: "#4f8fa8", roughness: 0.2, metalness: 0.2 }));
    surf.rotation.x = -Math.PI / 2;
    surf.position.set(tx, 0.61, tz);
    g.add(surf);
    // the gush: a curved sheet of falling water from the pipe mouth into the tank
    const wm = waterMaterial();
    this.water.push(wm);
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(dx * 2.3, 1.05, dz * 2.3), new THREE.Vector3(dx * 2.75, 1.0, dz * 2.75), new THREE.Vector3(dx * 2.8, 0.58, dz * 2.8));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.11, 8), wm));
    // splash spray
    const sp = new Float32Array(60 * 3);
    const pts = new THREE.BufferGeometry();
    pts.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    const splash = new THREE.Points(pts, new THREE.PointsMaterial({ color: "#f4faff", size: 0.09, transparent: true, opacity: 0.9 }));
    splash.position.set(dx * 2.8, 0.6, dz * 2.8);
    splash.userData.seed = Math.random() * 10;
    g.add(splash);
    this.splashes.push(splash);
    // the channel (paat) from the tank toward the fields: a thin stream in a cement lining
    const cl = 2.6;
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, cl), cement);
    ch.position.set(dx * (3.5 + cl / 2), 0.02, dz * (3.5 + cl / 2));
    ch.rotation.y = Math.atan2(dx, dz);
    g.add(ch);
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(0.34, cl), (() => { const m = waterMaterial(); this.water.push(m); return m; })());
    stream.rotation.x = -Math.PI / 2;
    stream.rotation.z = -Math.atan2(dx, dz) + Math.PI;
    stream.position.set(dx * (3.5 + cl / 2), 0.12, dz * (3.5 + cl / 2));
    g.add(stream);
    g.position.set(x, y, z);
    this.group.add(g);
  }

  /** Black drip laterals along every other row of each irrigated field, with a header pipe along one edge. */
  setDrip(plots: Plot[]) {
    const key = plots.map((p) => p.id).join(",");
    if (key === this.dripKey) return;
    this.dripKey = key;
    this.dripGroup.clear();
    const geos: THREE.BufferGeometry[] = [];
    for (const p of plots) {
      const y = p.y + 1.17; // resting on the furrow ridges
      const len = p.x1 - p.x0 - 1;
      for (let z = p.z0 + 2; z < p.z1 - 1; z += 2) {
        const lat = new THREE.CylinderGeometry(0.035, 0.035, len, 6);
        lat.rotateZ(Math.PI / 2);
        lat.translate((p.x0 + p.x1 + 1) / 2, y, z + 0.75);
        geos.push(lat);
        for (let x = p.x0 + 2; x < p.x1; x += 1) {
          const drop = new THREE.SphereGeometry(0.04, 5, 4);
          drop.translate(x + 0.5, y - 0.02, z + 0.75);
          geos.push(drop);
        }
      }
      const header = new THREE.CylinderGeometry(0.06, 0.06, p.z1 - p.z0 - 1, 6);
      header.rotateX(Math.PI / 2);
      header.translate(p.x0 + 1.2, y, (p.z0 + p.z1 + 1) / 2);
      geos.push(header);
      const filter = new THREE.CylinderGeometry(0.2, 0.2, 0.6, 10);
      filter.translate(p.x0 + 1.2, y + 0.2, p.z0 + 1.5);
      geos.push(filter);
    }
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute("uv"); return q; }))!, black);
    mesh.receiveShadow = true;
    this.dripGroup.add(mesh);
  }

  update(t: number, night: number, pumping: boolean) {
    for (const w of this.water) {
      w.uniforms.uTime.value = t;
      w.uniforms.uOn.value = pumping ? 1 : 0;
    }
    this.lampMat.emissiveIntensity = night * 5;
    for (const s of this.splashes) {
      s.visible = pumping;
      const pos = s.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        const ph = (t * 1.6 + i * 0.137 + s.userData.seed) % 1;
        const a = i * 2.4;
        pos.setXYZ(i, Math.cos(a) * ph * 0.35, Math.sin(ph * Math.PI) * 0.25, Math.sin(a) * ph * 0.35);
      }
      pos.needsUpdate = true;
    }
  }
}
