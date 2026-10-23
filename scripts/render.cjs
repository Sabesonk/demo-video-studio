#!/usr/bin/env node
// Render a tour. Every frame is renderAt(t) in a headless browser, so a render is exact and repeatable.
//
//   node render.cjs <tour dir> stills [--out dir]          mid-beat and mid-transition stills + labelled contact sheets
//   node render.cjs <tour dir> frame <seconds> [--out f.jpg]
//   node render.cjs <tour dir> video [--out tour-silent.mp4] [--fps 30] [--workers 4] [--from s] [--to s] [--no-blur] [--no-captions] [--crf 18]
//
// Video: frames go to <tour>/.frames-<fps>/ and are kept, so a stopped render resumes where it
// stopped (delete the folder after changing tour.js). Workers are separate pages taking every n-th
// frame. Motion blur integrates sub-frames across the shutter only where something moves; holds
// cost one draw. Writes <out>.render.json (fps, blur, frames, seconds) for verify.cjs.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch, openTour, opt, flag, fmtTime } = require('./_pw.cjs');

const args = process.argv.slice(2);
const [dirArg, mode = 'stills', third] = args;
if (!dirArg) { console.error('usage: render.cjs <tour dir> stills|frame|video [options]'); process.exit(2); }
const dir = path.resolve(dirArg);
const FPS = Number(opt(args, 'fps', 30));
const BLUR = !flag(args, 'no-blur');
const CAPS = !flag(args, 'no-captions');   // for platforms that show captions.srt as closed captions

