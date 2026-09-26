#!/usr/bin/env node
// Runs the public docs site against this checkout, so a page edit in `docs/` shows before it merges.
// The site shell lives in freegantt/docs. This keeps a clone of it at `.docs-site/` (gitignored) and
// points it here with FREEGANTT_SRC, so the site reads `docs/` and `src/` from this tree.
//
//   node scripts/docs-site.mjs start [docusaurus args]   dev server
//   node scripts/docs-site.mjs build                     production build; fails on a link that cannot land

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHELL_URL = 'https://github.com/freegantt/docs.git';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shellDir = path.join(root, '.docs-site');

const COMMANDS = new Set(['start', 'build']);

const [command, ...docusaurusArgs] = process.argv.slice(2);
if (!COMMANDS.has(command)) {
  console.error('usage: node scripts/docs-site.mjs start|build');
  process.exit(1);
}

function run(args, options = {}) {
  execFileSync(args[0], args.slice(1), { stdio: 'inherit', ...options });
}

/** Clones the site shell once, then keeps it on the latest `main`. */
function updateShell() {
  if (!existsSync(shellDir)) {
    run(['git', 'clone', '--quiet', '--depth', '1', SHELL_URL, shellDir]);
    return;
  }
  try {
    run(['git', '-C', shellDir, 'pull', '--quiet', '--ff-only']);
  } catch {
    console.warn('docs-site: cannot update .docs-site; the build uses the copy on disk.');
  }
}

updateShell();
run(['pnpm', '--dir', shellDir, 'install', '--frozen-lockfile']);
run(['pnpm', '--dir', shellDir, command, ...docusaurusArgs], {
  env: { ...process.env, FREEGANTT_SRC: root },
});
