// Покадровый рендер «Винтика»: поднимает Vite, пишет events.json для звука, снимает кадры через Chromium.
// node cartoon/vintik/render.cjs <папка_для_кадров> [первый последний шаг]   (MP4 со звуком собирает build.sh)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const frames = path.resolve(process.argv[2] || 'frames-vintik');

(async () => {
  fs.mkdirSync(frames, { recursive: true });

  // Запускаем vite напрямую (не через npx), иначе kill() остановит только npx, а сервер останется жить.
  const viteBin = path.join(__dirname, '..', '..', 'node_modules', '.bin', 'vite');
  const vite = spawn(viteBin, ['--config', path.join(__dirname, 'vite.config.ts')],
    { cwd: path.join(__dirname, '..', '..'), stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    vite.stdout.on('data', d => { if (String(d).includes('5181')) resolve(); });
    vite.on('exit', code => reject(new Error('vite завершился с кодом ' + code)));
  });

  try {
    const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('pageerror', e => { console.error('Ошибка на странице:', e.message); process.exit(1); });
    await page.goto('http://localhost:5181/?render');
    await page.waitForFunction(() => window.ready === true);
    const n = await page.evaluate(() => window.totalFrames);
    if (!process.argv[3]) fs.writeFileSync(path.join(frames, 'events.json'), JSON.stringify(await page.evaluate(() => window.getEvents()), null, 1));
    const a = process.argv[3] ? +process.argv[3] : 0, b = process.argv[4] ? +process.argv[4] : n - 1, step = process.argv[5] ? +process.argv[5] : 1;
    const t0 = Date.now();
    for (let i = a; i <= b; i += step) {
      const data = await page.evaluate(i => { window.renderFrame(i); return document.querySelector('canvas').toDataURL('image/png'); }, i);
      fs.writeFileSync(path.join(frames, `f${String(i).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
      if (i % 48 === 0) console.log(`кадр ${i}/${n - 1}`);
    }
    console.log(`кадров: ${n}, рендер: ${((Date.now() - t0) / 1000).toFixed(1)} с`);
    await browser.close();
  } finally {
    vite.kill();
    vite.stdout.destroy();
  }
})();
