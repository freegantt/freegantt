// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `ocr-review` exists because a real `ocr review` run takes 10 to 30+ minutes, longer than a
// foreground tool call allows, so an agent is left to poll `ocr session list` by hand — the same
// mistake `pr-wait` already exists to stop for CI (#415, #420). This file pins the three decisions
// that poll makes on the agent's behalf:
//   - which session is the one this run just opened, among every session this repo has saved;
//   - which comments are new since the last read, so a finding prints exactly once;
//   - whether a finished session is a PASS or a PARTIAL, and what a PARTIAL names to fix it.
// The stall clock — no progress for 15 minutes kills the run — is pinned on its own, since nothing
// else in this file exercises real time.

import { describe, expect, it } from 'vitest';
import {
  findOwnSession,
  formatFinding,
  findingTitle,
  isStalled,
  newComments,
  verdictForSession,
} from '../../scripts/ocr-review.mjs';

const REPO = '/home/pawel/orca/workspaces/freegantt/ocr-review-script';
const OTHER_REPO = '/home/pawel/orca/workspaces/freegantt/517-sync';

const session = (
  parts: Partial<{
    sessionId: string;
    repoDir: string;
    startTime: string;
    endTime: string;
    selectedFiles: number;
    completedFiles: number;
    failedFiles: number;
    totalComments: number;
    terminalState: string;
    failedFilePaths: readonly string[];
  }> = {},
) => ({
  sessionId: parts.sessionId ?? 'a1',
  repoDir: parts.repoDir ?? REPO,
  startTime: parts.startTime ?? '2026-09-24T20:00:00Z',
  endTime: parts.endTime ?? '2026-09-24T20:10:00Z',
  selectedFiles: parts.selectedFiles ?? 5,
  completedFiles: parts.completedFiles ?? 5,
  failedFiles: parts.failedFiles ?? 0,
  totalComments: parts.totalComments ?? 0,
  terminalState: parts.terminalState ?? 'complete',
  failedFilePaths: parts.failedFilePaths ?? [],
});

const comment = (
  parts: Partial<{
    path: string;
    content: string;
    startLine: number;
    endLine: number;
    severity: string;
    category: string;
  }> = {},
) => ({
  path: parts.path ?? 'src/data/entry-store.ts',
  content: parts.content ?? 'The write set stays open past the point the doc promises it closes.',
  startLine: parts.startLine ?? 42,
  endLine: parts.endLine ?? 42,
  severity: parts.severity ?? 'medium',
  category: parts.category ?? 'bug',
});

describe('ocr-review picks the session this run just opened', () => {
  it('finds nothing for an empty board', () => {
    expect(findOwnSession([], { repoDir: REPO, notBefore: '2026-09-24T20:00:00Z' })).toBeUndefined();
  });

  it('ignores a session for another repo', () => {
    const other = session({ repoDir: OTHER_REPO });
    expect(findOwnSession([other], { repoDir: REPO, notBefore: '2026-09-24T20:00:00Z' })).toBeUndefined();
  });

  it('ignores a session that started before the launch', () => {
    const stale = session({ startTime: '2026-09-24T19:00:00Z' });
    expect(findOwnSession([stale], { repoDir: REPO, notBefore: '2026-09-24T20:00:00Z' })).toBeUndefined();
  });

  it('picks a session that started exactly at the launch instant', () => {
    const own = session({ sessionId: 'launched-now', startTime: '2026-09-24T20:00:00Z' });
    expect(findOwnSession([own], { repoDir: REPO, notBefore: '2026-09-24T20:00:00Z' })?.sessionId).toBe(
      'launched-now',
    );
  });

  it('picks the newest of several candidates, not array order', () => {
    const older = session({ sessionId: 'older', startTime: '2026-09-24T20:01:00Z' });
    const newer = session({ sessionId: 'newer', startTime: '2026-09-24T20:02:00Z' });
    expect(
      findOwnSession([older, newer], { repoDir: REPO, notBefore: '2026-09-24T20:00:00Z' })?.sessionId,
    ).toBe('newer');
    expect(
      findOwnSession([newer, older], { repoDir: REPO, notBefore: '2026-09-24T20:00:00Z' })?.sessionId,
    ).toBe('newer');
  });
});

