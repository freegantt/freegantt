// The gate is the artifact the S1 -> S2 decision rests on (plans/s1.11-close-the-gate/README.md
// §3.4), so it gets the same treatment every other guard gets (docs/04 §4): a red-tested fixture.
// Drives `tagged()` against a temporary fixture directory, both directions —
//   - U2: delete the test, the gate goes red (id absent from source -> check fails).
//   - id present, its declared runner passing -> check passes.
//   - id present, its declared runner failing (the test itself broke) -> check fails.

import { describe, expect, it, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tagged } from '../../scripts/slice-gate.mjs';

let tmpDir: string | undefined;

function makeFixture(id: string | null): string {
  tmpDir = mkdtempSync(path.join(os.tmpdir(), 'slice-gate-test-'));
  mkdirSync(path.join(tmpDir, 'src'));
  mkdirSync(path.join(tmpDir, 'e2e'));
  if (id) {
    writeFileSync(path.join(tmpDir, 'src', 'example.test.ts'), `it('[${id}] does the thing', () => {});\n`);
  } else {
    writeFileSync(path.join(tmpDir, 'src', 'example.test.ts'), `it('unrelated', () => {});\n`);
  }
  return tmpDir;
}

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

describe('tagged()', () => {
  it('passes when the id exists in source and its runner passes', () => {
    const cwd = makeFixture('FX-1');
    const check = tagged('FX-1', ['fake'], 'fixture check', {
      runnerImpls: { fake: () => true },
      existsOptions: { cwd },
    });
    expect(check.run()).toBe(true);
  });

  it('fails when the id does not exist in source, even though the runner would pass (U2)', () => {
    const cwd = makeFixture(null);
    const check = tagged('FX-1', ['fake'], 'fixture check', {
      runnerImpls: { fake: () => true },
      existsOptions: { cwd },
    });
    expect(check.run()).toBe(false);
  });

  it('fails when the id exists but its declared runner fails (the test itself broke)', () => {
    const cwd = makeFixture('FX-1');
    const check = tagged('FX-1', ['fake'], 'fixture check', {
      runnerImpls: { fake: () => false },
      existsOptions: { cwd },
    });
    expect(check.run()).toBe(false);
  });

  it('requires every declared runner to pass', () => {
    const cwd = makeFixture('FX-1');
    const check = tagged('FX-1', ['fake', 'other'], 'fixture check', {
      runnerImpls: { fake: () => true, other: () => false },
      existsOptions: { cwd },
    });
    expect(check.run()).toBe(false);
  });
});
