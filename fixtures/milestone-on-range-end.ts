// The geometry #436 is about: three day-long entries filling a three-day range, and a zero-length
// milestone parked on the range's own end (ADR 0012 admits an entry there — `range.end` is exclusive
// as a bound, and an instant on it is in range as a value).
//
// That last entry is the whole point. `barSpan` floors a zero-length span's box at `minBarWidthPx`
// and centres it on its own instant, so a milestone on the last instant of the range used to put
// half its box — and all of its label — past `contentWidth`. A painted node past `contentWidth`
// widens the pane's native `scrollWidth`, which opens a scroll range no `ScrollAxis` knows about
// (D-S1.8-1). Under the default `fit: 'pane'` that is the only way two Gantts sharing one axis can
// desync, because the axis max is 0 there and nothing else can move.
//
// Two harness pages need exactly this shape and built it twice: `harness/e2e/scroll-sync.ts`'s
// `#pane-fit-*` pair and `harness/e2e/entries-outside-the-range.ts`, which adds two entries of its own
// that reach past the range. One fixture, so the shape the two pages prove stays one shape.

import { MS } from 'freegantt';
import type { EntryInput } from 'freegantt';

const start = new Date('2026-01-01T00:00:00Z');
const end = new Date(start.getTime() + 3 * MS.DAY);

/** The range a Gantt loading these entries asks to see. */
export const milestoneOnRangeEndSpan = { start, end };

export const milestoneOnRangeEndEntries: EntryInput[] = [
  { id: 'day-1', name: 'A', start, end: new Date(start.getTime() + MS.DAY) },
  {
    id: 'day-2',
    name: 'B',
    start: new Date(start.getTime() + MS.DAY),
    end: new Date(start.getTime() + 2 * MS.DAY),
  },
  { id: 'day-3', name: 'C', start: new Date(start.getTime() + 2 * MS.DAY), end },
  // Zero-length, on the range's own end. The long name is deliberate: a short label would fit
  // inside the floored box and hide the overflow this fixture exists to catch.
  { id: 'end-milestone', name: 'D milestone with a long label', start: end, end },
];
