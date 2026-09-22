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
// prove the same pane never natively scrolls past `contentWidth`, for a different reason than the
// shared fixture's `end-milestone`.
import { Gantt, Dataset, MS } from 'freegantt';
import type { EntryInput } from 'freegantt';
import {
  milestoneOnRangeEndEntries,
  milestoneOnRangeEndSpan,
} from '../../fixtures/milestone-on-range-end.js';

// The first mechanism's shape is the shared one — three day-long entries and a zero-length
// milestone on the range's own end. `harness/e2e/scroll-sync.ts` proves the same shape against a shared
// ScrollAxis; this page adds the two entries only it needs.
const rangeEnd = milestoneOnRangeEndSpan.end;

const entries: EntryInput[] = [
  ...milestoneOnRangeEndEntries,
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
new Gantt({ container: '#gantt', dataset, range: milestoneOnRangeEndSpan });