describe('ocr-review only reports a finding once', () => {
  it('reports every finding the first time it sees them', () => {
    const first = comment({ path: 'a.ts' });
    const second = comment({ path: 'b.ts' });
    expect(newComments([], [first, second])).toEqual([first, second]);
  });

  it('drops a finding already reported, even with a fresh array instance', () => {
    const seen = comment({ path: 'a.ts', content: 'same text' });
    const sameAgain = comment({ path: 'a.ts', content: 'same text' });
    expect(newComments([seen], [sameAgain])).toEqual([]);
  });

  it('keeps two findings on the same line apart by content', () => {
    const first = comment({ path: 'a.ts', startLine: 10, content: 'first issue' });
    const second = comment({ path: 'a.ts', startLine: 10, content: 'second issue' });
    expect(newComments([first], [first, second])).toEqual([second]);
  });
});

describe('ocr-review formats one line per finding', () => {
  it('names the file, the line, the severity and a short title', () => {
    const line = formatFinding(
      comment({ path: 'src/data/entry-store.ts', startLine: 42, severity: 'medium' }),
    );
    expect(line).toContain('src/data/entry-store.ts:42');
    expect(line).toContain('[medium]');
    expect(line).toContain('The write set stays open');
  });

  it('shows a line range when the finding spans more than one line', () => {
    const line = formatFinding(comment({ startLine: 10, endLine: 14 }));
    expect(line).toContain(':10-14');
  });

  it('falls back to the path alone when ocr gave no anchor line', () => {
    const line = formatFinding(comment({ startLine: 0, endLine: 0, path: 'src/model/errors.ts' }));
    expect(line.startsWith('src/model/errors.ts ')).toBe(true);
  });

  it('cuts a title at the first sentence, not the whole body', () => {
    expect(findingTitle('Short and clear. A second sentence nobody needs to see here.')).toBe(
      'Short and clear.',
    );
  });

  it('truncates a title with no sentence break instead of running on', () => {
    const long = 'x'.repeat(200);
    const title = findingTitle(long);
    expect(title.length).toBeLessThanOrEqual(120);
    expect(title.endsWith('…')).toBe(true);
  });
});

describe('ocr-review verdicts', () => {
  const context = { resumeCommand: 'pnpm ocr-review --resume a1' };

  it('a session with no failed file is a PASS', () => {
    const verdict = verdictForSession(session({ failedFilePaths: [] }), context);
    expect(verdict.ok).toBe(true);
    expect(verdict.failedFilePaths).toEqual([]);
    expect(verdict.line).toContain('ocr-review PASS');
  });

  it('a session with a failed file is a PARTIAL, and names the resume command', () => {
    const verdict = verdictForSession(
      session({ failedFilePaths: ['src/data/entry-batch.ts', 'src/data/transaction.ts'] }),
      context,
    );
    expect(verdict.ok).toBe(false);
    expect(verdict.failedFilePaths).toEqual(['src/data/entry-batch.ts', 'src/data/transaction.ts']);
    expect(verdict.line).toContain('ocr-review PARTIAL');
    expect(verdict.line).toContain('2 file(s) failed');
    expect(verdict.line).toContain('pnpm ocr-review --resume a1');
  });
});

describe('ocr-review kills a run that stops making progress', () => {
  const lastProgressAt = new Date('2026-09-24T20:00:00Z');

  it('is not stalled the instant progress lands', () => {
    expect(isStalled(lastProgressAt, lastProgressAt, 15)).toBe(false);
  });

  it('is not stalled just under the limit', () => {
    const now = new Date(lastProgressAt.getTime() + 14 * 60_000);
    expect(isStalled(lastProgressAt, now, 15)).toBe(false);
  });

  it('is stalled exactly at the limit, and past it', () => {
    const atLimit = new Date(lastProgressAt.getTime() + 15 * 60_000);
    const pastLimit = new Date(lastProgressAt.getTime() + 20 * 60_000);
    expect(isStalled(lastProgressAt, atLimit, 15)).toBe(true);
    expect(isStalled(lastProgressAt, pastLimit, 15)).toBe(true);
  });
});
