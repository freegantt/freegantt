// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `pr-wait` exists because a CI wait written on the spot reports green without having waited.
// It watches CI *workflow runs* for the pull request head, not `gh pr checks`. The check-suite
// rollup keeps skipped draft-time `gate` rows beside the live run, and that board is what made
// `pr-wait` report "CI never started" while the job was already green (#415, #420).
//
// So this file pins the ways a run list looks like a verdict and is not:
//   - no live `pull_request` run, including an all-skipped board;
//   - a `workflow_dispatch` run, which proves the gate and cannot close a `pr-wait`;
//   - a cancelled run, which is a superseded attempt, not a pass;
//   - a run still in progress, which is not a verdict and must not settle;
//   - a skipped draft-time run on a ready pull request, which is not the gate
//     until a newer run on that commit fails to appear.
// A pass needs a `pull_request` run on this head that actually succeeded.

import { describe, expect, it } from 'vitest';
import {
  gateRunForHead,
  isLiveGateRun,
  shouldWaitForNewerRunAfterSkip,
  summarizeGateRun,
} from '../../scripts/pr-wait.mjs';

const HEAD = 'abc123';
const OTHER = 'def456';
const CONTEXT = { number: 420, seconds: 12, branch: 'fix/some-branch' };

const run = (
  parts: Partial<{
    databaseId: number;
    status: string;
    conclusion: string;
    event: string;
    headSha: string;
    createdAt: string;
    url: string;
  }> = {},
) => ({
  databaseId: parts.databaseId ?? 1,
  status: parts.status ?? 'completed',
  conclusion: parts.conclusion ?? 'success',
  event: parts.event ?? 'pull_request',
  headSha: parts.headSha ?? HEAD,
  createdAt: parts.createdAt ?? '2026-09-16T15:41:44Z',
  url: parts.url ?? 'https://example.invalid/run/1',
});

describe('pr-wait verdicts', () => {
  it('a successful pull_request gate is the only thing that reads as green', () => {
    const summary = summarizeGateRun(run(), CONTEXT);
    expect(summary).toMatchObject({ settled: true, ok: true });
    expect(summary.verdict).toContain('pr-wait PASS');
    expect(summary.verdict).toContain('#420');
    expect(summary.verdict).toContain('https://example.invalid/run/1');
  });

  it('no live run is not a pass, and names a push — never a dispatch', () => {
    const summary = summarizeGateRun(undefined, CONTEXT);
    expect(summary.ok).toBe(false);
    expect(summary.verdict).toContain('pr-wait FAILED');
    expect(summary.verdict).toContain('no live pull_request gate run');
    expect(summary.verdict).toContain('Push a commit so synchronize fires');
    expect(summary.verdict).not.toContain('gh workflow run');
  });

  it('a dispatch run on the same commit is named, and still cannot close the wait', () => {
    const summary = summarizeGateRun(undefined, {
      ...CONTEXT,
      dispatchUrl: 'https://example.invalid/run/dispatch',
    });
    expect(summary.ok).toBe(false);
    expect(summary.verdict).toContain('workflow_dispatch');
    expect(summary.verdict).toContain('https://example.invalid/run/dispatch');
    expect(summary.verdict).toContain('cannot close this wait');
    expect(summary.verdict).not.toContain('gh workflow run');
  });

  it('a failing gate names the conclusion and its url', () => {
    const summary = summarizeGateRun(run({ conclusion: 'failure' }), CONTEXT);
    expect(summary).toMatchObject({ settled: true, ok: false });
    expect(summary.verdict).toContain('gate failure');
    expect(summary.verdict).toContain('https://example.invalid/run/1');
  });

  it('a timed-out gate is a failure, not a pass', () => {
    expect(summarizeGateRun(run({ conclusion: 'timed_out' }), CONTEXT).ok).toBe(false);
  });

  it('an in-progress run does not settle, so the caller keeps waiting', () => {
    expect(summarizeGateRun(run({ status: 'in_progress', conclusion: '' }), CONTEXT)).toMatchObject({
      settled: false,
      ok: false,
    });
  });
});

