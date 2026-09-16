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
//   - a run still in progress, which is not a verdict and must not settle.
// A pass needs a `pull_request` run on this head that actually succeeded.

import { describe, expect, it } from 'vitest';
import { gateRunForHead, isLiveGateRun, summarizeGateRun } from '../../scripts/pr-wait.mjs';

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
