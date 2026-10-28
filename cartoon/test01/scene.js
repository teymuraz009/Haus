'use strict';
// «Пончик и голубь на фонаре» — чёрно-белый мультфильм в духе 1930-х.
// Всё рисуется кодом на canvas; кадр t полностью определяется функцией renderFrame(i).

const W = 1280, H = 720;          // логические координаты
const SC = 1.5;                   // 1280x720 -> 1920x1080
const FPS = 24;
const BEAT = 2 / 3;               // 90 ударов в минуту; шаги — восьмыми
const GROUND = 580;               // низ стен домов
const FEET = 618;                 // линия, по которой идёт герой
const INK = '#161514';

// Таймлайн (секунды). Его же читает sound.py через events.json.
const T = {
  title: [0, 1.75],
  irisIn: [1.8, 2.45],
  walk: [2.0, 2.0 + 7 * BEAT],
  coo: [7.05, 7.42],
  look: [7.6, 7.95],
  take: 8.0,
  hatDown: 8.38,
  wave: [8.5, 9.75],
  whistle: [8.55, 8.85],
  fly: [9.0, 10.2],
  happy: [10.3, 11.8],
  hop: [10.45, 10.8],
  irisOut: [11.0, 11.8],
  endCard: [11.9, 13.6],
  shave: 10.6,
  blinks: [4.3, 7.47, 9.95],
  duration: 13.6,
};

const X0 = -110, X1 = 900;        // путь героя (мировые координаты)
const LAMP_X = 1090, LAMP_TOP = 184;
const CAT = { x: 1236, y: 392, w: 40, h: 52 };
const HYD_X = 640;
const CS = 1.3;                   // масштаб героя

// ---------- математика ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, u) => a + (b - a) * u;
const sstep = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
const bump = (t, a, b) => (t <= a || t >= b) ? 0 : Math.sin(Math.PI * (t - a) / (b - a));
const win01 = (t, a, b, fi, fo) => sstep(a, a + fi, t) * (1 - sstep(b - fo, b, t));

function h32(a) {
  a |= 0;
  a = Math.imul(a ^ (a >>> 16), 0x45d9f3b);
  a = Math.imul(a ^ (a >>> 16), 0x45d9f3b);
  a ^= a >>> 16;
  return (a >>> 0) / 4294967295 * 2 - 1;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ---------- «дрожащая» линия (line boil), меняется каждые 2 кадра ----------
let BF = 0, BOIL = 1.0;
function jp(x, y, amp) {
  amp = amp === undefined ? BOIL : amp;
  const k = (Math.round(x * 3.1) * 73856093) ^ (Math.round(y * 3.7) * 19349663) ^ (BF * 83492791);
  return [x + h32(k) * amp, y + h32(k ^ 0x5bd1e995) * amp];
}
function pathPoly(c, pts, close, seg = 36) {
  const n = pts.length, lim = close ? n : n - 1;
  let first = true;
  for (let i = 0; i < lim; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % n];
    const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / seg));
    for (let j = 0; j < m; j++) {
      const u = j / m;
      const [x, y] = jp(ax + (bx - ax) * u, ay + (by - ay) * u);
      if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
    }
  }
  if (close) c.closePath();
  else { const [x, y] = jp(pts[n - 1][0], pts[n - 1][1]); c.lineTo(x, y); }
}
function poly(c, pts, fill, stroke, lw, close = true) {
  c.beginPath();
  pathPoly(c, pts, close);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
}
function line(c, pts, lw, color = INK) { poly(c, pts, null, color, lw, false); }
const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function ellPts(cx, cy, rx, ry, rot = 0, n = 32) {
  const p = [], cr = Math.cos(rot), sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    p.push([cx + x * cr - y * sr, cy + x * sr + y * cr]);
  }
  return p;
}
function hose(c, a, ctl, b, lw) {
  const A = jp(a.x, a.y, 0.5), C = jp(ctl.x, ctl.y, 0.5), B = jp(b.x, b.y, 0.5);
  c.beginPath(); c.moveTo(A[0], A[1]); c.quadraticCurveTo(C[0], C[1], B[0], B[1]);
  c.strokeStyle = INK; c.lineWidth = lw; c.lineCap = 'round'; c.stroke();
}

// ---------- герой: движение ----------
function charX(t) {
  const [a, b] = T.walk;
  return lerp(X0, X1, clamp((t - a) / (b - a), 0, 1));
}

