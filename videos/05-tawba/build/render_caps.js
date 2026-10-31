// usage: node render_caps.js <dir> ; reads <dir>/caps.json -> writes <dir>/caps/*.png
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const dir = process.argv[2]; const items = JSON.parse(fs.readFileSync(dir + '/caps.json'));
  fs.mkdirSync(dir + '/caps', { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  const base = `<style>body{margin:0;width:1080px;height:1920px;background:transparent;font-family:'Inter Display','Inter',sans-serif}
  .sub{position:absolute;left:50%;transform:translateX(-50%);width:max-content;max-width:920px;top:990px;text-align:center;background:rgba(4,8,22,.55);border-radius:36px;padding:18px 30px 22px;box-shadow:0 0 60px 30px rgba(4,8,22,.35);font-weight:800;font-size:96px;line-height:1.12;color:#fff;letter-spacing:-0.01em;text-shadow:0 4px 24px rgba(0,0,0,.85),0 0 6px rgba(0,0,0,.7)}
  .sub .w{display:inline-block;margin:0 14px} .sub .on{color:#F2C46D}
  .badge{position:absolute;left:0;right:0;top:230px;display:flex;flex-direction:column;align-items:center;gap:18px}
  .pill{background:rgba(6,10,26,.62);border:2px solid rgba(242,196,109,.75);border-radius:28px;padding:22px 44px;color:#fff;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.5)}
  .ar{font-family:'FreeSerif','DejaVu Sans',serif;direction:rtl;font-size:92px;line-height:1.5;color:#F6D58E}
  .ru{font-size:44px;font-weight:600;letter-spacing:.02em;color:#E9ECF6}</style>`;
  for (const it of items) {
    let html;
    if (it.kind === 'sub') html = `<div class="sub">${it.words.map((w, i) => `<span class="w${i === it.on ? ' on' : ''}">${w}</span>`).join('')}</div>`;
    else html = `<div class="badge">${it.ar ? `<div class="pill"><div class="ar">${it.ar}</div></div>` : ''}<div class="pill"><div class="ru">${it.ru}</div></div></div>`;
    await p.setContent(`<html><head><meta charset="utf-8">${base}</head><body>${html}</body></html>`);
    await p.screenshot({ path: `${dir}/caps/${it.name}.png`, omitBackground: true });
  }
  await b.close();
})();
