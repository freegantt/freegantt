#!/usr/bin/env node
// #342 (follow-up to #306, #95): the bundle guard compares a pull request with `main`, never a
// fixed ceiling. #306 found a fixed number always finds its cliff — the last bytes of headroom
// block whoever pushes next. A growth check makes every increase visible and deliberate at the
// moment it happens.
//
// Budget (owner ruling, #342): 1 kB (brotli), per pull request, per `.size-limit.json` entry.
// `main`'s merge-base is built beside the branch and both are measured with the same tool
// (`size-limit --json`) so the two numbers come from one code path. Growth past the budget fails,
// unless `bundle-size-exceptions.md` already records a reason for that entry — so an accepted
// increase stays on record instead of forcing the number up quietly.
//
// This is the local half and the CI half at once: `pnpm verify` calls this script directly (no
// fixed ceiling survives it — `.size-limit.json` carries no `limit` field any more), and CI runs
// the same `pnpm check-bundle-growth`, so no caller can prove a different thing from the other
// (#255's rule, applied here).

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sizeLimitConfigPath = path.join(root, '.size-limit.json');
const ledgerPath = path.join(root, 'bundle-size-exceptions.md');

/** 1 kB, decimal — the unit `size-limit` itself reports in ("82.55 kB"), so the budget and the
 * report speak the same number. */
const GROWTH_BUDGET_BYTES = 1000;

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', ...options }).trim();
}

/** `main`'s tip, tried as a remote-tracking branch first (CI, and most local clones), falling
 * back to a local branch of the same name. Throws with a fix a reader can act on — a silent
 * fallback to "compare nothing" would pass a pull request the guard was never able to check. */
function resolveBaseRef() {
  const configured = process.env.FG_BASE_REF ?? 'main';
  for (const candidate of [`origin/${configured}`, configured]) {
    const result = spawnSync('git', ['rev-parse', '--verify', candidate], { cwd: root, encoding: 'utf8' });
    if (result.status === 0) return candidate;
  }
  try {
    git(['fetch', 'origin', configured]);
    return spawnSync('git', ['rev-parse', '--verify', `origin/${configured}`], { cwd: root }).status === 0
      ? `origin/${configured}`
      : configured;
  } catch {
    throw new Error(
      `check-bundle-growth: no "${configured}" ref found, locally or as "origin/${configured}", and ` +
        `\`git fetch origin ${configured}\` failed. Fetch it yourself and re-run.`,
    );
  }
}

/** `size-limit --json` in one directory, for the entries `.size-limit.json` there names.
 * Returns a `Map<name, bytes>` so callers match branch entries to base entries by name, not by
 * position — the two configs are allowed to differ. */
function measureSizes(dir) {
  const sizeLimitBin = path.join(dir, 'node_modules', '.bin', 'size-limit');
  if (!existsSync(sizeLimitBin)) {
    throw new Error(`check-bundle-growth: ${sizeLimitBin} is missing — install did not complete.`);
  }
  const output = execFileSync(sizeLimitBin, ['--json'], { cwd: dir, encoding: 'utf8' });
  const results = JSON.parse(output);
  const sizes = new Map();
  for (const entry of results) sizes.set(entry.name, entry.size);
  return sizes;
}

/** Builds the library at `ref` in a throwaway worktree and measures it. Reuses this worktree's
 * `node_modules` by symlink when the lockfile at `ref` is byte-identical to the one here — the
 * ordinary case, since a pull request rarely changes dependencies — and falls back to a real
 * install only when it is not. */
function measureAtRef(ref) {
  const workDir = mkdtempSync(path.join(tmpdir(), 'freegantt-bundle-growth-'));
  rmSync(workDir, { recursive: true, force: true }); // `git worktree add` wants to create this itself.
  git(['worktree', 'add', '--detach', workDir, ref]);
  try {
    // `git()` trims its output, so `lockHere` is trimmed the same way — otherwise a trailing
    // newline is the only difference and every run takes the slow path.
    const lockAtRef = git(['show', `${ref}:pnpm-lock.yaml`]);
    const lockHere = readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8').trim();
    if (lockAtRef === lockHere) {
      symlinkSync(path.join(root, 'node_modules'), path.join(workDir, 'node_modules'));
    } else {
      const install = spawnSync('pnpm', ['install', '--frozen-lockfile'], { cwd: workDir, stdio: 'inherit' });
      if (install.status !== 0) throw new Error(`check-bundle-growth: \`pnpm install\` failed for ${ref}.`);
    }

    const vite = path.join(workDir, 'node_modules', '.bin', 'vite');
    const build = spawnSync(vite, ['build', '--config', 'vite.lib.config.ts'], {
      cwd: workDir,
      stdio: 'inherit',
    });
    if (build.status !== 0) throw new Error(`check-bundle-growth: the library build failed for ${ref}.`);

    return measureSizes(workDir);
  } finally {
    git(['worktree', 'remove', '--force', workDir]);
  }
}

