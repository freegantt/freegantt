// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `scripts/check-crap.mjs` scores production functions. Metric `crap` mixes cyclomatic complexity
// with statement coverage. Metric `complexity` drops coverage. `crap.json` holds the switch.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  crapScore,
  evaluateTree,
  functionsIn,
  mergeCoverageMaps,
  readConfig,
} from '../../scripts/check-crap.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/check-crap.mjs');

interface Run {
  readonly exitCode: number;
  readonly output: string;
}

function runCli(args: string[], cwd = root): Run {
  try {
    const output = execFileSync('node', [script, ...args], { cwd, encoding: 'utf8', stdio: 'pipe' });
    return { exitCode: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

function fixtureRoot(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-crap-'));
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, contents);
  }
  return dir;
}

describe('crapScore', () => {
  it('equals complexity when coverage is total', () => {
    expect(crapScore(10, 1)).toBe(10);
  });

  it('equals complexity squared plus complexity when coverage is none', () => {
    expect(crapScore(5, 0)).toBe(30);
  });
});

describe('mergeCoverageMaps', () => {
  it('adds statement hits when both reports name the same file', () => {
    const merged = mergeCoverageMaps([
      { '/a.ts': { s: { '0': 1 } } },
      { '/a.ts': { s: { '0': 2 } }, '/b.ts': { s: { '0': 1 } } },
    ]);
    expect(merged['/a.ts']?.s?.['0']).toBe(3);
    expect(merged['/b.ts']?.s?.['0']).toBe(1);
  });
});

describe('functionsIn', () => {
  it('starts at one and adds one for an if', () => {
    const [fn] = functionsIn('export function f(x: boolean) { if (x) return 1; return 0; }\n');
    expect(fn?.complexity).toBe(2);
  });

  it('scores a nested function on its own, and does not add it to the parent', () => {
    const found = functionsIn(`
      export function outer(x: boolean) {
        if (x) return;
        function inner(y: boolean, z: boolean) {
          if (y) return;
          if (z) return;
        }
        inner(true, false);
      }
    `);
    const outer = found.find((row) => row.name === 'outer');
    const inner = found.find((row) => row.name === 'inner');
    expect(outer?.complexity).toBe(2);
    expect(inner?.complexity).toBe(3);
  });

  it('counts each case and not the default', () => {
    const [fn] = functionsIn(`
      export function f(x: number) {
        switch (x) {
          case 1: return 'a';
          case 2: return 'b';
          default: return 'c';
        }
      }
    `);
    expect(fn?.complexity).toBe(3);
  });

  it('counts a default parameter as a branch', () => {
    const [fn] = functionsIn('export function f(a = 1) { return a; }\n');
    expect(fn?.complexity).toBe(2);
  });
});

describe('readConfig', () => {
  it('rejects a metric that is not crap or complexity', () => {
    const dir = fixtureRoot({ 'crap.json': JSON.stringify({ metric: 'lines', threshold: 10 }) });
    try {
      expect(() => readConfig(path.join(dir, 'crap.json'))).toThrow(/metric must be "crap" or "complexity"/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('evaluateTree metric switch', () => {
  it('ignores missing coverage when metric is complexity', () => {
    const dir = fixtureRoot({
      'src/hot.ts': 'export function f(a: boolean, b: boolean) { if (a) return; if (b) return; }\n',
    });
    try {
      const result = evaluateTree({
        rootDir: dir,
        srcDir: path.join(dir, 'src'),
        metric: 'complexity',
        threshold: 2,
        coveragePath: path.join(dir, 'coverage/coverage-final.json'),
        collectCoverageRun: () => {
          throw new Error('complexity mode must not collect coverage');
        },
      });
      expect(result.breaches).toHaveLength(1);
      expect(result.breaches[0]?.score).toBe(3);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('backs off: the same uncovered function fails CRAP and passes complexity', () => {
    const source = 'export function f(a: boolean, b: boolean) { if (a) return; if (b) return; }\n';
    const dir = fixtureRoot({ 'src/hot.ts': source });
    const abs = path.join(dir, 'src/hot.ts');
    const coverage = {
      [abs]: {
        path: abs,
        statementMap: {
          '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 80 } },
        },
        s: { '0': 0 },
      },
    };
    try {
      const crap = evaluateTree({
        rootDir: dir,
        srcDir: path.join(dir, 'src'),
        metric: 'crap',
        threshold: 5,
        coveragePath: path.join(dir, 'coverage/coverage-final.json'),
        coverage,
      });
      const complexity = evaluateTree({
        rootDir: dir,
        srcDir: path.join(dir, 'src'),
        metric: 'complexity',
        threshold: 5,
        coveragePath: path.join(dir, 'coverage/coverage-final.json'),
        coverage,
      });
      expect(crap.breaches).toHaveLength(1);
      expect(complexity.breaches).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads coverage/pure and coverage/dom and does not spawn a third test run', () => {
    const source = 'export function f() { return 1; }\n';
    const dir = fixtureRoot({ 'src/ok.ts': source });
    const abs = path.join(dir, 'src/ok.ts');
    const fileCov = {
      [abs]: {
        path: abs,
        statementMap: { '0': { start: { line: 1, column: 0 }, end: { line: 1, column: 40 } } },
        s: { '0': 1 },
      },
    };
    fs.mkdirSync(path.join(dir, 'coverage/pure'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'coverage/dom'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'coverage/pure/coverage-final.json'), JSON.stringify(fileCov));
    fs.writeFileSync(path.join(dir, 'coverage/dom/coverage-final.json'), JSON.stringify({}));
    try {
      const result = evaluateTree({
        rootDir: dir,
        srcDir: path.join(dir, 'src'),
        metric: 'crap',
        threshold: 20,
        coveragePath: path.join(dir, 'coverage/coverage-final.json'),
        collectCoverageRun: () => {
          throw new Error('must not re-run tests when project coverage JSON is present');
        },
      });
      expect(result.breaches).toHaveLength(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the check-crap CLI', () => {
  it('rejects a function over the complexity ceiling and names file, line and score', () => {
    const dir = fixtureRoot({
      'crap.json': JSON.stringify({ metric: 'complexity', threshold: 2 }),
      'src/hot.ts': 'export function f(a: boolean, b: boolean) { if (a) return; if (b) return; }\n',
    });
    try {
      const run = runCli(['--root', dir, '--no-collect-coverage']);
      expect(run.exitCode).toBe(1);
      expect(run.output).toContain('src/hot.ts:1 f');
      expect(run.output).toContain('complexity=3');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('accepts a function at the complexity ceiling', () => {
    const dir = fixtureRoot({
      'crap.json': JSON.stringify({ metric: 'complexity', threshold: 2 }),
      'src/ok.ts': 'export function f(a: boolean) { if (a) return 1; return 0; }\n',
    });
    try {
      const run = runCli(['--root', dir, '--no-collect-coverage']);
      expect(run.exitCode).toBe(0);
      expect(run.output).toContain('check-crap: clean');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('passes the committed tree at the committed threshold', () => {
    const run = runCli(['--metric', 'complexity', '--threshold', '36', '--no-collect-coverage']);
    expect(run.exitCode).toBe(0);
    expect(run.output).toContain('check-crap: clean');
  });
});
