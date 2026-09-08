// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `scripts/check-sentence-length.mjs` enforces CLAUDE.md's ASD-STE100 sentence ceiling over comment
// prose. It exists because the pass was run by hand twice and drifted back both times (#164). So it
// gets the same treatment every other guard gets: a file it must reject, and a file it must accept.
//
// The script takes an optional file argument. With none it reads its own declared scope, which is
// the run `pnpm verify` performs.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/check-sentence-length.mjs');

interface Run {
  readonly exitCode: number;
  readonly output: string;
}

function runOver(file?: string): Run {
  try {
    const output = execFileSync('node', file === undefined ? [script] : [script, file], {
      cwd: root,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { exitCode: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { exitCode: failure.status ?? 1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

/** Writes `source` to a throwaway `.ts` file, runs the guard over it, then removes it. */
function runOverSource(source: string): Run {
  const file = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-sentence-'));
  const target = path.join(file, 'fixture.ts');
  fs.writeFileSync(target, source);
  try {
    return runOver(target);
  } finally {
    fs.rmSync(file, { recursive: true, force: true });
  }
}

const TWENTY_SIX_WORDS =
  'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen ' +
  'sixteen seventeen eighteen nineteen twenty twentyone twentytwo twentythree twentyfour ' +
  'twentyfive twentysix.';

describe('the sentence-length guard', () => {
  it('passes over its own declared scope', () => {
    const run = runOver();
    expect(run.output).toContain('sentence-length: clean');
    expect(run.exitCode).toBe(0);
  });

  it('rejects a comment sentence over the ceiling, and names file, line and count', () => {
    const run = runOverSource(`export const a = 1;\n// ${TWENTY_SIX_WORDS}\nexport const b = 2;\n`);
    expect(run.exitCode).toBe(1);
    expect(run.output).toContain('fixture.ts:2:');
    expect(run.output).toContain('26 words');
  });

  it('accepts a comment sentence at the ceiling', () => {
    const atCeiling = TWENTY_SIX_WORDS.replace(' twentysix.', '.');
    const run = runOverSource(`// ${atCeiling}\nexport const a = 1;\n`);
    expect(run.exitCode).toBe(0);
  });

  it('counts one backticked code span as one word', () => {
    const span = '`one two three four five six seven eight nine ten`';
    const run = runOverSource(`// ${span} ${TWENTY_SIX_WORDS.replace(' twentysix.', '.')}\n`);
    // The span plus 25 words is 26 by a naive count, and 26 by this one too — but only because the
    // span counts once. Ten words inside it would make a naive count 35.
    expect(run.output).toContain('26 words');
    expect(run.exitCode).toBe(1);
  });

  it('joins a sentence wrapped over several comment lines', () => {
    const wrapped = TWENTY_SIX_WORDS.split(' ')
      .map((word) => `// ${word}`)
      .join('\n');
    const run = runOverSource(`${wrapped}\nexport const a = 1;\n`);
    expect(run.exitCode).toBe(1);
    expect(run.output).toContain('26 words');
  });

  it('reads a block comment as well as a line comment', () => {
    const run = runOverSource(`/** ${TWENTY_SIX_WORDS} */\nexport const a = 1;\n`);
    expect(run.exitCode).toBe(1);
  });

  it('reads a comment that follows code on the same line', () => {
    // The red fixture for the blind spot the #163 review found: `commentLines` only accepted a line
    // that started with `//`, so a breach after a semicolon reported clean.
    const run = runOverSource(`export const a = 1; // ${TWENTY_SIX_WORDS}\n`);
    expect(run.exitCode).toBe(1);
    expect(run.output).toContain('fixture.ts:1:');
    expect(run.output).toContain('26 words');
  });

  it('reads a `//` inside a string literal as code, not as prose', () => {
    const url = `"https://example.com ${TWENTY_SIX_WORDS}"`;
    const run = runOverSource(`export const a = ${url};\n`);
    expect(run.exitCode).toBe(0);
  });

  it('keeps two trailing comments apart instead of joining them into one sentence', () => {
    const half = 'one two three four five six seven eight nine ten eleven twelve thirteen';
    const run = runOverSource(`export const a = 1; // ${half}\nexport const b = 2; // ${half}\n`);
    expect(run.exitCode).toBe(0);
  });

  it('names its own scope on a clean default run, so green never reads as the whole tree', () => {
    const run = runOver();
    expect(run.output).toContain('declared scope, not the whole tree');
  });

  it('does not split a sentence at an abbreviation or a dotted code reference', () => {
    // Both periods here end a word, not a sentence. Split at either one and the 26-word breach
    // below would read as two short sentences and pass.
    const run = runOverSource(`// e.g. \`plans/01.md\` ${TWENTY_SIX_WORDS}\n`);
    expect(run.exitCode).toBe(1);
    expect(run.output).toContain('28 words');
  });
});
