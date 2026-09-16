#!/usr/bin/env node
// `pnpm pr-wait <n>` — wait for a pull request's CI to finish, and state the result in words.
//
// Why a script, and not a poll written on the spot. `gh pr checks` carries two status vocabularies
// on one object: `bucket` is lowercase and coarse (`pending`, `pass`, `fail`), and `state` is
// uppercase and fine (`QUEUED`, `IN_PROGRESS`, `SUCCESS`). The human output prints the bucket word.
// So a loop written from reading that output — `until [ "$(gh pr checks N --json state …)" !=
// "PENDING" ]` — compares a `state` against a `bucket` word, never matches, and falls through on
// its first evaluation while still printing the word `pending`. A wait that exits at once looks
// exactly like a wait that ran. That is `verify:full`'s `EXIT: $?` lesson in a second place: read
// the wrong field, believe it, report green.
//
// The fix is the same one. Nobody polls by hand — `gh pr checks --watch` does the waiting, and the
// verdict is computed from a fresh read afterwards, never from the watch's exit code. Every run
// prints exactly one verdict line, and it is the last line. Green needs that exact line. A run a
// signal kills has no verdict line, and reads as unproven, never as green.
//
// This script also knows the two ways CI reports nothing while looking fine, both from docs/04 §5.2:
//   - A draft runs nothing, by design (#255). That is not a pass.
//   - `gh pr ready` does not always fire the `ready_for_review` trigger (#298, #235). The newest run
//     stays the stale draft-time run, `conclusion: skipped`, and nothing queues. This script names
//     the documented fallback — `gh workflow run ci.yml --ref <branch>` — instead of waiting out a
//     run that will never start.
//
// A third case wears the second one's clothes for a few seconds, and it is the harder one.
// `gh pr ready` returns before its run appears, and the stale draft-time run is already on the
// board, SKIPPED. So an all-skipped board tells one of two opposite stories: the trigger never
// fired, or the real run is seconds away. One read cannot tell them apart. On #360 that misread
// cost a needless `gh workflow run` dispatch, and the dispatch then cancelled the real run through
// the shared concurrency group. So a skipped check never counts as a started run, and the wait
// below holds until a check arrives that is not skipped.

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** How long to wait for a run to appear after "ready" before calling the trigger gap (§5.2). */
const START_TIMEOUT_SECONDS = 120;
const POLL_SECONDS = 10;

/** Buckets `gh pr checks` uses for a check that has not settled yet. */
const UNSETTLED = new Set(['pending']);
/** Buckets that mean the gate did not go green. */
const FAILING = new Set(['fail', 'cancel']);

/**
 * True when a real run is on the board. A skipped check is the leftover draft-time run, so it
 * never counts as a start — see the header for the two opposite stories an all-skipped board tells.
 */
export function hasRunStarted(checks) {
  return checks.some((check) => check.bucket !== 'skipping');
}

function gh(argv, options = {}) {
  return spawnSync('gh', argv, { encoding: 'utf8', ...options });
}

/** Block this thread for `seconds`. The script is synchronous end to end, so its output stays ordered. */
function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

/** The checks on a pull request, or `[]` when GitHub reports none at all. */
function readChecks(number) {
  const result = gh(['pr', 'checks', String(number), '--json', 'name,state,bucket,link']);
  if (result.status !== 0 && !result.stdout.trim().startsWith('[')) return [];
  try {
    return JSON.parse(result.stdout);
  } catch {
    return [];
  }
}

/**
 * What a set of checks says about the gate, in the words the reader needs to act on it.
 * `checks` is `gh pr checks --json name,state,bucket,link` output. Returns the verdict text and
 * whether the run is settled, so the caller never has to read a bucket or a state itself.
 */
