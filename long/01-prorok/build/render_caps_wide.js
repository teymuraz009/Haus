// usage: node render_caps_wide.js <dir> ; reads <dir>/caps.json -> writes <dir>/caps/*.png (1920x1080, transparent)
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const dir = process.argv[2]; const items = JSON.parse(fs.readFileSync(dir + '/caps.json'));
  fs.mkdirSync(dir + '/caps', { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
  const base = `<style>body{margin:0;width:1920px;height:1080px;background:transparent;font-family:'Inter Display','Inter',sans-serif}
  .sub{position:absolute;left:50%;transform:translateX(-50%);bottom:70px;width:max-content;max-width:1500px;text-align:center;font-weight:800;font-size:62px;line-height:1.15;color:#fff;
       background:rgba(4,8,22,.55);border-radius:28px;padding:14px 30px 18px;box-shadow:0 0 50px 24px rgba(4,8,22,.3);text-shadow:0 3px 18px rgba(0,0,0,.8)}
  .sub .w{display:inline-block;margin:0 10px} .sub .on{color:#F2C46D}
  .badge{position:absolute;left:0;right:0;top:56px;display:flex;flex-direction:column;align-items:center;gap:12px}
  .pill{background:rgba(6,10,26,.62);border:2px solid rgba(242,196,109,.75);border-radius:22px;padding:12px 34px;color:#fff;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.45)}
  .ar{font-family:'FreeSerif','DejaVu Sans',serif;direction:rtl;font-size:64px;line-height:1.5;color:#F6D58E}
  .ru{font-size:30px;font-weight:600;letter-spacing:.02em;color:#E9ECF6}
  .chap{position:absolute;left:0;right:0;top:330px;display:flex;flex-direction:column;align-items:center;gap:18px;color:#fff;text-shadow:0 4px 30px rgba(0,0,0,.85)}
  .chap .n{font-size:30px;font-weight:600;letter-spacing:.35em;color:#F2C46D;text-transform:uppercase}
  .chap .t{font-size:92px;font-weight:800;letter-spacing:-0.01em}
  .chap .l{width:340px;height:2px;background:linear-gradient(90deg,transparent,#F2C46D,transparent)}</style>`;
  for (const it of items) {
    let html;
    if (it.kind === 'sub') html = `<div class="sub">${it.words.map((w, i) => `<span class="w${i === it.on ? ' on' : ''}">${w}</span>`).join('')}</div>`;
    else if (it.kind === 'chapter') html = `<div class="chap"><div class="l"></div><div class="n">${it.num}</div><div class="t">${it.title}</div><div class="l"></div></div>`;
    else html = `<div class="badge">${it.ar ? `<div class="pill"><div class="ar">${it.ar}</div></div>` : ''}<div class="pill"><div class="ru">${it.ru}</div></div></div>`;
    await p.setContent(`<html><head><meta charset="utf-8">${base}</head><body>${html}</body></html>`);
    await p.screenshot({ path: `${dir}/caps/${it.name}.png`, omitBackground: true });
  }
  await b.close();
})();