describe('pr-wait picks the live pull_request run for this head', () => {
  it('reads an empty board as not started', () => {
    expect(gateRunForHead([], HEAD)).toBeUndefined();
  });

  it('ignores skipped draft-time runs, because those are not a start', () => {
    const skipped = run({ conclusion: 'skipped', databaseId: 2 });
    expect(isLiveGateRun(skipped, HEAD)).toBe(false);
    expect(gateRunForHead([skipped], HEAD)).toBeUndefined();
  });

  it('ignores a cancelled run, because concurrency superseded it', () => {
    const cancelled = run({ conclusion: 'cancelled', databaseId: 3 });
    expect(isLiveGateRun(cancelled, HEAD)).toBe(false);
    expect(gateRunForHead([cancelled], HEAD)).toBeUndefined();
  });

  it('ignores a workflow_dispatch run, which cannot close a pr-wait', () => {
    const dispatch = run({ event: 'workflow_dispatch', databaseId: 4 });
    expect(isLiveGateRun(dispatch, HEAD)).toBe(false);
    expect(gateRunForHead([dispatch], HEAD)).toBeUndefined();
  });

  it('ignores a run on another commit', () => {
    expect(gateRunForHead([run({ headSha: OTHER })], HEAD)).toBeUndefined();
  });

  it('picks a queued run as started', () => {
    const queued = run({ status: 'queued', conclusion: '', databaseId: 5 });
    expect(isLiveGateRun(queued, HEAD)).toBe(true);
    expect(gateRunForHead([queued], HEAD)?.databaseId).toBe(5);
  });

  it('picks the newest live run by createdAt, not array order', () => {
    const older = run({
      status: 'completed',
      conclusion: 'failure',
      databaseId: 10,
      createdAt: '2026-09-16T15:41:00Z',
    });
    const newer = run({
      status: 'in_progress',
      conclusion: '',
      databaseId: 11,
      createdAt: '2026-09-16T15:42:00Z',
    });
    const skipped = run({
      conclusion: 'skipped',
      databaseId: 12,
      createdAt: '2026-09-16T15:43:00Z',
    });
    expect(gateRunForHead([skipped, older, newer], HEAD)?.databaseId).toBe(11);
    expect(gateRunForHead([newer, skipped, older], HEAD)?.databaseId).toBe(11);
  });

  it('picks a settled success as started', () => {
    expect(gateRunForHead([run({ conclusion: 'success' })], HEAD)?.conclusion).toBe('success');
    expect(gateRunForHead([run({ conclusion: 'failure' })], HEAD)?.conclusion).toBe('failure');
  });
});

// #561: `gh pr ready` starts the real gate a few seconds after the draft-time skip
// concludes. The skip-run still looks live while its jobs skip, so `pr-wait` watches
// it, then must wait for the newer run instead of reporting "gate skipped".
const READY_PR = { isDraft: false } as const;
const DRAFT_PR = { isDraft: true } as const;

const skippedDraftTimeRun = (parts: { databaseId: number; createdAt: string }) =>
  run({
    ...parts,
    status: 'completed',
    conclusion: 'skipped',
    url: `https://github.com/freegantt/freegantt/actions/runs/${parts.databaseId}`,
  });

const readyGateRun = (parts: { databaseId: number; createdAt: string }) =>
  run({
    ...parts,
    status: 'in_progress',
    conclusion: '',
    url: `https://github.com/freegantt/freegantt/actions/runs/${parts.databaseId}`,
  });

describe('pr-wait waits for the ready gate after a draft-time skip', () => {
  const skipped560 = skippedDraftTimeRun({
    databaseId: 36193124161,
    createdAt: '2026-09-25T21:43:58Z',
  });
  const ready560 = readyGateRun({
    databaseId: 36193128507,
    createdAt: '2026-09-25T21:44:01Z',
  });
  const skipped558 = skippedDraftTimeRun({
    databaseId: 36191438791,
    createdAt: '2026-09-25T21:25:08Z',
  });
  const ready558 = readyGateRun({
    databaseId: 36191443831,
    createdAt: '2026-09-25T21:25:12Z',
  });

  it('treats an in-progress draft-time run as live until it concludes skipped', () => {
    const skipping = run({
      databaseId: skipped560.databaseId,
      createdAt: skipped560.createdAt,
      status: 'in_progress',
      conclusion: '',
    });
    expect(isLiveGateRun(skipping, HEAD)).toBe(true);
    expect(gateRunForHead([skipping], HEAD)?.databaseId).toBe(skipped560.databaseId);
  });

  it('waits after that skip on a ready pull request, and reports skipped only when no newer run appears', () => {
    expect(shouldWaitForNewerRunAfterSkip(skipped560, READY_PR)).toBe(true);
    expect(gateRunForHead([skipped560], HEAD)).toBeUndefined();
    expect(gateRunForHead([skipped560], HEAD, { besidesId: skipped560.databaseId })).toBeUndefined();

    const skippedVerdict = summarizeGateRun(skipped560, { ...CONTEXT, number: 560, seconds: 8 });
    expect(skippedVerdict.ok).toBe(false);
    expect(skippedVerdict.verdict).toContain('gate skipped');
    expect(skippedVerdict.verdict).toContain(String(skipped560.databaseId));
  });

  it('picks the ready gate that appears seconds later on #560, not the skipped draft-time run', () => {
    expect(
      gateRunForHead([skipped560, ready560], HEAD, { besidesId: skipped560.databaseId })?.databaseId,
    ).toBe(ready560.databaseId);
    expect(gateRunForHead([ready560, skipped560], HEAD)?.databaseId).toBe(ready560.databaseId);
  });

  it('picks the ready gate that appears seconds later on #558, not the skipped draft-time run', () => {
    expect(shouldWaitForNewerRunAfterSkip(skipped558, READY_PR)).toBe(true);
    expect(
      gateRunForHead([skipped558, ready558], HEAD, { besidesId: skipped558.databaseId })?.databaseId,
    ).toBe(ready558.databaseId);
  });

  it('does not wait for a replacement when the pull request is still a draft', () => {
    expect(shouldWaitForNewerRunAfterSkip(skipped560, DRAFT_PR)).toBe(false);
  });
});
