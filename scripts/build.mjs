#!/usr/bin/env node
// Runs the lib and harness `vite build`s concurrently (#50) — they write to disjoint,
// independently-emptied output dirs and share no inputs/outputs, so nothing requires the sequential
// `&&` chain `pnpm build` used to run. check-lib-build only inspects dist/ (the library output), so
// it runs right after the lib build resolves instead of waiting on the harness build too.

import { spawn } from 'node:child_process';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

const lib = run('vite', ['build', '--config', 'vite.lib.config.ts']).then(() =>
  run('node', ['scripts/check-lib-build.mjs']),
);
const harness = run('vite', ['build']);

const results = await Promise.allSettled([lib, harness]);
const failed = results.filter((r) => r.status === 'rejected');
for (const failure of failed) {
  console.error(failure.reason instanceof Error ? failure.reason.message : failure.reason);
}
if (failed.length > 0) process.exit(1);
