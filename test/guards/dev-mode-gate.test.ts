// docs/00-guardrails-overview.md §5.1: `isDevMode()` reads `import.meta.env.DEV`, which Vite replaces
// with a literal when THIS library builds `dist/`. A consumer's own dev server never re-evaluates it,
// so every consumer receives `false`. Gating a consumer-facing diagnostic on it deletes that
// diagnostic from the product, and our own suite cannot see the loss: vitest runs with `DEV === true`,
// so the gated branch is the only branch we exercise.
//
// That combination has shipped three times — `'scale-options-ignored'` and the corrected-rollup report
// (both reached no consumer), and `'look-claimed-twice'` (caught in review). Each was
// specified as "warn in dev mode".
//
// This guard is an allowlist of IMPORTERS, not a parse of what each gate contains. Two reasons. A
// text scan cannot reliably tell a gated `raiseError` from an ungated one, and a guard that is nearly
// right is worse than none. And the allowlist puts the cost where it belongs: a new gate is not
// forbidden, it just cannot be added silently. Whoever adds one edits this file, and this file states
// the rule they need to have read.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** The one file that may define it. */
const HOME = 'src/data/dev-mode.ts';

/**
 * Every file permitted to import `isDevMode`, with the reason it qualifies.
 *
 * The test each entry must pass: **would a consumer want this?** If yes, it must not be gated — raise
 * it through `raiseError` at `severity: 'warning'` in every build instead. An entry belongs here only
 * when it sharpens *our own* feedback loop at a cost we do not want to charge a consumer, and would
 * still be correct if it never ran anywhere else.
 */
const ALLOWED_IMPORTERS: ReadonlyMap<string, string> = new Map([
  [
    'src/data/transaction.ts',
    'Deep-freezes a ChangeSet so our own tests catch a mutation of one. Freezing costs time, and a ' +
      'consumer gains no diagnostic by paying for it.',
  ],
  [
    'src/data/build-commit-change-set.ts',
    'Asserts an extension hook did not overwrite the body. It guards a library-internal invariant ' +
      'while we develop against it, and reports nothing to a consumer.',
  ],
]);

function sourceFilesUnder(dir: string): string[] {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFilesUnder(relative);
    return entry.isFile() && entry.name.endsWith('.ts') ? [relative] : [];
  });
}

/** A file that imports the symbol, as opposed to one that only names it in prose. Every `src/` file
 *  quoting "no longer behind `isDevMode()`" in a comment must not count as a caller. */
function importsDevMode(relativeFile: string): boolean {
  const text = fs.readFileSync(path.join(root, relativeFile), 'utf8');
  return /import\s*\{[^}]*\bisDevMode\b[^}]*\}\s*from/.test(text);
}

describe('isDevMode() gates are allowlisted (docs/00 §5.1)', () => {
  const importers = sourceFilesUnder('src')
    .filter((file) => file.replaceAll(path.sep, '/') !== HOME)
    .map((file) => file.replaceAll(path.sep, '/'))
    .filter(importsDevMode);

  it('no file imports isDevMode without a recorded reason', () => {
    const unlisted = importers.filter((file) => !ALLOWED_IMPORTERS.has(file));
    expect(
      unlisted,
      unlisted.length === 0
        ? ''
        : `These files import isDevMode() and are not allowlisted:\n` +
            unlisted.map((file) => `  - ${file}`).join('\n') +
            `\n\nisDevMode() is false in every build a consumer installs — Vite resolves it when THIS` +
            `\nrepo builds dist/, and their dev server never re-evaluates it. Our tests run with` +
            `\nDEV === true, so a gated branch is the only branch they exercise and the suite stays` +
            `\ngreen while the consumer gets nothing.` +
            `\n\nAsk: would a consumer want this?` +
            `\n  Yes -> do not gate it. Raise it through raiseError at severity: 'warning', always.` +
            `\n  No, it only sharpens our own loop -> add the file to ALLOWED_IMPORTERS with its reason.` +
            `\n\nSee docs/00-guardrails-overview.md §5.1 and src/data/dev-mode.ts.`,
    ).toEqual([]);
  });

  it('every allowlisted file still imports it, so the list cannot rot', () => {
    const stale = [...ALLOWED_IMPORTERS.keys()].filter((file) => !importers.includes(file));
    expect(
      stale,
      `These files are allowlisted but no longer import isDevMode(). Remove them from` +
        ` ALLOWED_IMPORTERS:\n` +
        stale.map((file) => `  - ${file}`).join('\n'),
    ).toEqual([]);
  });

  it('records why each allowlisted gate is not a consumer-facing diagnostic', () => {
    for (const [file, reason] of ALLOWED_IMPORTERS) {
      expect(reason.length, `${file} needs a real reason, not a placeholder`).toBeGreaterThan(40);
    }
  });
});
