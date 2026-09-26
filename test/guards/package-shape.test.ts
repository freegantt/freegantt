// `package.json`'s `sideEffects` is a promise to every bundler that imports the package: each file
// not named here may be dropped when nothing calls it. S0 shipped a blanket `false`, which was
// false — `view/styles.ts` injects the base stylesheet on import (issue #137), and a bundler
// that believed the blanket promise shipped an unstyled Gantt. S5.13 narrowed it to the one file.
//
// Two documents describe the array today (`docs/03-boundaries-and-config.md` §3.1 and `plans/04`
// §3.1), and neither could tell when the manifest moved under them. This test holds all three in
// step: widen the array and it fails, and the failure names the documents to update with it.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The one file in `src/` that does something on import rather than on call. */
const SIDE_EFFECTING_FILES = ['src/view/styles.ts'];

function manifest(): { readonly sideEffects?: unknown } {
  return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    readonly sideEffects?: unknown;
  };
}

describe('package.json states what it does on import', () => {
  it('names exactly the side-effecting files', () => {
    expect(manifest().sideEffects).toEqual(SIDE_EFFECTING_FILES);
  });

  it('names files that exist', () => {
    for (const file of SIDE_EFFECTING_FILES) {
      expect(fs.existsSync(path.join(root, file)), `${file} is named but missing`).toBe(true);
    }
  });
});
