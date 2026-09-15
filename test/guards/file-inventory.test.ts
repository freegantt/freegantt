// `website/docs/architecture/files.md` claims to list every non-test file in `src/`. That claim
// was false for 24 files and had been false for long enough that nobody knew which of the 142 rows
// still described a live file. Nothing checked it, because the page is prose and prose is read by
// people, not by CI.
//
// So the claim becomes a test. The page names a file that `src/` does not hold, or `src/` holds a
// file the page does not name, and this fails with both lists.
//
// Why a guard and not a line in `maintaining.md`: the rule "re-run the comparison after any `src/`
// file is added or deleted" is a rule an agent must remember, and the same class of rule already
// broke twice — once as the hand-run sentence-length pass (#164), once as the hand-written CI wait
// (#354). A rule that must be remembered on a busy turn is not enforced.
//
// A guard with no failing fixture is presumed broken (`docs/04-hooks-and-ci.md` §4), so
// `inventoryDrift` is a pure function over two lists and is exercised against a rigged pair below.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventoryPage = path.join(root, 'website/docs/architecture/files.md');
const sourceRoot = path.join(root, 'src');

/** A row in the inventory opens with the file's path in a code span: ``| `view/theme.ts` | …``. */
const ROW_PATH = /^\| `([a-z0-9\-/.]+\.ts)`/gm;

/** A whole row: the file, then the symbols it exports, then what it is for. */
const ROW = /^\| `([a-z0-9\-/.]+\.ts)` \| (.+?) \| /gm;

/**
 * A symbol in the exports cell. Only a code span counts, because the cell mixes symbols with prose
 * about them. The cell "`FreeGanttError` and the catchable subclasses" names one symbol, not four.
 */
const CODE_SPAN = /`([^`]+)`/g;
const SYMBOL = /\b([A-Za-z_][A-Za-z0-9_]*)\b/g;

interface Drift {
  readonly liveButUnlisted: readonly string[];
  readonly listedButDeleted: readonly string[];
}

/** What the two lists disagree about, in both directions. Empty on both sides means no drift. */
function inventoryDrift(listed: readonly string[], live: readonly string[]): Drift {
  const listedSet = new Set(listed);
  const liveSet = new Set(live);
  return {
    liveButUnlisted: live.filter((file) => !listedSet.has(file)).sort(),
    listedButDeleted: listed.filter((file) => !liveSet.has(file)).sort(),
  };
}

/** Every file path the page names as a row, deduplicated — a path may be cited in prose too. */
function pathsListedOnPage(): string[] {
  const page = fs.readFileSync(inventoryPage, 'utf8');
  return [...new Set([...page.matchAll(ROW_PATH)].map((match) => match[1] as string))];
}

/** Every non-test `.ts` file under `src/`, as a path relative to `src/`. */
function filesUnderSource(directory = sourceRoot): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnderSource(full);
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return [];
    return [path.relative(sourceRoot, full).split(path.sep).join('/')];
  });
}

/**
 * Names the inventory credits to `file` that its source never writes.
 *
 * The test is textual on purpose. A row may name a generic parameter, a re-export, or a type
 * spelled inside a wider declaration, and all of those are honest — what is not honest is a name
 * the file does not contain at all. That is the failure this catches, and it caught seven.
 */
function exportsNamedButAbsent(file: string, cell: string): string[] {
  const source = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
  const named = [...cell.matchAll(CODE_SPAN)].flatMap((span) =>
    [...(span[1] as string).matchAll(SYMBOL)].map((m) => m[1] as string),
  );
  return [...new Set(named.filter((name) => name.length > 3 && !source.includes(name)))];
}

describe('the file inventory names every file in src/, and only files that exist', () => {
  it('has no live file the page leaves out', () => {
    expect(inventoryDrift(pathsListedOnPage(), filesUnderSource()).liveButUnlisted).toEqual([]);
  });

  it('has no row for a file that no longer exists', () => {
    expect(inventoryDrift(pathsListedOnPage(), filesUnderSource()).listedButDeleted).toEqual([]);
  });

  it('reads the page as rows, not as a word search', () => {
    // The row shape is the contract. A path mentioned mid-sentence is not a row, and counting it
    // would let a page pass while listing nothing.
    expect(pathsListedOnPage()).toContain('view/theme.ts');
    expect(pathsListedOnPage().length).toBeGreaterThan(100);
  });

  it('credits no file with an export it does not contain', () => {
    const page = fs.readFileSync(inventoryPage, 'utf8');
    const wrong = [...page.matchAll(ROW)]
      .filter(([, file]) => fs.existsSync(path.join(sourceRoot, file as string)))
      .map(([, file, cell]) => ({ file, absent: exportsNamedButAbsent(file as string, cell as string) }))
      .filter((row) => row.absent.length > 0);
    expect(wrong).toEqual([]);
  });

  it('names the invented export, and spares the real one and the prose beside it', () => {
    const cell = '`resolveTheme(), notAThingWeExport` and the resolution it runs';
    expect(exportsNamedButAbsent('view/theme.ts', cell)).toEqual(['notAThingWeExport']);
  });

  it('fails when the two lists disagree', () => {
    const drift = inventoryDrift(['kept.ts', 'gone.ts'], ['kept.ts', 'fresh.ts']);
    expect(drift.listedButDeleted).toEqual(['gone.ts']);
    expect(drift.liveButUnlisted).toEqual(['fresh.ts']);
  });
});
