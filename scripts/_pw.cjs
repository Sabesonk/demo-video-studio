// Shared helpers: find Playwright and a Chromium to drive, run ffmpeg, open a tour page.
//
// Playwright is taken from (in order) $PLAYWRIGHT_MODULE, the current project's node_modules, or
// a global install. The browser is $CHROME_PATH, else Playwright's own, else the newest build in
// Playwright's download cache (a project's pinned Playwright often expects a build that is not
// downloaded, while an older or newer one is).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

function loadPlaywright() {
  const names = [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '@playwright/test'].filter(Boolean);
  for (const name of names) {
    try { return require(require.resolve(name, { paths: [process.cwd(), __dirname] })); } catch { /* try the next */ }
  }
  throw new Error('Playwright was not found. Install it in the project (`npm i -D playwright`), or point PLAYWRIGHT_MODULE at an existing node_modules/playwright.');
}

function cacheDirs() {
  const home = os.homedir();
  return [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(home, 'Library/Caches/ms-playwright'), path.join(home, '.cache/ms-playwright'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'ms-playwright')].filter(d => d && fs.existsSync(d));
}

// The newest cached Chromium: the headless shell for rendering, full Chrome for a visible window.
function findCachedChromium(headed) {
  const prefix = headed ? 'chromium-' : 'chromium_headless_shell-';
  const exes = headed
    ? ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
       'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome-linux64/chrome', 'chrome-linux/chrome', 'chrome-win64/chrome.exe', 'chrome-win/chrome.exe']
    : ['chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell',
       'chrome-linux/headless_shell', 'chrome-headless-shell-win64/chrome-headless-shell.exe'];
  const found = [];
  for (const dir of cacheDirs()) {
    for (const d of fs.readdirSync(dir).filter(n => n.startsWith(prefix) && /^\D+-\d+$/.test(n))) {
      for (const e of exes) { const p = path.join(dir, d, e); if (fs.existsSync(p)) found.push([Number(d.split('-').pop()), p]); }
    }
  }
  found.sort((a, b) => b[0] - a[0]);
  return found[0] ? found[0][1] : null;
}

async function launch({ headed = false, args = [] } = {}) {
  const { chromium } = loadPlaywright();
  const exe = process.env.CHROME_PATH;
  try {
    return await chromium.launch({ headless: !headed, executablePath: exe || undefined, args });
  } catch (e) {
    if (exe) throw e;
    const cached = findCachedChromium(headed) || (headed ? null : findCachedChromium(true));
    if (!cached) throw new Error(`${e.message.split('\n')[0]}\nInstall a browser with \`npx playwright install chromium\`, or set CHROME_PATH.`);
    return chromium.launch({ headless: !headed, executablePath: cached, args });
  }
}

// Open a tour folder's player in render mode and wait until its images and fonts are in.
async function openTour(browser, tourDir, { blur = true, captions = true, viewport = { width: 1920, height: 1080 } } = {}) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const url = `file://${path.resolve(tourDir, 'index.html')}?render${blur ? '' : '&noblur'}${captions ? '' : '&nocaptions'}`;
  await page.goto(url, { waitUntil: 'load' });
  try {
    await page.evaluate(() => window.walkthroughReady);
  } catch (e) {
    throw new Error(`The tour did not load: ${e.message.split('\n')[0]}${errors.length ? `\n  ${errors.join('\n  ')}` : ''}`);
  }
  page.tourErrors = errors;
  return page;
}

const ffprobeDuration = file =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());

// ffmpeg's stderr, for the filters that report there (ebur128, loudnorm, blackdetect, freezedetect).
function ffmpegLog(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${(r.stderr || '').split('\n').slice(-6).join('\n')}`);
  return r.stderr || '';
}

// Integrated loudness (LUFS) and true peak (dBTP) of a file or of one stream of it.
function loudness(file) {
  const log = ffmpegLog(['-i', file, '-vn', '-af', 'ebur128=peak=true', '-f', 'null', '-']);
  const summary = log.slice(log.lastIndexOf('Summary:'));
  const num = re => { const m = summary.match(re); return m ? Number(m[1]) : null; };
  return { I: num(/I:\s+(-?[\d.]+) LUFS/), LRA: num(/LRA:\s+(-?[\d.]+) LU/), TP: num(/Peak:\s+(-?[\d.]+|-inf) dBFS/) };
}

// Two-pass loudness normalisation to a target, so the result lands on it rather than near it.
function normalize(input, output, { I = -16, TP = -1.5, LRA = 11, codec = ['-c:a', 'aac', '-b:a', '192k'] } = {}) {
  const log = ffmpegLog(['-i', input, '-af', `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`, '-f', 'null', '-']);
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const f = `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', input, '-af', `${f},aresample=48000`, ...codec, output], { stdio: 'inherit' });
}

const opt = (args, name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const flag = (args, name) => args.includes(`--${name}`);
const fmtTime = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

module.exports = { loadPlaywright, launch, findCachedChromium, openTour, ffprobeDuration, ffmpegLog, loudness, normalize, opt, flag, fmtTime };
