#!/usr/bin/env node
// Run capture step files in one headless, signed-in session (apps without a second factor).
//
//   node run.cjs --config capture.config.cjs [--user name] steps/01-build.cjs [steps/02-run.cjs ...]
//
// A step file exports async (page, h) => result, where h = { go, shot, box, dismiss, step, log, cfg }.
// For an app that asks for a one-time code, use driver.cjs instead: a visible window you sign in to once.
const path = require('path');
const { loadConfig, session, kit } = require('./lib.cjs');
const { opt } = require('../_pw.cjs');

const args = process.argv.slice(2);
const cfg = loadConfig(opt(args, 'config', 'capture.config.cjs'));
const user = opt(args, 'user', cfg.login && cfg.login.user);
const steps = args.filter((a, i) => a.endsWith('.cjs') && args[i - 1] !== '--config');

(async () => {
  const { browser, page } = await session(cfg, { user });
  const k = kit(cfg);
  let failed = 0;
  for (const file of steps) {
    const log = [];
    const h = { ...k, log, step: k.stepper(page, log, path.basename(file, '.cjs')) };
    try {
      const result = await require(path.resolve(file))(page, h);
      console.log(JSON.stringify({ step: file, ok: true, result, log }, null, 2));
    } catch (e) {
      failed++;
      console.log(JSON.stringify({ step: file, ok: false, error: String(e.message).split('\n').slice(0, 4).join(' | '), log }, null, 2));
    }
    if (log.some(l => l.startsWith('FAIL'))) failed++;
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('CAPTURE FAILED', e.message); process.exit(1); });
