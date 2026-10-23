#!/usr/bin/env node
// Compose instrumental music that follows the video's chapters, with ElevenLabs Music (paid plans only).
//
//   node --env-file=<env file> music-compose.mjs --tour <tour dir> --plan music/plan.json --out music/score.mp3
//        [--styles "modern corporate technology,soft piano,warm synth pads,optimistic"] [--plan-only]
//   node --env-file=<env file> music-compose.mjs --plan music/plan.json --out music/score.mp3
//
// With --tour, writes a plan with one section per chapter (each 3-120 s, at most 30), timed from the
// tour, then composes it. Edit the plan's section texts to shape the arc and run again without --tour.
// Plan format (see assets/music-plan.example.json): { chunks: [{ text, durationMs, positiveStyles,
// negativeStyles, contextAdherence }] }. The key comes from ELEVENLABS_API_KEY.
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const planPath = resolve(opt('plan', 'music/plan.json'));
const NEGATIVE = ['vocals', 'lyrics', 'singing', 'choir', 'heavy drums', 'distorted guitar', 'aggressive', 'dramatic orchestral hits', 'dark'];

if (opt('tour')) {
  const { launch, openTour } = require('./_pw.cjs');
  const browser = await launch();
  const page = await openTour(browser, opt('tour'), { blur: false });
  const chapters = await page.evaluate(() => window.__tour.CHAPTERS.map(c => ({ title: c.title, t: c.t, end: c.end })));
  await browser.close();
  const styles = opt('styles', 'instrumental,modern corporate technology,ambient electronic,soft piano,warm synth pads,optimistic,clean modern production').split(',').map(s => s.trim());
  // Merge chapters shorter than 3 s into the next; split any longer than 120 s.
  const parts = [];
  for (const c of chapters) {
    const last = parts[parts.length - 1];
    if (last && last.end - last.t < 3) { last.end = c.end; last.title += ` / ${c.title}`; } else parts.push({ ...c });
  }
  const chunks = [];
  parts.forEach((c, n) => {
    let ms = Math.round((c.end - c.t) * 1000);
    const role = n === 0 ? 'Intro: soft and welcoming, slowly opening up' : n === parts.length - 1 ? 'Outro: resolve warmly, then a gentle final cadence' : 'Steady and confident, light pulse, leaves room for a voice';
    while (ms > 0) {
      const d = Math.min(ms, 120000);
      chunks.push({ text: `[${c.title}]\n${role}`, durationMs: Math.max(3000, d), positiveStyles: styles, negativeStyles: NEGATIVE, contextAdherence: 'high' });
      ms -= d;
    }
  });
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, `${JSON.stringify({ chunks: chunks.slice(0, 30) }, null, 2)}\n`);
  console.log(`plan: ${chunks.length} sections -> ${planPath}`);
  if (args.includes('--plan-only')) process.exit(0);
}

if (!existsSync(planPath)) { console.error(`no plan at ${planPath}`); process.exit(2); }
if (!process.env.ELEVENLABS_API_KEY) { console.error('ELEVENLABS_API_KEY is not set: run with node --env-file=<env file>.'); process.exit(2); }
const snake = v => Array.isArray(v) ? v.map(snake) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`), snake(x)])) : v;
const plan = JSON.parse(readFileSync(planPath, 'utf8'));
const total = plan.chunks.reduce((s, c) => s + (c.durationMs || c.duration_ms), 0);
console.log(`composing ${plan.chunks.length} sections, ${(total / 1000).toFixed(1)} s ...`);
const res = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
  method: 'POST',
  headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
  body: JSON.stringify({ composition_plan: snake(plan), model_id: opt('model', 'music_v2_5') }),
});
if (!res.ok) {
  const why = res.status === 402 ? ' (Music needs a paid ElevenLabs plan: use find-music.py for an openly licensed track instead)' : '';
  console.error(`ElevenLabs Music -> ${res.status}${why}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const out = resolve(opt('out', 'music/score.mp3'));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, Buffer.from(await res.arrayBuffer()));
console.log(`wrote ${out}`);
