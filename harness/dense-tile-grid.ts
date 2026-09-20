// Virtualization e2e fixture (pass-2 branch review, #435 follow-up): the maintainer's rule is that
// nothing renders outside the visible chart, and `e2e/large-dataset.spec.ts` only pins that for rows
// — no fixture anywhere has many bars per row, so nothing proves the bar layer stays windowed once a
// consumer draws the #435 dense-tile shape this branch makes each bar costlier for
// (`render/dom/index.ts`'s `BarLabelToken`). This page is many rows, each a strip of many contiguous
// day tiles, sized larger than the pane in both axes — `e2e/dense-tile-grid.spec.ts`'s own fixture.

import './harness-nav.ts';
import { Gantt, Dataset, MS } from 'freegantt';
import type { Entry, EntryInput, ViewPreset } from 'freegantt';

// Both far larger than the pane can show at once, and both large enough that a broken cull on
// either axis alone (not just both at once) pushes `.fg-bar` count well past
// `e2e/dense-tile-grid.spec.ts`'s bound: `ROW_COUNT` rows at `--fg-row-height: 20px` (the harness
// page's own CSS) don't fit `#gantt`'s 300px height, and `TILE_COUNT` tiles at `TILE_WIDTH_PX` each
// don't fit its 700px width (minus the grid pane).
// Module-private, like every other harness fixture's constants: importing this module would run
// the page body against a DOM that is not there, so `e2e/dense-tile-grid.spec.ts` reads the three
// numbers back through the `window.__*` seams below instead.
const ROW_COUNT = 50;
const TILE_COUNT = 250;
// 14px, not a narrower pitch, because the shipped bar floor is 12px (`--fg-bar-min-width`, whose
// fallback is `DEFAULT_MIN_BAR_WIDTH_PX`). Below it every tile would take `barSpan`'s `'minimum'`
// path — widened to 12 and re-centred on its own slot — so adjacent tiles would overhang each other
// and the page would not be the strip of contiguous tiles this fixture claims to draw. The same
// 14px `harness/bar-label-fit.ts` picks, for the same reason.
const TILE_WIDTH_PX = 14;

const ORIGIN = new Date('2026-01-01T00:00:00Z');

const entries: EntryInput[] = [];
for (let r = 0; r < ROW_COUNT; r++) {
  const rowId = `tile-row-${r}`;
  entries.push({ id: rowId, name: `Row ${r + 1}` });
  for (let i = 0; i < TILE_COUNT; i++) {
    const start = new Date(ORIGIN.getTime() + i * MS.DAY);
    const end = new Date(start.getTime() + MS.DAY);
    entries.push({ id: `${rowId}-day-${i}`, name: `Day ${i + 1}`, parentId: rowId, start, end });
  }
}

const dataset = new Dataset({ entries, timeZone: 'UTC' });

// Same stated tile width `harness/bar-label-fit.ts` uses, and for the same reason: the shipped
// `dayPreset` floors density above this page's tile width, so this page brings its own preset.
const tilePreset: ViewPreset = {
  id: 'dense-tile-grid-day-tile',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [{ unit: 'day', increment: 1, format: { day: 'numeric' } }],
  preferredTickWidthPx: TILE_WIDTH_PX,
  minTickWidthPx: TILE_WIDTH_PX,
};

// Names the 50 parents, and only those: the id prefix alone also matches every one of their
// 12,750 tile children (`tile-row-0-day-5`). `resolveEntriesSource` happens to ask the has-children
// question first, so a leaf never reaches this rule — an implementation detail a fixture should not
// quietly depend on.
const isTileRow = (entry: Entry): boolean => entry.id.startsWith('tile-row-') && entry.children().length > 0;

// `overscan` (#435) is zero here on purpose: `e2e/dense-tile-grid.spec.ts` asserts the tightest
// possible bound — the exact visible slice, no culling slack — rather than a headroom guess over
// the shipped default.
const gantt = new Gantt({
  container: '#gantt',
  dataset,
  preset: tilePreset,
  fit: { unit: 'day', widthPx: TILE_WIDTH_PX },
  range: { start: ORIGIN, end: new Date(ORIGIN.getTime() + TILE_COUNT * MS.DAY) },
  rowSource: {
    source: 'entries',
    tree: true,
    childrenAsSegments: isTileRow,
  },
  barLabels: 'insideOrNone',
  overscan: { verticalRows: 0, horizontalPx: 0 },
  a11yLabel: 'Dense tile grid',
});

declare global {
  interface Window {
    /** The page's own design constants, read back by `e2e/dense-tile-grid.spec.ts` to derive its
     *  expected bar-count bound — not a re-derivation of anything `layout/frame.ts` computes, just
     *  the same numbers this file already chose, mirrored for the test that must not hardcode them. */
    __tileWidthPx: number;
    __rowCount: number;
    __tilesPerRow: number;
  }
}
window.__gantt = gantt;
window.__tileWidthPx = TILE_WIDTH_PX;
window.__rowCount = ROW_COUNT;
window.__tilesPerRow = TILE_COUNT;
