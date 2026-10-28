// Покадровый рендер scene.html в PNG.
// node render.cjs <папка_для_кадров> [первый_кадр последний_кадр шаг]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const out = path.resolve(process.argv[2] || 'frames');
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  page.on('pageerror', e => { console.error('Ошибка на странице:', e.message); process.exit(1); });
  await page.goto('file://' + path.join(__dirname, 'scene.html'));
  await page.evaluate(() => window.ready);

  const info = await page.evaluate(() => ({ n: totalFrames(), events: getEvents() }));
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify(info.events, null, 1));

  const a = process.argv[3] ? +process.argv[3] : 0;
  const b = process.argv[4] ? +process.argv[4] : info.n - 1;
  const step = process.argv[5] ? +process.argv[5] : 1;
  const t0 = Date.now();
  for (let i = a; i <= b; i += step) {
    const data = await page.evaluate(i => { renderFrame(i); return document.getElementById('c').toDataURL('image/png'); }, i);
    fs.writeFileSync(path.join(out, `f${String(i).padStart(4, '0')}.png`), Buffer.from(data.split(',')[1], 'base64'));
    if (i % 48 === 0) console.log(`кадр ${i}/${info.n - 1}`);
  }
  console.log(`готово: ${(Date.now() - t0) / 1000} с`);
  await browser.close();
})();
