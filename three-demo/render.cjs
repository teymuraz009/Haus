// Покадровый рендер демо Three.js + GSAP: поднимает Vite, снимает кадры через Chromium, собирает MP4.
// node three-demo/render.cjs <папка_для_кадров> <выходной.mp4>
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const frames = path.resolve(process.argv[2] || 'frames-three');
const outMp4 = path.resolve(process.argv[3] || path.join(__dirname, 'out', 'three_gsap_demo.mp4'));

(async () => {
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  fs.mkdirSync(path.dirname(outMp4), { recursive: true });

  // Запускаем vite напрямую (не через npx), иначе kill() остановит только npx, а сервер останется жить.
  const viteBin = path.join(__dirname, '..', 'node_modules', '.bin', 'vite');
  const vite = spawn(viteBin, ['--config', path.join(__dirname, 'vite.config.ts')],
    { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    vite.stdout.on('data', d => { if (String(d).includes('5180')) resolve(); });
    vite.on('exit', code => reject(new Error('vite завершился с кодом ' + code)));
  });

  try {
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', e => { console.error('Ошибка на странице:', e.message); process.exit(1); });
    await page.goto('http://localhost:5180/?render');
    await page.waitForFunction(() => window.ready === true);
    const n = await page.evaluate(() => window.totalFrames);
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const data = await page.evaluate(i => { window.renderFrame(i); return document.querySelector('canvas').toDataURL('image/png'); }, i);
      fs.writeFileSync(path.join(frames, `f${String(i).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    }
    console.log(`кадров: ${n}, рендер: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
    await browser.close();
  } finally {
    vite.kill();
    vite.stdout.destroy();
  }

  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '24', '-i', path.join(frames, 'f%04d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outMp4]);
  console.log('видео:', outMp4);
})();
