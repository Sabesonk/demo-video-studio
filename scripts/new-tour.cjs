#!/usr/bin/env node
// Start a video folder: the player, a starter tour.js, img/ and vo/.
//
//   node new-tour.cjs <dir> [--force]      (--force replaces the player but never an existing tour.js)
const fs = require('fs');
const path = require('path');
const { flag } = require('./_pw.cjs');

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--'));
if (!dir) { console.error('usage: new-tour.cjs <dir> [--force]'); process.exit(2); }
const SKILL = path.join(__dirname, '..');
const out = path.resolve(dir);
fs.mkdirSync(path.join(out, 'img'), { recursive: true });
fs.mkdirSync(path.join(out, 'vo'), { recursive: true });

const copy = (from, to, { keep } = {}) => {
  if (fs.existsSync(to) && (keep || !flag(args, 'force'))) { console.log(`kept     ${path.relative(process.cwd(), to)}`); return; }
  fs.copyFileSync(from, to);
  console.log(`wrote    ${path.relative(process.cwd(), to)}`);
};
copy(path.join(SKILL, 'assets/player/index.html'), path.join(out, 'index.html'));
copy(path.join(SKILL, 'assets/player/tour.js'), path.join(out, 'tour.js'), { keep: true });
copy(path.join(SKILL, 'assets/CREDITS.template.md'), path.join(out, 'CREDITS.md'), { keep: true });
console.log(`\nNext: capture screens into ${path.relative(process.cwd(), path.join(out, 'img'))}/, describe the video in tour.js, then open index.html.`);
