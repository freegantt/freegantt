// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `pr-wait` exists because a CI wait written on the spot reports green without having waited.
// `gh pr checks` carries two status vocabularies on one object — `bucket` is lowercase and coarse,
// `state` is uppercase and fine — and the human output prints the bucket word. A loop written from
// reading that output compares a `state` against a bucket word, never matches, and falls through on
// its first evaluation while still printing `pending`.
//
// So this file pins the three ways CI reports nothing while looking fine. Each is a case where a
// hand-written wait says green and the gate never ran:
//   - no checks at all, the `ready_for_review` trigger gap (docs/04 §5.2, #298/#235);
//   - every check SKIPPED, the stale draft-time run the same gap leaves behind;
//   - a check still pending, which is not a verdict and must not settle.
// A pass needs a check that actually went green.

import { describe, expect, it } from 'vitest';
import { summarizeChecks } from '../../scripts/pr-wait.mjs';

const CONTEXT = { number: 354, seconds: 12, branch: 'fix/some-branch' };

const check = (
  bucket: string,
  name = 'gate',
): { name: string; state: string; bucket: string; link: string } => ({
  name,
  state: bucket.toUpperCase(),
  bucket,
  link: 'https://example.invalid/run/1',
});

describe('pr-wait verdicts', () => {
  it('a passing gate is the only thing that reads as green', () => {
    const summary = summarizeChecks([check('pass')], CONTEXT);
    expect(summary).toMatchObject({ settled: true, ok: true });
    expect(summary.verdict).toContain('pr-wait PASS');
    expect(summary.verdict).toContain('#354');
  });

  it('no checks is the trigger gap, and names the documented fallback — never a pass', () => {
    const summary = summarizeChecks([], CONTEXT);
    expect(summary.ok).toBe(false);
    expect(summary.verdict).toContain('pr-wait FAILED');
    expect(summary.verdict).toContain('CI never started');
    expect(summary.verdict).toContain('gh workflow run ci.yml --ref fix/some-branch');
  });

  it('every check SKIPPED is the stale draft-time run — never a pass', () => {
    const summary = summarizeChecks([check('skipping')], CONTEXT);
    expect(summary.ok).toBe(false);
    expect(summary.verdict).toContain('SKIPPED');
    expect(summary.verdict).toContain('gh workflow run ci.yml');
  });

  it('a pending check does not settle, so the caller keeps waiting', () => {
    expect(summarizeChecks([check('pending'), check('pass', 'other')], CONTEXT)).toMatchObject({
      settled: false,
      ok: false,
    });
  });

  it('a failing check names the check and its link', () => {
    const summary = summarizeChecks([check('pass', 'lint'), check('fail')], CONTEXT);
    expect(summary).toMatchObject({ settled: true, ok: false });
    expect(summary.verdict).toContain('"gate" failed');
    expect(summary.verdict).toContain('https://example.invalid/run/1');
  });

  it('a cancelled check is a failure, not a pass', () => {
    expect(summarizeChecks([check('cancel')], CONTEXT).ok).toBe(false);
  });

  it('a skipped check beside a green one still passes — only an all-skipped run is the gap', () => {
    expect(summarizeChecks([check('pass'), check('skipping', 'optional')], CONTEXT).ok).toBe(true);
  });
});