/** Which pull request a ledger row must name to cover this run. `FG_PR_ID` is what CI sets, read
 * from `github.event.pull_request.number` — a number is known there. Locally, before a pull
 * request exists, the branch name is the only stable handle, so a row can be written against it
 * and updated to the real number once `pnpm open-pr` mints one. */
function resolvePullRequestId() {
  if (process.env.FG_PR_ID) return process.env.FG_PR_ID.replace(/^#/, '');
  return git(['rev-parse', '--abbrev-ref', 'HEAD']);
}

/** One row per accepted entry: `| pull request | entry | delta (bytes) | reason |`. A row covers
 * a run only when its recorded delta is at least the actual growth — a row written for 1,100 B
 * does not cover a later 4,000 B surprise on the same entry. */
function readLedger() {
  if (!existsSync(ledgerPath)) return [];
  const rows = [];
  for (const line of readFileSync(ledgerPath, 'utf8').split('\n')) {
    const cells = line
      .match(/^\s*\|(.+)\|\s*$/)?.[1]
      ?.split('|')
      .map((cell) => cell.trim());
    if (!cells || cells.length !== 4) continue;
    const [pullRequest, entry, delta, reason] = cells;
    const recordedDelta = Number(delta);
    if (!pullRequest || !entry || !Number.isFinite(recordedDelta) || !reason) continue;
    if (pullRequest.toLowerCase() === 'pull request') continue; // header row
    rows.push({ pullRequest: pullRequest.replace(/^#/, ''), entry, recordedDelta, reason });
  }
  return rows;
}

function formatDelta(bytes) {
  const sign = bytes > 0 ? '+' : '';
  return `${sign}${bytes} B`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const distEntry = path.join(root, 'dist/api/index.js');
  if (!existsSync(distEntry)) {
    console.error('check-bundle-growth: dist/api/index.js is missing. Run `pnpm build` first.');
    process.exit(1);
  }
  if (!existsSync(sizeLimitConfigPath)) {
    console.error('check-bundle-growth: .size-limit.json is missing — nothing to measure.');
    process.exit(1);
  }

  const baseRef = resolveBaseRef();
  const headSha = git(['rev-parse', 'HEAD']);
  const baseSha = git(['merge-base', 'HEAD', baseRef]);

  const branchSizes = measureSizes(root);
  // No point rebuilding an identical tree: a branch still at its merge-base (a fresh branch, or a
  // run on `main` itself) has nothing to grow against.
  const baseSizes = baseSha === headSha ? branchSizes : measureAtRef(baseSha);

  const ledger = readLedger();
  const pullRequestId = resolvePullRequestId();

  console.log(
    `check-bundle-growth: comparing HEAD (${headSha.slice(0, 7)}) with ${baseRef}'s merge-base (${baseSha.slice(0, 7)})\n`,
  );

  const failures = [];
  for (const [name, branchSize] of branchSizes) {
    const baseSize = baseSizes.get(name);
    if (baseSize === undefined) {
      console.log(`  ${name}: ${branchSize} B (new entry, no baseline to compare)`);
      continue;
    }
    const delta = branchSize - baseSize;
    console.log(`  ${name}: ${baseSize} B → ${branchSize} B (${formatDelta(delta)})`);

    if (delta <= GROWTH_BUDGET_BYTES) continue;

    const covered = ledger.find(
      (row) => row.pullRequest === pullRequestId && row.entry === name && row.recordedDelta >= delta,
    );
    if (covered) {
      console.log(`    within budget by ledger row: "${covered.reason}"`);
      continue;
    }
    failures.push({ name, delta });
  }

  if (failures.length > 0) {
    console.error(
      `\ncheck-bundle-growth FAILED: ${failures
        .map((f) => `${f.name} grew ${formatDelta(f.delta)}`)
        .join(', ')} — over the ${GROWTH_BUDGET_BYTES} B budget.`,
    );
    console.error(
      `Add a row to bundle-size-exceptions.md ("| #${pullRequestId} | <entry> | <delta bytes> | <reason> |") ` +
        'to accept the growth, or shrink the bundle back under budget.',
    );
    process.exit(1);
  }

  console.log('\ncheck-bundle-growth PASS — no entry grew past the 1 kB budget.');
}