export function summarizeChecks(checks, { number, seconds, branch }) {
  const took = `(${seconds}s)`;

  if (checks.length === 0) {
    return {
      settled: true,
      ok: false,
      verdict:
        `pr-wait FAILED — #${number} reports no checks after ${seconds}s, so CI never started. ` +
        `This is the ready_for_review trigger gap (docs/04 §5.2, #298/#235). ` +
        `Force the same gate job: \`gh workflow run ci.yml --ref ${branch}\`.`,
    };
  }

  const failed = checks.filter((check) => FAILING.has(check.bucket));
  if (failed.length > 0) {
    const names = failed.map((check) => `"${check.name}"`).join(', ');
    const link = failed[0]?.link ?? '';
    return {
      settled: true,
      ok: false,
      verdict: `pr-wait FAILED — ${names} failed on #${number}: ${link} ${took}`,
    };
  }

  if (checks.some((check) => UNSETTLED.has(check.bucket))) {
    return { settled: false, ok: false, verdict: '' };
  }

  // Every check skipped means the newest run predates "ready" — the stale draft-time run §5.2
  // describes. A skipped gate proves nothing, so this is never a pass. The caller waits this state
  // out first (see `hasRunStarted`), because the real run often queues seconds after `gh pr ready`.
  if (checks.every((check) => check.bucket === 'skipping')) {
    return {
      settled: true,
      ok: false,
      verdict:
        `pr-wait FAILED — every check on #${number} is SKIPPED after ${seconds}s, so this is the ` +
        `stale draft-time run, not a gate that ran (docs/04 §5.2, #298/#235). ` +
        `Force the same gate job: \`gh workflow run ci.yml --ref ${branch}\`.`,
    };
  }

  const green = checks.filter((check) => check.bucket === 'pass').length;
  return {
    settled: true,
    ok: true,
    verdict: `pr-wait PASS — ${green} of ${checks.length} checks green on #${number} ${took}`,
  };
}

function stop(message) {
  console.log(`pr-wait FAILED — ${message}`);
  process.exit(1);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) {
  const startedAt = Date.now();
  const elapsed = () => Math.round((Date.now() - startedAt) / 1000);

  const asked = process.argv[2]?.replace(/^#/, '');
  if (asked !== undefined && !/^\d+$/.test(asked)) {
    stop(`"${process.argv[2]}" is not a pull request number. usage: pnpm pr-wait [<number>]`);
  }

  const view = gh([
    'pr',
    'view',
    ...(asked ? [asked] : []),
    '--json',
    'number,url,isDraft,state,headRefName',
  ]);
  if (view.status !== 0) {
    stop(
      asked
        ? `\`gh pr view ${asked}\` failed. ${view.stderr.trim()}`
        : `this branch has no pull request, and none was named. ${view.stderr.trim()}`,
    );
  }

  const pr = JSON.parse(view.stdout);
  const branch = pr.headRefName;

  if (pr.state !== 'OPEN') {
    stop(`#${pr.number} is ${pr.state}, so there is nothing to wait for. ${pr.url}`);
  }
  if (pr.isDraft) {
    stop(
      `#${pr.number} is a draft, so CI is idle by design (#255). No checks ran. ` +
        `Run \`pnpm open-pr --ready\` when it is meant to merge, then run this again.`,
    );
  }

  // First: has a real run started? Waiting inside `--watch` for a run that never queues is the
  // trigger gap's failure mode, and it looks like a slow CI rather than a missing one. An
  // all-skipped board is not a start either, so this loop waits it out before it believes the gap.
  let checks = readChecks(pr.number);
  while (!hasRunStarted(checks) && elapsed() < START_TIMEOUT_SECONDS) {
    console.log(
      `pr-wait: #${pr.number} shows no run yet — waiting for one to queue ` +
        `(${elapsed()}s of ${START_TIMEOUT_SECONDS}s).`,
    );
    sleepSeconds(POLL_SECONDS);
    checks = readChecks(pr.number);
  }

  if (hasRunStarted(checks)) {
    console.log(`pr-wait: watching ${checks.length} check(s) on #${pr.number} — ${pr.url}`);
    // `gh` owns the waiting. This script never polls a status field itself, which is the whole
    // point: there is no vocabulary here to read wrong.
    gh(['pr', 'checks', String(pr.number), '--watch', '--fail-fast'], { stdio: 'inherit' });
  }

  // The verdict comes from a fresh read, never from the watch's exit code — same reason
  // `verify:full` states its result in the output stream instead of leaving it to `$?`.
  const summary = summarizeChecks(readChecks(pr.number), {
    number: pr.number,
    seconds: elapsed(),
    branch,
  });
  console.log(`\n${summary.verdict}`);
  process.exit(summary.ok ? 0 : 1);
}
