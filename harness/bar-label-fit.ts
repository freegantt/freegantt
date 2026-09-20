// #435: what a consumer painting one row as a strip of contiguous per-day tiles needs — a label
// that paints inside a tile wide enough for it, and no label at all on one too narrow, never a
// label pushed outside onto the next tile. `childrenAsSegments` is the shipped way to draw many
// bars on one row (`docs/08-a-bar-is-an-entry.md`): a parent Entry with no dates of its own, and
// forty single-day children whose own dates roll up into its span (ADR 0013). This is
// `e2e/bar-label-fit.spec.ts`'s own fixture.

import './harness-nav.ts';
import { Gantt, Dataset, MS } from 'freegantt';
import type { Entry, EntryInput, ViewPreset } from 'freegantt';

const DAY_COUNT = 40;
const ORIGIN = new Date('2026-01-01T00:00:00Z');
const ROW_ENTRY_ID = 'fulfillment-row';

// Each child's `end` equals the next child's `start` — the half-open `[start, end)` storage rule
// (`plans/01` §5) already butts these tiles edge to edge with no gap to tune.
const children: EntryInput[] = Array.from({ length: DAY_COUNT }, (_, i) => {
  const start = new Date(ORIGIN.getTime() + i * MS.DAY);
  const end = new Date(start.getTime() + MS.DAY);
  return { id: `day-${i + 1}`, name: `Day ${i + 1}`, parentId: ROW_ENTRY_ID, start, end };
});

const entries: EntryInput[] = [{ id: ROW_ENTRY_ID, name: 'Fulfillment row' }, ...children];

const dataset = new Dataset({ entries, timeZone: 'UTC' });

// A stated tile width (`TimeScaleFit`'s `TimeUnitWidth` mode), not the default `'pane'` —
// this page wants one day-tile's width to stay the same however wide the browser window is, so the
// "narrow" and "wide" buttons below always cross the same fit line. The shipped `dayPreset` floors
// density at its own `minTickWidthPx` (96, for a full "Sep 21, 2026" tick label — `time/presets.ts`),
// which would silently widen every tile back past that floor. A day tile carries a much shorter
// label than a day *tick*, so this page brings its own preset — a day tick, at this page's own
// floor — the same "a new zoom level is never a library edit" knob `plans/02` already covers.
const NARROW_DAY_WIDTH_PX = 14; // too narrow for "Day 12" — no side ever has room for it
const WIDE_DAY_WIDTH_PX = 120; // wide enough that the label sits inside with room to spare

const tilePreset: ViewPreset = {
  id: 'bar-label-fit-day-tile',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [{ unit: 'day', increment: 1, format: { day: 'numeric' } }],
  preferredTickWidthPx: WIDE_DAY_WIDTH_PX,
  minTickWidthPx: NARROW_DAY_WIDTH_PX,
};

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  preset: tilePreset,
  fit: { unit: 'day', widthPx: NARROW_DAY_WIDTH_PX },
  range: { start: children[0]!.start!, end: children[DAY_COUNT - 1]!.end! },
  rowSource: {
    source: 'entries',
    tree: true,
    childrenAsSegments: (entry: Entry) => entry.id === ROW_ENTRY_ID,
  },
  barLabels: 'insideOrNone',
  a11yLabel: 'Bar label fit',
});

document.querySelector<HTMLButtonElement>('#narrow-days')!.addEventListener('click', () => {
  gantt.fit = { unit: 'day', widthPx: NARROW_DAY_WIDTH_PX };
});
document.querySelector<HTMLButtonElement>('#widen-days')!.addEventListener('click', () => {
  gantt.fit = { unit: 'day', widthPx: WIDE_DAY_WIDTH_PX };
});
