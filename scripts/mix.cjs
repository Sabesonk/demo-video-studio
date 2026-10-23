#!/usr/bin/env node
// The soundtrack, from the tour's own schedule: every narration line placed where the player starts
// it, an optional music bed fitted to the length and ducked under the voice, mastered to -16 LUFS.
//
//   node mix.cjs <tour dir> [--music track.mp3] [--bed -27] [--fit auto|tempo|loop|trim]
//                           [--video silent.mp4 --out final.mp4]
//
// Writes <tour>/vo/narration.m4a (voice only) and, with --music, <tour>/vo/mix.m4a. With --video,
// muxes the soundtrack onto the rendered picture. Re-run after any retiming: nothing is placed by hand.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { launch, openTour, ffprobeDuration, loudness, normalize, opt, flag, fmtTime } = require('./_pw.cjs');

const args = process.argv.slice(2);
const dir = path.resolve(args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--')) || '.');
const VO = path.join(dir, 'vo');
const run = a => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });

(async () => {
  const browser = await launch();
  const page = await openTour(browser, dir, { blur: false });
  const { sched, DUR, END_CARD } = await page.evaluate(() => ({ sched: window.__tour.VO_SCHEDULE, DUR: window.__tour.DUR, END_CARD: window.__tour.END_CARD }));
  await browser.close();
  const tmp = fs.mkdtempSync(path.join(VO, '.mix-'));

  // 1. Narration: each clip at its start time.
  let narration = null;
  if (sched.length) {
    const dur = JSON.parse(fs.readFileSync(path.join(VO, 'durations.json'), 'utf8'));
    let overlaps = 0;
    sched.forEach((s, i) => {
      const n = sched[i + 1];
      if (n && s.t + dur[s.id] > n.t - .15) { overlaps++; console.log(`overlap: ${s.id} ends ${(s.t + dur[s.id]).toFixed(2)} s, ${n.id} starts ${n.t.toFixed(2)} s`); }
    });
    const a = [];
    sched.forEach(s => a.push('-i', path.join(VO, `${s.id}.mp3`)));
    const parts = sched.map((s, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round(s.t * 1000)}:all=1[a${i}]`);
    const mixf = `${sched.map((_, i) => `[a${i}]`).join('')}amix=inputs=${sched.length}:normalize=0:dropout_transition=0,apad,atrim=0:${DUR.toFixed(3)}[out]`;
    const pre = path.join(tmp, 'narration.wav');
    run([...a, '-filter_complex', [...parts, mixf].join(';'), '-map', '[out]', pre]);
    narration = path.join(VO, 'narration.m4a');
    normalize(pre, narration);
    console.log(`narration: ${sched.length} lines, ${overlaps} overlaps -> ${path.relative(process.cwd(), narration)}`);
  }

  // 2. Music bed: level, fit, fades, ducked under the voice.
  let soundtrack = narration;
  const music = opt(args, 'music');
  if (music) {
    const bed = Number(opt(args, 'bed', -27));                 // music level before ducking, LUFS
    const len = ffprobeDuration(music), ratio = len / DUR, I = loudness(music).I;
    let fit = opt(args, 'fit', 'auto');
    if (fit === 'auto') fit = ratio >= .97 && ratio <= 1.03 ? 'tempo' : ratio < 1 ? 'loop' : 'trim';
    const fadeOut = Math.min(3, Math.max(1.5, END_CARD * .6));
    const chain = [`aresample=48000`, 'aformat=channel_layouts=stereo'];
    if (fit === 'tempo') chain.push(`atempo=${ratio.toFixed(5)}`);   // pitch kept; ends exactly with the video
    chain.push(`volume=${(bed - I).toFixed(1)}dB`, 'afade=in:st=0:d=1.5', 'apad', `atrim=0:${DUR.toFixed(3)}`, `afade=out:st=${(DUR - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(2)}`);
    const inputs = [...(fit === 'loop' ? ['-stream_loop', '-1'] : []), '-i', music];
    const pre = path.join(tmp, 'mix.wav');
    if (narration) {
      inputs.push('-i', narration);
      const g = `[0:a]${chain.join(',')}[m];[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit[key][voice];`
        + (flag(args, 'no-duck') ? '[m]anull[duck];' : '[m][key]sidechaincompress=threshold=0.04:ratio=4:knee=4:attack=20:release=450:makeup=1[duck];')
        + '[duck][voice]amix=inputs=2:normalize=0:duration=first[out]';
      run([...inputs, '-filter_complex', g, '-map', '[out]', '-t', DUR.toFixed(3), pre]);
    } else run([...inputs, '-af', chain.join(','), '-t', DUR.toFixed(3), pre]);
    soundtrack = path.join(VO, 'mix.m4a');
    normalize(pre, soundtrack);
    console.log(`music: ${path.basename(music)} ${fmtTime(len)} (${I} LUFS) -> bed ${bed} LUFS, fit ${fit}${fit === 'tempo' ? ` x${ratio.toFixed(4)}` : ''}, ${flag(args, 'no-duck') ? 'no ducking' : 'ducked under the voice'}`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!soundtrack) { console.log('nothing to mix: no narration (vo/vo-data.js) and no --music'); return; }
  const L = loudness(soundtrack);
  console.log(`soundtrack: ${path.relative(process.cwd(), soundtrack)}  ${L.I} LUFS, true peak ${L.TP} dBTP, ${fmtTime(ffprobeDuration(soundtrack))} for a ${fmtTime(DUR)} video`);

  // 3. Onto the picture.
  const video = opt(args, 'video');
  if (video) {
    const out = path.resolve(opt(args, 'out', video.replace(/(-silent)?\.mp4$/, '-final.mp4')));
    run(['-i', video, '-i', soundtrack, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
    console.log(`wrote ${path.relative(process.cwd(), out)}`);
  }
})().catch(e => { console.error('MIX FAILED', e.message); process.exit(1); });
