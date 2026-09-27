// A reader should not need a plan to decode a comment, a test name, or a doc. Slice decision ids,
// review finding ids, and question ids stay in `plans/`, in ADRs, and in commit messages. Everywhere
// else states the rule itself (#536).
//
// The tree still holds many old citations. This guard reads lines added since `main`'s merge-base,
// so a new citation fails and an untouched one does not. After that sweep, switch the scan to the
// whole tree.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = path
  .relative(root, fileURLToPath(import.meta.url))
  .split(path.sep)
  .join('/');

const TEXT_FILE = /\.(?:cjs|css|html|js|json|md|mdc|mjs|ts|tsx|yml|yaml)$/;

/** `plans/` holds the ids. An ADR keeps the wording it shipped with. */
const EXEMPT_PREFIXES = ['plans/', 'docs/adr/'];
const EXEMPT_FILES = new Set(['CLAUDE.md', 'AGENTS.md', SELF]);

const SLICE_DECISION = /\bD-S\d[\d.]*-\d+(?:\/\d+)*\b/g;
const REVIEW_FINDING = /\b[FJRW]\d+\b/g;
const QUESTION_ID = /\bQ\d+\b/g;
/** A slice section such as `S1.12`. A bare `S5` stays legal: it also names a sprint or a series. */
const SLICE_SECTION = /(?<!-)\bS\d+(?:\.\d+)+\b/g;

interface LabelHit {
  readonly file: string;
  readonly line: number;
  readonly id: string;
  readonly text: string;
}

interface AddedLine {
  readonly file: string;
  readonly line: number;
  readonly text: string;
}

function posix(rel: string): string {
  return rel.split(path.sep).join('/');
}

function isExemptPath(rel: string): boolean {
  const file = posix(rel);
  if (EXEMPT_FILES.has(file)) return true;
  return EXEMPT_PREFIXES.some((prefix) => file === prefix.slice(0, -1) || file.startsWith(prefix));
}

function labelsInLine(line: string): string[] {
  const ids = [
    ...(line.match(SLICE_DECISION) ?? []),
    ...(line.match(REVIEW_FINDING) ?? []),
    ...(line.match(QUESTION_ID) ?? []),
    ...(line.match(SLICE_SECTION) ?? []),
  ];
  return [...new Set(ids)];
}

