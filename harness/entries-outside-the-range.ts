// #436: `fit: 'pane'` (the default) makes `contentWidth === paneWidth`, so the ScrollAxis's own
// `max` is 0 — a bar painted past `contentWidth` still opens a real native scroll range the axis
// never sees, and two Gantts sharing that axis desync (`e2e/scroll-sync.spec.ts`'s own
// `fit: 'pane'` pair). `barSpan` (`layout/frame.ts`) floors a zero-length span's box at
// `minBarWidthPx`, centred on its own instant — an entry pinned to the range's own end centres that
// box past the content's right edge unless the floor is shifted inward instead.
//
// A second, independent mechanism opens the same leak: a Dataset wider than its own `range` (the
// normal shape for a caller prefetching so pan/zoom never re-fetches) hands `placeFrame` entries
// the overscan buffer alone pulls into the culled window, with no `contentWidth` bound of its own.
// `out-after` sits entirely past `range.end`; `straddling` starts inside and ends past it. Both
// prove the same pane never natively scrolls past `contentWidth`, for a different reason than `d`.
import './harness-nav.ts';
import { Gantt, Dataset, MS } from 'freegantt';
import type { EntryInput } from 'freegantt';

const rangeStart = new Date('2026-01-01T00:00:00Z');
const rangeEnd = new Date(rangeStart.getTime() + 3 * MS.DAY);

const entries: EntryInput[] = [
  { id: 'a', name: 'A', start: rangeStart, end: new Date(rangeStart.getTime() + MS.DAY) },
  {
    id: 'b',
    name: 'B',
    start: new Date(rangeStart.getTime() + MS.DAY),
    end: new Date(rangeStart.getTime() + 2 * MS.DAY),
  },
  { id: 'c', name: 'C', start: new Date(rangeStart.getTime() + 2 * MS.DAY), end: rangeEnd },
  // The zero-length entry #436 needs: parked exactly on the range's own end (ADR 0012 — start ===
  // end is a milestone, not an error), with a label long enough that the fallback 'inside'
  // placement (`resolveBarLabelPlacement`) has nowhere to grow it either.
  { id: 'd', name: 'D milestone with a long label', start: rangeEnd, end: rangeEnd },
  // Straddles `range.end`: the truthful in-range half must still paint, trimmed at the edge.
  {
    id: 'straddling',
    name: 'Straddles the range end',
    start: new Date(rangeEnd.getTime() - 2 * MS.HOUR),
    end: new Date(rangeEnd.getTime() + 6 * MS.HOUR),
  },
  // Entirely past `range.end`, within the default overscan buffer's reach — never painted at all.
  {
    id: 'out-after',
    name: 'Outside the range',
    start: new Date(rangeEnd.getTime() + 2 * MS.HOUR),
    end: new Date(rangeEnd.getTime() + 5 * MS.HOUR),
  },
];

const dataset = new Dataset({ entries, timeZone: 'UTC' });
// `e2e/timeline-content-width.spec.ts` asserts on the DOM alone, so this page publishes no
// `window.__gantt` seam: an `__gantt` on a harness page means a spec depends on it.
new Gantt({ container: '#gantt', dataset, range: { start: rangeStart, end: rangeEnd } });