function charState(t) {
  const [w0, w1] = T.walk;
  const s = { x: charX(t) };
  const amt = t < w0 ? 0 : (t <= w1 ? 1 : 1 - sstep(w1, w1 + 0.28, t));
  const ph = (Math.min(t, w1) - w0) / BEAT + 0.25;      // фаза цикла; касания ног — на сетке восьмых
  const sw = Math.sin(2 * Math.PI * ph), cw = Math.cos(2 * Math.PI * ph);
  s.legA = 0.62 * sw * amt;
  s.liftR = Math.max(0, cw) * 18 * amt;
  s.liftL = Math.max(0, -cw) * 18 * amt;
  let bob = -12 * (1 - Math.abs(sw)) * amt;
  if (t > w1) bob += -7 * Math.sin((t - w1) * 20) * Math.exp(-(t - w1) * 7);
  let sq = 0.07 * Math.abs(sw) * amt;
  s.armA = -0.75 * sw * amt;
  s.lean = 0.08 * amt;
  s.tilt = 0.05 * Math.sin(4 * Math.PI * ph) * amt;
  s.breath = 0.015 * Math.sin(2 * Math.PI * t / 1.6) * (1 - amt);

  // прыжок радости
  let jump = 0;
  const [h0, h1] = T.hop;
  if (t > h0 - 0.12 && t <= h0) sq += 0.1 * Math.sin(Math.PI * (t - (h0 - 0.12)) / 0.12);
  if (t > h0 && t < h1) { const u = (t - h0) / (h1 - h0); jump = -34 * Math.sin(Math.PI * u); sq -= 0.08 * Math.sin(Math.PI * u); }
  if (t >= h1 && t < h1 + 0.25) { const u = (t - h1) / 0.25; sq += 0.12 * Math.sin(Math.PI * u) * (1 - u); }
  // испуг: вытягивается вверх
  sq -= 0.1 * bump(t, T.take - 0.04, T.take + 0.3);
  if (t > T.hatDown && t < T.hatDown + 0.18) sq += 0.07 * Math.sin(Math.PI * (t - T.hatDown) / 0.18);
  s.bob = bob; s.jump = jump; s.sq = sq;

  // кепка подпрыгивает
  if (t > T.take && t < T.hatDown) {
    const u = (t - T.take) / (T.hatDown - T.take);
    s.hatLift = 70 * Math.sin(Math.PI * u);
    s.hatRot = -0.5 * Math.sin(Math.PI * u) + 0.15 * Math.sin(2 * Math.PI * u);
  } else { s.hatLift = 0; s.hatRot = 0; }

  // лицо
  s.eyeScale = 1 + 0.45 * bump(t, T.take - 0.02, T.take + 0.55);
  s.blink = T.blinks.some(b => Math.abs(t - b) < 0.055);
  s.happy = t >= T.happy[0];
  s.mouth = s.happy ? 'grin'
    : (t >= T.take - 0.02 && t < T.take + 0.5) ? 'o'
    : (t >= T.whistle[0] - 0.05 && t < T.whistle[1] + 0.25) ? 'whistle' : 'smile';
  s.brow = bump(t, T.take - 0.02, T.take + 0.6);
  s.wave = win01(t, T.wave[0], T.wave[1], 0.15, 0.2);
  s.waveA = 0.5 * Math.sin(2 * Math.PI * 3.6 * (t - T.wave[0]));
  s.cheer = bump(t, h0 - 0.1, h1 + 0.25);
  s.lookUp = win01(t, T.look[0], T.happy[0] + 0.25, 0.25, 0.2);
  return s;
}

function charRig(t, s) {
  s = s || charState(t);
  const y = s.bob + s.jump;
  const hipY = -56 + y;
  const torso = { x: 4 + s.lean * 20, y: hipY - 36, rx: 34 * (1 + s.sq), ry: 41 * (1 - s.sq) * (1 + s.breath) };
  const neckY = hipY - 72 * (1 - s.sq * 0.8);
  const nx = 8 + s.lean * 70;
  const head = { x: nx + 4, y: neckY - 36 };
  const capTop = { x: head.x, y: head.y - 24 - s.hatLift - 25 };
  return {
    hipY, torso, neckY, head, capTop,
    shL: { x: torso.x - 24, y: neckY + 16 },
    shR: { x: torso.x + 26, y: neckY + 16 },
  };
}

// ---------- голубь: движение ----------
function landPoint(t) {
  const r = charRig(t);
  return { x: charX(t) + r.capTop.x * CS - 2, y: FEET + r.capTop.y * CS + 3 };
}
function pigeonState(t) {
  const [f0, f1] = T.fly;
  const cooBob = (list) => {
    for (const c of list) if (t > c && t < c + 0.42) return Math.sin((t - c) / 0.42 * Math.PI * 3);
    return 0;
  };
  if (t < f0) {
    let bob = cooBob(T.coo);
    if (!bob) bob = 0.4 * Math.max(0, Math.sin(t * 2.3)) ** 8;   // изредка клюёт воздух
    const crouch = sstep(f0 - 0.18, f0, t) * 4;
    return { x: LAMP_X, y: LAMP_TOP + crouch, dir: -1, flying: false, bob, flap: 0 };
  }
  if (t < f1) {
    const u = (t - f0) / (f1 - f0);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const P0 = { x: LAMP_X, y: LAMP_TOP }, P3 = landPoint(f1);
    const P1 = { x: LAMP_X + 190, y: 20 }, P2 = { x: P3.x - 220, y: -40 };
    const m = 1 - e;
    const x = m * m * m * P0.x + 3 * m * m * e * P1.x + 3 * m * e * e * P2.x + e * e * e * P3.x;
    const y = m * m * m * P0.y + 3 * m * m * e * P1.y + 3 * m * e * e * P2.y + e * e * e * P3.y;
    const dx = 3 * m * m * (P1.x - P0.x) + 6 * m * e * (P2.x - P1.x) + 3 * e * e * (P3.x - P2.x);
    return { x, y, dir: dx >= 0 ? 1 : -1, flying: true, flap: Math.sin((t - f0) * 2 * Math.PI * 7.5), bob: 0 };
  }
  const p = landPoint(t);
  return { x: p.x, y: p.y, dir: 1, flying: false, bob: cooBob([T.happy[0] + 0.05]), flap: 0 };
}

// ---------- камера (плавное слежение, просчитано заранее) ----------
const CAM = (() => {
  const dt = 1 / 240, n = Math.ceil(T.duration / dt) + 2, a = new Float32Array(n), w = 4.0;
  let x = 0, v = 0;
  for (let i = 0; i < n; i++) {
    const tg = clamp(charX(i * dt) - 470, 0, 430);
    v += (w * w * (tg - x) - 2 * w * v) * dt;
    x += v * dt;
    a[i] = x;
  }
  return a;
})();
function camX(t) {
  const f = t * 240, i = Math.floor(f), u = f - i;
  const a = CAM[Math.min(i, CAM.length - 1)], b = CAM[Math.min(i + 1, CAM.length - 1)];
  return a + (b - a) * u;
}

