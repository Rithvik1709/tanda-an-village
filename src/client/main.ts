import * as THREE from "three";

// M0: boot a renderer and signal readiness for the headless screenshot checks.
const canvas = document.getElementById("game") as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color("#bcd4de");
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 500);
camera.position.set(3, 3, 5);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight("#fff4dd", "#5a4a3a", 1.2));
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: "#6b8e3a" }));
scene.add(cube);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));

fetch("/api/health").then((r) => r.json()).then((h) => {
  (window as unknown as { __bailgaadi: object }).__bailgaadi = { ready: true, health: h };
});
