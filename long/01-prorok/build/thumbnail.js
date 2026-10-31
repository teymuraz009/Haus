// usage: node thumbnail.js <background.png> <out.jpg> — 1280x720 YouTube thumbnail
const { chromium } = require('playwright'); const fs = require('fs');
(async () => {
  const [bg, out] = process.argv.slice(2);
  const data = fs.readFileSync(bg).toString('base64');
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.setContent(`<html><head><meta charset="utf-8"><style>
  body{margin:0;width:1280px;height:720px;overflow:hidden;font-family:'Inter Display','Inter',sans-serif}
  .bg{position:absolute;inset:0;background:url(data:image/png;base64,${data}) center/cover;filter:saturate(1.1) contrast(1.05)}
  .shade{position:absolute;inset:0;background:linear-gradient(90deg,rgba(3,6,18,.92) 0%,rgba(3,6,18,.65) 45%,rgba(3,6,18,0) 75%)}
  .txt{position:absolute;left:70px;top:150px;color:#fff;font-weight:900;font-size:128px;line-height:1.0;letter-spacing:-0.02em;text-shadow:0 6px 40px rgba(0,0,0,.7)}
  .txt span{color:#F2C46D}
  .sub{position:absolute;left:74px;top:440px;color:#E9ECF6;font-weight:600;font-size:40px;letter-spacing:.01em;text-shadow:0 3px 20px rgba(0,0,0,.8)}
  .line{position:absolute;left:74px;top:415px;width:260px;height:4px;background:#F2C46D;border-radius:2px}
  </style></head><body><div class="bg"></div><div class="shade"></div>
  <div class="txt">ОН СКУЧАЛ<br><span>ПО ТЕБЕ</span></div><div class="line"></div>
  <div class="sub">Последние дни Пророка ﷺ</div></body></html>`);
  await p.screenshot({ path: out, type: 'jpeg', quality: 92 });
  await b.close();
})();
