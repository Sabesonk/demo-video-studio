#!/usr/bin/env node
// Measure typed text in real screenshots, so the player can "type" it: for each region, the field's
// background colour and the extent of every text line. Results go into img/manifest.(json|js) under
// <img>.text.<name>, which a beat uses as  type: [{ text: '<name>', at: .3 }].
//
//   node measure-text.cjs <img dir> spec.json
//   spec.json: { "prompt": { "img": "07-orch-filled", "box": [263, 248, 770, 76] }, ... }
//
// The box is the input's inner area (from h.box(locator) at capture time, minus padding). The
// background is sampled at its right edge, so keep that edge clear of text and icons.
const fs = require('fs');
const path = require('path');
const { launch } = require('../_pw.cjs');

const [dir, specFile] = process.argv.slice(2);
if (!dir || !specFile) { console.error('usage: measure-text.cjs <img dir> spec.json'); process.exit(2); }
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const MF = path.join(dir, 'manifest.json');
const manifest = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};

(async () => {
  const browser = await launch();
  const page = await browser.newPage();
  for (const [name, { img, box }] of Object.entries(spec)) {
    const data = `data:image/png;base64,${fs.readFileSync(path.join(dir, `${img}.png`)).toString('base64')}`;
    const m = await page.evaluate(async ([data, [x, y, w, h]]) => {
      const im = new Image(); im.src = data; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const d = g.getImageData(x, y, w, h).data;
      const px = (i, j) => { const o = (j * w + i) * 4; return [d[o], d[o + 1], d[o + 2]]; };
      const bg = px(w - 6, Math.floor(h / 2));
      const ink = a => Math.abs(a[0] - bg[0]) + Math.abs(a[1] - bg[1]) + Math.abs(a[2] - bg[2]) > 70;
      const rows = [];
      for (let j = 0; j < h; j++) { let a = -1, b = -1; for (let i = 0; i < w - 12; i++) if (ink(px(i, j))) { if (a < 0) a = i; b = i; } rows.push([a, b]); }
      const lines = []; let cur = null;
      rows.forEach(([a, b], j) => {
        if (a < 0) return;
        if (cur && j - cur.y1 <= 3) { cur.y1 = j; cur.x0 = Math.min(cur.x0, a); cur.x1 = Math.max(cur.x1, b); }
        else { cur = { y0: j, y1: j, x0: a, x1: b }; lines.push(cur); }
      });
      const hex = v => v.toString(16).padStart(2, '0');
      return { bg: `#${bg.map(hex).join('')}`, lines: lines.map(l => [x + l.x0, y + l.y0 - 1, l.x1 - l.x0 + 2, l.y1 - l.y0 + 3]) };
    }, [data, box]);
    manifest[img] = manifest[img] || { boxes: {} };
    manifest[img].text = { ...(manifest[img].text || {}), [name]: m };
    console.log(name, JSON.stringify(m));
  }
  await browser.close();
  fs.writeFileSync(MF, `${JSON.stringify(manifest, null, 1)}\n`);
  fs.writeFileSync(path.join(dir, 'manifest.js'), `window.SHOT_BOXES = ${JSON.stringify(manifest)};\n`);
})().catch(e => { console.error(e.message); process.exit(1); });
