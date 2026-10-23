#!/usr/bin/env node
// Text that ships with the video, from the tour's own timeline: captions.srt (closed captions),
// chapters.txt (for a YouTube description or a player) and voiceover-script.md (lines, start
// times, lengths: for review and re-recording).
//
//   node export-text.cjs <tour dir>
const fs = require('fs');
const path = require('path');
const { launch, openTour, fmtTime } = require('./_pw.cjs');

const dir = path.resolve(process.argv[2] || '.');
const srtTime = s => { const ms = Math.round(s * 1000); const p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };

(async () => {
  const browser = await launch();
  const page = await openTour(browser, dir, { blur: false });
  const T = await page.evaluate(() => {
    const t = window.__tour;
    return { DUR: t.DUR, CAPTIONS: t.CAPTIONS, CHAPTERS: t.CHAPTERS, SCHED: t.VO_SCHEDULE.map(s => ({ ...s, text: t.voText(s.id) })) };
  });
  await browser.close();

  // Closed captions cover all speech: the beats' captions plus lines spoken over the title card,
  // chapter bumpers and end card, which have no on-screen caption of their own.
  const durFile = path.join(dir, 'vo/durations.json');
  const dur = fs.existsSync(durFile) ? JSON.parse(fs.readFileSync(durFile, 'utf8')) : {};
  const cues = T.CAPTIONS.map(([a, z, text]) => [a, z, text]);
  for (const s of T.SCHED) {
    if (s.text && !cues.some(([a, z]) => s.t >= a - .2 && s.t <= z)) cues.push([s.t, s.t + (dur[s.id] || 2) + .3, s.text]);
  }
  cues.sort((x, y) => x[0] - y[0]);
  const srt = cues.map(([a, z, text], n) => `${n + 1}\n${srtTime(a)} --> ${srtTime(z)}\n${text}\n`).join('\n');
  fs.writeFileSync(path.join(dir, 'captions.srt'), srt);

  const chapters = [];
  for (const c of T.CHAPTERS.slice(0, -1)) if (!chapters.length || chapters[chapters.length - 1].title !== c.title) chapters.push(c);
  fs.writeFileSync(path.join(dir, 'chapters.txt'), `${chapters.map(c => `${fmtTime(c.t)} ${c.title}`).join('\n')}\n`);

  const rows = T.SCHED.map(s => `| ${fmtTime(s.t)} | ${s.id.startsWith('ch-') ? `**${s.text}**` : s.text} | ${(dur[s.id] || 0).toFixed(1)} s |`);
  const speech = Object.values(dur).reduce((a, b) => a + b, 0);
  const words = T.SCHED.reduce((n, s) => n + String(s.text || '').split(/\s+/).length, 0);
  if (T.SCHED.length) fs.writeFileSync(path.join(dir, 'voiceover-script.md'), `# Voiceover script\n\n${T.SCHED.length} lines, ${words} words, ${speech.toFixed(0)} s of speech`
    + `${speech ? ` (about ${Math.round(words / speech * 60)} words per minute)` : ''} in a ${fmtTime(T.DUR)} video. `
    + 'To change a line, edit tour.js, then run lines.cjs, voiceover.mjs (it re-voices only changed lines), mix.cjs and render.cjs.\n\n'
    + `| Starts | Narration | Length |\n|---|---|---|\n${rows.join('\n')}\n`);
  console.log(`captions.srt (${cues.length} captions), chapters.txt (${chapters.length}), ${T.SCHED.length ? `voiceover-script.md (${T.SCHED.length} lines)` : "no narration"} in ${dir}`);
})().catch(e => { console.error(e.message); process.exit(1); });
