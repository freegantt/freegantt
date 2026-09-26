#!/usr/bin/env node
// `pnpm pr-wait <n>` — wait for a pull request's CI to finish, and state the result in words.
//
// Why a script, and not a poll written on the spot. A wait written from `gh pr checks` reads the
// pull request's check-suite rollup. This workflow skips the `gate` job on every draft push, and
// again on close, so that rollup is full of `SKIPPED` rows that share the required check name.
// `gh pr checks` then reports "nothing started" while `gh run list` already shows a live
// `pull_request` run — or it prints `pass` from `--watch` and returns empty JSON on the re-read.
// Both look like a red gate. Neither is. That is the #415 / #420 failure: the observer lied, the
// job was fine, and the documented fallback (`gh workflow run`) cancelled the live run through the
// shared concurrency group.
//
// So this script never reads check suites. It lists CI workflow runs for the pull request's head
// commit, ignores skipped and cancelled rows, and gives the waiting to `gh run watch`. A watched
// run that then concludes skipped on a ready pull request is the draft-time job finishing; the
// script waits for a newer run on that commit instead of reporting the skip as the gate (#561).
// Every run prints exactly one verdict line, and it is the last line. Green needs that exact line.
// A run a signal kills has no verdict line, and reads as unproven, never as green.
//
// Two ways CI reports nothing while looking fine, both from docs/04 §5.2:
//   - A draft runs nothing, by design (#255). That is not a pass.
//   - No live `pull_request` run after the start wait. Push a commit so `synchronize` fires. Do
//     not dispatch: a `workflow_dispatch` run is on the branch, not the pull request, so it cannot
//     close this wait, and concurrency cancels the real run (#415).

import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** How long to wait for a live `pull_request` run to appear after "ready". */
const START_TIMEOUT_SECONDS = 120;
/** How long to wait for a replacement run after concurrency cancels the one we were watching. */
const REPLACEMENT_TIMEOUT_SECONDS = 60;
const POLL_SECONDS = 10;
const WORKFLOW = 'ci.yml';

const RUN_JSON_FIELDS = 'databaseId,status,conclusion,event,headSha,url,createdAt';

/**
 * True when this row is the gate for `headSha`: a `pull_request` run that actually ran.
 * A skipped row is the draft-time or close-time job `if:`; a cancelled row is a superseded attempt.
 */
export function isLiveGateRun(run, headSha) {
  return (
    run.event === 'pull_request' &&
    run.headSha === headSha &&
    run.conclusion !== 'skipped' &&
    run.conclusion !== 'cancelled'
  );
}

/**
 * The newest live gate run for this head.
 * `gateRunForHead(runs, pr.headSha)` reads "the gate run for this head".
 * `besidesId` drops a run we already watched: a draft-time skip can still look
 * live in a stale list while a newer ready run is the gate.
 */
export function gateRunForHead(runs, headSha, { besidesId } = {}) {
  let newest;
  for (const run of runs) {
    if (besidesId !== undefined && run.databaseId === besidesId) continue;
    if (!isLiveGateRun(run, headSha)) continue;
    if (newest === undefined || run.createdAt > newest.createdAt) newest = run;
  }
  return newest;
}

/**
 * True when a watched run skipped on a ready pull request.
 * That skip is the draft-time job finishing; the ready gate is a newer run on
 * the same commit, often a few seconds later.
 * `shouldWaitForNewerRunAfterSkip(fresh, { isDraft: pr.isDraft })`
 */
export function shouldWaitForNewerRunAfterSkip(run, { isDraft }) {
  return run.conclusion === 'skipped' && !isDraft;
}

function gh(argv, options = {}) {
  return spawnSync('gh', argv, { encoding: 'utf8', ...options });
}

/** Block this thread for `seconds`. The script is synchronous end to end, so its output stays ordered. */
function sleepSeconds(seconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, seconds * 1000);
}

function stop(message) {
  console.log(`pr-wait FAILED — ${message}`);
  process.exit(1);
}

/**
 * What a gate run says, in the words the reader needs to act on it.
 * `run` is one `gh run list` / `gh run view` row, or `undefined` when none is live.
 */
