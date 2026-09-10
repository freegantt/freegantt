import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('type probes — Q1', () => {
  it('PropsEdit accepts undeclared keys; Write refuses strat; un-date compiles', () => {
    const tsc = resolve(process.cwd(), 'node_modules/.bin/tsc');
    const result = spawnSync(tsc, ['--noEmit', '-p', resolve(dir, 'tsconfig.json')], {
      encoding: 'utf8',
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
