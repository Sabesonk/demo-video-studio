#!/usr/bin/env node
// Write the narration script, vo/lines.json, from tour.js: one line per beat with a caption, plus
// the title, each chapter name and the end card. `say` is what gets spoken; `cap` what is shown.
// tour.js stays the single source: edit a line there and run this again.
//
//   node lines.cjs <tour dir> [--no-chapters]        then: voiceover.mjs --lines <tour dir>/vo/lines.json
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { flag } = require('./_pw.cjs');

const args = process.argv.slice(2);
const dir = path.resolve(args.find(a => !a.startsWith('--')) || '.');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(dir, 'tour.js'), 'utf8'), sandbox);
const T = sandbox.window.TOUR;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const chapterSay = ch => { const v = (T.chapters || {})[ch]; return (v && typeof v === 'object' && v.say) || `${ch}.`; };

const lines = [];
const add = (id, say, cap) => { if (say) lines.push({ id, text: say.trim(), caption: (cap || say).trim() }); };
if (T.titleCard) add('title', T.titleCard.say || [T.titleCard.name, T.titleCard.line].filter(Boolean).join('. '));
const seen = new Set();
(T.beats || []).forEach((b, i) => {
  const prev = T.beats[i - 1];
  if (prev && prev.ch !== b.ch && !b.join && !flag(args, 'no-chapters')) add(`ch-${slug(b.ch || '')}`, chapterSay(b.ch), b.ch);
  const id = b.id || (b.img === 'WALL' ? 'wall' : b.img);
  if (seen.has(id)) console.warn(`warning: two beats share the id "${id}"; give one an "id"`);
  seen.add(id);
  if (b.cap) add(id, b.say || b.cap, b.cap);
});
if (T.endCard) add('end', T.endCard.say || [T.endCard.tag, T.endCard.tagEm].filter(Boolean).join(' '));

fs.mkdirSync(path.join(dir, 'vo'), { recursive: true });
fs.writeFileSync(path.join(dir, 'vo/lines.json'), `${JSON.stringify(lines, null, 2)}\n`);
const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
console.log(`${lines.length} lines, ${words} words (about ${(words / 135).toFixed(1)} min of speech at a slow 135 wpm) -> vo/lines.json`);