// ---------- декорации (генерируются один раз) ----------
const FAR = [], NEAR = [];
(() => {
  const R = mulberry32(12345);
  for (let x = -400; x < 2400;) {
    const w = 90 + R() * 140, h = 330 + R() * 190;
    FAR.push({ x, w, h, chim: R() < 0.5, tank: R() < 0.25, seed: (R() * 1e9) | 0 });
    x += w + (R() < 0.3 ? 10 + R() * 30 : 0);
  }
  const shades = ['#c8c4b9', '#bebaaf', '#d0ccc1', '#c3bfb4'];
  let i = 0;
  for (let x = -300; x < 2300; i++) {
    const w = 200 + R() * 120, h = 280 + R() * 150;
    NEAR.push({ x, w, h, shade: shades[i % 4], seed: (R() * 1e9) | 0, awning: R() < 0.45, sign: null });
    x += w;
  }
  const at = (wx) => NEAR.find(b => wx >= b.x && wx < b.x + b.w);
  Object.assign(at(260), { sign: 'БУЛОЧНАЯ', awning: true });
  Object.assign(at(1480), { sign: 'ПОЧТА', awning: false });
})();
const CLOUDS = [
  { x: 100, y: 110, s: 1 }, { x: 520, y: 70, s: 0.8 }, { x: 880, y: 135, s: 1.1 },
  { x: 1300, y: 90, s: 0.9 }, { x: 1720, y: 120, s: 1 },
];

function drawCloud(c, cl) {
  const parts = [[-50, 0, 30], [-15, -18, 36], [25, -10, 32], [55, 4, 24]];
  const s = cl.s, base = cl.y + 18 * s;
  c.save();
  c.beginPath(); c.rect(cl.x - 200, cl.y - 200, 400, base - (cl.y - 200)); c.clip();
  for (const [dx, dy, r] of parts) poly(c, ellPts(cl.x + dx * s, cl.y + dy * s, r * s, r * s, 0, 22), null, INK, 5);
  for (const [dx, dy, r] of parts) poly(c, ellPts(cl.x + dx * s, cl.y + dy * s, r * s, r * s, 0, 22), '#e6e2d8', null, 0);
  c.restore();
  let lo = Infinity, hi = -Infinity;
  for (const [dx, dy, r] of parts) {
    const d = base - (cl.y + dy * s), rr = r * s;
    if (Math.abs(d) < rr) { const hw = Math.sqrt(rr * rr - d * d); lo = Math.min(lo, cl.x + dx * s - hw); hi = Math.max(hi, cl.x + dx * s + hw); }
  }
  line(c, [[lo, base], [hi, base]], 2.5);
}

function drawFar(c, b) {
  const top = GROUND - b.h;
  c.fillStyle = '#b4b0a6';
  c.fillRect(b.x, top, b.w, b.h);
  const r = mulberry32(b.seed);
  c.fillStyle = '#a19d93';
  for (let y = top + 16; y < GROUND - 20; y += 26)
    for (let x = b.x + 10; x < b.x + b.w - 14; x += 22) if (r() < 0.8) c.fillRect(x, y, 9, 13);
  c.fillStyle = '#a5a197';
  if (b.chim) c.fillRect(b.x + b.w * 0.7, top - 26, 14, 26);
  if (b.tank) {
    const tx = b.x + b.w * 0.3;
    c.fillRect(tx, top - 40, 30, 26);
    c.beginPath(); c.moveTo(tx - 3, top - 40); c.lineTo(tx + 15, top - 54); c.lineTo(tx + 33, top - 40); c.fill();
    c.fillRect(tx + 3, top - 14, 3, 14); c.fillRect(tx + 24, top - 14, 3, 14);
  }
}

function drawAwning(c, x, y, w) {
  const n = Math.max(4, Math.round(w / 26)), sw = w / n;
  for (let k = 0; k < n; k++)
    poly(c, [[x + k * sw, y], [x + (k + 1) * sw, y], [x + (k + 1) * sw + 4, y + 26], [x + k * sw + 4, y + 26]],
      k % 2 ? '#f0ece2' : '#3b3a36', null, 0);
  for (let k = 0; k < n; k++) {
    c.beginPath();
    c.arc(x + k * sw + sw / 2 + 4, y + 26, sw / 2, 0, Math.PI);
    c.fillStyle = k % 2 ? '#f0ece2' : '#3b3a36'; c.fill();
    c.strokeStyle = INK; c.lineWidth = 2.4; c.stroke();
  }
  poly(c, [[x, y], [x + w, y], [x + w + 4, y + 26], [x + 4, y + 26]], null, INK, 3);
}

