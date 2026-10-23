#!/usr/bin/env node
// A visible, signed-in browser that stays open and runs capture steps handed to it as files.
// For apps with a second factor: the person types their own one-time code once, then every step
// runs in that session. Nothing here reads, stores or resets their code.
//
//   node driver.cjs --config capture.config.cjs --user finance-builder [--cmd ./cmd-finance-builder]
//   node send.cjs ./cmd-finance-builder READY              (waits until signed in)
//   node send.cjs ./cmd-finance-builder steps/04-models.cjs 300
//   touch ./cmd-finance-builder/QUIT                       (closes the window)
//
// A step may declare its own time limit with a comment: // @timeout 600 (seconds; default 300).
const fs = require('fs');
const path = require('path');
const { loadConfig, session, kit } = require('./lib.cjs');
const { opt } = require('../_pw.cjs');

const args = process.argv.slice(2);
const cfg = loadConfig(opt(args, 'config', 'capture.config.cjs'));
const user = opt(args, 'user', cfg.login && cfg.login.user);
const CMD = path.resolve(opt(args, 'cmd', path.join(cfg.__dir, `cmd-${user || 'session'}`)));
fs.rmSync(CMD, { recursive: true, force: true });
fs.mkdirSync(CMD, { recursive: true });

(async () => {
  const { browser, page } = await session(cfg, { user, headed: true });
  fs.writeFileSync(path.join(CMD, 'READY'), new Date().toISOString());
  console.log(`READY (steps go in ${CMD})`);
  const k = kit(cfg);
  let busy = false;
  setInterval(async () => {
    if (busy) return;
    if (fs.existsSync(path.join(CMD, 'QUIT'))) { await browser.close(); process.exit(0); }
    const next = fs.readdirSync(CMD).filter(f => f.endsWith('.cjs')).sort()[0];
    if (!next) return;
    busy = true;
    const file = path.join(CMD, next);
    const log = [];
    let out;
    try {
      delete require.cache[require.resolve(file)];
      const limit = Number((fs.readFileSync(file, 'utf8').match(/@timeout (\d+)/) || [0, 300])[1]) * 1000;
      const h = { ...k, log, step: k.stepper(page, log, next.replace(/\.cjs$/, '')) };
      const result = await Promise.race([require(file)(page, h), new Promise((_, rej) => setTimeout(() => rej(new Error('step timed out')), limit))]);
      out = { ok: true, result, log };
    } catch (e) {
      out = { ok: false, error: String(e && e.message || e).split('\n').slice(0, 4).join(' | '), log };
      await page.screenshot({ path: path.join(CMD, `${next}.fail.png`) }).catch(() => {});
    }
    fs.writeFileSync(file.replace(/\.cjs$/, '.out'), JSON.stringify(out, null, 2));
    fs.renameSync(file, file.replace(/\.cjs$/, '.done'));
    busy = false;
  }, 400);
})().catch(e => { console.error('DRIVER STOPPED', e.message); process.exit(1); });
