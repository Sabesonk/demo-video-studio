#!/usr/bin/env node
// The QA oracle: checks a cut the way a reviewer would, before a person has to watch it.
//
//   node verify.cjs <tour dir> [--video final.mp4] [--min-text 18] [--fps 30]
//
// Legs (PASS / WARN / FAIL; any FAIL fails the verdict and exits 1):
//   plan        the tour loads; boxes resolve; screenshots are 1920x1080
//   narration   every line has audio, none overlap, none runs past its beat; pace; stale or draft voice
//   cadence     hold lengths vary (equal holds read as a slideshow); chapter balance
//   captions    at most two lines; reading speed at most 20 characters a second
//   framing     focus rings and click targets stay in frame and out from under the caption
//   legibility  on-screen size of the app's text in beats that point at details
//   motion      fastest on-screen move in px/frame; FAIL if fast moves were rendered without blur
//   film        (--video) size, frame rate and length match the tour; no black frames
//   audio       (--video) -16 LUFS +-2, true peak <= -1 dBTP, music at least 8 dB under the voice
//   credits     music and voice credits on the end card and in CREDITS.md
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch, openTour, ffmpegLog, loudness, opt, fmtTime } = require('./_pw.cjs');

const args = process.argv.slice(2);
const dir = path.resolve(args[0] && !args[0].startsWith('--') ? args[0] : '.');
const VIDEO = opt(args, 'video');
const MIN_TEXT = Number(opt(args, 'min-text', 18));
const FPS = Number(opt(args, 'fps', 30));
const results = [];
const leg = (name, state, detail, fix) => { results.push({ name, state, detail, fix }); };
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const pngSize = f => { const b = Buffer.alloc(24); const fd = fs.openSync(f, 'r'); fs.readSync(fd, b, 0, 24, 0); fs.closeSync(fd); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
const inter = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

(async () => {
  const browser = await launch();
  let page;
  try { page = await openTour(browser, dir, { blur: false }); }
  catch (e) { leg('plan', 'FAIL', e.message.split('\n')[0], 'Fix tour.js / img/manifest.js so the player loads (open index.html to see the error).'); return report(browser); }

  const P = await page.evaluate(() => {
    const T = window.__tour;
    return {
      DUR: T.DUR, T0: T.T0, END: T.END, HAS_END: T.HAS_END, endCredits: T.endCredits, shutter: T.T.shutter,
      beats: T.BEATS.map(b => ({ id: b.id, img: b.img, ch: b.ch, cap: b.cap || '', vo: b.vo, d: b.d, t0: b.t0, c0: b.c0, t1: b.t1, zout: b.zout, join: !!b.join, voSpan: !!b.voSpan,
        s: Math.min(b.F[0][2], b.F[1][2]), detail: b.focus.length > 0 || !!b.click || b.type.length > 0, click: b.click ? { at: b.click.at } : null })),
      captions: T.CAPTIONS, chapters: T.CHAPTERS, sched: T.VO_SCHEDULE.map(s => ({ ...s, text: T.voText(s.id) })),
      shots: T.shots, images: [...new Set(T.BEATS.map(b => b.img).filter(i => i && i !== 'WALL'))],
    };
  });

  // plan
  const badSize = P.images.filter(i => { try { const [w, h] = pngSize(path.join(dir, 'img', `${i}.png`)); return w !== 1920 || h !== 1080; } catch { return true; } });
  leg('plan', badSize.length ? 'WARN' : 'PASS', `${P.beats.length} beats, ${new Set(P.beats.map(b => b.ch)).size} chapters, ${fmtTime(P.DUR)}${badSize.length ? `; not 1920x1080: ${badSize.join(', ')}` : ''}`,
    badSize.length ? 'Capture at a 1920x1080 viewport with deviceScaleFactor 1, or the camera framing will be off.' : '');

  // narration
  const voDir = path.join(dir, 'vo');
  const dur = fs.existsSync(path.join(voDir, 'durations.json')) ? JSON.parse(fs.readFileSync(path.join(voDir, 'durations.json'), 'utf8')) : {};
  if (!P.sched.length) leg('narration', 'PASS', 'none: a captions-only cut (lines.cjs + voiceover.mjs add a voice)', '');
  else {
    const missing = P.sched.filter(s => !fs.existsSync(path.join(voDir, `${s.id}.mp3`))).map(s => s.id);
    const overlaps = P.sched.filter((s, i) => P.sched[i + 1] && s.t + (dur[s.id] || 0) > P.sched[i + 1].t - .15).map(s => s.id);
    const late = P.beats.filter(b => b.vo && !b.voSpan && P.sched.find(s => s.id === b.vo).t + (dur[b.vo] || 0) > b.t1 - b.zout * .5 + .05).map(b => b.id);
    const speech = P.sched.reduce((a, s) => a + (dur[s.id] || 0), 0);
    const words = P.sched.reduce((n, s) => n + String(s.text || '').split(/\s+/).length, 0);
    const wpm = speech ? Math.round(words / speech * 60) : 0;
    const state = fs.existsSync(path.join(voDir, '.voiced.json')) ? JSON.parse(fs.readFileSync(path.join(voDir, '.voiced.json'), 'utf8')) : {};
    const draft = Object.values(state).some(v => v.engine === 'say');
    let stale = [];
    if (fs.existsSync(path.join(voDir, 'lines.json'))) {
      const lines = JSON.parse(fs.readFileSync(path.join(voDir, 'lines.json'), 'utf8'));
      stale = lines.filter(l => { const s = P.sched.find(x => x.id === l.id); return !s || s.text !== (l.caption || l.text); }).map(l => l.id);
    }
    const fail = missing.length || overlaps.length;
    leg('narration', fail ? 'FAIL' : late.length || draft || stale.length || wpm > 160 ? 'WARN' : 'PASS',
      `${P.sched.length} lines, ${speech.toFixed(0)} s of speech, ${wpm} wpm${missing.length ? `; missing audio: ${missing.join(', ')}` : ''}${overlaps.length ? `; overlaps after: ${overlaps.join(', ')}` : ''}`
      + `${late.length ? `; runs past its beat: ${late.join(', ')}` : ''}${stale.length ? `; not re-voiced since edited: ${stale.slice(0, 6).join(', ')}` : ''}${draft ? '; draft voice (macOS say)' : ''}`,
      fail ? 'Run voiceover.mjs again (it voices missing lines), then mix.cjs.' : stale.length ? 'Run voiceover.mjs to re-voice edited lines.' : draft ? 'Voice it with ElevenLabs before delivery.' : late.length ? 'Give those beats a larger d, or remove voSpan.' : '');
  }

  // cadence
  const holds = P.beats.map(b => b.d);
  const mean = holds.reduce((a, b) => a + b, 0) / holds.length;
  const cv = Math.sqrt(holds.reduce((a, b) => a + (b - mean) ** 2, 0) / holds.length) / mean;
  const chapterLens = P.chapters.slice(1, -1).map(c => c.end - c.t);
  leg('cadence', holds.length >= 6 && cv < .2 ? 'WARN' : 'PASS', `holds ${Math.min(...holds).toFixed(1)}-${Math.max(...holds).toFixed(1)} s, variation ${cv.toFixed(2)} (want >= 0.20); chapters ${chapterLens.map(x => Math.round(x)).join('/')} s`,
    cv < .2 ? 'Equal holds read as a slideshow: vary the line lengths, join quick states, give the key moment a longer hold.' : '');

  // captions, framing: sample the real rendered frame
  const longCaps = [], fastCaps = [], offFrame = [], tooBig = [], covered = [], cursorBad = [];
  for (const [a, z, text] of P.captions) {
    if (text.length / Math.max(.1, z - a) > 20) fastCaps.push(text.slice(0, 40));
  }
  for (const b of P.beats) {
    const times = [0, .25, .5, .75, 1].map(k => b.c0 + .35 + k * Math.max(0, (b.t1 - b.zout - .15) - (b.c0 + .35)));
    if (b.click) times.push(b.c0 + b.click.at);
    for (const t of times) {
      const f = await page.evaluate(t => {
        window.renderAt(t);
        const el = document.getElementById('caption'), r = el.getBoundingClientRect(), op = Number(getComputedStyle(el).opacity);
        const lines = Math.round(el.querySelector('.text').getBoundingClientRect().height / (38 * 1.22));
        const sc = window.__tour.sceneAt(t);
        let cursor = null;
        if (sc.cursor && sc.cursor.since >= 0 && sc.cursor.since < .3) {
          const [cx, cy, s] = sc.cursor.cam;
          cursor = { x: (sc.cursor.pos[0] - cx) * s + 960, y: (sc.cursor.pos[1] - cy) * s + 540 };
        }
        return { cap: op > .5 ? { x: r.x, y: r.y, w: r.width, h: r.height, lines } : null, rings: window.__tour.ringsAt(t).filter(x => x.al > .5), cursor };
      }, t);
      if (f.cap && f.cap.lines > 2 && !longCaps.includes(b.id)) longCaps.push(b.id);
      for (const r of f.rings) {
        const big = r.w > 1900 || r.h > 1060;
        if (big && !tooBig.includes(b.id)) tooBig.push(b.id);
        if (!big && (r.x < -6 || r.y < -6 || r.x + r.w > 1926 || r.y + r.h > 1086) && !offFrame.includes(b.id)) offFrame.push(b.id);
        if (f.cap && inter(r, f.cap) > .15 * r.w * r.h && !covered.includes(b.id)) covered.push(b.id);
      }
      if (f.cursor) {
        const out = f.cursor.x < 0 || f.cursor.y < 0 || f.cursor.x > 1920 || f.cursor.y > 1080;
        const under = f.cap && f.cursor.x > f.cap.x && f.cursor.x < f.cap.x + f.cap.w && f.cursor.y > f.cap.y && f.cursor.y < f.cap.y + f.cap.h;
        if ((out || under) && !cursorBad.includes(b.id)) cursorBad.push(b.id);
      }
    }
  }
  leg('captions', longCaps.length ? 'FAIL' : fastCaps.length ? 'WARN' : 'PASS',
    `${P.captions.length} captions${longCaps.length ? `; more than two lines: ${longCaps.join(', ')}` : ''}${fastCaps.length ? `; faster than 20 chars/s: ${fastCaps.length}` : ''}`,
    longCaps.length ? 'Shorten the line (one idea per beat), or split the beat.' : fastCaps.length ? 'Give those beats a larger d, or shorten the caption.' : '');
  const frameBad = offFrame.length || tooBig.length || covered.length || cursorBad.length;
  leg('framing', frameBad ? 'FAIL' : 'PASS',
    frameBad ? [tooBig.length && `ring wider or taller than the frame at this zoom: ${tooBig.join(', ')}`, offFrame.length && `ring partly out of frame: ${offFrame.join(', ')}`,
      covered.length && `caption covers the ring: ${covered.join(', ')}`, cursorBad.length && `click hidden or off frame: ${cursorBad.join(', ')}`].filter(Boolean).join('; ') : 'rings and clicks in frame and clear of the caption',
    frameBad ? [tooBig.length && 'Lower that beat\'s zoom (cam s) or ring a smaller box.', (offFrame.length || covered.length || cursorBad.length) && 'Move the camera (cam) so the subject sits above the caption, or set capTop: true; check the box in img/manifest.js.'].filter(Boolean).join(' ') : '');

  // legibility
  const small = P.beats.filter(b => b.detail && b.img !== 'WALL').map(b => ({ id: b.id, px: ((P.shots[b.img] || {}).fontPx || 14) * b.s })).filter(x => x.px < MIN_TEXT);
  leg('legibility', small.length ? 'WARN' : 'PASS', small.length ? `app text under ${MIN_TEXT} px on screen: ${small.map(x => `${x.id} ${x.px.toFixed(1)}px`).join(', ')}` : `app text at least ${MIN_TEXT} px in every detail beat`,
    small.length ? 'Zoom in further on those beats (cam zoom 1.3-1.7), or point at a larger element.' : '');

  // motion: the fastest thing on screen, per frame
  const peak = await page.evaluate(({ DUR, FPS }) => {
    let best = { px: 0, t: 0 };
    for (let t = 0; t < DUR - 1 / FPS; t += 1 / FPS) {
      const d = window.__tour.motionBetween(t, t + 1 / FPS);
      if (d > best.px) best = { px: d, t };
    }
    return best;
  }, { DUR: P.DUR, FPS });
  const infoFile = [VIDEO && /\.mp4$/.test(VIDEO) && VIDEO.replace(/\.mp4$/, '.render.json'), VIDEO && /-final\.mp4$/.test(VIDEO) && VIDEO.replace(/-final\.mp4$/, '-silent.render.json'),
    path.join(dir, 'tour-silent.render.json')].find(f => f && f.endsWith('.render.json') && fs.existsSync(f));
  const renderInfo = infoFile ? JSON.parse(fs.readFileSync(infoFile, 'utf8')) : null;
  const sharp = renderInfo && renderInfo.blur === false;
  leg('motion', peak.px > 80 && sharp ? 'FAIL' : 'PASS', `fastest move ${peak.px.toFixed(0)} px/frame at ${fmtTime(peak.t)} (${peak.t.toFixed(1)} s); ${renderInfo ? (sharp ? 'rendered without blur' : 'rendered with motion blur') : 'no render yet'}`,
    peak.px > 80 && sharp ? 'Render without --no-blur: fast moves strobe as separate copies.' : '');
  await page.close();

  if (VIDEO) {
    // film
    const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height,r_frame_rate', '-show_entries', 'format=duration', '-of', 'json', VIDEO]).toString());
    const v = info.streams.find(s => s.codec_type === 'video'), a = info.streams.find(s => s.codec_type === 'audio');
    const len = Number(info.format.duration), [n, d] = v.r_frame_rate.split('/').map(Number);
    const black = [...ffmpegLog(['-i', VIDEO, '-an', '-vf', 'blackdetect=d=0.25:pic_th=0.98', '-f', 'null', '-']).matchAll(/black_start:([\d.]+)/g)].map(m => Number(m[1]));
    const problems = [v.width !== 1920 || v.height !== 1080 ? `${v.width}x${v.height}` : '', Math.abs(len - P.DUR) > .25 ? `length ${len.toFixed(2)} s vs tour ${P.DUR.toFixed(2)} s` : '',
      black.length ? `black frames at ${black.map(x => x.toFixed(1)).join(', ')} s` : ''].filter(Boolean);
    leg('film', problems.length ? 'FAIL' : 'PASS', `${v.width}x${v.height}, ${(n / d).toFixed(0)} fps, ${fmtTime(len)}${a ? ', with sound' : ', silent'}${problems.length ? `; ${problems.join('; ')}` : ''}`,
      problems.length ? 'Re-render (delete the .frames folder if tour.js changed), then mix again.' : '');

    // audio
    if (a) {
      const L = loudness(VIDEO);
      const log = ffmpegLog(['-i', VIDEO, '-vn', '-af', 'ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.M', '-f', 'null', '-']);
      const M = []; let tNow = 0;
      for (const line of log.split('\n')) {
        const tm = line.match(/pts_time:([\d.]+)/); if (tm) { tNow = Number(tm[1]); continue; }
        const mm = line.match(/lavfi\.r128\.M=(-?[\d.]+)/); if (mm) M.push([tNow, Number(mm[1])]);
      }
      const speaking = t => P.sched.some(s => t >= s.t - .3 && t <= s.t + (dur[s.id] || 0) + .5);
      const inSpeech = M.filter(([t]) => P.sched.some(s => t >= s.t + .3 && t <= s.t + (dur[s.id] || 0) - .2)).map(x => x[1]);
      const inGaps = M.filter(([t]) => t > 2 && t < len - 3 && !speaking(t)).map(x => x[1]);
      const sp = median(inSpeech), gp = median(inGaps);
      const music = gp !== null && gp > -45;
      const gap = sp !== null && music ? sp - gp : null;
      const st = L.TP > -1 ? 'FAIL' : gap !== null && gap < 5 ? 'FAIL' : Math.abs(L.I + 16) > 2 || (gap !== null && gap < 8) ? 'WARN' : 'PASS';
      leg('audio', st, `${L.I} LUFS, true peak ${L.TP} dBTP${music ? `, voice ${gap !== null ? gap.toFixed(1) : '?'} dB over the music` : ', no music bed'}`,
        st === 'PASS' ? '' : L.TP > -1 ? 'Re-run mix.cjs (it limits the true peak to -1.5 dBTP).' : gap !== null && gap < 8 ? 'Lower the music: mix.cjs --bed -30.' : 'Re-run mix.cjs (it masters to -16 LUFS).');
    } else if (!P.sched.length && !fs.existsSync(path.join(voDir, 'mix.m4a'))) leg('audio', 'PASS', 'silent video: no narration or music was made', '');
    else leg('audio', 'WARN', 'the video has no sound track', 'Mux the soundtrack: mix.cjs <tour> --video <silent.mp4> --out <final.mp4>.');
  }

  // credits
  const voiced = fs.existsSync(path.join(voDir, '.voiced.json')) && Object.values(JSON.parse(fs.readFileSync(path.join(voDir, '.voiced.json'), 'utf8'))).some(v => v.engine === 'elevenlabs');
  const mixed = fs.existsSync(path.join(voDir, 'mix.m4a'));
  if (voiced || mixed) {
    const credits = fs.existsSync(path.join(dir, 'CREDITS.md')) ? fs.readFileSync(path.join(dir, 'CREDITS.md'), 'utf8') : '';
    const todo = !credits || /<[A-Z ]+>|TODO/.test(credits);
    leg('credits', todo || (P.HAS_END && !P.endCredits) ? 'WARN' : 'PASS',
      `${credits ? (todo ? 'CREDITS.md has placeholders' : 'CREDITS.md filled in') : 'no CREDITS.md'}; end card credits ${P.endCredits ? 'present' : 'missing'}`,
      'Write who made the music and voice, under which licence, in CREDITS.md and endCard.credits (CC BY needs the credit line; a free ElevenLabs plan needs attribution and is non-commercial).');
  }
  return report(browser);
})().catch(e => { console.error('VERIFY FAILED TO RUN', e.message); process.exit(2); });

async function report(browser) {
  await browser.close();
  console.log(`\nverify ${path.relative(process.cwd(), dir) || '.'}${VIDEO ? ` + ${path.basename(VIDEO)}` : ''}\n`);
  for (const r of results) {
    console.log(`  ${r.state.padEnd(4)}  ${r.name.padEnd(10)} ${r.detail}`);
    if (r.fix && r.state !== 'PASS') console.log(`  ${''.padEnd(16)}-> ${r.fix}`);
  }
  const fails = results.filter(r => r.state === 'FAIL').length, warns = results.filter(r => r.state === 'WARN').length;
  console.log(`\nVERDICT: ${fails ? 'FAIL' : 'PASS'} (${fails} fail, ${warns} warn)`);
  process.exit(fails ? 1 : 0);
}