function drawNear(c, b) {
  const top = GROUND - b.h;
  poly(c, rectPts(b.x, top, b.w, b.h), b.shade, INK, 3.2);
  poly(c, rectPts(b.x - 6, top - 8, b.w + 12, 14), '#a9a59b', INK, 3);
  const r = mulberry32(b.seed);
  const cols = Math.max(2, Math.floor((b.w - 30) / 62));
  const gap = (b.w - cols * 34) / (cols + 1);
  const rows = Math.max(1, Math.floor((b.h - 140) / 78));
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = b.x + gap + col * (34 + gap), y = top + 30 + row * 78;
      const dark = r() < 0.35;
      if (x + 34 > CAT.x - 10 && x < CAT.x + CAT.w + 10 && y + 46 > CAT.y - 10 && y < CAT.y + CAT.h + 10) continue;
      poly(c, rectPts(x, y, 34, 46), dark ? '#4a4843' : '#e9e5da', INK, 2.6);
      if (!dark) { line(c, [[x + 17, y], [x + 17, y + 46]], 2); line(c, [[x, y + 20], [x + 34, y + 20]], 2); }
      poly(c, rectPts(x - 4, y + 46, 42, 5), '#9f9b91', INK, 2);
    }
  }
  line(c, [[b.x, GROUND - 112], [b.x + b.w, GROUND - 112]], 2.4);
  const dx = b.x + b.w * 0.68;
  poly(c, rectPts(dx, GROUND - 80, 40, 80), '#5d5a54', INK, 3);
  c.beginPath(); c.arc(dx + 32, GROUND - 40, 3, 0, 7); c.fillStyle = '#e9e5da'; c.fill();
  if (b.awning) {
    const sw = b.w * 0.45;
    poly(c, rectPts(b.x + 22, GROUND - 82, sw, 66), '#e3dfd4', INK, 3);
    line(c, [[b.x + 22 + sw / 2, GROUND - 82], [b.x + 22 + sw / 2, GROUND - 16]], 2.4);
    drawAwning(c, b.x + 16, GROUND - 104, sw + 10);
  }
  if (b.sign) {
    c.font = '24px Oswald';
    c.letterSpacing = '3px';
    const tw = c.measureText(b.sign).width + 34;
    const sx = b.x + b.w / 2 - tw / 2;
    poly(c, rectPts(sx, GROUND - 146, tw, 32), '#efeae0', INK, 3);
    c.fillStyle = INK; c.textAlign = 'center'; c.textBaseline = 'middle';
    const [jx, jy] = jp(sx, GROUND - 146, 0.8);
    c.fillText(b.sign, b.x + b.w / 2 + (jx - sx), GROUND - 129 + (jy - GROUND + 146));
    c.letterSpacing = '0px';
  }
}

function drawCatWindow(c, t, pg) {
  const { x, y, w, h } = CAT;
  poly(c, rectPts(x, y, w, h), '#ece8dd', INK, 2.6);
  poly(c, [[x, y], [x + 9, y], [x + 5, y + h], [x, y + h]], '#9d998f', INK, 1.8);
  poly(c, [[x + w, y], [x + w - 9, y], [x + w - 5, y + h], [x + w, y + h]], '#9d998f', INK, 1.8);
  const cx = x + w / 2, by = y + h;
  const tail = Math.sin(t * 3.1) * 7;
  c.beginPath(); c.moveTo(cx + 8, by - 4); c.quadraticCurveTo(cx + 22, by - 10, cx + 14 + tail * 0.4, by - 24 + Math.abs(tail) * 0.3);
  c.strokeStyle = INK; c.lineWidth = 3.5; c.lineCap = 'round'; c.stroke();
  poly(c, ellPts(cx, by - 11, 11, 12, 0, 16), INK, null, 0);
  poly(c, ellPts(cx, by - 27, 8.5, 7.5, 0, 16), INK, null, 0);
  poly(c, [[cx - 8, by - 30], [cx - 7, by - 39], [cx - 2, by - 33]], INK, null, 0);
  poly(c, [[cx + 8, by - 30], [cx + 7, by - 39], [cx + 2, by - 33]], INK, null, 0);
  const vx = pg.x - cx, vy = pg.y - (by - 27), d = Math.hypot(vx, vy) || 1;
  const ex = vx / d * 1.6, ey = vy / d * 1.2;
  c.fillStyle = '#f2efe6';
  c.beginPath(); c.ellipse(cx - 3.5 + ex, by - 28 + ey, 1.8, 1.1, 0, 0, 7); c.fill();
  c.beginPath(); c.ellipse(cx + 3.5 + ex, by - 28 + ey, 1.8, 1.1, 0, 0, 7); c.fill();
  poly(c, rectPts(x - 5, by, w + 10, 6), '#9f9b91', INK, 2.2);
}

function drawSidewalk(c, cx) {
  poly(c, rectPts(cx - 60, GROUND, W + 120, 75), '#c9c5ba', INK, 3);
  for (let x = Math.floor((cx - 100) / 120) * 120; x < cx + W + 120; x += 120)
    line(c, [[x, GROUND + 3], [x - 16, 654]], 2.2, '#7d7a72');
  poly(c, rectPts(cx - 60, 655, W + 120, 12), '#a8a499', INK, 3);
  c.fillStyle = '#8f8b81'; c.fillRect(cx - 60, 667, W + 120, 70);
  const off = cx * 0.15;
  for (let x = Math.floor((cx + off - 100) / 160) * 160; x < cx + off + W + 160; x += 160)
    poly(c, rectPts(x - off, 698, 70, 6), '#cfcbc0', null, 0);
}

function drawLamp(c) {
  const x = LAMP_X, base = 606;
  poly(c, [[x - 16, base], [x + 16, base], [x + 9, base - 34], [x - 9, base - 34]], '#3a3834', INK, 3);
  poly(c, rectPts(x - 4, 236, 8, base - 34 - 236), '#2c2a27', INK, 2.5);
  poly(c, ellPts(x, 300, 9, 5, 0, 14), '#3a3834', INK, 2.4);
  poly(c, ellPts(x, 440, 9, 5, 0, 14), '#3a3834', INK, 2.4);
  poly(c, [[x - 13, 236], [x + 13, 236], [x + 18, 202], [x - 18, 202]], '#efe9d8', INK, 3);
  line(c, [[x, 202], [x, 236]], 2);
  poly(c, [[x - 24, 202], [x + 24, 202], [x, 182]], INK, INK, 2.5);
}

