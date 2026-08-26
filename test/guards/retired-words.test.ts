// D-S1.11-3: `Project` (ADR 0004) and `host` (D-S1.11-6, #64) are retired words — both used to smuggle
// two concepts under one name, the same "chart" failure #7 already named once. This guard, shaped like
// `scripts/check-vendor-names.mjs`, keeps either word from creeping back into prose or an identifier.
//
// `docs/adr/**` is exempt by design (ADR 0004's own consequences: ADRs keep their original wording as
// historical record). Two narrower exemptions cover legitimate historical citations elsewhere: a line
// citing the ADR that retired `Project` (CONTEXT.md's own glossary explains the retirement, which
// necessarily names the retired word once), and the literal git branch name `host-input-dates-and-ids`
// cited in `harness/doc.html` as a historical fact, not a live usage of the concept.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SCAN_DIRS = ['src', 'harness', 'e2e', 'test', 'scripts', 'fixtures'];
const SCAN_FILES = [
  'CONTEXT.md',
  'CLAUDE.md',
  'README.md',
  'plans/00-overview.md',
  'plans/01-domain-architecture.md',
  'plans/02-public-api.md',
  'plans/03-slices.md',
  'plans/04-implementation.md',
  'docs/00-guardrails-overview.md',
  'docs/01-invariant-guard-matrix.md',
  'docs/02-lint-rules.md',
  'docs/03-boundaries-and-config.md',
  'docs/04-hooks-and-ci.md',
];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const SELF = path.relative(root, fileURLToPath(import.meta.url));
const BRANCH_NAME_CITATION = 'host-input-dates-and-ids';

function walk(dir: string, files: string[]): void {
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    try {
      walk(path.join(root, dir), files);
    } catch {
      // directory doesn't exist — fine.
    }
  }
  for (const file of SCAN_FILES) {
    files.push(path.join(root, file));
  }
  return files;
}

interface Hit {
  file: string;
  line: number;
  word: string;
  text: string;
}

function findHits(pattern: RegExp, isExempt: (line: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const file of collectFiles()) {
    if (path.relative(root, file) === SELF) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    content.split('\n').forEach((line, index) => {
      if (isExempt(line)) return;
      const match = pattern.exec(line);
      pattern.lastIndex = 0;
      if (match) {
        hits.push({ file: path.relative(root, file), line: index + 1, word: match[0], text: line.trim() });
      }
    });
  }
  return hits;
}

describe('retired words stay retired', () => {
  it('never reintroduces `host` (D-S1.11-6, #64)', () => {
    const hits = findHits(
      /\bhosts?\b/i,
      (line) => /retired/i.test(line) || line.includes(BRANCH_NAME_CITATION) || /localhost/i.test(line),
    );
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  it('never reintroduces `Project` (ADR 0004)', () => {
    const hits = findHits(/\bProject\b/, (line) => /ADR 0\d{3}/.test(line));
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });
});
