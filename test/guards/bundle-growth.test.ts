// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `scripts/check-bundle-growth.mjs` (#342) fails a pull request whose bundle grew past budget
// unless a ledger row covers it. The script itself builds `main`'s merge-base with a real `git
// worktree` and a real `vite build`, which is too slow to run per assertion here — `pnpm build`
// already proves that path every `pnpm verify`. This file tests the pieces a fabricated fixture
// can drive without a build: the rename-safe key, the "no comparison happened" guard, the ledger
// parser's refusal to drop a malformed row in silence, and `size-limit --json`'s own output shape
// being checked rather than trusted.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  entryKey,
  evaluateGrowth,
  formatBudget,
  measureSizes,
  readLedger,
} from '../../scripts/check-bundle-growth.mjs';

/** A throwaway directory shaped like `measureSizes` expects: a `.size-limit.json` and a
 * `node_modules/.bin/size-limit` stub that prints `json` verbatim, standing in for the real CLI
 * so the test drives `measureSizes`' own parsing, never a real build. */
function fixtureDir(config: unknown, sizeLimitOutput: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-bundle-growth-'));
  fs.mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.size-limit.json'), JSON.stringify(config));
  fs.writeFileSync(
    path.join(dir, 'node_modules', '.bin', 'size-limit'),
    `#!/usr/bin/env node\nconsole.log(${JSON.stringify(JSON.stringify(sizeLimitOutput))});\n`,
  );
  fs.chmodSync(path.join(dir, 'node_modules', '.bin', 'size-limit'), 0o755);
  return dir;
}

describe('measureSizes', () => {
  it('rejects a size-limit result that is not a finite number, naming the entry', () => {
    const dir = fixtureDir(
      [{ name: 'core', path: 'dist/x.js', import: '{ A }' }],
      [{ name: 'core', size: null }],
    );
    try {
      expect(() => measureSizes(dir)).toThrow(/"core" reported a size of null, not a finite number/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects a size-limit result naming an entry .size-limit.json does not declare', () => {
    const dir = fixtureDir(
      [{ name: 'core', path: 'dist/x.js', import: '{ A }' }],
      [{ name: 'ghost', size: 100 }],
    );
    try {
      expect(() => measureSizes(dir)).toThrow(/"ghost", which is not in \.size-limit\.json/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('measures an empty .size-limit.json as an empty map, not a silent pass', () => {
    const dir = fixtureDir([], []);
    try {
      expect(measureSizes(dir).size).toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keys an entry by path + import, so a renamed entry still matches its counterpart', () => {
    const dir = fixtureDir(
      [{ name: 'core (renamed)', path: 'dist/x.js', import: '{ A }' }],
      [{ name: 'core (renamed)', size: 100 }],
    );
    try {
      const sizes = measureSizes(dir);
      const key = entryKey({ path: 'dist/x.js', import: '{ A }' });
      expect(sizes.get(key)).toEqual({ name: 'core (renamed)', size: 100 });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('evaluateGrowth', () => {
  it('matches a renamed entry by path + import and reports its real growth', () => {
    const key = entryKey({ path: 'dist/x.js', import: '{ A }' });
    const branch = new Map([[key, { name: 'A (renamed)', size: 2000 }]]);
    const base = new Map([[key, { name: 'A', size: 100 }]]);
    const result = evaluateGrowth(branch, base, { ledger: [], pullRequestId: '1', growthBudgetBytes: 1000 });
    expect(result.comparisons).toBe(1);
    expect(result.failures).toEqual([{ name: 'A (renamed)', delta: 1900 }]);
  });

  it('reports zero comparisons when no branch entry shares a base key — no growth check ran', () => {
    const branch = new Map([[entryKey({ path: 'dist/x.js', import: '{ A }' }), { name: 'A', size: 100 }]]);
    const base = new Map([[entryKey({ path: 'dist/y.js', import: '{ B }' }), { name: 'B', size: 90 }]]);
    const result = evaluateGrowth(branch, base, { ledger: [], pullRequestId: '1', growthBudgetBytes: 1000 });
    expect(result.comparisons).toBe(0);
    expect(result.failures).toEqual([]);
  });

  it('lets a ledger row cover growth over budget for the matching pull request and entry', () => {
    const key = entryKey({ path: 'dist/x.js', import: '{ A }' });
    const branch = new Map([[key, { name: 'A', size: 2000 }]]);
    const base = new Map([[key, { name: 'A', size: 100 }]]);
    const ledger = [{ pullRequest: '9', entry: 'A', recordedDelta: 1900, reason: 'known growth' }];
    const result = evaluateGrowth(branch, base, { ledger, pullRequestId: '9', growthBudgetBytes: 1000 });
    expect(result.failures).toEqual([]);
    expect(result.lines.at(-1)).toContain('known growth');
  });
});

describe('formatBudget', () => {
  it('reads a round-kB budget in kB, so the PASS and FAILED text stay in step with the constant', () => {
    expect(formatBudget(1000)).toBe('1 kB');
  });

  it('reads a non-round budget in bytes', () => {
    expect(formatBudget(2500)).toBe('2500 B');
  });
});

describe('readLedger', () => {
  /** Writes `content` to a throwaway ledger file, runs the guard over it, then removes it. */
  function readOverSource(content: string): unknown {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-ledger-'));
    const file = path.join(dir, 'ledger.md');
    fs.writeFileSync(file, content);
    try {
      return readLedger(file);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  it('parses the header row, the separator row, and a data row, and returns one entry', () => {
    const rows = readOverSource(
      '| Pull request | Entry | Delta (bytes) | Reason |\n| --- | --- | --- | --- |\n| #1 | core | 1200 | known growth |\n',
    );
    expect(rows).toEqual([{ pullRequest: '1', entry: 'core', recordedDelta: 1200, reason: 'known growth' }]);
  });

  it('throws, naming the line, on a row-shaped line with the wrong cell count', () => {
    expect(() => readOverSource('| #1 | core | 1200 |\n')).toThrow(/ledger\.md:1 .* has 3 cells, not 4/);
  });

  it('throws, naming the line, on a row-shaped line whose delta does not parse as a number', () => {
    expect(() => readOverSource('| #1 | core | not-a-number | known growth |\n')).toThrow(
      /ledger\.md:1 does not parse as a ledger row/,
    );
  });

  it('ignores ordinary prose that is not shaped like a table row', () => {
    expect(readOverSource('This file records accepted bundle growth. See #342.\n')).toEqual([]);
  });
});