function drawHydrant(c, x, y) {
  poly(c, rectPts(x - 15, y - 8, 30, 8), '#3a3834', INK, 2.6);
  poly(c, rectPts(x - 11, y - 46, 22, 38), '#4a4843', INK, 3);
  poly(c, ellPts(x, y - 46, 12, 9, 0, 18), '#4a4843', INK, 3);
  poly(c, ellPts(x - 15, y - 30, 6, 5, 0, 12), '#3a3834', INK, 2.4);
  poly(c, ellPts(x + 15, y - 30, 6, 5, 0, 12), '#3a3834', INK, 2.4);
  poly(c, ellPts(x, y - 57, 4, 4, 0, 10), '#3a3834', INK, 2.2);
  line(c, [[x - 5, y - 40], [x - 5, y - 14]], 2.5, '#77736c');
}

// ---------- рисование героя ----------
const SKIN = '#ebe7dc', GLOVE = '#f2efe7';

function drawShoe(c, x, y, rot) {
  c.save(); c.translate(x, y); c.rotate(rot);
  poly(c, ellPts(10, -8, 19, 10.5, 0, 24), INK, INK, 2);
  c.beginPath(); c.ellipse(16, -12, 5, 2.5, -0.3, 0, 7); c.fillStyle = '#e8e4da'; c.fill();
  c.restore();
}

function drawGlove(c, x, y, rot, open) {
  c.save(); c.translate(x, y); c.rotate(rot);
  poly(c, ellPts(0, -10, 9, 5, 0, 16), GLOVE, INK, 2.6);
  if (open) for (const a of [-0.55, -0.18, 0.2, 0.56])
    poly(c, ellPts(Math.sin(a) * 13, 5 + Math.cos(a) * 12, 4.5, 7.5, -a, 14), GLOVE, INK, 2.4);
  poly(c, ellPts(0, 4, 12, 11, 0, 20), GLOVE, INK, 2.8);
  poly(c, ellPts(-10, 0, 5, 6.5, 0.5, 12), GLOVE, INK, 2.4);
  if (!open) { line(c, [[-3, 9], [-2, 14]], 2); line(c, [[3, 9], [4, 14]], 2); }
  c.restore();
}

function drawLimbArm(c, sh, hand, ctl, open) {
  hose(c, sh, ctl, hand, 8.5);
  const rot = Math.atan2(hand.y - ctl.y, hand.x - ctl.x) - Math.PI / 2;
  drawGlove(c, hand.x, hand.y, rot, open);
}

