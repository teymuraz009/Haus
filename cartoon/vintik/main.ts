/// <reference types="vite/client" />
// «Винтик и новый друг» — 3D-мультфильм на Three.js + GSAP.
// Вся анимация — один таймлайн GSAP на паузе: кадр i = tl.seek(i / FPS), затем поза считается из состояния S.
import * as THREE from 'three';
import gsap from 'gsap';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import oswaldUrl from '../test01/fonts/Oswald-Bold.ttf?url';
import caveatUrl from '../test01/fonts/Caveat-Bold.ttf?url';

const W = 1920, H = 1080, FPS = 24, DURATION = 35.5;
const X_START = -15, STRIDE = 0.95, PELVIS_Y = 0.64;
const FLOWER = new THREE.Vector3(-5, 0.82, 1.75);
const BUSH = new THREE.Vector3(2.4, 0, 1.45);

// ---------- состояние, которое двигает GSAP ----------
const S = {
  // робот
  rx: X_START, ry: 0, rz: 0.5, rRot: Math.PI / 2, w: 0, crouch: 0, lean: 0,
  armsUp: 0, reach: 0, wave: 0,
  look: 0, lx: 0, ly: 1.6, lz: 5, lookBF: 0, lookCam: 0,
  headYaw: 0, headPitch: 0, headTilt: 0,
  eyeOpen: 1, eyeSize: 1, happy: 0, love: 0, smile: 0.3, mouthO: 0, qmark: 0,
  antYellow: 0, antPink: 0, antWobble: 0,
  // заяц
  bx: 2.2, by: -0.5, bz: 0.95, bRot: -Math.PI / 2, bHopY: 0, bSniff: 0, bHead: 0, bTilt: 0, bEarWave: 0, bEarUp: 0,
  // окружение
  bloom: 0, bfP: 0, bfVis: 0, bushShake: 0,
  // камера: фиксированная (c*/t*) или следящая за роботом (fo*/fl*), смешиваются через follow
  follow: 0, cx: -6, cy: 6.5, cz: 13, tx: -12, ty: 1.2, tz: 0,
  fox: 2.4, foy: 1.45, foz: 5.4, flx: 0.5, fly: 1.15, flz: 0.5,
  // титры
  title: 0, fade: 0, endText: 0,
};

