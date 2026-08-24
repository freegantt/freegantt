// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4).
//
// `.github/workflows/ci.yml` is `workflow_dispatch:` only, so `.githooks/pre-push` is the gate that
// actually runs. That only holds while the hook runs everything the workflow would: the failure mode
// is silent — someone adds a CI job, nobody adds it to `pnpm verify`, and the hook keeps reporting
// green over a check it no longer performs.
//
// So: every `pnpm <script>` a CI job runs must also appear in the `verify` script, and `pre-push`
// must invoke `verify`. Adding a job without extending `verify` fails here.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string): string => fs.readFileSync(path.join(root, rel), 'utf8');

/** `- run: pnpm install --frozen-lockfile` is scaffolding every job repeats, not a check. */
const SCAFFOLDING = new Set(['install']);

function pnpmScriptsRunBy(workflow: string): string[] {
  const names = [...workflow.matchAll(/^\s*-\s*run:\s*pnpm\s+(?:run\s+)?([\w:-]+)/gm)].map((m) => m[1]!);
  return [...new Set(names)].filter((name) => !SCAFFOLDING.has(name));
}

describe('pre-push runs everything CI would', () => {
  const workflow = read('.github/workflows/ci.yml');
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  const verify = pkg.scripts['verify'] ?? '';
  const prePush = read('.githooks/pre-push');

  it('finds the CI jobs to compare against', () => {
    // Guards the parser itself: a workflow rewrite that stops matching would otherwise make every
    // assertion below vacuously pass.
    expect(pnpmScriptsRunBy(workflow).length).toBeGreaterThan(5);
  });

  for (const script of pnpmScriptsRunBy(workflow)) {
    it(`\`pnpm ${script}\` is covered by \`pnpm verify\``, () => {
      expect(verify).toContain(`pnpm ${script}`);
    });
  }

  it('pre-push invokes verify', () => {
    expect(prePush).toMatch(/^\s*pnpm verify\s*$/m);
  });

  it('every script verify chains actually exists in package.json', () => {
    const chained = [...verify.matchAll(/pnpm ([\w:-]+)/g)].map((m) => m[1]!);
    expect(chained.length).toBeGreaterThan(0);
    for (const script of chained) {
      expect(Object.keys(pkg.scripts)).toContain(script);
    }
  });
});