function drawChar(c, t, sx0, pg) {
  const s = charState(t), r = charRig(t, s);
  c.save(); c.translate(sx0, FEET); c.scale(CS, CS);
  BOIL = 0.6;

  // тень
  const k = 1 + s.jump / 100;
  c.fillStyle = 'rgba(20,18,16,0.22)';
  c.beginPath(); c.ellipse(6, 2, 48 * k, 8 * k, 0, 0, 7); c.fill();

  // ноги
  const hipL = { x: -12 + s.lean * 10, y: r.hipY + 4 }, hipR = { x: 16 + s.lean * 10, y: r.hipY + 4 };
  const tuck = s.jump < 0 ? -10 * Math.sin(Math.PI * clamp((t - T.hop[0]) / (T.hop[1] - T.hop[0]), 0, 1)) : 0;
  const footL = { x: hipL.x + 56 * Math.sin(-s.legA), y: -s.liftL + s.jump + tuck };
  const footR = { x: hipR.x + 56 * Math.sin(s.legA), y: -s.liftR + s.jump + tuck };
  const leg = (hip, foot, lift) => {
    const ctl = { x: (hip.x + foot.x) / 2 + 6 + lift * 0.7, y: (hip.y + foot.y) / 2 };
    hose(c, hip, ctl, { x: foot.x, y: foot.y - 6 }, 9);
    drawShoe(c, foot.x - 4, foot.y, -0.35 * lift / 18);
  };

  // руки: обычное положение, приветствие, «ура»
  const armPos = (sh, a, side) => ({ x: sh.x + 48 * Math.sin(a) + side * 6, y: sh.y + 48 * Math.cos(a) });
  let hL = armPos(r.shL, -s.armA, -1), hR = armPos(r.shR, s.armA, 1);
  let cL = { x: (r.shL.x + hL.x) / 2 - 8, y: (r.shL.y + hL.y) / 2 }, cR = { x: (r.shR.x + hR.x) / 2 - 8, y: (r.shR.y + hR.y) / 2 };
  if (s.wave > 0) {
    const phi = 1.1 + 0.5 * s.waveA;
    const wv = { x: r.shR.x + 76 * Math.sin(phi), y: r.shR.y - 76 * Math.cos(phi) - 12 };
    hR = { x: lerp(hR.x, wv.x, s.wave), y: lerp(hR.y, wv.y, s.wave) };
    cR = { x: lerp(cR.x, (r.shR.x + hR.x) / 2 + 14, s.wave), y: lerp(cR.y, (r.shR.y + hR.y) / 2 + 12, s.wave) };
  }
  if (s.cheer > 0) {
    const uL = { x: r.shL.x - 34, y: r.shL.y - 50 }, uR = { x: r.shR.x + 34, y: r.shR.y - 50 };
    hL = { x: lerp(hL.x, uL.x, s.cheer), y: lerp(hL.y, uL.y, s.cheer) };
    hR = { x: lerp(hR.x, uR.x, s.cheer), y: lerp(hR.y, uR.y, s.cheer) };
    cL = { x: lerp(cL.x, r.shL.x - 26, s.cheer), y: lerp(cL.y, r.shL.y - 14, s.cheer) };
    cR = { x: lerp(cR.x, r.shR.x + 26, s.cheer), y: lerp(cR.y, r.shR.y - 14, s.cheer) };
  }

  leg(hipL, footL, s.liftL);
  drawLimbArm(c, r.shL, hL, cL, s.cheer > 0.5);

  // туловище
  poly(c, ellPts(r.torso.x, r.torso.y, r.torso.rx, r.torso.ry, 0, 30), INK, INK, 2);
  for (const by of [-8, 10]) {
    c.beginPath(); c.arc(r.torso.x + 15, r.torso.y + by, 4.5, 0, 7); c.fillStyle = GLOVE; c.fill();
  }
  leg(hipR, footR, s.liftR);

  // голова
  c.save(); c.translate(r.head.x, r.head.y); c.rotate(s.tilt);
  poly(c, ellPts(-38, -6, 11, 15, -0.3, 18), SKIN, INK, 3.5);
  poly(c, ellPts(-38, -6, 5, 8, -0.3, 12), '#bdb8ac', null, 0);
  poly(c, ellPts(0, 0, 44 * (1 + s.sq * 0.4), 43 * (1 - s.sq * 0.4), 0, 36), SKIN, INK, 4.5);
  c.fillStyle = 'rgba(120,115,105,0.25)';
  c.beginPath(); c.ellipse(30, 16, 8, 5, 0, 0, 7); c.fill();

  // глаза следят за голубем
  let ex = 3, ey = 0;
  if (s.lookUp > 0) {
    const hx = s.x + r.head.x * CS, hy = FEET + r.head.y * CS;
    const vx = pg.x - hx, vy = pg.y - 10 - hy, d = Math.hypot(vx, vy) || 1;
    ex = lerp(ex, vx / d * 4, s.lookUp); ey = lerp(ey, vy / d * 6.5, s.lookUp);
  }
  const es = s.eyeScale;
  for (const [ox, oy] of [[-4, -8], [19, -8]]) {
    c.strokeStyle = INK; c.lineCap = 'round';
    if (s.blink) {
      c.beginPath(); c.moveTo(ox - 9, oy + 2); c.quadraticCurveTo(ox, oy + 7, ox + 9, oy + 2); c.lineWidth = 3.5; c.stroke();
    } else if (s.happy) {
      c.beginPath(); c.moveTo(ox - 9, oy + 4); c.quadraticCurveTo(ox, oy - 12, ox + 9, oy + 4); c.lineWidth = 4.5; c.stroke();
    } else {
      poly(c, ellPts(ox, oy, 9.5 * (1 + (es - 1) * 0.3), 15.5 * es, 0, 22), '#fbf9f3', INK, 3);
      const px = ox + ex, py = oy + ey * es;
      const pr = 1 / Math.sqrt(es);
      c.beginPath(); c.ellipse(px, py, 5 * pr, 9 * pr, 0, 0, 7); c.fillStyle = INK; c.fill();
      c.beginPath(); c.ellipse(px + 1.8, py - 4, 1.6, 2.6, 0, 0, 7); c.fillStyle = '#fbf9f3'; c.fill();
    }
    const bl = 10 * s.brow;
    c.beginPath(); c.moveTo(ox - 8, oy - 22 - bl); c.quadraticCurveTo(ox, oy - 28 - bl, ox + 8, oy - 22 - bl);
    c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
  }

  // нос
  poly(c, ellPts(38, 6, 12, 9.5, 0.1, 20), INK, INK, 2);
  c.beginPath(); c.ellipse(41, 2, 3.5, 2, -0.3, 0, 7); c.fillStyle = '#fbf9f3'; c.fill();

  // рот
  c.strokeStyle = INK; c.lineCap = 'round';
  if (s.mouth === 'smile') {
    c.beginPath(); c.moveTo(4, 22); c.quadraticCurveTo(20, 34, 36, 21); c.lineWidth = 4; c.stroke();
    c.beginPath(); c.moveTo(2, 19); c.lineTo(5, 25); c.lineWidth = 2.5; c.stroke();
  } else if (s.mouth === 'o') {
    poly(c, ellPts(22, 28, 6.5, 9.5, 0, 16), INK, INK, 2);
  } else if (s.mouth === 'whistle') {
    poly(c, ellPts(30, 24, 4, 4, 0, 12), INK, INK, 2);
  } else {
    c.beginPath(); c.moveTo(2, 17); c.quadraticCurveTo(20, 50, 40, 15); c.quadraticCurveTo(20, 24, 2, 17);
    c.fillStyle = INK; c.fill(); c.lineWidth = 3; c.stroke();
    c.beginPath(); c.ellipse(21, 30, 8, 4, 0, 0, 7); c.fillStyle = '#7d7a74'; c.fill();
  }

  // кепка
  c.save(); c.translate(0, -24 - s.hatLift); c.rotate(s.hatRot);
  const dome = [];
  for (let i = 0; i <= 16; i++) { const a = Math.PI + i / 16 * Math.PI; dome.push([46 * Math.cos(a), 25 * Math.sin(a)]); }
  dome.push([40, 4], [0, 6], [-40, 4]);
  poly(c, dome, INK, INK, 3);
  poly(c, ellPts(46, 2, 26, 7, 0.12, 20), INK, INK, 2);
  line(c, [[-42, -4], [42, -4]], 3, '#5a5852');
  c.beginPath(); c.ellipse(0, -25, 4, 3, 0, 0, 7); c.fillStyle = '#d8d4c9'; c.fill();
  c.restore();
  c.restore();

  // бабочка
  const nx = r.torso.x + 8, ny = r.neckY + 2;
  poly(c, [[nx, ny], [nx - 14, ny - 8], [nx - 14, ny + 8]], GLOVE, INK, 2.5);
  poly(c, [[nx, ny], [nx + 14, ny - 8], [nx + 14, ny + 8]], GLOVE, INK, 2.5);
  poly(c, ellPts(nx, ny, 4, 4, 0, 10), GLOVE, INK, 2.5);

  drawLimbArm(c, r.shR, hR, cR, s.wave > 0.5 || s.cheer > 0.5);

  c.restore();
  BOIL = 1.0;
}

