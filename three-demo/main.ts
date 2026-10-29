// Демо Three.js + GSAP: мультяшный робот, анимация на таймлайне GSAP.
// Таймлайн стоит на паузе, кадр i выставляется через tl.seek(i / FPS),
// поэтому рендер покадровый и детерминированный (без зависимости от скорости машины).
import * as THREE from 'three';
import gsap from 'gsap';

const W = 1920, H = 1080, FPS = 24, DURATION = 4;

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#bfe3f5');
scene.fog = new THREE.Fog('#bfe3f5', 12, 30);

const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 100);
camera.position.set(0, 2.2, 9);

scene.add(new THREE.HemisphereLight('#ffffff', '#8fb36a', 1.2));
const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -8; sun.shadow.camera.right = 8;
sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
scene.add(sun);

const toon = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });

const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), toon('#9ccc6b'));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// Деревья: ствол-цилиндр и крона из шаров.
for (let k = 0; k < 9; k++) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 12), toon('#8a5a3b'));
  trunk.position.y = 0.6;
  tree.add(trunk);
  for (const [x, y, r] of [[0, 1.5, 0.6], [-0.35, 1.25, 0.42], [0.38, 1.3, 0.45]] as const) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), toon(k % 2 ? '#4f9d4a' : '#5fae52'));
    leaf.position.set(x, y, 0);
    tree.add(leaf);
  }
  const side = k % 2 ? 1 : -1;
  tree.position.set(side * (3 + (k % 3) * 1.4), 0, -2 - k * 1.3);
  tree.scale.setScalar(1 + (k % 3) * 0.25);
  tree.traverse(o => { o.castShadow = true; });
  scene.add(tree);
}

// Робот: тело-капсула, голова, большие глаза, антенна, руки.
const robot = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 0.6, 8, 24), toon('#e8eef2'));
body.position.y = 1.05;
robot.add(body);
const head = new THREE.Group();
head.position.y = 2.15;
robot.add(head);
head.add(new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 24), toon('#f4f7f9')));
const eyes: THREE.Group[] = [];
for (const x of [-0.22, 0.22]) {
  const eye = new THREE.Group();
  eye.position.set(x, 0.05, 0.5);
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 16), toon('#ffffff'));
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 12), toon('#1d2733'));
  pupil.position.z = 0.11;
  eye.add(white, pupil);
  head.add(eye);
  eyes.push(eye);
}
const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), toon('#7d8a94'));
antenna.position.y = 0.72;
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12),
  new THREE.MeshStandardMaterial({ color: '#ff5a4f', emissive: '#ff2a1f', emissiveIntensity: 0.6 }));
bulb.position.y = 0.92;
head.add(antenna, bulb);
const arms: THREE.Group[] = [];
for (const side of [-1, 1]) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.62, 1.4, 0);
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.5, 6, 12), toon('#5aa7d6'));
  arm.position.y = -0.35;
  shoulder.add(arm);
  robot.add(shoulder);
  arms.push(shoulder);
}
robot.traverse(o => { o.castShadow = true; });
robot.position.set(-4, 0, 0);
scene.add(robot);

// Таймлайн GSAP: выход, прыжок, взмах рукой, моргание, проезд камеры.
const tl = gsap.timeline({ paused: true });
tl.to(robot.position, { x: 0, duration: 1.6, ease: 'power2.out' }, 0)
  .to(robot.rotation, { z: -0.08, duration: 0.2, yoyo: true, repeat: 7, ease: 'sine.inOut' }, 0)
  .to(robot.position, { y: 0.6, duration: 0.25, yoyo: true, repeat: 1, ease: 'power1.out' }, 1.6)
  .to(body.scale, { y: 0.85, x: 1.1, duration: 0.12, yoyo: true, repeat: 1 }, 2.1)
  .to(arms[1].rotation, { z: 2.6, duration: 0.3, ease: 'back.out(2)' }, 2.2)
  .to(arms[1].rotation, { x: 0.5, duration: 0.15, yoyo: true, repeat: 5, ease: 'sine.inOut' }, 2.5)
  .to(arms[1].rotation, { z: 0, x: 0, duration: 0.35, ease: 'power2.inOut' }, 3.4)
  .to(head.rotation, { y: 0.35, z: 0.12, duration: 0.4, ease: 'sine.inOut' }, 2.2)
  .to(head.rotation, { y: 0, z: 0, duration: 0.4, ease: 'sine.inOut' }, 3.4)
  .to(eyes.map(e => e.scale), { y: 0.1, duration: 0.06, yoyo: true, repeat: 1 }, 1.1)
  .to(eyes.map(e => e.scale), { y: 0.1, duration: 0.06, yoyo: true, repeat: 1 }, 3.0)
  .to(bulb.material, { emissiveIntensity: 2.2, duration: 0.2, yoyo: true, repeat: 9 }, 0)
  .to(camera.position, { x: 1.4, y: 1.8, z: 7, duration: DURATION, ease: 'sine.inOut' }, 0)
  .set({}, {}, DURATION);

const lookAt = new THREE.Vector3(0, 1.4, 0);
function renderFrame(i: number): void {
  tl.seek(i / FPS, false);
  camera.lookAt(lookAt);
  renderer.render(scene, camera);
}

declare global {
  interface Window { renderFrame: (i: number) => void; totalFrames: number; ready: boolean; }
}
window.renderFrame = renderFrame;
window.totalFrames = Math.round(DURATION * FPS);
window.ready = true;

// Обычный просмотр в браузере (без ?render) — проигрывание по кругу.
if (!location.search.includes('render')) {
  const start = performance.now();
  const loop = (now: number) => {
    renderFrame(Math.floor((now - start) / 1000 * FPS) % window.totalFrames);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
} else {
  renderFrame(0);
}
