// Capture kit: a signed-in browser on the real app, and screenshots that record where the
// controls a beat talks about are (img/manifest.json + manifest.js for the player).
//
// The config (see assets/capture.config.example.cjs) says where the app is, how to sign in, what
// to inject into this browser only (theme, brand file, CSS), and where screenshots go.
const fs = require('fs');
const path = require('path');
const { launch } = require('../_pw.cjs');

function loadConfig(file) {
  const abs = path.resolve(file);
  delete require.cache[abs];
  const cfg = { viewport: { width: 1920, height: 1080 }, settle: 2500, timeout: 15000, spaNavigation: false, ...require(abs) };
  cfg.__dir = path.dirname(abs);
  cfg.shotsDir = path.resolve(cfg.__dir, cfg.shotsDir || 'img');
  fs.mkdirSync(cfg.shotsDir, { recursive: true });
  return cfg;
}

// Everything injected here lives in this browser only: the app's code and settings stay untouched.
async function newContext(browser, cfg) {
  const ctx = await browser.newContext({ viewport: cfg.viewport, deviceScaleFactor: cfg.deviceScaleFactor || 1, locale: cfg.locale || 'en-US',
    timezoneId: cfg.timezoneId, colorScheme: cfg.colorScheme, reducedMotion: 'reduce' });
  for (const [p, file] of Object.entries(cfg.routes || {})) {
    await ctx.route(new URL(p, cfg.baseUrl).href, r => r.fulfill({ path: path.resolve(cfg.__dir, file) }));
  }
  const origin = new URL(cfg.baseUrl).origin;
  if (cfg.localStorage) {
    await ctx.addInitScript(({ origin, items }) => {
      if (location.origin !== origin) return;
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
    }, { origin, items: cfg.localStorage });
  }
  if (cfg.css) {
    await ctx.addInitScript(({ origin, css }) => {
      if (location.origin !== origin) return;
      const add = () => { const s = document.createElement('style'); s.dataset.capture = ''; s.textContent = css; document.documentElement.appendChild(s); };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
    }, { origin, css: cfg.css });
  }
  return ctx;
}

// Sign in with the app's own form. `login` is either a function (page, { user, cfg }) or
// { user, username, password, submit, passwordEnv, password, ready }. With `headed`, the person at the
// keyboard finishes any second factor in the window; nothing here reads or stores their code.
async function signIn(page, cfg, { user, headed } = {}) {
  const L = cfg.login;
  if (!L) return;
  if (typeof L === 'function') { await L(page, { user, cfg }); return; }
  const ready = L.ready || 'body';
  await page.locator(`${L.username}, ${ready}`).first().waitFor({ timeout: 30000 });
  if (await page.locator(L.username).count()) {
    const secret = L.passwordEnv ? process.env[L.passwordEnv] : L.password;
    if (!secret) throw new Error(`No password: set ${L.passwordEnv || 'login.passwordEnv'} in the environment (never in the config file).`);
    await page.fill(L.username, user || L.user);
    await page.fill(L.password, secret);
    await page.click(L.submit);
    if (headed) console.log('WAITING: finish signing in (one-time code) in the browser window');
    const appHost = new URL(cfg.baseUrl).host;
    await page.waitForURL(u => u.host === appHost && !(L.loginPath && u.pathname.startsWith(L.loginPath)), { timeout: headed ? 600000 : 60000 });
  }
  await page.locator(ready).first().waitFor({ timeout: 60000 });
}

async function session(cfg, { user, headed = false } = {}) {
  const browser = await launch({ headed, args: headed ? ['--window-position=60,60', '--window-size=1320,900'] : [] });
  const ctx = await newContext(browser, cfg);
  const page = await ctx.newPage();
  // A visible window signs in at a size that fits the screen, then captures at the full viewport.
  if (headed) await page.setViewportSize({ width: 1280, height: 800 });
  page.setDefaultTimeout(cfg.timeout);
  await page.goto(new URL(cfg.startPath || '/', cfg.baseUrl).href, { waitUntil: 'load' });
  await signIn(page, cfg, { user, headed });
  if (headed) await page.setViewportSize(cfg.viewport);
  await page.waitForTimeout(cfg.settle);
  return { browser, ctx, page };
}

function kit(cfg) {
  const MF = path.join(cfg.shotsDir, 'manifest.json');
  const manifest = fs.existsSync(MF) ? JSON.parse(fs.readFileSync(MF, 'utf8')) : {};
  const save = () => {
    fs.writeFileSync(MF, `${JSON.stringify(manifest, null, 1)}\n`);
    fs.writeFileSync(path.join(cfg.shotsDir, 'manifest.js'), `window.SHOT_BOXES = ${JSON.stringify(manifest)};\n`);
  };

  // Navigate. Apps that keep their sign-in in memory lose it on a full page load, so with
  // spaNavigation the route changes inside the app (history.pushState + popstate).
  async function go(page, p, wait = cfg.settle) {
    if (cfg.spaNavigation) await page.evaluate(p => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, p);
    else await page.goto(new URL(p, cfg.baseUrl).href, { waitUntil: 'load' });
    await page.waitForTimeout(wait);
  }

  // Close toasts and banners that would date the shot or cover the subject.
  async function dismiss(page) {
    for (const d of cfg.dismiss || []) {
      for (let i = 0; i < 3; i++) {
        const loc = typeof d === 'string' ? page.locator(d) : page.getByRole(d.role || 'button', { name: d.name });
        if (!(await loc.count())) break;
        for (const b of await loc.all()) await b.click({ timeout: 800 }).catch(() => {});
        await page.waitForTimeout(300);
      }
    }
  }

  async function box(loc) {
    const b = await loc.first().boundingBox().catch(() => null);
    return b && [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)];
  }

  // Screenshot <shotsDir>/<name>.png and record the boxes of `targets` ({ name: locator }), the page's
  // base text size (for the legibility check) and the URL.
  async function shot(page, name, targets = {}) {
    await dismiss(page);
    await page.mouse.move(cfg.viewport.width - 1, cfg.viewport.height - 1);   // no hover states
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(cfg.shotsDir, `${name}.png`) });
    const boxes = {};
    for (const [k, loc] of Object.entries(targets)) {
      boxes[k] = await box(loc);
      if (!boxes[k]) console.log(`  warning: ${name}: "${k}" is not on screen`);
    }
    const fontPx = await page.evaluate(sel => {
      const el = document.querySelector(sel) || document.body;
      return parseFloat(getComputedStyle(el).fontSize) || 14;
    }, cfg.textSample || 'main p, main td, main li, main span, main').catch(() => 14);
    manifest[name] = { ...(manifest[name] || {}), boxes, fontPx, url: page.url().replace(/[?#].*$/, ''), at: new Date().toISOString() };
    save();
    console.log('shot', name, JSON.stringify(boxes));
    return boxes;
  }

  // Run one named step, keep going if it fails, and leave a screenshot of the failure.
  function stepper(page, log, prefix = 'step') {
    return async (n, fn) => {
      try { await fn(); log.push(`ok ${n}`); }
      catch (e) {
        log.push(`FAIL ${n}: ${String(e.message).split('\n')[0]}`);
        const dir = path.join(cfg.__dir, 'capture-failures'); fs.mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: path.join(dir, `${prefix}-${n}.png`) }).catch(() => {});
      }
    };
  }

  return { cfg, go, dismiss, box, shot, stepper, manifest, save };
}

module.exports = { loadConfig, session, kit, newContext, signIn };