// ---------- голубь ----------
function drawPigeon(c, x, y, p) {
  c.save(); c.translate(x, y); c.scale(p.dir * 1.4, 1.4);
  BOIL = 0.5;
  const wing = (back) => {
    const up = p.flap;
    const tip = { x: -10 + (back ? 5 : 0), y: -20 - 34 * up };
    poly(c, [[-8, -19], [8, -21], [tip.x + 16, tip.y + 2 * up], [tip.x, tip.y], [tip.x - 10, tip.y + 9 * Math.sign(up || 1)]], back ? '#5f5b55' : '#77736c', INK, 2.2);
  };
  if (p.flying) wing(true);
  poly(c, [[-14, -14], [-34, -10], [-34, -4], [-12, -8]], '#77736c', INK, 2.4);
  if (!p.flying) { line(c, [[-2, -6], [-3, 0]], 2.2); line(c, [[4, -6], [5, 0]], 2.2); }
  poly(c, ellPts(0, -15, 17, 11, -0.15, 24), '#8f8b84', INK, 2.6);
  if (p.flying) wing(false);
  else poly(c, ellPts(-4, -16, 11, 6, -0.2, 16), '#6f6b65', INK, 2);
  const hx = 14 + p.bob * 4, hy = -27 + Math.abs(p.bob) * 2;
  poly(c, [[8, -22], [hx - 4, hy + 2], [hx + 3, hy + 5], [14, -16]], '#9a968e', null, 0);
  poly(c, ellPts(hx, hy, 8, 7.5, 0, 16), '#a8a49c', INK, 2.4);
  c.beginPath(); c.arc(hx + 3, hy - 2, 2, 0, 7); c.fillStyle = INK; c.fill();
  poly(c, [[hx + 7, hy - 1], [hx + 14, hy + 1], [hx + 7, hy + 3]], '#3a3833', INK, 1.2);
  BOIL = 1.0;
  c.restore();
}

// ---------- сцена ----------
function drawScene(c, t) {
  const cx = camX(t);
  const g = c.createLinearGradient(0, 0, 0, GROUND);
  g.addColorStop(0, '#dcd8cd'); g.addColorStop(1, '#cfcbc0');
  c.fillStyle = g; c.fillRect(0, 0, W, H);

  c.save(); c.translate(-cx * 0.15 + t * 6, 0); CLOUDS.forEach(cl => drawCloud(c, cl)); c.restore();
  c.save(); c.translate(-cx * 0.45, 0);
  for (const b of FAR) if (b.x - cx * 0.45 < W + 50 && b.x + b.w - cx * 0.45 > -50) drawFar(c, b);
  c.restore();

  const pg = pigeonState(t);
  c.save(); c.translate(-cx, 0);
  for (const b of NEAR) if (b.x - cx < W + 60 && b.x + b.w - cx > -60) drawNear(c, b);
  drawCatWindow(c, t, pg);
  drawSidewalk(c, cx);
  drawLamp(c);
  c.restore();

  drawChar(c, t, charX(t) - cx, pg);
  drawPigeon(c, pg.x - cx, pg.y, pg);

  c.save(); c.translate(-cx, 0); drawHydrant(c, HYD_X, 652); c.restore();
}

function irisLayer(c, t) {
  let rad = null, cx = W / 2, cy = H / 2;
  const [a, b] = T.irisIn;
  if (t < b) rad = sstep(a, b, t) * 780;
  const [o0, o1] = T.irisOut;
  if (t >= o0) {
    const r = charRig(t);
    cx = charX(t) - camX(t) + r.head.x * CS; cy = FEET + (r.head.y - 6) * CS;
    if (t < o0 + 0.45) rad = lerp(800, 135, sstep(o0, o0 + 0.45, t));
    else if (t < o1 - 0.18) rad = 135;
    else rad = lerp(135, 0, sstep(o1 - 0.18, o1, t));
  }
  if (rad === null) return;
  c.beginPath();
  c.rect(-20, -20, W + 40, H + 40);
  c.moveTo(cx + rad, cy);
  c.arc(cx, cy, Math.max(rad, 0.01), 0, Math.PI * 2, true);
  c.fillStyle = '#070707'; c.fill('evenodd');
}

function drawCard(c, t, kind) {
  c.fillStyle = '#e2ddd0'; c.fillRect(0, 0, W, H);
  poly(c, rectPts(46, 40, W - 92, H - 80), null, INK, 5);
  poly(c, rectPts(62, 56, W - 124, H - 112), null, INK, 2);
  for (const [x, y] of [[62, 56], [W - 62, 56], [62, H - 56], [W - 62, H - 56]]) poly(c, ellPts(x, y, 10, 10, 0, 14), INK, null, 0);
  const [jx, jy] = jp(0, 0, 1.4);
  c.save(); c.translate(jx, jy);
  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  const rule = (y) => {
    line(c, [[W / 2 - 260, y], [W / 2 - 22, y]], 3); line(c, [[W / 2 + 22, y], [W / 2 + 260, y]], 3);
    poly(c, [[W / 2, y - 10], [W / 2 + 12, y], [W / 2, y + 10], [W / 2 - 12, y]], INK, null, 0);
  };
  if (kind === 'title') {
    c.font = '46px Caveat'; c.fillStyle = INK; c.fillText('мультфильм', W / 2, 190);
    c.font = '190px Oswald'; c.letterSpacing = '8px';
    c.fillStyle = '#8d8980'; c.fillText('ПОНЧИК', W / 2 + 7, 407);
    c.fillStyle = INK; c.fillText('ПОНЧИК', W / 2, 400);
    c.letterSpacing = '0px';
    rule(448);
    c.font = '66px Caveat'; c.fillText('и голубь на фонаре', W / 2, 530);
    c.font = '24px Oswald'; c.letterSpacing = '6px'; c.fillText('СЕРИЯ 1', W / 2, 615); c.letterSpacing = '0px';
  } else {
    c.font = '200px Oswald'; c.letterSpacing = '10px';
    c.fillStyle = '#8d8980'; c.fillText('КОНЕЦ', W / 2 + 7, 417);
    c.fillStyle = INK; c.fillText('КОНЕЦ', W / 2, 410);
    c.letterSpacing = '0px';
    rule(458);
    c.font = '56px Caveat'; c.fillText('продолжение следует…', W / 2, 540);
  }
  c.restore();
  const fadeIn = kind === 'title' ? 1 - sstep(0, 0.3, t) : 1 - sstep(T.endCard[0], T.endCard[0] + 0.15, t);
  const fadeOut = kind === 'end' ? sstep(T.duration - 0.5, T.duration, t) : 0;
  const a = Math.max(fadeIn, fadeOut);
  if (a > 0) { c.fillStyle = `rgba(5,5,5,${a})`; c.fillRect(0, 0, W, H); }
}

