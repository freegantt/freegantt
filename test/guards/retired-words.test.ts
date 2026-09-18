// D-S1.11-3: `Project` (ADR 0004) and `host` (D-S1.11-6, #64) are retired words — both used to smuggle
// two concepts under one name, the same "chart" failure #7 already named once. `EntryKind` (ADR 0017)
// and `DatasetDocument` (ADR 0016) are retired for a second reason: the type each one named is gone,
// and prose that still names it teaches a concept the library does not have. This guard, shaped like
// `scripts/check-vendor-names.mjs`, keeps any of them from creeping back into prose or an identifier.
//
// `docs/` is in scope, because that is where the last four escapes happened: `EntryKind` outlived
// its type on four `docs/architecture/` pages, and no guard fired. The site serves these files
// directly, so scanning them covers every page a reader sees.
//
// An ADR is exempt by design (ADR 0004's own consequences: ADRs keep their original wording as
// historical record). One narrower exemption covers a legitimate historical citation elsewhere:
// a line citing the ADR that retired `Project` (CONTEXT.md's own glossary explains the retirement,
// which necessarily names the retired word once).

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const SCAN_DIRS = ['src', 'harness', 'e2e', 'test', 'scripts', 'fixtures', 'docs'];
/** Read the header for why each one is out of scope. Scoped to a path, never to a file name. */
const EXEMPT_DIRS = ['docs/adr'];
const SCAN_FILES = [
  'CONTEXT.md',
  'CLAUDE.md',
  'README.md',
  'plans/00-overview.md',
  'plans/01-domain-architecture.md',
  'plans/02-public-api.md',
  'plans/03-slices.md',
  'plans/04-implementation.md',
  'docs/00-guardrails-overview.md',
  'docs/01-invariant-guard-matrix.md',
  'docs/02-lint-rules.md',
  'docs/03-boundaries-and-config.md',
  'docs/04-hooks-and-ci.md',
];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const SELF = path.relative(root, fileURLToPath(import.meta.url));

function isExemptPath(full: string): boolean {
  const rel = path.relative(root, full);
  return EXEMPT_DIRS.some((dir) => rel === dir || rel.startsWith(`${dir}${path.sep}`));
}

function walk(dir: string, files: string[]): void {
  for (const entry of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    if (isExemptPath(full)) continue;
    if (fs.statSync(full).isDirectory()) walk(full, files);
    else files.push(full);
  }
}

function collectFiles(): string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    try {
      walk(path.join(root, dir), files);
    } catch {
      // directory doesn't exist — fine.
    }
  }
  for (const file of SCAN_FILES) {
    files.push(path.join(root, file));
  }
  return files;
}

interface Hit {
  file: string;
  line: number;
  word: string;
  text: string;
}

function findHits(pattern: RegExp, isExempt: (line: string) => boolean): Hit[] {
  const hits: Hit[] = [];
  for (const file of collectFiles()) {
    if (path.relative(root, file) === SELF) continue;
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    content.split('\n').forEach((line, index) => {
      if (isExempt(line)) return;
      const match = pattern.exec(line);
      pattern.lastIndex = 0;
      if (match) {
        hits.push({ file: path.relative(root, file), line: index + 1, word: match[0], text: line.trim() });
      }
    });
  }
  return hits;
}

/** A line that *documents* a retirement necessarily names the retired spelling once. Those lines are
 *  the point of the record, not a relapse — a docs table listing what went, a test comment naming the
 *  tests it replaced. The guard's job is prose that still *instructs* against a deleted symbol. */
const RETIREMENT_PROSE = /retired|no longer|deleted|\bgone\b|replaces|used to|#421/i;

