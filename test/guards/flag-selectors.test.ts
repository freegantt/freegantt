// A guard with no failing fixture is presumed broken (docs/04-hooks-and-ci.md §4). The last describe
// block below builds two deliberately broken doc fixtures and asserts the extraction this guard
// runs on the real doc actually catches each one — the two defects a 2026-09 review found this file
// shipping without catching (C4/#482):
//  (a) reading the whole doc, not just the `data-flag` table, let a key named in an unrelated row
//      (a `--fg-warn` token row that happens to say "conflict") stand in for a deleted table row;
//  (b) checking one direction only (code -> doc) let an orphaned doc row — naming a key no
//      BAR_FLAG_KEYS/LINK_FLAG_KEYS lists any more — pass unnoticed.
//
// The question the real-doc tests below ask: does every `BarFlags`/`LinkFlags` key have a
// documented selector, and does every documented selector name a real key? An interface has no
// runtime keys, so nothing but this test could catch a key that ships with no doc row
// (`LinkFlags.inactive` shipped undocumented once already, #475) or a doc row for a key nothing
// declares any more.
//
// `data-state` (`hovered`, `selected`, `pending`, `dragging`, `ghost`, …) is a separate attribute,
// a string union, not a flag-key set. It is out of scope for this guard.
//
// This lives in `test/guards/` (moved from `src/render/dom/`, C4): it reads a doc and two exported
// key lists, touches no DOM, and belongs in the `guards` Vitest project (node env) with every other
// doc/code contract check (`vitest.workspace.ts`), not in `dom`.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR_FLAG_KEYS, LINK_FLAG_KEYS } from '../../src/layout/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const doc = fs.readFileSync(path.join(root, 'docs/05-consumer-api.md'), 'utf8');

/** The text between one `### Heading` and the next heading matching `stop` (exclusive on both
 *  ends) — same helper as `test/guards/theming-contract.test.ts`'s own `section`, so a key named
 *  only in a doc row *outside* the `data-flag` table can never satisfy this guard (defect (a)). */
function section(fromDoc: string, heading: string, stop: RegExp): string {
  const start = fromDoc.indexOf(heading);
  if (start === -1) throw new Error(`flag-selectors guard: heading "${heading}" not found in doc`);
  const rest = fromDoc.slice(start + heading.length);
  const end = stop.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

/** Every `data-flag` key a `### \`data-flag\`` table names for `part`, read only from that section
 *  of `fromDoc` — never the surrounding file. */
function documentedFlagKeys(fromDoc: string, part: '.fg-bar' | '.fg-link'): Set<string> {
  const dataFlagSection = section(fromDoc, '### `data-flag`', /^### /m);
  const re = new RegExp(`\\${part}\\[data-flag~="([\\w-]+)"\\]`, 'g');
  return new Set([...dataFlagSection.matchAll(re)].map((m) => m[1]!));
}

const documentedBarKeys = documentedFlagKeys(doc, '.fg-bar');
const documentedLinkKeys = documentedFlagKeys(doc, '.fg-link');

describe('the data-flag doc contract', () => {
  it('lists every BAR_FLAG_KEYS key as a .fg-bar selector', () => {
    const missing = BAR_FLAG_KEYS.filter((key) => !documentedBarKeys.has(key));
    expect(
      missing,
      `add a ".fg-bar[data-flag~=\\"KEY\\"]" row to the data-flag table in docs/05-consumer-api.md for: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  it('lists every LINK_FLAG_KEYS key as a .fg-link selector', () => {
    const missing = LINK_FLAG_KEYS.filter((key) => !documentedLinkKeys.has(key));
    expect(
      missing,
      `add a ".fg-link[data-flag~=\\"KEY\\"]" row to the data-flag table in docs/05-consumer-api.md for: ${missing.join(', ')}`,
    ).toEqual([]);
  });

  // Defect (b), #482 review: checking code -> doc alone let a doc row for a retired key stand
  // forever — the same gap `theming-contract.test.ts`'s Internal Parts check closes for `.fg-*`
  // classes, checked both ways.
  it('never documents a .fg-bar data-flag key BAR_FLAG_KEYS does not name', () => {
    const orphaned = [...documentedBarKeys].filter(
      (key) => !(BAR_FLAG_KEYS as readonly string[]).includes(key),
    );
    expect(
      orphaned,
      `docs/05-consumer-api.md documents these .fg-bar data-flag keys but BAR_FLAG_KEYS (src/layout/frame.ts) does not name them:\n${orphaned.join('\n')}`,
    ).toEqual([]);
  });

  it('never documents a .fg-link data-flag key LINK_FLAG_KEYS does not name', () => {
    const orphaned = [...documentedLinkKeys].filter(
      (key) => !(LINK_FLAG_KEYS as readonly string[]).includes(key),
    );
    expect(
      orphaned,
      `docs/05-consumer-api.md documents these .fg-link data-flag keys but LINK_FLAG_KEYS (src/layout/frame.ts) does not name them:\n${orphaned.join('\n')}`,
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Failing fixtures — proof this guard bites (docs/04-hooks-and-ci.md §4)
// ---------------------------------------------------------------------------------------------

describe('the guard mechanism itself, against a deliberately broken fixture doc', () => {
  it('defect (a): a key named only outside the data-flag table does not count as documented', () => {
    // Mirrors the real failure: docs/05-consumer-api.md:207 names "conflict" in an unrelated
    // --fg-warn token row, and the `### data-flag` table's own "conflict" row is gone.
    const brokenDoc = [
      '### Colour and shadow tokens',
      '',
      '| `--fg-warn` | Used to flag a conflict state, see .fg-bar[data-flag~="conflict"] below |',
      '',
      '### `data-flag`',
      '',
      '| Selector | Set by |',
      '|---|---|',
      '| `.fg-bar[data-flag~="cycle"]` | S7 scheduling plugin |',
      '',
      '### Internal Parts',
    ].join('\n');

    expect(documentedFlagKeys(brokenDoc, '.fg-bar').has('conflict')).toBe(false);
  });

  it('defect (b): a doc row naming a key the code list does not is reported as orphaned', () => {
    const brokenDoc = [
      '### `data-flag`',
      '',
      '| Selector | Set by |',
      '|---|---|',
      '| `.fg-bar[data-flag~="cycle"]` | S7 scheduling plugin |',
      '| `.fg-bar[data-flag~="retired-key"]` | no longer a real key |',
      '',
      '### Internal Parts',
    ].join('\n');

    const orphaned = [...documentedFlagKeys(brokenDoc, '.fg-bar')].filter(
      (key) => !(BAR_FLAG_KEYS as readonly string[]).includes(key),
    );
    expect(orphaned).toEqual(['retired-key']);
  });
});