// ---------- рендерер и сцена ----------
const renderer = new THREE.WebGLRenderer({antialias: true, preserveDrawingBuffer: true});
renderer.setSize(W, H, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
scene.fog = new THREE.Fog('#dcebf4', 28, 75);
{
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d')!, gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, '#7fbfea'); gr.addColorStop(0.65, '#cfe7f6'); gr.addColorStop(1, '#eef6fa');
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}

const camera = new THREE.PerspectiveCamera(32, W / H, 0.1, 200);
scene.add(new THREE.HemisphereLight('#d6ecff', '#d9c7a4', 0.95));
const sun = new THREE.DirectionalLight('#fff0d8', 2.7);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// ---------- материалы и помощники ----------
const plastic = (color: string, rough = 0.3) =>
  new THREE.MeshPhysicalMaterial({color, roughness: rough, clearcoat: 0.8, clearcoatRoughness: 0.2});
const metal = (color: string) => new THREE.MeshStandardMaterial({color, roughness: 0.35, metalness: 0.75});
const matte = (color: string, rough = 0.85) => new THREE.MeshStandardMaterial({color, roughness: rough});
const fur = (color: string) => new THREE.MeshPhysicalMaterial({
  color, roughness: 0.95, sheen: 1, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ffe9ef'),
});
const glow = (color: string) => new THREE.MeshBasicMaterial({color, toneMapped: false});

function add<T extends THREE.Object3D>(parent: THREE.Object3D, obj: T, x = 0, y = 0, z = 0): T {
  obj.position.set(x, y, z);
  parent.add(obj);
  return obj;
}
function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], x = 0, y = 0, z = 0, shadow = true) {
  const m = add(parent, new THREE.Mesh(geo, mat), x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}
const group = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => add(parent, new THREE.Group(), x, y, z);
const sphere = (r: number, ws = 32, hs = 20) => new THREE.SphereGeometry(r, ws, hs);
const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 8, 20);
const rbox = (w: number, h: number, d: number, r: number, seg = 4) => new RoundedBoxGeometry(w, h, d, seg, r);
function roundedRect(w: number, h: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function textTexture(text: string, bg: string, fg: string, w = 512, h = 128, font = 'Oswald', size = 78) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = fg; g.font = `${size}px ${font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '6px';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const mix = (a: number, b: number, u: number) => a + (b - a) * u;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

// ---------- робот Винтик ----------
const WHITE = plastic('#f3f5f7'), ORANGE = plastic('#ff8a3d', 0.35), JOINT = metal('#9aa5b1');
const DARKM = metal('#5e6873'), VISOR = new THREE.MeshPhysicalMaterial({color: '#0d1520', roughness: 0.12, clearcoat: 1});
const antMat = new THREE.MeshStandardMaterial({color: '#38e1d8', emissive: '#38e1d8', emissiveIntensity: 1.5});
const heartMat = glow('#5ff3e8');

const faceCanvas = document.createElement('canvas'); faceCanvas.width = 512; faceCanvas.height = 320;
const fctx = faceCanvas.getContext('2d')!;
const faceTex = new THREE.CanvasTexture(faceCanvas); faceTex.colorSpace = THREE.SRGBColorSpace;

const R = (() => {
  const root = group(scene);
  const pelvis = group(root, 0, PELVIS_Y, 0);
  mesh(pelvis, rbox(0.5, 0.18, 0.36, 0.07), DARKM);
  const torso = group(pelvis, 0, 0.08, 0);
  mesh(torso, rbox(0.66, 0.56, 0.46, 0.14, 5), WHITE, 0, 0.3, 0);
  mesh(torso, rbox(0.4, 0.26, 0.06, 0.03), ORANGE, 0, 0.3, 0.22);
  const heart = mesh(torso, new THREE.CircleGeometry(0.055, 32), heartMat, -0.08, 0.31, 0.255, false);
  for (let k = 0; k < 3; k++) mesh(torso, rbox(0.1, 0.022, 0.02, 0.008, 2), DARKM, 0.08, 0.37 - k * 0.05, 0.255, false);
  mesh(torso, new THREE.CylinderGeometry(0.07, 0.09, 0.16, 20), JOINT, 0, 0.64, 0);
  const head = group(torso, 0, 0.7, 0);
  mesh(head, rbox(0.82, 0.58, 0.56, 0.1, 5), WHITE, 0, 0.3, 0);
  const visorGeo = new THREE.ExtrudeGeometry(roundedRect(0.64, 0.4, 0.12),
    {depth: 0.02, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 10});
  mesh(head, visorGeo, VISOR, 0, 0.3, 0.27);
  const face = add(head, new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3875),
    new THREE.MeshBasicMaterial({map: faceTex, transparent: true, toneMapped: false})), 0, 0.3, 0.306);
  for (const side of [-1, 1]) {
    const ear = mesh(head, new THREE.CylinderGeometry(0.11, 0.11, 0.08, 28), ORANGE, side * 0.43, 0.3, 0);
    ear.rotation.z = Math.PI / 2;
    const cap = mesh(head, new THREE.CylinderGeometry(0.06, 0.06, 0.03, 20), JOINT, side * 0.48, 0.3, 0);
    cap.rotation.z = Math.PI / 2;
  }
  const antenna = group(head, 0.14, 0.58, 0);
  mesh(antenna, new THREE.CylinderGeometry(0.016, 0.02, 0.26, 10), JOINT, 0, 0.13, 0);
  const bulb = mesh(antenna, sphere(0.06), antMat, 0, 0.29, 0);

  const arm = (side: number) => {
    const shoulder = group(torso, side * 0.4, 0.5, 0);
    mesh(shoulder, sphere(0.09), ORANGE);
    mesh(shoulder, capsule(0.062, 0.16), JOINT, 0, -0.15, 0);
    const elbow = group(shoulder, 0, -0.3, 0);
    mesh(elbow, sphere(0.068), DARKM);
    mesh(elbow, capsule(0.07, 0.13), WHITE, 0, -0.13, 0);
    const hand = group(elbow, 0, -0.28, 0);
    mesh(hand, sphere(0.088), DARKM).scale.set(1, 0.9, 1.1);
    mesh(hand, sphere(0.04), DARKM, -side * 0.07, 0.02, 0.05);
    return {shoulder, elbow};
  };
  const leg = (side: number) => {
    const hip = group(pelvis, side * 0.15, -0.04, 0);
    mesh(hip, sphere(0.08), JOINT);
    mesh(hip, capsule(0.07, 0.12), JOINT, 0, -0.13, 0);
    const knee = group(hip, 0, -0.27, 0);
    mesh(knee, sphere(0.072), WHITE);
    mesh(knee, capsule(0.08, 0.1), WHITE, 0, -0.12, 0);
    const foot = group(knee, 0, -0.25, 0);
    mesh(foot, rbox(0.2, 0.1, 0.3, 0.045), ORANGE, 0, -0.01, 0.05);
    return {hip, knee, foot};
  };
  return {root, pelvis, torso, head, face, antenna, bulb, heart, armL: arm(1), armR: arm(-1), legL: leg(1), legR: leg(-1)};
})();

// ---------- заяц ----------
const B = (() => {
  const root = group(scene);
  const CREAM = fur('#f4ede2'), WHITEF = fur('#ffffff'), PINK = matte('#f4a3b5', 0.6);
  const EYE = new THREE.MeshPhysicalMaterial({color: '#141414', roughness: 0.05, clearcoat: 1});
  const body = group(root, 0, 0.24, 0);
  mesh(body, sphere(0.25), CREAM).scale.set(0.95, 0.9, 1.15);
  mesh(body, sphere(0.18), WHITEF, 0, -0.04, 0.17).scale.set(0.8, 0.85, 0.6);
  mesh(body, sphere(0.075), WHITEF, 0, 0.0, -0.29);
  const feet: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    feet.push(mesh(root, sphere(0.07), CREAM, side * 0.12, 0.035, -0.02));
    feet[feet.length - 1].scale.set(0.8, 0.5, 1.8);
    mesh(root, sphere(0.045), WHITEF, side * 0.08, 0.04, 0.22).scale.set(1, 1, 1.3);
  }
  const head = group(root, 0, 0.5, 0.15);
  mesh(head, sphere(0.17), CREAM).scale.set(1, 0.95, 0.95);
  for (const side of [-1, 1]) {
    mesh(head, sphere(0.075), WHITEF, side * 0.07, -0.055, 0.1);
    mesh(head, sphere(0.04), EYE, side * 0.085, 0.03, 0.125);
    mesh(head, sphere(0.012), glow('#ffffff'), side * 0.085 + 0.012, 0.045, 0.16, false);
    for (let k = -1; k <= 1; k++) {
      const wh = mesh(head, new THREE.CylinderGeometry(0.0025, 0.0025, 0.14, 4), matte('#d8d2c8'), side * 0.11, -0.05 + k * 0.012, 0.15, false);
      wh.rotation.z = Math.PI / 2 + k * 0.15 * side;
    }
  }
  const nose = mesh(head, sphere(0.024), PINK, 0, -0.025, 0.165);
  const ears: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const ear = group(head, side * 0.06, 0.12, -0.02);
    ear.rotation.z = -side * 0.15;
    mesh(ear, capsule(0.045, 0.26), CREAM, 0, 0.17, 0).scale.set(1, 1, 0.55);
    mesh(ear, capsule(0.028, 0.2), PINK, 0, 0.17, 0.022, false).scale.set(1, 1, 0.4);
    ears.push(ear);
  }
  return {root, body, head, nose, ears, feet};
})();

// ---------- бабочка ----------
const BF = (() => {
  const root = group(scene);
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff9a2e'; g.strokeStyle = '#2a1a10'; g.lineWidth = 7;
  g.beginPath(); g.ellipse(64, 44, 54, 38, 0, 0, 7); g.fill(); g.stroke();
  g.beginPath(); g.ellipse(64, 98, 34, 24, 0, 0, 7); g.fill(); g.stroke();
  g.fillStyle = '#fff3d6';
  for (const [x, y] of [[40, 40], [86, 36], [64, 98]]) { g.beginPath(); g.arc(x, y, 8, 0, 7); g.fill(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const wingMat = new THREE.MeshStandardMaterial({map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.6});
  mesh(root, capsule(0.012, 0.09), matte('#2a1a10'), 0, 0, 0).rotation.z = Math.PI / 2;
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = group(root);
    const wing = mesh(pivot, new THREE.PlaneGeometry(0.16, 0.16), wingMat, 0, 0, side * 0.08);
    wing.rotation.x = -Math.PI / 2;
    if (side < 0) wing.rotation.z = Math.PI;
    wings.push(pivot);
  }
  root.scale.setScalar(1.8);
  return {root, wings};
})();
const BF_PATH = new THREE.CatmullRomCurve3([
  [-5, 0.95, 1.75], [-5.4, 1.6, 1.3], [-6.1, 2.15, 0.9], [-5.3, 2.4, 0.3], [-3.6, 2.05, 0.8],
  [-1.6, 1.85, 1.0], [0.4, 1.65, 1.15], [2.2, 1.3, 1.55], [3.4, 2.3, 2.1], [5.6, 4.4, 2.8],
].map(p => new THREE.Vector3(...p)));

// ---------- улица ----------
const flower = {petals: new THREE.Group()};
const bush = new THREE.Group();
function buildStreet() {
  // тротуар и дорога
  const tile = document.createElement('canvas'); tile.width = tile.height = 256;
  const tg = tile.getContext('2d')!;
  tg.fillStyle = '#e7e0d3'; tg.fillRect(0, 0, 256, 256);
  const rnd = mulberry(7);
  for (let k = 0; k < 900; k++) { tg.fillStyle = `rgba(120,100,80,${rnd() * 0.06})`; tg.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
  tg.strokeStyle = '#cbc1b0'; tg.lineWidth = 5; tg.strokeRect(0, 0, 256, 256);
  const tileTex = new THREE.CanvasTexture(tile); tileTex.colorSpace = THREE.SRGBColorSpace;
  tileTex.wrapS = tileTex.wrapT = THREE.RepeatWrapping; tileTex.repeat.set(80 / 1.2, 6 / 1.2); tileTex.anisotropy = 8;
  const walk = mesh(scene, new THREE.PlaneGeometry(80, 6), new THREE.MeshStandardMaterial({map: tileTex, roughness: 0.9}), 0, 0, -0.6);
  walk.rotation.x = -Math.PI / 2;
  mesh(scene, new THREE.BoxGeometry(80, 0.14, 0.26), matte('#bdb6aa'), 0, -0.03, 2.47);
  const road = mesh(scene, new THREE.PlaneGeometry(80, 14), matte('#6e727a', 0.95), 0, -0.1, 9.6);
  road.rotation.x = -Math.PI / 2;
  for (let x = -40; x < 40; x += 4) mesh(scene, new THREE.BoxGeometry(2, 0.01, 0.16), matte('#f4f1e8'), x, -0.09, 6.8, false);

  // дома
  const HOUSES: [number, number, string, number, string | null][] = [
    [-25.2, 4.2, '#f6c6c0', 6.2, null], [-21, 4.2, '#bfe3d6', 5.2, 'ПОЧТА'], [-16.8, 4.2, '#fde3a7', 6.8, null],
    [-12.6, 4.2, '#c9dcf5', 5.6, 'КНИГИ'], [-8.4, 4.2, '#f7cfe0', 6.4, 'КАФЕ'], [-4.2, 4.2, '#d8ecc4', 5.4, 'ЦВЕТЫ'],
    [0, 4.2, '#ffd8b8', 7.0, null], [4.2, 4.2, '#d6d0f2', 5.8, 'ПЕКАРНЯ'], [8.4, 4.2, '#c4e8ef', 6.6, null],
    [12.6, 4.2, '#f6c6c0', 5.2, 'ИГРУШКИ'], [16.8, 4.2, '#fde3a7', 6.2, null], [21, 4.2, '#bfe3d6', 5.6, null],
    [25.2, 4.2, '#f7cfe0', 6.8, null],
  ];
  const Z = -3.6;
  const frames: THREE.Matrix4[] = [], glass: THREE.Matrix4[] = [], sills: THREE.Matrix4[] = [];
  const m4 = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
  HOUSES.forEach(([x, w, color, h, sign], idx) => {
    mesh(scene, new THREE.BoxGeometry(w - 0.04, h, 4), matte(color, 0.9), x, h / 2, Z - 2);
    mesh(scene, new THREE.BoxGeometry(w + 0.1, 0.22, 0.3), matte('#fbf7f0'), x, h - 0.11, Z + 0.1);
    mesh(scene, new THREE.BoxGeometry(w - 0.04, 0.12, 0.12), matte('#fbf7f0'), x, 2.95, Z + 0.06);
    const cols = 3;
    for (let row = 0; row * 1.3 + 3.6 < h - 0.5; row++)
      for (let k = 0; k < cols; k++) {
        const wx = x + (k - 1) * 1.15, wy = 3.75 + row * 1.3;
        frames.push(m4(wx, wy, Z + 0.04)); glass.push(m4(wx, wy, Z + 0.07)); sills.push(m4(wx, wy - 0.55, Z + 0.12));
      }
    // первый этаж: дверь, витрина, маркиза, вывеска
    mesh(scene, new THREE.BoxGeometry(0.85, 1.75, 0.1), matte('#7a5640', 0.7), x + w * 0.3, 0.875, Z + 0.05);
    mesh(scene, sphere(0.04, 12, 8), metal('#e3c26a'), x + w * 0.3 - 0.28, 0.9, Z + 0.12);
    mesh(scene, new THREE.BoxGeometry(w * 0.48, 1.45, 0.08), matte('#fbf7f0'), x - w * 0.16, 1.15, Z + 0.04);
    mesh(scene, new THREE.BoxGeometry(w * 0.44, 1.3, 0.06), new THREE.MeshPhysicalMaterial({color: '#3c5a73', roughness: 0.08, metalness: 0.1}), x - w * 0.16, 1.15, Z + 0.08);
    if (sign) {
      const stripes = document.createElement('canvas'); stripes.width = 256; stripes.height = 16;
      const sg = stripes.getContext('2d')!;
      for (let k = 0; k < 8; k++) { sg.fillStyle = k % 2 ? '#fff8ec' : ['#e8505b', '#2a9d8f', '#f4a261', '#6a7bd6'][idx % 4]; sg.fillRect(k * 32, 0, 32, 16); }
      const st = new THREE.CanvasTexture(stripes); st.colorSpace = THREE.SRGBColorSpace;
      const awning = mesh(scene, new THREE.BoxGeometry(w * 0.62, 0.05, 0.95), new THREE.MeshStandardMaterial({map: st, roughness: 0.8}), x - w * 0.12, 2.25, Z + 0.45);
      awning.rotation.x = 0.38;
      const signMat = new THREE.MeshStandardMaterial({map: textTexture(sign, '#fff8ec', '#3a2f2a'), roughness: 0.7});
      const side = matte('#fff8ec');
      mesh(scene, new THREE.BoxGeometry(w * 0.6, 0.44, 0.08), [side, side, side, side, signMat, side], x - w * 0.05, 2.62, Z + 0.1);
    }
  });
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true; im.receiveShadow = true;
    scene.add(im);
  };
  inst(new THREE.BoxGeometry(0.78, 1.0, 0.08), matte('#fbf7f0'), frames);
  inst(new THREE.BoxGeometry(0.62, 0.84, 0.05), new THREE.MeshPhysicalMaterial({color: '#35536b', roughness: 0.06, metalness: 0.1}), glass);
  inst(new THREE.BoxGeometry(0.92, 0.07, 0.22), matte('#fbf7f0'), sills);

  // фонари
  // фонари только вне зоны действия: иначе загораживают героев на переднем плане
  for (const x of [-22, -17, 7.5, 13, 19]) {
    mesh(scene, new THREE.CylinderGeometry(0.12, 0.16, 0.3, 16), matte('#2e3b36', 0.5), x, 0.15, 2.05);
    mesh(scene, new THREE.CylinderGeometry(0.05, 0.065, 3.3, 12), matte('#2e3b36', 0.5), x, 1.8, 2.05);
    mesh(scene, new THREE.CylinderGeometry(0.16, 0.12, 0.34, 6), new THREE.MeshStandardMaterial({color: '#fff3d0', emissive: '#ffe2a0', emissiveIntensity: 0.4}), x, 3.6, 2.05);
    mesh(scene, new THREE.ConeGeometry(0.24, 0.2, 6), matte('#2e3b36', 0.5), x, 3.87, 2.05);
  }
  // деревья в кадках
  for (const x of [-18.5, -10.5, 6.6, 14.6, 22.5]) {
    mesh(scene, rbox(0.95, 0.5, 0.95, 0.06), matte('#b59f86'), x, 0.25, -2.55);
    mesh(scene, new THREE.CylinderGeometry(0.09, 0.12, 1.4, 10), matte('#7b5338'), x, 1.1, -2.55);
    for (const [dx, dy, dz, r] of [[0, 2.15, 0, 0.62], [-0.38, 1.85, 0.1, 0.42], [0.4, 1.9, -0.05, 0.45], [0.05, 2.55, 0, 0.4]])
      mesh(scene, sphere(r, 24, 16), matte(dy > 2 ? '#5aa651' : '#4c9846'), x + dx, dy, -2.55 + dz);
  }
  // скамейка, почтовый ящик, гидрант
  mesh(scene, rbox(1.6, 0.08, 0.45, 0.03), matte('#a8744f'), -1.6, 0.48, -2.7);
  mesh(scene, rbox(1.6, 0.4, 0.06, 0.02), matte('#a8744f'), -1.6, 0.78, -2.92);
  for (const dx of [-0.65, 0.65]) mesh(scene, new THREE.BoxGeometry(0.06, 0.48, 0.42), matte('#2e3b36', 0.5), -1.6 + dx, 0.24, -2.72);
  mesh(scene, rbox(0.5, 0.9, 0.45, 0.08), plastic('#3a6fd8', 0.4), -19, 0.75, 2.0);
  mesh(scene, new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), matte('#2e3b36'), -19, 0.15, 2.0);
  mesh(scene, new THREE.CylinderGeometry(0.13, 0.15, 0.55, 16), plastic('#e04848', 0.4), 9.2, 0.28, 2.0);
  mesh(scene, sphere(0.14, 16, 10), plastic('#e04848', 0.4), 9.2, 0.56, 2.0);

  // горшок с цветком
  const pot = group(scene, FLOWER.x, 0, FLOWER.z);
  mesh(pot, new THREE.CylinderGeometry(0.24, 0.17, 0.34, 28), matte('#c96f4a', 0.75), 0, 0.17, 0);
  mesh(pot, new THREE.CylinderGeometry(0.265, 0.265, 0.06, 28), matte('#b9603d', 0.75), 0, 0.34, 0);
  mesh(pot, new THREE.CylinderGeometry(0.22, 0.22, 0.02, 24), matte('#5a3d2b'), 0, 0.36, 0);
  const STEM = matte('#4e9a45');
  mesh(pot, new THREE.CylinderGeometry(0.014, 0.018, 0.46, 8), STEM, 0, 0.58, 0);
  for (const [dx, h, rz] of [[-0.09, 0.3, 0.25], [0.1, 0.26, -0.3]]) {
    mesh(pot, new THREE.CylinderGeometry(0.01, 0.012, h, 6), STEM, dx * 0.6, 0.36 + h / 2, 0).rotation.z = rz;
    mesh(pot, sphere(0.04, 16, 10), matte('#ff9fc3', 0.6), dx * 1.5, 0.36 + h, 0).scale.set(0.8, 1.2, 0.8);
  }
  for (const side of [-1, 1]) {
    const leaf = mesh(pot, sphere(0.07, 16, 10), STEM, side * 0.08, 0.52, 0.02);
    leaf.scale.set(1.6, 0.35, 0.8); leaf.rotation.z = side * 0.5;
  }
  const head = group(pot, 0, FLOWER.y, 0);
  head.rotation.x = -0.35;
  mesh(head, sphere(0.065, 24, 16), matte('#7a4b1f', 0.7)).scale.set(1, 1, 0.6);
  head.add(flower.petals);
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2;
    const p = mesh(flower.petals, sphere(0.06, 16, 10), plastic('#ff6fa8', 0.45), Math.cos(a) * 0.1, Math.sin(a) * 0.1, -0.01);
    p.scale.set(1.7, 0.55, 0.35); p.rotation.z = a;
  }
  // куст, за которым прячется заяц
  bush.position.copy(BUSH);
  scene.add(bush);
  for (const [dx, dy, dz, r, c] of [[0, 0.24, 0, 0.36, '#4f9a48'], [-0.36, 0.2, 0.05, 0.28, '#5aa651'], [0.38, 0.2, 0, 0.3, '#4a9143'],
    [0.14, 0.38, -0.1, 0.26, '#5fae52'], [-0.18, 0.38, -0.05, 0.24, '#55a24c'], [0, 0.18, 0.24, 0.24, '#5aa651']] as const)
    mesh(bush, sphere(r, 24, 16), matte(c), dx, dy, dz);
  for (const [dx, dy, dz] of [[-0.25, 0.45, 0.15], [0.3, 0.38, 0.22], [0.05, 0.55, 0.1]])
    mesh(bush, sphere(0.035, 12, 8), matte('#fffaf0'), dx, dy, dz, false);
  // облака
  for (const [x, y, z, s] of [[-30, 12, -40, 1.4], [-12, 14, -45, 1.1], [6, 11.5, -42, 1.3], [24, 13.5, -44, 1.2], [40, 12, -40, 1]]) {
    const cl = group(scene, x, y, z);
    for (const [dx, dy, r] of [[-2, 0, 1.6], [0, 0.8, 2.1], [2.2, 0.2, 1.7], [0.6, -0.4, 1.5]])
      mesh(cl, sphere(r * s, 20, 14), new THREE.MeshStandardMaterial({color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, roughness: 1}), dx * s, dy * s, 0, false);
  }
}
function mulberry(a: number) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- таймлайн ----------
type Cue = {t: number, type: string, who: 'robot' | 'rabbit' | 'flower' | 'bush' | 'bf'};
const CUES: Cue[] = [];
const HOPS: number[] = [];
const BLINKS = [2.4, 6.1, 8.9, 16.8, 19.1, 23.0, 25.6, 31.2];
const cue = (t: number, type: string, who: Cue['who'] = 'robot') => CUES.push({t, type, who});
const tl = gsap.timeline({paused: true, defaults: {ease: 'sine.inOut'}});
const T = (vars: gsap.TweenVars, t: number, duration = 0.4) => tl.to(S, {...vars, duration}, t);
const cut = (vars: Partial<typeof S>, t: number) => tl.set(S, vars, t);
let rabX = S.bx, rabZ = S.bz;
function hops(t0: number, n: number, dur: number, x1: number, z1: number, h = 0.2) {
  const x0 = rabX, z0 = rabZ;
  for (let k = 0; k < n; k++) {
    const t = t0 + k * dur;
    tl.to(S, {bx: mix(x0, x1, (k + 1) / n), bz: mix(z0, z1, (k + 1) / n), duration: dur * 0.85, ease: 'none'}, t);
    tl.to(S, {bHopY: h, duration: dur * 0.42, ease: 'power2.out'}, t);
    tl.to(S, {bHopY: 0, duration: dur * 0.43, ease: 'power2.in'}, t + dur * 0.42);
    HOPS.push(t + dur * 0.85);
  }
  rabX = x1; rabZ = z1;
}

// 0–3.5: общий план, титр
T({cx: -9.5, cy: 2.6, cz: 8.5, tx: -11.5, ty: 1.3, tz: 0.5}, 0, 3.5);
T({title: 1}, 0.5, 0.8); T({title: 0}, 2.7, 0.6);
// прогулка 1: от -15 до цветка
tl.to(S, {rx: -6.2, duration: 9, ease: 'sine.inOut'}, 1.0);
T({w: 1}, 1.0, 0.5); T({w: 0}, 9.5, 0.5);
cut({follow: 1, fox: 2.6, foy: 1.4, foz: 5.6, flx: 0.6, fly: 1.2, flz: 0.5}, 3.5);
T({foz: 4.7, fox: 2.2}, 3.5, 6.5);
// по дороге рассматривает вывеску кафе и смотрит в камеру
T({look: 0.9, lx: -8.6, ly: 2.7, lz: -3.4}, 4.4, 0.6); T({qmark: 1, antYellow: 1}, 4.6, 0.3); cue(4.7, 'beep_q');
T({qmark: 0, antYellow: 0}, 6.4, 0.3);
T({lookCam: 1}, 6.9, 0.5); T({happy: 1, smile: 1}, 7.2, 0.2); cue(7.3, 'beep_happy');
T({happy: 0, smile: 0.3}, 8.2, 0.2); T({lookCam: 0, look: 0}, 8.3, 0.5);
// замечает цветок
T({look: 1, lx: FLOWER.x, ly: FLOWER.y, lz: FLOWER.z}, 9.1, 0.5); T({qmark: 1, antYellow: 1, eyeSize: 1.15}, 9.2, 0.3); cue(9.3, 'beep_q');
// 10–14.5: рассматривает цветок, тот распускается
cut({follow: 0, cx: -4.15, cy: 0.95, cz: 4.5, tx: -5.55, ty: 0.98, tz: 1.15}, 10.0);
T({cx: -4.5, cz: 3.75}, 10.0, 4.6);
T({rRot: 0.78}, 10.0, 0.8); T({crouch: 0.4, lean: 0.12}, 10.3, 0.7);
T({headTilt: 0.25}, 10.9, 0.35); T({headTilt: -0.2}, 11.25, 0.4); T({headTilt: 0}, 11.65, 0.3);
cue(11.0, 'servo');
T({bloom: 1}, 11.6, 1.5); cue(11.6, 'bloom', 'flower');
T({qmark: 0}, 11.8, 0.3); T({eyeSize: 1.3, mouthO: 0.8}, 11.9, 0.3); cue(12.1, 'beep_wow');
T({mouthO: 0, smile: 1, love: 0.7, antPink: 1}, 12.8, 0.4);
// бабочка вылетает из цветка
cut({bfVis: 1}, 13.6); tl.to(S, {bfP: 1, duration: 7.0, ease: 'sine.inOut'}, 13.6); cue(13.6, 'sparkle', 'bf');
T({lookBF: 1, eyeSize: 1.35, love: 0, antPink: 0, smile: 0.5}, 13.7, 0.4); cue(13.9, 'beep_q');
T({crouch: 0, lean: 0}, 14.4, 0.6); T({rRot: Math.PI / 2}, 14.5, 0.6);
// 15–20: идёт за бабочкой
cut({follow: 1, fox: 1.7, foy: 1.75, foz: 5.6, flx: 1.4, fly: 1.35, flz: 0.6}, 15.0);
T({foz: 5.0}, 15.0, 5.2);
tl.to(S, {rx: 0.6, duration: 5.2, ease: 'sine.inOut'}, 15.0);
T({w: 1}, 15.0, 0.5); T({w: 0}, 19.7, 0.5);
cue(16.2, 'sparkle', 'bf'); cue(17.6, 'sparkle', 'bf'); cue(18.9, 'sparkle', 'bf');
// бабочка улетает, Винтик грустит
T({lookBF: 0, lx: 5.6, ly: 4.4, lz: 2.8, eyeOpen: 0.7, eyeSize: 1, smile: 0, antYellow: 0}, 20.4, 0.5); cue(20.6, 'beep_sad');
cut({bfVis: 0}, 20.7);
// 21–24: шорох в кусте, заяц
cut({follow: 0, cx: 3.65, cy: 0.65, cz: 3.95, tx: 1.3, ty: 1.0, tz: 0.85}, 21.0);
T({cx: 3.45, cz: 3.6}, 21.0, 3.2);
T({bushShake: 0.07}, 21.0, 0.1); T({bushShake: 0}, 21.45, 0.15); cue(21.0, 'rustle', 'bush');
T({lx: BUSH.x, ly: 0.6, lz: BUSH.z, eyeOpen: 1, qmark: 1, antYellow: 1}, 21.1, 0.35); cue(21.3, 'servo');
T({by: 0.15}, 21.6, 0.35); cue(21.65, 'rustle', 'bush');
T({eyeSize: 1.5, mouthO: 1, qmark: 0, armsUp: 1, antWobble: 1}, 22.05, 0.12); cue(22.05, 'surprise');
tl.to(S, {rx: 0.05, duration: 0.4, ease: 'power2.out'}, 22.05);
tl.to(S, {ry: 0.22, duration: 0.18, ease: 'power2.out'}, 22.05); tl.to(S, {ry: 0, duration: 0.2, ease: 'power2.in'}, 22.23);
cue(22.43, 'land');
tl.to(S, {by: -0.5, duration: 0.2, ease: 'power2.in'}, 22.25); T({bushShake: 0.08}, 22.25, 0.05); T({bushShake: 0}, 22.6, 0.15);
cue(22.3, 'rustle', 'bush');
T({eyeSize: 1, mouthO: 0, armsUp: 0, antWobble: 0, antYellow: 0}, 22.8, 0.6);
T({crouch: 0.85, lean: 0.15, reach: 1, eyeOpen: 0.85, smile: 0.6}, 23.4, 0.8); cue(23.8, 'beep_soft');
// 24–29: знакомство
cut({cx: 0.9, cy: 1.2, cz: 5.3, tx: 0.7, ty: 0.72, tz: 0.6}, 24.2);
T({cx: 0.95, cy: 1.15, cz: 4.9}, 24.2, 3.4);
T({cx: 0.9, cy: 1.35, cz: 6.3, ty: 0.95}, 27.6, 0.9);
T({by: 0.15, bEarUp: 1}, 24.4, 0.35); cue(24.45, 'rustle', 'bush');
tl.to(S, {by: 0, duration: 0.4, ease: 'none'}, 25.0);
hops(25.0, 2, 0.48, 1.12, 0.55, 0.16);
T({bSniff: 1, bEarUp: 0.4}, 26.1, 0.3); cue(26.2, 'sniff', 'rabbit'); cue(26.65, 'sniff', 'rabbit');
T({bSniff: 0}, 27.0, 0.3);
T({happy: 1, love: 1, antPink: 1, smile: 1, eyeOpen: 1}, 27.1, 0.25); cue(27.1, 'beep_happy');
hops(27.35, 1, 0.42, 1.12, 0.55, 0.14); T({bEarUp: 1, bTilt: 0.2}, 27.35, 0.3);
T({crouch: 0, lean: 0, reach: 0}, 27.9, 0.7);
T({rRot: 0.75}, 28.0, 0.35); T({wave: 1}, 28.3, 0.3); T({wave: 0}, 29.4, 0.4); T({rRot: Math.PI / 2}, 29.5, 0.4); cue(28.4, 'servo');
T({bEarWave: 1, bTilt: -0.15}, 28.6, 0.3); T({bEarWave: 0, bTilt: 0}, 29.5, 0.3);
// 29.8–35.5: уходят вместе
cut({cx: -0.6, cy: 1.4, cz: 6.4, tx: 1.6, ty: 0.9, tz: 0.6}, 29.8);
T({cx: 2.4, cy: 4.8, cz: 12, tx: 5.2, ty: 1.0, tz: 0}, 29.8, 4.4);
T({bRot: Math.PI / 2}, 29.8, 0.4); T({happy: 0, smile: 0.8, love: 0.5}, 30.0, 0.3);
tl.to(S, {rx: 4.9, duration: 4.2, ease: 'sine.inOut'}, 30.0); T({w: 1}, 30.0, 0.5); T({w: 0}, 33.8, 0.4);
hops(30.2, 8, 0.47, 5.5, 1.15, 0.18);
T({fade: 1}, 32.8, 1.0); T({endText: 1}, 33.6, 0.6);
tl.set({}, {}, DURATION);

// ---------- поза в момент t ----------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
const COL_TEAL = new THREE.Color('#38e1d8'), COL_Y = new THREE.Color('#ffd23f'), COL_P = new THREE.Color('#ff6fb5');
function bfPos(target: THREE.Vector3, t: number) {
  BF_PATH.getPointAt(clamp(S.bfP, 0, 1), target);
  target.y += Math.sin(t * 9) * 0.05;
  return target;
}
let pupX = 0, pupY = 0;
function pose(t: number) {
  // камера
  const fx = S.rx;
  camera.position.set(mix(S.cx, fx + S.fox, S.follow), mix(S.cy, S.foy, S.follow), mix(S.cz, S.foz, S.follow));
  camera.position.y += Math.sin(t * 0.8) * 0.015;
  camera.lookAt(mix(S.tx, fx + S.flx, S.follow), mix(S.ty, S.fly, S.follow), mix(S.tz, S.flz, S.follow));
  sun.position.set(fx + 5, 9.5, 7.5); sun.target.position.set(fx + 1, 0, 0.5);

  // робот
  R.root.position.set(S.rx, S.ry, S.rz);
  R.root.rotation.y = S.rRot;
  const ph = (S.rx - X_START) / STRIDE, s = Math.sin(2 * Math.PI * ph), c = Math.cos(2 * Math.PI * ph), w = S.w;
  R.pelvis.position.y = PELVIS_Y + w * (0.045 * Math.abs(c) - 0.02) - 0.24 * S.crouch + Math.sin(t * 2.2) * 0.006 * (1 - w);
  R.torso.rotation.set(S.lean + 0.05 * w, 0.08 * s * w, 0.035 * s * w);
  const legPose = (L: {hip: THREE.Group, knee: THREE.Group, foot: THREE.Group}, swing: number, lift: number) => {
    L.hip.rotation.x = swing - 0.2 * lift - 1.1 * S.crouch;
    L.knee.rotation.x = 0.75 * lift + 1.9 * S.crouch;
    L.foot.rotation.x = -(L.hip.rotation.x + L.knee.rotation.x) * 0.85;
  };
  legPose(R.legL, -0.5 * s * w, Math.max(0, c) * w);
  legPose(R.legR, 0.5 * s * w, Math.max(0, -c) * w);
  R.armL.shoulder.rotation.set(0.45 * s * w - 0.3 * S.armsUp, 0, 0.1 + 1.9 * S.armsUp);
  R.armL.elbow.rotation.set(-0.35 - 0.5 * S.armsUp, 0, 0);
  R.armR.shoulder.rotation.set(-0.45 * s * w - 0.3 * S.armsUp - 0.95 * S.reach, 0, -0.1 - 1.9 * S.armsUp - 2.5 * S.wave);
  R.armR.elbow.rotation.set(-0.35 + 0.3 * S.reach - 0.5 * S.armsUp, 0, S.wave * 0.5 * Math.sin(t * 13));

  // взгляд: точка интереса, бабочка или камера
  tmp.set(S.lx, S.ly, S.lz);
  if (S.lookBF > 0) tmp.lerp(bfPos(tmp2, t), S.lookBF);
  if (S.lookCam > 0) tmp.lerp(camera.position, S.lookCam);
  const lookW = Math.max(S.look, S.lookBF, S.lookCam);
  R.root.updateMatrixWorld(true);
  R.root.worldToLocal(tmp);
  const hy = PELVIS_Y + 0.78 - 0.24 * S.crouch + 0.3;
  const yawRaw = Math.atan2(tmp.x, tmp.z), pitchRaw = -Math.atan2(tmp.y - hy, Math.hypot(tmp.x, tmp.z));
  const yaw = clamp(yawRaw, -1.3, 1.3), pitch = clamp(pitchRaw, -0.6, 0.5);
  R.head.rotation.set(pitch * lookW + S.headPitch - S.lean * 0.6, yaw * lookW + S.headYaw, S.headTilt + 0.03 * s * w);
  pupX = clamp(yawRaw * 0.3 * lookW + (yawRaw - yaw) * lookW, -1, 1);
  pupY = clamp(pitchRaw * 0.6 * lookW, -1, 1);
  R.antenna.rotation.z = 0.06 * s * w + 0.3 * S.antWobble * Math.sin(t * 24) + 0.03 * Math.sin(t * 1.7);
  const col = COL_TEAL.clone().lerp(COL_Y, S.antYellow).lerp(COL_P, S.antPink);
  antMat.color.copy(col); antMat.emissive.copy(col);
  antMat.emissiveIntensity = 1.4 + 0.5 * Math.sin(t * 6);
  heartMat.color.setRGB(0.37, 0.95, 0.91).multiplyScalar(0.75 + 0.25 * Math.sin(t * 4));

  // заяц
  B.root.position.set(S.bx, S.by + S.bHopY, S.bz);
  B.root.rotation.y = S.bRot;
  B.body.scale.set(1, 1 + 0.02 * Math.sin(t * 5), 1);
  B.head.rotation.set(S.bSniff * (0.22 + 0.07 * Math.sin(t * 17)) - S.bHopY * 0.5, S.bHead, S.bTilt + 0.04 * Math.sin(t * 1.7));
  B.nose.scale.setScalar(1 + S.bSniff * 0.25 * Math.max(0, Math.sin(t * 22)));
  const twitch = 0.18 * Math.max(0, Math.sin(t * 2.9)) ** 20;
  B.ears[0].rotation.set(-S.bHopY * 3 - 0.15 + 0.15 * S.bEarUp + twitch, 0, 0.15);
  B.ears[1].rotation.set(-S.bHopY * 3 - 0.15 + 0.15 * S.bEarUp, 0, -0.15 - S.bEarWave * (0.7 + 0.5 * Math.sin(t * 12)));
  for (const f of B.feet) f.rotation.x = S.bHopY * 2.5;

  // бабочка
  BF.root.visible = S.bfVis > 0.5;
  if (BF.root.visible) {
    bfPos(BF.root.position, t);
    const tan = BF_PATH.getTangentAt(clamp(S.bfP, 0, 0.999));
    BF.root.rotation.set(0, Math.atan2(-tan.z, tan.x), 0.2 * Math.sin(t * 4));
    const f = 0.25 + 1.1 * Math.abs(Math.sin(t * 26));
    BF.wings[0].rotation.x = -f; BF.wings[1].rotation.x = f;
  }

  // цветок и куст
  flower.petals.scale.setScalar(0.3 + 0.7 * S.bloom);
  flower.petals.rotation.z = (1 - S.bloom) * 1.2;
  bush.rotation.set(S.bushShake * Math.sin(t * 40) * 0.6, 0, S.bushShake * Math.sin(t * 45));
}

// ---------- лицо-экран ----------
function blinkAt(t: number) {
  for (const b of BLINKS) { const d = Math.abs(t - b); if (d < 0.08) return 1 - d / 0.08; }
  return 0;
}
function drawFace(t: number) {
  const g = fctx;
  g.clearRect(0, 0, 512, 320);
  const col = '#' + new THREE.Color('#76f3ff').lerp(new THREE.Color('#ff8fd0'), S.love).getHexString();
  g.shadowColor = col; g.shadowBlur = 30; g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
  const open = Math.max(0.07, S.eyeOpen * (1 - blinkAt(t)));
  for (const ex of [168, 344]) {
    const cx = ex + pupX * 30, cy = 140 + pupY * 24;
    if (S.happy > 0.5) {
      g.lineWidth = 22; g.beginPath(); g.arc(cx, cy + 34, 44 * S.eyeSize, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    } else {
      const w = 74 * S.eyeSize, h = 104 * S.eyeSize * open;
      g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, Math.min(w, h) / 2); g.fill();
      if (open > 0.4) {
        g.save(); g.shadowBlur = 0; g.fillStyle = 'rgba(255,255,255,0.85)';
        g.beginPath(); g.ellipse(cx - w * 0.18, cy - h * 0.22, w * 0.13, h * 0.1, 0, 0, 7); g.fill(); g.restore();
      }
    }
  }
  if (S.mouthO > 0.05) {
    g.lineWidth = 10; g.beginPath(); g.ellipse(256 + pupX * 14, 262, 16 * S.mouthO, 20 * S.mouthO, 0, 0, 7); g.stroke();
  } else if (S.smile > 0.05) {
    g.lineWidth = 12; g.beginPath(); g.moveTo(212, 250); g.quadraticCurveTo(256, 250 + 40 * S.smile, 300, 250); g.stroke();
  }
  if (S.qmark > 0.01) {
    g.globalAlpha = S.qmark; g.font = '96px Oswald'; g.textAlign = 'center'; g.fillText('?', 462, 100 + Math.sin(t * 6) * 6); g.globalAlpha = 1;
  }
  faceTex.needsUpdate = true;
}

// ---------- итоговый кадр: 3D + титры ----------
const out = document.createElement('canvas'); out.width = W; out.height = H;
document.body.appendChild(out);
const octx = out.getContext('2d')!;
function composite() {
  const g = octx;
  g.drawImage(renderer.domElement, 0, 0);
  const vg = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.0);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(20,30,40,0.35)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  if (S.title > 0.01) {
    g.globalAlpha = S.title;
    const band = g.createRadialGradient(W / 2, H * 0.42, 40, W / 2, H * 0.42, 620);
    band.addColorStop(0, 'rgba(25,35,55,0.42)'); band.addColorStop(1, 'rgba(25,35,55,0)');
    g.fillStyle = band; g.fillRect(0, 0, W, H);
    g.shadowColor = 'rgba(30,40,60,0.45)'; g.shadowBlur = 24; g.shadowOffsetY = 6;
    g.fillStyle = '#ffffff'; g.font = '190px Oswald'; g.letterSpacing = '14px';
    g.fillText('ВИНТИК', W / 2, H * 0.42 - (1 - S.title) * 30);
    g.letterSpacing = '0px'; g.font = '92px Caveat'; g.fillStyle = '#fff4d6';
    g.fillText('и новый друг', W / 2, H * 0.42 + 110);
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0; g.globalAlpha = 1;
  }
  if (S.fade > 0.01) { g.fillStyle = `rgba(14,20,30,${S.fade})`; g.fillRect(0, 0, W, H); }
  if (S.endText > 0.01) {
    g.globalAlpha = S.endText;
    g.fillStyle = '#ffffff'; g.font = '150px Oswald'; g.letterSpacing = '12px';
    g.fillText('КОНЕЦ', W / 2, H * 0.48);
    g.letterSpacing = '0px'; g.font = '76px Caveat'; g.fillStyle = '#ffd9ec';
    g.fillText('Винтик нашёл друга', W / 2, H * 0.48 + 110);
    g.globalAlpha = 1;
  }
}

function renderFrame(i: number) {
  const t = i / FPS;
  tl.seek(t, false);
  pose(t);
  drawFace(t);
  renderer.render(scene, camera);
  composite();
}

// ---------- события для звука ----------
function panOf(p: THREE.Vector3) { return clamp(p.clone().project(camera).x, -1, 1); }
function getEvents() {
  const n = Math.round(DURATION * FPS);
  const steps: {t: number, side: number, pan: number}[] = [];
  const servo: {t: number, pan: number}[] = [];
  const positions: Record<string, {pan: number}[]> = {robot: [], rabbit: [], flower: [], bush: [], bf: []};
  let prevIdx = Math.floor(2 * ((S.rx - X_START) / STRIDE) - 0.5), prevYaw = 0, lastServo = -9;
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    tl.seek(t, false); pose(t);
    camera.updateMatrixWorld();
    const idx = Math.floor(2 * ((S.rx - X_START) / STRIDE) - 0.5);
    const rp = R.root.position.clone().setY(1);
    if (idx > prevIdx && S.w > 0.3) steps.push({t, side: idx % 2, pan: panOf(rp)});
    prevIdx = idx;
    const yaw = R.head.rotation.y;
    if (Math.abs(yaw - prevYaw) * FPS > 1.6 && t - lastServo > 0.6) { servo.push({t, pan: panOf(rp)}); lastServo = t; }
    prevYaw = yaw;
    positions.robot.push({pan: panOf(rp)});
    positions.rabbit.push({pan: panOf(B.root.position)});
    positions.flower.push({pan: panOf(FLOWER)});
    positions.bush.push({pan: panOf(BUSH)});
    positions.bf.push({pan: S.bfVis > 0.5 ? panOf(BF.root.position) : 0});
  }
  const at = (who: string, t: number) => positions[who][clamp(Math.round(t * FPS), 0, n - 1)].pan;
  return {
    fps: FPS, duration: DURATION, steps, servo,
    hops: HOPS.map(t => ({t, pan: at('rabbit', t)})),
    cues: CUES.map(c => ({...c, pan: at(c.who, c.t)})),
    blinks: BLINKS,
  };
}

declare global {
  interface Window {
    renderFrame: (i: number) => void; getEvents: typeof getEvents; totalFrames: number; ready: boolean;
  }
}
(async () => {
  for (const [name, url] of [['Oswald', oswaldUrl], ['Caveat', caveatUrl]]) {
    const f = new FontFace(name, `url(${url})`); await f.load(); (document.fonts as unknown as Set<FontFace>).add(f);
  }
  buildStreet();
  window.renderFrame = renderFrame;
  window.getEvents = getEvents;
  window.totalFrames = Math.round(DURATION * FPS);
  window.ready = true;
  if (!location.search.includes('render')) {
    const start = performance.now();
    const loop = (now: number) => { renderFrame(Math.floor((now - start) / 1000 * FPS) % window.totalFrames); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  } else renderFrame(0);
})();