export function summarizeGateRun(run, { number, seconds, branch, dispatchUrl }) {
  const took = `(${seconds}s)`;

  if (run === undefined) {
    const dispatch =
      dispatchUrl === undefined
        ? ''
        : ` A workflow_dispatch run is on this commit (${dispatchUrl}) and cannot close this wait — it may have cancelled the gate.`;
    return {
      settled: true,
      ok: false,
      verdict:
        `pr-wait FAILED — #${number} has no live pull_request gate run after ${seconds}s.${dispatch} ` +
        `Push a commit so synchronize fires, then run this again. ` +
        `Confirm with \`gh run list --branch ${branch} --workflow ${WORKFLOW}\`.`,
    };
  }

  if (run.status !== 'completed') {
    return { settled: false, ok: false, verdict: '' };
  }

  const url = run.url ?? '';
  if (run.conclusion === 'success') {
    return {
      settled: true,
      ok: true,
      verdict: `pr-wait PASS — gate succeeded on #${number}: ${url} ${took}`,
    };
  }

  return {
    settled: true,
    ok: false,
    verdict: `pr-wait FAILED — gate ${run.conclusion} on #${number}: ${url} ${took}`,
  };
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
    'number,url,isDraft,state,headRefName,headRefOid',
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
  const headSha = pr.headRefOid;

  if (pr.state !== 'OPEN') {
    stop(`#${pr.number} is ${pr.state}, so there is nothing to wait for. ${pr.url}`);
  }
  if (pr.isDraft) {
    stop(
      `#${pr.number} is a draft, so CI is idle by design (#255). No checks ran. ` +
        `Run \`pnpm open-pr --ready\` when it is meant to merge, then run this again.`,
    );
  }

  function ghJson(argv) {
    const result = gh(argv);
    if (result.status !== 0) {
      stop(`\`${argv.join(' ')}\` failed. ${(result.stderr || result.stdout).trim()}`);
    }
    try {
      return JSON.parse(result.stdout);
    } catch {
      stop(`\`${argv.join(' ')}\` did not return JSON.`);
    }
  }

  function listPullRequestRuns() {
    return ghJson([
      'run',
      'list',
      '--commit',
      headSha,
      '--event',
      'pull_request',
      '--workflow',
      WORKFLOW,
      '--limit',
      '20',
      '--json',
      RUN_JSON_FIELDS,
    ]);
  }

  function listDispatchRunUrl() {
    const runs = ghJson([
      'run',
      'list',
      '--commit',
      headSha,
      '--event',
      'workflow_dispatch',
      '--workflow',
      WORKFLOW,
      '--limit',
      '1',
      '--json',
      'url',
    ]);
    return runs[0]?.url;
  }

  function readRun(id) {
    return ghJson(['run', 'view', String(id), '--json', RUN_JSON_FIELDS]);
  }

  function waitForLiveRun(timeoutSeconds, { besidesId } = {}) {
    const deadline = elapsed() + timeoutSeconds;
    let run = gateRunForHead(listPullRequestRuns(), headSha, { besidesId });
    while (run === undefined && elapsed() < deadline) {
      console.log(
        `pr-wait: #${pr.number} shows no live gate run yet — waiting for one to queue ` +
          `(${elapsed()}s, ${timeoutSeconds}s budget).`,
      );
      sleepSeconds(POLL_SECONDS);
      run = gateRunForHead(listPullRequestRuns(), headSha, { besidesId });
    }
    return run;
  }

  function failNoLiveRun() {
    const dispatchUrl = listDispatchRunUrl();
    const summary = summarizeGateRun(undefined, {
      number: pr.number,
      seconds: elapsed(),
      branch,
      ...(dispatchUrl === undefined ? {} : { dispatchUrl }),
    });
    console.log(`\n${summary.verdict}`);
    process.exit(1);
  }

  let run = waitForLiveRun(START_TIMEOUT_SECONDS);
  if (run === undefined) failNoLiveRun();

  for (;;) {
    if (run.status !== 'completed') {
      console.log(`pr-wait: watching run ${run.databaseId} on #${pr.number} — ${run.url}`);
      // `gh` owns the waiting. This script never polls a status field itself.
      gh(['run', 'watch', String(run.databaseId), '--compact'], { stdio: 'inherit' });
    }

    const fresh = readRun(run.databaseId);
    if (fresh.conclusion === 'cancelled') {
      console.log(
        `pr-wait: run ${run.databaseId} was cancelled — waiting for a replacement pull_request run.`,
      );
      run = waitForLiveRun(REPLACEMENT_TIMEOUT_SECONDS, { besidesId: fresh.databaseId });
      if (run === undefined) failNoLiveRun();
      continue;
    }

    if (shouldWaitForNewerRunAfterSkip(fresh, { isDraft: pr.isDraft })) {
      console.log(`pr-wait: run ${run.databaseId} skipped — waiting for the ready gate run on this commit.`);
      const replacement = waitForLiveRun(REPLACEMENT_TIMEOUT_SECONDS, {
        besidesId: fresh.databaseId,
      });
      if (replacement !== undefined) {
        run = replacement;
        continue;
      }
    }

    const summary = summarizeGateRun(fresh, {
      number: pr.number,
      seconds: elapsed(),
      branch,
    });
    console.log(`\n${summary.verdict}`);
    process.exit(summary.ok ? 0 : 1);
  }
}
