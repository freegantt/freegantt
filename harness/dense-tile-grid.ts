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
export const ROW_COUNT = 50;
export const TILE_COUNT = 250;
export const TILE_WIDTH_PX = 10;

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

// Same explicit pixels-per-millisecond `fit` `harness/bar-label-fit.ts` uses, and for the same
// reason: the shipped `dayPreset` floors density above this page's tile width.
const pxPerMsFor = (dayWidthPx: number): number => dayWidthPx / MS.DAY;

const tilePreset: ViewPreset = {
  id: 'dense-tile-grid-day-tile',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [{ unit: 'day', increment: 1, format: { day: 'numeric' } }],
  preferredTickWidthPx: TILE_WIDTH_PX,
  minTickWidthPx: TILE_WIDTH_PX,
};

const isTileRow = (entry: Entry): boolean => entry.id.startsWith('tile-row-');

// No `overscan` key here: `GanttOptions` (`src/api/gantt.ts`) does not carry one.
// `GanttShellOptions.overscan` (`src/view/gantt-shell.ts:286`) exists one layer down, unreachable
// from this page or from `e2e/dense-tile-grid.spec.ts` — an app author can neither read nor set the
// slack the render window keeps past the visible edge. Recorded as a gap in the task report; the
// e2e spec's bound works around not having this number, it does not restate it.
const gantt = new Gantt({
  container: '#gantt',
  dataset,
  preset: tilePreset,
  fit: pxPerMsFor(TILE_WIDTH_PX),
  range: { start: ORIGIN, end: new Date(ORIGIN.getTime() + TILE_COUNT * MS.DAY) },
  rowSource: {
    source: 'entries',
    tree: true,
    childrenAsSegments: isTileRow,
  },
  barLabels: 'insideOrNone',
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