// ---------- «старая плёнка» ----------
const GRAIN = [];
function makeGrain() {
  for (let k = 0; k < 6; k++) {
    const g = document.createElement('canvas'); g.width = 960; g.height = 540;
    const gc = g.getContext('2d'), img = gc.createImageData(960, 540), r = mulberry32(999 + k);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (r() + r() - 1) * 90;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    gc.putImageData(img, 0, 0);
    GRAIN.push(g);
  }
}

function postFX(c, i, r) {
  c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.35;
  c.fillStyle = '#f4ead6'; c.fillRect(0, 0, W, H);
  c.globalCompositeOperation = 'overlay'; c.globalAlpha = 0.28;
  c.drawImage(GRAIN[Math.floor(r() * GRAIN.length)], -r() * 30, -r() * 30, W + 30, H + 30);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;

  const f = (r() - 0.5) * 0.07;
  c.fillStyle = f > 0 ? `rgba(255,248,235,${f})` : `rgba(0,0,0,${-f})`;
  c.fillRect(0, 0, W, H);

  const nd = r() < 0.55 ? 1 + Math.floor(r() * 3) : 0;
  for (let k = 0; k < nd; k++) {
    const x = r() * W, y = r() * H, s = 0.6 + r() * 2.4, dark = r() < 0.7;
    c.fillStyle = dark ? 'rgba(10,10,10,0.75)' : 'rgba(255,255,250,0.8)';
    c.beginPath(); c.ellipse(x, y, s, s * (0.6 + r()), r() * 3, 0, 7); c.fill();
    if (r() < 0.3) {
      c.strokeStyle = c.fillStyle; c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, x + (r() - 0.5) * 24, y + (r() - 0.5) * 24); c.stroke();
    }
  }
  const seg = Math.floor(i / 7);
  if (h32(seg * 911) > 0.55) {
    const x = (h32(seg * 37) + 1) / 2 * W + (r() - 0.5) * 3;
    c.strokeStyle = 'rgba(250,248,240,0.35)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x + (r() - 0.5) * 6, H); c.stroke();
  }
  const vg = c.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
}

// ---------- кадр ----------
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const S = document.createElement('canvas'); S.width = 1920; S.height = 1080;
const sx = S.getContext('2d');

function renderFrame(i) {
  const t = i / FPS;
  BF = Math.floor(i / 2);
  sx.setTransform(SC, 0, 0, SC, 0, 0);
  sx.fillStyle = '#000'; sx.fillRect(0, 0, W, H);
  if (t < T.title[1]) drawCard(sx, t, 'title');
  else if (t < T.irisIn[0]) { /* чёрная склейка */ }
  else if (t < T.endCard[0]) { drawScene(sx, t); irisLayer(sx, t); }
  else drawCard(sx, t, 'end');

  const r = mulberry32((i * 2654435761) >>> 0);
  const dx = (r() - 0.5) * 2.2, dy = (r() - 0.5) * 2.2;   // дрожание кадра в проекторе
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
  ctx.drawImage(S, dx - 6, dy - 4, 1920 + 12, 1080 + 8);
  ctx.setTransform(SC, 0, 0, SC, 0, 0);
  postFX(ctx, i, r);
}

function totalFrames() { return Math.round(T.duration * FPS); }

function getEvents() {
  const steps = [];
  const [w0, w1] = T.walk;
  for (let k = 0; ; k++) {
    const t = w0 + k * BEAT / 2;
    if (t > w1 + 1e-6) break;
    const x = charX(t) - camX(t);
    steps.push({ t, foot: k % 2, pan: clamp(x / W * 2 - 1, -1, 1) });
  }
  const pan = (t) => clamp((pigeonState(t).x - camX(t)) / W * 2 - 1, -1, 1);
  return {
    fps: FPS, duration: T.duration, beat: BEAT, T, steps,
    charPanEnd: clamp((X1 - camX(w1)) / W * 2 - 1, -1, 1),
    pigeonPan: { lamp: pan(T.fly[0] - 0.01), land: pan(T.fly[1] + 0.01) },
  };
}

window.ready = Promise.all([document.fonts.load('100px Oswald'), document.fonts.load('60px Caveat')]).then(makeGrain);
window.renderFrame = renderFrame;
window.totalFrames = totalFrames;
window.getEvents = getEvents;

// Просмотр в браузере: scene.html?play
if (location.search.includes('play')) {
  window.ready.then(() => {
    const start = performance.now();
    const loop = (now) => {
      const i = Math.floor((now - start) / 1000 * FPS) % totalFrames();
      renderFrame(i);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