/** Reads `git diff -U0` hunks and returns every added line with its new-file line number. */
function addedLinesFromDiff(diff: string): AddedLine[] {
  const lines: AddedLine[] = [];
  let file = '';
  let newLine = 0;
  for (const raw of diff.split('\n')) {
    if (raw.startsWith('+++ b/')) {
      file = raw.slice('+++ b/'.length);
      continue;
    }
    if (raw.startsWith('+++ /dev/null')) {
      file = '';
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (file === '' || raw.startsWith('diff ') || raw.startsWith('index ') || raw.startsWith('--- ')) {
      continue;
    }
    if (raw.startsWith('+')) {
      if (!raw.startsWith('+++')) {
        lines.push({ file, line: newLine, text: raw.slice(1) });
      }
      newLine += 1;
      continue;
    }
    if (raw.startsWith('-')) continue;
    if (raw.startsWith('\\')) continue;
    newLine += 1;
  }
  return lines;
}

function hitsOnAddedLines(added: readonly AddedLine[]): LabelHit[] {
  const hits: LabelHit[] = [];
  for (const row of added) {
    if (!TEXT_FILE.test(row.file) || isExemptPath(row.file)) continue;
    for (const id of labelsInLine(row.text)) {
      hits.push({ file: row.file, line: row.line, id, text: row.text.trim() });
    }
  }
  return hits;
}

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function resolveBaseRef(): string {
  const configured = process.env['FG_BASE_REF'] ?? 'main';
  for (const candidate of [`origin/${configured}`, configured]) {
    try {
      git(['rev-parse', '--verify', candidate]);
      return candidate;
    } catch {
      // try the next spelling
    }
  }
  throw new Error(`spec-labels: no "${configured}" ref, locally or as origin/${configured}.`);
}

function untrackedTextFiles(): AddedLine[] {
  const listing = git(['ls-files', '--others', '--exclude-standard']);
  const rows: AddedLine[] = [];
  for (const rel of listing.split('\n').filter(Boolean)) {
    const file = posix(rel);
    if (!TEXT_FILE.test(file) || isExemptPath(file)) continue;
    const full = path.join(root, rel);
    let content: string;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    content.split('\n').forEach((text, index) => {
      rows.push({ file, line: index + 1, text });
    });
  }
  return rows;
}

function addedLinesSinceMergeBase(): AddedLine[] {
  const baseRef = resolveBaseRef();
  const mergeBase = git(['merge-base', 'HEAD', baseRef]).trim();
  const diff = git(['diff', '-U0', '--no-ext-diff', mergeBase]);
  return [...addedLinesFromDiff(diff), ...untrackedTextFiles()];
}

describe('spec ids stay in plans and ADRs', () => {
  it('flags a slice decision id, including a dotted slice and a slash list', () => {
    expect(labelsInLine('see the pane width rule D-S5-31 here')).toEqual(['D-S5-31']);
    expect(labelsInLine('the row-geometry rule D-S1.11-6')).toEqual(['D-S1.11-6']);
    expect(labelsInLine('the error bus D-S5-40/41/42')).toEqual(['D-S5-40/41/42']);
  });

  it('flags a review finding id and a question id', () => {
    expect(labelsInLine('Live (J1).')).toEqual(['J1']);
    expect(labelsInLine('the write door (F4)')).toEqual(['F4']);
    expect(labelsInLine('load origin (Q3)')).toEqual(['Q3']);
    expect(labelsInLine('R2 and W8 in one comment')).toEqual(['R2', 'W8']);
  });

  it('flags a slice section id, but not the slice inside a decision id', () => {
    expect(labelsInLine('the locale option (S1.12)')).toEqual(['S1.12']);
    expect(labelsInLine('the error bus S5.12.3')).toEqual(['S5.12.3']);
    expect(labelsInLine('the row-geometry rule D-S1.11-6')).toEqual(['D-S1.11-6']);
  });

  it('does not flag a bare slice or sprint number', () => {
    expect(labelsInLine('bars S1 to S7 in the chart')).toEqual([]);
  });

  it('does not flag JSON, an ISO date, or an invariant id', () => {
    expect(labelsInLine('JSON.stringify(row)')).toEqual([]);
    expect(labelsInLine('owner ruling 2026-09-23')).toEqual([]);
    expect(labelsInLine('one capability resolution (I14)')).toEqual([]);
  });

  it('does not flag W3C, because the digit is not a whole word', () => {
    expect(labelsInLine('the W3C calendar')).toEqual([]);
  });

  it('exempts plans, ADRs, and the files that state the ban', () => {
    expect(isExemptPath('plans/02-public-api.md')).toBe(true);
    expect(isExemptPath('docs/adr/0017-the-entry-answers-questions-about-itself.md')).toBe(true);
    expect(isExemptPath('CLAUDE.md')).toBe(true);
    expect(isExemptPath('src/api/gantt.ts')).toBe(false);
    expect(isExemptPath('docs/architecture/files.md')).toBe(false);
    expect(isExemptPath('harness/main.ts')).toBe(false);
  });

  it('flags an added line in a canned diff and ignores a removed one', () => {
    const diff = [
      'diff --git a/src/api/gantt.ts b/src/api/gantt.ts',
      '--- a/src/api/gantt.ts',
      '+++ b/src/api/gantt.ts',
      '@@ -10,1 +10,1 @@',
      '-old comment with J99',
      '+new comment with J54',
    ].join('\n');
    expect(hitsOnAddedLines(addedLinesFromDiff(diff))).toEqual([
      { file: 'src/api/gantt.ts', line: 10, id: 'J54', text: 'new comment with J54' },
    ]);
  });

  it('does not flag an added line under plans/', () => {
    const diff = [
      'diff --git a/plans/02-public-api.md b/plans/02-public-api.md',
      '--- a/plans/02-public-api.md',
      '+++ b/plans/02-public-api.md',
      '@@ -1,0 +1,1 @@',
      '+D-S5-31 stays legal here',
    ].join('\n');
    expect(hitsOnAddedLines(addedLinesFromDiff(diff))).toEqual([]);
  });

  it('rejects spec ids on lines added since main', () => {
    const hits = hitsOnAddedLines(addedLinesSinceMergeBase());
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });
});
