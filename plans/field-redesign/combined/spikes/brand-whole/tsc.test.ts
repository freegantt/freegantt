import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = dirname(fileURLToPath(import.meta.url));

describe('brand probes — Q2 Q12', () => {
  it('whole ProposedEdit brand and PropsEdit intersection compile', () => {
    const tsc = resolve(process.cwd(), 'node_modules/.bin/tsc');
    const result = spawnSync(tsc, ['--noEmit', '-p', resolve(dir, 'tsconfig.json')], {
      encoding: 'utf8',
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
  });
});