describe('retired words stay retired', () => {
  it('never reintroduces `host` (D-S1.11-6, #64)', () => {
    const hits = findHits(/\bhosts?\b/i, (line) => /retired/i.test(line) || /localhost/i.test(line));
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  it('never reintroduces `Project` (ADR 0004)', () => {
    const hits = findHits(/\bProject\b/, (line) => /ADR 0\d{3}/.test(line));
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  // An Entry has no stored classification (ADR 0017, CONTEXT.md). `EntryKind` named one, the type is
  // gone, and prose naming it teaches a seam that core does not have — structure and variants answer
  // what a row draws.
  it('never reintroduces `EntryKind` (ADR 0017)', () => {
    const hits = findHits(/\bEntryKind\b/, (line) => /ADR 0\d{3}/.test(line));
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  // ADR 0016 deleted the save format. There is no Document, so nothing names its shape.
  it('never reintroduces `DatasetDocument` (ADR 0016)', () => {
    const hits = findHits(/\bDatasetDocument\b/, (line) => /ADR 0\d{3}/.test(line));
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  // ADR 0026 retired the `Segment` **type**. The *word* is not retired and is deliberately not guarded:
  // `CONTEXT.md` keeps a *Segment* entry meaning "a child Entry drawn as one piece of its parent's
  // row", and the shipped public key is literally `childrenAsSegments`.
  //
  // Nor are the retired TypeScript identifiers guarded here — `SegmentId`, `updateSegment`,
  // `selectedSegmentIds` and the rest. The types behind them are deleted, so `tsc` refuses any real
  // use of one, which is a harder guarantee than a regex. What `tsc` cannot see is a **DOM attribute
  // string**: `data-segment-id` is just text, a consumer copies it into a CSS selector or an e2e
  // locator, and nothing fails until the selector silently matches nothing. That is this guard's job,
  // and it is the same job the `data-item-id` line below does.
  //
  // Prose that *documents* the retirement names the old spelling once, by necessity — a docs table of
  // what went, a test comment naming the tests it replaced. Those are the record working, not a
  // relapse, which is the second reason this guard stays narrow: a line-based pattern cannot tell a
  // table row that says a symbol "goes" from one that tells a reader to call it.
  it('never reintroduces the `data-segment-id` DOM stamp (ADR 0026, #421)', () => {
    const hits = findHits(/\bdata-segment-id\b/, (line) => RETIREMENT_PROSE.test(line));
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  // `Item` retires into `Bar` (ADR 0026): the word named the drawn unit under a name none of its own
  // consumers used, and it doubled for two unrelated concepts. `MenuItem` and `CellItem` keep the
  // generic word because it is generic in its place, so the pattern matches the bare word and the
  // id spellings only — a menu still has items.
  it('never reintroduces `Item` as the drawn unit (ADR 0026, #421)', () => {
    const hits = findHits(
      /\bItemId\b|\bitemId\b|\bItemProducer\b|\bVariantItems\b|\bproduceItemsForRow\b|\bwholeEntryItem\b|\bfixedWidthItem\b|\bdata-item-id\b|\bBarRendererContext\.item\b|\bTooltipRendererContext\.item\b|\bRowMemory\.items\b/,
      (line) => /ADR 0\d{3}/.test(line) || /retired/i.test(line),
    );
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  // F6 (#421 review): the rename that retired `Item` missed a directory, two file names and a struct
  // field — `layout/items/`, `item.ts`, `produce-items.ts`, `RowMemory.items` — because the guard
  // above only ever watched compound identifiers, never a bare path or a field re-declaration. These
  // two checks close that: one watches the filesystem shape directly (a rename cannot silently drop a
  // `git mv` the way a spelling can drop a letter), the other watches the exact declaration text a
  // regression would have to reintroduce.
  it('never reintroduces the `layout/items/` directory or its `item.ts`/`produce-items.ts` file names (ADR 0026, #421)', () => {
    const staleDirNames = new Set(['items']);
    const staleBasenames = new Set(['item.ts', 'item.test.ts', 'produce-items.ts', 'produce-items.test.ts']);
    const offenders: string[] = [];

    function scan(dir: string): void {
      let entries: string[];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (SKIP_DIRS.has(entry)) continue;
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          if (staleDirNames.has(entry)) offenders.push(path.relative(root, full));
          scan(full);
        } else if (staleBasenames.has(entry)) {
          offenders.push(path.relative(root, full));
        }
      }
    }

    scan(path.join(root, 'src/layout'));
    expect(offenders, JSON.stringify(offenders, null, 2)).toEqual([]);
  });

  it('never reintroduces the `RowMemory.items` field (ADR 0026, #421)', () => {
    const hits = findHits(
      /\bitems:\s*readonly Bar\[\]/,
      (line) => /ADR 0\d{3}/.test(line) || /retired/i.test(line),
    );
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });

  // The three checks above watch specific spellings and paths — the same narrow style every other
  // guard in this file uses, because a blanket sweep for the bare word `item`/`items` across
  // `layout/`, `view/`, `render/`, `interaction/` would also flag every legitimate generic use those
  // four layers already have: `CellItem` (a grid cell), `RangeBand | RowStripe` decoration items,
  // `GridColumnInput` items, `syncKeyed`'s own generic `TItem`, and CSS's `align-items`/`.fg-menu-item`.
  // F6's own survivors were all compound identifiers or file/path spellings, which the checks above
  // now cover; a change to one of the exempt files below that starts naming a *Bar* as `item` again
  // needs a human to widen this exemption list, not a regex to guess it.
  const ITEM_WORD_EXEMPT_FILES = new Set([
    'src/view/column-chrome.ts',
    'src/view/grid-columns.ts',
    'src/view/column-chrome.test.ts',
    'src/view/core-commands.test.ts',
    'src/view/roving-focus.test.ts',
    'src/view/styles.ts',
    'src/layout/decorations.ts',
    'src/render/dom/decorations.ts',
    'src/render/dom/date-line.ts',
    'src/render/dom/element-description.ts',
    'src/render/dom/sync-keyed.ts',
    'src/render/dom/index.ts',
  ]);
  const ITEM_WORD_SCAN_DIRS = ['src/layout', 'src/view', 'src/render', 'src/interaction'];

  it('never reintroduces a stray `item`/`items` identifier in layout/, view/, render/ or interaction/ (ADR 0026, #421)', () => {
    const pattern = /\bitems?\b/i;
    const hits: Hit[] = [];
    for (const dir of ITEM_WORD_SCAN_DIRS) {
      const files: string[] = [];
      try {
        walk(path.join(root, dir), files);
      } catch {
        continue;
      }
      for (const file of files) {
        const rel = path.relative(root, file);
        if (rel === SELF || ITEM_WORD_EXEMPT_FILES.has(rel)) continue;
        if (!file.endsWith('.ts')) continue;
        let content: string;
        try {
          content = fs.readFileSync(file, 'utf8');
        } catch {
          continue;
        }
        content.split('\n').forEach((line, index) => {
          if (/CellItem|MenuItem|TItem/.test(line)) return;
          if (pattern.test(line)) {
            hits.push({ file: rel, line: index + 1, word: 'item', text: line.trim() });
          }
        });
      }
    }
    expect(hits, JSON.stringify(hits, null, 2)).toEqual([]);
  });
});
