#!/usr/bin/env node
// Hand a step file to a running driver.cjs and print its result.
//
//   node send.cjs <cmd dir> READY [timeoutS]          wait until the person has signed in
//   node send.cjs <cmd dir> <step.cjs> [timeoutS]     run one step
const fs = require('fs');
const path = require('path');

const [cmdDir, stepPath, timeoutS = '600'] = process.argv.slice(2);
if (!cmdDir || !stepPath) { console.error('usage: send.cjs <cmd dir> READY|<step.cjs> [timeoutS]'); process.exit(2); }
const CMD = path.resolve(cmdDir);
const deadline = Date.now() + Number(timeoutS) * 1000;
const wait = (file, done) => {
  const t = setInterval(() => {
    if (fs.existsSync(file)) { clearInterval(t); done(); process.exit(0); }
    if (Date.now() > deadline) { console.log('TIMEOUT'); process.exit(2); }
  }, 500);
};
if (stepPath === 'READY') wait(path.join(CMD, 'READY'), () => console.log('READY'));
else {
  const name = `${Date.now()}-${path.basename(stepPath)}`;
  fs.copyFileSync(stepPath, path.join(CMD, name));
  const out = path.join(CMD, name.replace(/\.cjs$/, '.out'));
  wait(out, () => console.log(fs.readFileSync(out, 'utf8')));
}