async function stills(browser) {
  const page = await openTour(browser, dir, { blur: true });
  const out = path.resolve(opt(args, 'out', path.join(dir, 'stills')));
  fs.mkdirSync(out, { recursive: true });
  const marks = await page.evaluate(() => {
    const T = window.__tour, m = [{ t: Math.min(1.8, T.T0 - .2), label: 'title' }];
    T.SEGS.forEach(s => {
      if (s.type === 'beat') m.push({ t: s.b.c0 + s.b.d * .6, label: `${s.b.id}`, cap: s.b.cap || '' });
      else m.push({ t: s.t0 + s.d * (s.type === 'chapter' ? .45 : .5), label: `${s.type} → ${s.to.id}`, cap: '' });
    });
    m.push({ t: T.DUR - 1.2, label: 'end' });
    return m;
  });
  const shots = [];
  for (const [n, m] of marks.entries()) {
    await page.evaluate(t => window.renderAt(t), m.t);
    const file = path.join(out, `s${String(n).padStart(3, '0')}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
    shots.push({ ...m, file });
  }
  // Contact sheets, 24 stills each, labelled with time and beat: one image to review a whole cut.
  const sheet = await browser.newPage({ viewport: { width: 1680, height: 1000 } });
  const pages = [];
  for (let i = 0; i < shots.length; i += 24) {
    const cells = shots.slice(i, i + 24).map((s, j) => `<figure><img src="data:image/jpeg;base64,${fs.readFileSync(s.file).toString('base64')}"><figcaption><b>${i + j} · ${fmtTime(s.t)}.${String(Math.floor((s.t % 1) * 10))}</b> ${s.label.replace(/</g, '&lt;')}</figcaption></figure>`).join('');
    await sheet.setContent(`<style>body{margin:12px;font:13px system-ui;background:#fff;color:#111;display:grid;grid-template-columns:repeat(4,1fr);gap:10px}figure{margin:0}img{width:100%;display:block;border:1px solid #ccc}figcaption{padding:3px 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}</style>${cells}`);
    const file = path.join(out, `sheet-${String(pages.length + 1).padStart(2, '0')}.png`);
    await sheet.screenshot({ path: file, fullPage: true });
    pages.push(file);
  }
  fs.writeFileSync(path.join(out, 'stills.json'), JSON.stringify(shots.map(({ file, ...s }) => ({ file: path.basename(file), ...s })), null, 1));
  console.log(`${shots.length} stills, ${pages.length} contact sheets in ${out}\n${pages.join('\n')}`);
}

async function video(browser) {
  const probe = await openTour(browser, dir, { blur: BLUR, captions: CAPS });
  const DUR = await probe.evaluate(() => window.TOUR_DURATION);
  await probe.close();
  const from = Math.round(Number(opt(args, 'from', 0)) * FPS), to = Math.min(Math.round(Number(opt(args, 'to', DUR)) * FPS), Math.round(DUR * FPS));
  const frames = path.join(dir, `.frames-${FPS}${BLUR ? '' : '-sharp'}${CAPS ? '' : '-nocap'}`);
  fs.mkdirSync(frames, { recursive: true });
  const name = i => path.join(frames, `f${String(i).padStart(5, '0')}.jpg`);
  const todo = [];
  for (let i = from; i < to; i++) if (!fs.existsSync(name(i)) || fs.statSync(name(i)).size === 0) todo.push(i);
  const workers = Math.max(1, Math.min(Number(opt(args, 'workers', Math.max(1, Math.min(6, os.cpus().length - 2)))), todo.length || 1));
  console.log(`duration ${fmtTime(DUR)}, frames ${from}-${to - 1} at ${FPS} fps: ${todo.length} to render (${to - from - todo.length} kept), ${workers} workers, blur ${BLUR ? 'on' : 'off'}`);
  const started = Date.now();
  let done = 0;
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    let page = await openTour(browser, dir, { blur: BLUR, captions: CAPS });
    for (let k = w; k < todo.length; k += workers) {
      const i = todo[k];
      for (let attempt = 1; ; attempt++) {
        try {
          await page.evaluate(t => window.renderAt(t), i / FPS);
          await page.screenshot({ path: name(i), type: 'jpeg', quality: 95, timeout: 60000 });
          break;
        } catch (e) {
          console.log(`frame ${i}, attempt ${attempt}: ${e.message.split('\n')[0]}`);
          if (attempt >= 4) throw e;
          await page.close().catch(() => {});
          page = await openTour(browser, dir, { blur: BLUR, captions: CAPS });
        }
      }
      if (++done % 300 === 0) {
        const rate = done / ((Date.now() - started) / 1000);
        console.log(`  ${done}/${todo.length} frames, ${rate.toFixed(1)}/s, about ${fmtTime((todo.length - done) / rate)} left`);
      }
    }
    await page.close();
  }));
  const out = path.resolve(opt(args, 'out', path.join(dir, 'tour-silent.mp4')));
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(FPS), '-start_number', String(from), '-i', path.join(frames, 'f%05d.jpg'), '-frames:v', String(to - from),
    // Screenshots are full-range JPEG; convert to the limited-range BT.709 every player expects.
    '-vf', 'scale=in_range=pc:in_color_matrix=bt601:out_range=tv:out_color_matrix=bt709,format=yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', opt(args, 'crf', '18'), '-movflags', '+faststart', out], { stdio: 'inherit' });
  const seconds = Math.round((Date.now() - started) / 1000);
  fs.writeFileSync(out.replace(/\.mp4$/, '.render.json'), JSON.stringify({ fps: FPS, blur: BLUR, shutter: BLUR ? 'from tour timing.shutter' : 0, from: from / FPS, to: to / FPS, frames: to - from, workers, seconds, duration: DUR }, null, 1));
  console.log(`wrote ${out} (${to - from} frames, rendered in ${fmtTime(seconds)})`);
}

(async () => {
  const browser = await launch();
  if (mode === 'stills') await stills(browser);
  else if (mode === 'frame') {
    const page = await openTour(browser, dir, { blur: BLUR, captions: CAPS });
    const t = Number(third || 2);
    await page.evaluate(t => window.renderAt(t), t);
    const out = path.resolve(opt(args, 'out', path.join(dir, `frame-${t}.jpg`)));
    await page.screenshot({ path: out, type: 'jpeg', quality: 90 });
    console.log(`wrote ${out}`);
  } else if (mode === 'video') await video(browser);
  else throw new Error(`unknown mode ${mode}`);
  await browser.close();
})().catch(e => { console.error('RENDER FAILED', e.message); process.exit(1); });
