const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const caps = JSON.parse(fs.readFileSync('captions.json'));
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (let i = 0; i < caps.length; i++) {
    const c = caps[i];
    const lines = c.lines.map((l, j) => `<div class="l${c.accent.includes(j) ? ' a' : ''}">${l}</div>`).join('');
    await p.setContent(`<html><body style="margin:0;background:transparent;width:1080px;height:1920px;display:flex;align-items:center;justify-content:center;">
    <div style="margin-top:-120px;text-align:center;font-family:'Inter Display','Inter',sans-serif;font-weight:800;color:#fff;font-size:${c.size}px;line-height:1.08;letter-spacing:-0.02em;text-shadow:0 6px 40px rgba(0,0,0,.65);padding:0 70px;">
    <style>.a,b{color:#FFB347}b{font-weight:800}</style>${lines}</div></body></html>`);
    await p.screenshot({ path: `caps/c${String(i).padStart(2,'0')}.png`, omitBackground: true });
  }
  await b.close();
})();
