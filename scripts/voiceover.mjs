#!/usr/bin/env node
// Narration: one audio file per line, each line's length, and vo-data.js for the player.
//
//   node --env-file=<env file> voiceover.mjs --lines vo/lines.json [--out vo] [--voice <id>] [--model eleven_v4]
//   node --env-file=<env file> voiceover.mjs --list-voices
//   node --env-file=<env file> voiceover.mjs --audition "A line from the script." --voices <id>,<id>,... --out vo/audition
//   node voiceover.mjs --lines vo/lines.json --engine say       (macOS draft voice: free, for timing only)
//
// ElevenLabs reads ELEVENLABS_API_KEY from the environment; pass the env file with --env-file so the
// key never appears in code, on the command line or in output. Lines are re-voiced only when their
// text, voice, model or settings change (.voiced.json), which saves credits; --force re-voices all.
// Neighbouring lines go along as context (previous_text / next_text), so tone carries across cuts.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const has = name => args.includes(`--${name}`);
const API = 'https://api.elevenlabs.io';
const ENGINE = opt('engine', 'elevenlabs');
const VOICE = opt('voice', ENGINE === 'say' ? 'Samantha' : 'cjVigY5qzO86Huf0OWal');   // ElevenLabs "Eric": smooth, trustworthy
const MODEL = opt('model', 'eleven_v4');
// Steady, professional narration. Higher stability = calmer, more even reads.
const SETTINGS = { stability: Number(opt('stability', 0.75)), similarity_boost: Number(opt('similarity', 0.6)) };

function key() {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) {
    console.error('ELEVENLABS_API_KEY is not set. Keep it in an env file that git ignores and run with node --env-file=<that file>.\n'
      + 'For a free draft voice to time the cut, use --engine say (macOS).');
    process.exit(2);
  }
  return k;
}

async function api(path, { method = 'GET', body, query = '' } = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${path}${query}`, {
      method, headers: { 'xi-api-key': key(), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body && JSON.stringify(body),
    });
    if (res.ok) return res;
    const text = (await res.text()).slice(0, 400);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) { await new Promise(r => setTimeout(r, 2000 * attempt)); continue; }
    const hint = { 401: ' (key missing or not valid)', 402: ' (this needs a paid ElevenLabs plan)', 422: ' (check the voice id and model)' }[res.status] || '';
    throw new Error(`ElevenLabs ${method} ${path} -> ${res.status}${hint}: ${text}`);
  }
}

const seconds = file => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString());

async function synth(text, file, { voice = VOICE, prev, next } = {}) {
  if (ENGINE === 'say') {
    const aiff = `${file}.aiff`;
    execFileSync('say', ['-v', voice, '-r', opt('rate', '140'), '-o', aiff, text]);
    // Some voices (Samantha among them) ignore -r and read at 180+ wpm: slow them, pitch kept, so
    // the draft times the cut like a calm professional read would.
    const wpm = text.split(/\s+/).length / seconds(aiff) * 60, target = Number(opt('wpm', 140));
    const tempo = wpm > target * 1.05 ? Math.max(.75, target / wpm) : 1;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', aiff, ...(tempo < 1 ? ['-af', `atempo=${tempo.toFixed(3)}`] : []), '-ar', '44100', '-b:a', '128k', file]);
    rmSync(aiff);
    return;
  }
  const res = await api(`/v1/text-to-speech/${encodeURIComponent(voice)}`, {
    method: 'POST', query: '?output_format=mp3_44100_128',
    body: { text, model_id: MODEL, voice_settings: SETTINGS, previous_text: prev, next_text: next },
  });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
}

if (has('list-voices')) {
  const res = await api('/v2/voices', { query: '?page_size=100' });
  const { voices } = await res.json();
  for (const v of voices) {
    const l = v.labels || {};
    console.log(`${v.voice_id}  ${v.name.padEnd(28)} ${[l.gender, l.age, l.accent, l.descriptive || l.description, l.use_case].filter(Boolean).join(', ')}`);
  }
  process.exit(0);
}

const out = resolve(opt('out', 'vo'));
mkdirSync(out, { recursive: true });

if (has('audition')) {
  // The same line in several voices, to choose by ear before voicing the whole script.
  const text = opt('audition');
  const voices = (opt('voices', VOICE)).split(',').map(s => s.trim()).filter(Boolean);
  for (const v of voices) {
    const file = join(out, `${v.replace(/[^\w-]/g, '_')}.mp3`);
    try { await synth(text, file, { voice: v }); console.log(`${file}  ${seconds(file).toFixed(2)} s`); }
    catch (e) { console.log(`${v}: ${e.message}`); }
  }
  process.exit(0);
}

const lines = JSON.parse(readFileSync(resolve(opt('lines', join(out, 'lines.json'))), 'utf8'));
const only = opt('only') ? new Set(opt('only').split(',')) : null;
const STATE = join(out, '.voiced.json');
const state = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : {};
const durations = {};
const data = {};
let voiced = 0;
for (const [i, line] of lines.entries()) {
  const file = join(out, `${line.id}.mp3`);
  const sig = createHash('sha1').update(JSON.stringify([ENGINE, VOICE, MODEL, SETTINGS, line.text])).digest('hex').slice(0, 12);
  const stale = !existsSync(file) || (state[line.id] && state[line.id].sig !== sig);
  if ((has('force') || stale) && (!only || only.has(line.id))) {
    await synth(line.text, file, { prev: lines[i - 1]?.text, next: lines[i + 1]?.text });
    state[line.id] = { sig, engine: ENGINE, voice: VOICE, model: ENGINE === 'say' ? 'say' : MODEL };
    writeFileSync(STATE, `${JSON.stringify(state, null, 1)}\n`);
    voiced++;
    console.log(`voiced ${line.id}`);
  }
  durations[line.id] = Math.round(seconds(file) * 1000) / 1000;
  data[line.id] = { text: line.caption || line.text, dur: durations[line.id] };
}
writeFileSync(join(out, 'durations.json'), `${JSON.stringify(durations, null, 2)}\n`);
writeFileSync(join(out, 'vo-data.js'), `// Narration for the player: each line's caption and length (written by voiceover.mjs).\nwindow.VO_DATA = ${JSON.stringify(data, null, 1)};\n`);
const total = Object.values(durations).reduce((a, b) => a + b, 0);
const words = lines.reduce((n, l) => n + l.text.split(/\s+/).length, 0);
console.log(`${lines.length} lines (${voiced} voiced now), ${total.toFixed(1)} s of speech, ${Math.round(words / total * 60)} words per minute -> ${out}`);
