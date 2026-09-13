#!/usr/bin/env node
// #257: `reuseExistingServer` in playwright.config.ts silently reuses whatever already listens on
// the e2e port. Between two `pnpm dev` starts in one worktree that is the intended behaviour; between
// two *worktrees* of this repo it is not — Playwright then serves one worktree's specs against
// another worktree's `harness/` and `src/`, and the run reports a false red or a false green with no
// signal that anything is wrong.
//
// This runs as playwright.config.ts's `globalSetup`, which fires before any spec runs but after the
// `webServer` plugin has already started or reused a listener on the port (playwright's task order:
// plugin setup, then globalSetup, then tests). So this cannot stop the reuse — only refuse the run
// before a test sees the wrong worktree's page. `ss -lptn 'sport = :PORT'` finds the pid holding the
// port; `/proc/<pid>/cwd` names the directory it runs from. A pid whose cwd is not this worktree's
// root means the reused server belongs to someone else, and the run must stop, loudly, naming the
// pid, its directory and the port — not fail a test with no clue why.

import { execFileSync } from 'node:child_process';
import { readlinkSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const thisWorktreeRoot = realpathSync(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

/**
 * Refuses the e2e run when the port it will use is already held by a foreign worktree's dev
 * server. Warns and steps aside — never fails the run — when the check itself cannot be made: in
 * CI (which runs one worktree at a time, and starts its own server), off Linux (`/proc` does not
 * exist), or when `ss` is missing.
 */
export default async function guardAgainstForeignWorktreePort() {
  const port = process.env['FG_E2E_PORT'] ?? '5172';

  if (process.env['CI']) {
    return;
  }
  if (process.platform !== 'linux') {
    console.warn(
      `e2e-worktree-port-guard: skipped — this check reads /proc, which only exists on Linux ` +
        `(platform is "${process.platform}"). A foreign worktree on port ${port} would go unnoticed.`,
    );
    return;
  }

  const pid = findListeningPid(port);
  if (pid === 'unavailable') {
    console.warn(
      `e2e-worktree-port-guard: skipped — could not run 'ss' to inspect port ${port}. ` +
        `A foreign worktree on that port would go unnoticed.`,
    );
    return;
  }
  if (pid === null) {
    return; // Nothing listens yet — vite starts fresh, so there is no foreign server to catch.
  }

  const listenerCwd = readListenerCwd(pid);
  if (listenerCwd === null) {
    console.warn(
      `e2e-worktree-port-guard: skipped — could not read /proc/${pid}/cwd. ` +
        `Cannot tell whether pid ${pid} on port ${port} belongs to this worktree.`,
    );
    return;
  }

  if (listenerCwd !== thisWorktreeRoot) {
    throw new Error(
      `e2e-worktree-port-guard: refusing to reuse the dev server on port ${port}. ` +
        `pid ${pid} is running from "${listenerCwd}", not this worktree ("${thisWorktreeRoot}"). ` +
        `Playwright's reuseExistingServer would serve this worktree's specs against that other ` +
        `checkout's harness/ and src/. Stop that server, or run this worktree's e2e with a port of ` +
        `its own via FG_E2E_PORT.`,
    );
  }
}

/**
 * Reads the pid of the process listening on `port`, or `null` when nothing listens, or
 * `'unavailable'` when `ss` cannot be run at all.
 */
function findListeningPid(port) {
  let output;
  try {
    output = execFileSync('ss', ['-lptn', `sport = :${port}`], { encoding: 'utf8' });
  } catch {
    return 'unavailable';
  }
  const match = /pid=(\d+)/.exec(output);
  return match?.[1] ?? null;
}

/** Reads the working directory of `pid`, or `null` when `/proc/<pid>/cwd` cannot be read. */
function readListenerCwd(pid) {
  try {
    return realpathSync(readlinkSync(`/proc/${pid}/cwd`));
  } catch {
    return null;
  }
}
