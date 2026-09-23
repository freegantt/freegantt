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

/** The stable identity of a `.size-limit.json` entry: what it measures, not what it is called. A
 * rename changes `name` but never `path` + `import` together, so keying on the pair lets a branch
 * entry find its base counterpart across a rename instead of reading as "new" and slipping past
 * the growth check unchecked (#342 follow-up). */
export function entryKey(entry) {
  return `${entry.path}::${entry.import}`;
}

/** `size-limit --json` in one directory, for the entries `.size-limit.json` there names.
 * Returns a `Map<key, { name, size }>`, keyed by `entryKey` so callers match branch entries to
 * base entries by what they measure, surviving a rename. Each `size-limit` result is matched back
 * to its config entry by `name` — the one field `size-limit` echoes verbatim from the config it
 * read, so the match needs no assumption about output order. Throws, naming the entry, when a
 * result cites a name absent from the config or carries a size that is not a finite number — both
 * mean `size-limit --json`'s shape moved and a silent pass would hide that. */
export function measureSizes(dir) {
  const sizeLimitBin = path.join(dir, 'node_modules', '.bin', 'size-limit');
  if (!existsSync(sizeLimitBin)) {
    throw new Error(`check-bundle-growth: ${sizeLimitBin} is missing — install did not complete.`);
  }
  const output = execFileSync(sizeLimitBin, ['--json'], { cwd: dir, encoding: 'utf8' });
  const results = JSON.parse(output);
  const config = JSON.parse(readFileSync(path.join(dir, '.size-limit.json'), 'utf8'));
  const configByName = new Map(config.map((entry) => [entry.name, entry]));

  const sizes = new Map();
  for (const result of results) {
    const entry = configByName.get(result.name);
    if (!entry) {
      throw new Error(
        `check-bundle-growth: ${dir} — size-limit reported "${result.name}", which is not in .size-limit.json.`,
      );
    }
    if (typeof result.size !== 'number' || !Number.isFinite(result.size)) {
      throw new Error(
        `check-bundle-growth: ${dir} — "${result.name}" reported a size of ${JSON.stringify(result.size)}, not a finite number.`,
      );
    }
    sizes.set(entryKey(entry), { name: entry.name, size: result.size });
  }
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
      symlinkSync(path.join(root, 'node_modules'), path.join(workDir, 'node_modules'), 'dir');
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
export function resolvePullRequestId() {
  if (process.env.FG_PR_ID) return process.env.FG_PR_ID.replace(/^#/, '');
  return git(['rev-parse', '--abbrev-ref', 'HEAD']);
}

/** One row per accepted entry: `| pull request | entry | delta (bytes) | reason |`. A row covers
 * a run only when its recorded delta is at least the actual growth — a row written for 1,100 B
 * does not cover a later 4,000 B surprise on the same entry.
 *
 * A line shaped like a table row — it opens and closes with `|` — but not readable as one throws,
 * naming the line: a row that silently drops reads to the guard as "no exception recorded", which
 * fails the pull request it meant to cover instead of telling the writer their row has a typo. */
export function readLedger(filePath = ledgerPath) {
  if (!existsSync(filePath)) return [];
  const rows = [];
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (const [index, line] of lines.entries()) {
    const cells = line
      .match(/^\s*\|(.+)\|\s*$/)?.[1]
      ?.split('|')
      .map((cell) => cell.trim());
    if (!cells) continue; // not shaped like a table row at all — ordinary prose
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue; // markdown header separator row

    const lineNumber = index + 1;
    if (cells.length !== 4) {
      throw new Error(
        `check-bundle-growth: ${filePath}:${lineNumber} looks like a table row but has ` +
          `${cells.length} cells, not 4: "${line.trim()}"`,
      );
    }
    const [pullRequest, entry, delta, reason] = cells;
    if (pullRequest.toLowerCase() === 'pull request') continue; // header row
    const recordedDelta = Number(delta);
    if (!pullRequest || !entry || !Number.isFinite(recordedDelta) || !reason) {
      throw new Error(
        `check-bundle-growth: ${filePath}:${lineNumber} does not parse as a ledger row: "${line.trim()}"`,
      );
    }
    rows.push({ pullRequest: pullRequest.replace(/^#/, ''), entry, recordedDelta, reason });
  }
  return rows;
}

export function formatDelta(bytes) {
  const sign = bytes > 0 ? '+' : '';
  return `${sign}${bytes} B`;
}

/** The budget, in the unit `size-limit` itself reports ("82.55 kB") — 1000 B reads as "1 kB", any
 * other value reads in bytes. Both the PASS line and the FAILED line quote this, so neither can
 * drift from `GROWTH_BUDGET_BYTES` the way the PASS line once did (#342 follow-up). */
export function formatBudget(bytes) {
  return bytes % 1000 === 0 ? `${bytes / 1000} kB` : `${bytes} B`;
}

/** One branch build against one base build, entry by entry, keyed by `entryKey` so a rename still
 * finds its counterpart. Returns the report lines, the entries over budget with no ledger row to
 * cover them, and `comparisons` — how many branch entries found a base counterpart at all. A
 * caller treats `comparisons === 0` as "no growth check ran", never as "nothing grew" (#342
 * follow-up). Takes no I/O: every caller, script and test alike, builds `branchSizes`/`baseSizes`
 * itself, so a test can hand it a fabricated pair no build ever has to produce. */
export function evaluateGrowth(branchSizes, baseSizes, { ledger, pullRequestId, growthBudgetBytes }) {
  const lines = [];
  const failures = [];
  let comparisons = 0;
  for (const [key, branch] of branchSizes) {
    const base = baseSizes.get(key);
    if (base === undefined) {
      lines.push(`  ${branch.name}: ${branch.size} B (new entry, no baseline to compare)`);
      continue;
    }
    comparisons++;
    const delta = branch.size - base.size;
    lines.push(`  ${branch.name}: ${base.size} B → ${branch.size} B (${formatDelta(delta)})`);

    if (delta <= growthBudgetBytes) continue;

    const covered = ledger.find(
      (row) => row.pullRequest === pullRequestId && row.entry === branch.name && row.recordedDelta >= delta,
    );
    if (covered) {
      lines.push(`    within budget by ledger row: "${covered.reason}"`);
      continue;
    }
    failures.push({ name: branch.name, delta });
  }
  return { lines, failures, comparisons };
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
  if (branchSizes.size === 0) {
    console.error('check-bundle-growth: measured no entry in .size-limit.json — nothing to compare.');
    process.exit(1);
  }
  // No point rebuilding an identical tree: a branch still at its merge-base (a fresh branch, or a
  // run on `main` itself) has nothing to grow against.
  const baseSizes = baseSha === headSha ? branchSizes : measureAtRef(baseSha);
  if (baseSizes.size === 0) {
    console.error(
      `check-bundle-growth: measured no entry at ${baseRef}'s merge-base — nothing to compare against.`,
    );
    process.exit(1);
  }

  const ledger = readLedger();
  const pullRequestId = resolvePullRequestId();
  // `#342` reads as a pull request number; a branch name (the local, pre-pull-request fallback)
  // does not, and `readLedger` only strips a leading `#`, never adds one — so the suggested row
  // below must match what a reader actually needs to write for `pullRequestId` to match on replay.
  const pullRequestLabel = /^\d+$/.test(pullRequestId) ? `#${pullRequestId}` : pullRequestId;

  console.log(
    `check-bundle-growth: comparing HEAD (${headSha.slice(0, 7)}) with ${baseRef}'s merge-base (${baseSha.slice(0, 7)})\n`,
  );

  const { lines, failures, comparisons } = evaluateGrowth(branchSizes, baseSizes, {
    ledger,
    pullRequestId,
    growthBudgetBytes: GROWTH_BUDGET_BYTES,
  });
  for (const line of lines) console.log(line);

  // Every branch entry read as "new" means the base build and the branch build shared no entry at
  // all — a wholesale rename, or a base measurement that silently measured the wrong thing. Either
  // way no growth check ran, which must fail loud, not pass quiet (#342 follow-up).
  if (comparisons === 0) {
    console.error(
      'check-bundle-growth: no branch entry matched a base entry by path + import — no comparison happened.',
    );
    process.exit(1);
  }

  if (failures.length > 0) {
    console.error(
      `\ncheck-bundle-growth FAILED: ${failures
        .map((f) => `${f.name} grew ${formatDelta(f.delta)}`)
        .join(', ')} — over the ${formatBudget(GROWTH_BUDGET_BYTES)} budget.`,
    );
    console.error(
      `Add a row to bundle-size-exceptions.md ("| ${pullRequestLabel} | <entry> | <delta bytes> | <reason> |") ` +
        'to accept the growth, or shrink the bundle back under budget.',
    );
    process.exit(1);
  }

  console.log(
    `\ncheck-bundle-growth PASS — no entry grew past the ${formatBudget(GROWTH_BUDGET_BYTES)} budget.`,
  );
}
