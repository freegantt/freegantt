// `root: 'harness'` with no explicit input list makes `pnpm build` emit only
// `harness/index.html`. Every other demo page needs its own entry in `vite.config.ts`'s
// `rollupOptions.input`, or it never sees a production build — it only ever worked because the dev
// server serves every file under `root` regardless of the input map, so the gap is invisible until
// someone runs `pnpm build` and looks.
//
// That happened twice with nobody noticing: `dense-tile-grid.html` predates this guard, and
// `theme-push.html` (#433) shipped without an entry until review caught it. A gap nobody can see
// from the dev server earns a guard, the same call `file-inventory.test.ts` already made for
// `docs/architecture/files.md`.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const harnessDir = path.join(root, 'harness');
const viteConfigPath = path.join(root, 'vite.config.ts');

/** Every `.html` page under `harness/`, by file name — what the dev server can already reach. */
function harnessPages(): string[] {
  return fs
    .readdirSync(harnessDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => entry.name);
}

/** Every `page('<file>.html')` call inside `rollupOptions.input` — what `pnpm build` will emit. */
function pagesInBuildInput(): string[] {
  const source = fs.readFileSync(viteConfigPath, 'utf8');
  return [...source.matchAll(/page\('([a-z0-9-]+\.html)'\)/g)].map((match) => match[1] as string);
}

describe('every harness/*.html page has its own vite.config.ts build input (D-S1.11-5)', () => {
  it('names no page the build input leaves out', () => {
    const input = new Set(pagesInBuildInput());
    const missing = harnessPages().filter((page) => !input.has(page));
    expect(missing).toEqual([]);
  });

  it('names no page in the build input that no longer exists', () => {
    const pages = new Set(harnessPages());
    const stale = pagesInBuildInput().filter((page) => !pages.has(page));
    expect(stale).toEqual([]);
  });
});
