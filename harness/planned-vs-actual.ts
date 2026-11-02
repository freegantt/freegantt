// Planned vs actual: the library draws the actual dates as bars. A plugin draws the planned dates
// as row spans, read from two Fields this page declares. See `plugins/planned-vs-actual.ts`.

import { Gantt, Dataset } from 'freegantt';
import type { EntryInput } from 'freegantt';
import { mountHarnessChrome } from './harness-nav.js';
import { mountPageBrief } from './docs/page-brief.js';
import { plannedVsActual, PLANNED_END, PLANNED_START } from './plugins/planned-vs-actual.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'planned-vs-actual');

type PlannedProps = { [PLANNED_START]: string; [PLANNED_END]: string };

function task(
  id: string,
  name: string,
  actual: [start: string, end: string],
  planned: [start: string, end: string],
): EntryInput<PlannedProps> {
  return {
    id,
    name,
    start: actual[0],
    end: actual[1],
    props: { [PLANNED_START]: planned[0], [PLANNED_END]: planned[1] },
  };
}

// Dates carry `Z` so no zoneless plain time reaches `instant()`.
const entries: EntryInput<PlannedProps>[] = [
  task(
    't1',
    'Survey',
    ['2026-09-01T00:00:00Z', '2026-09-04T00:00:00Z'],
    ['2026-09-01T00:00:00Z', '2026-09-04T00:00:00Z'],
  ),
  task(
    't2',
    'Design',
    ['2026-09-05T00:00:00Z', '2026-09-14T00:00:00Z'],
    ['2026-09-04T00:00:00Z', '2026-09-10T00:00:00Z'],
  ),
  task(
    't3',
    'Build',
    ['2026-09-12T00:00:00Z', '2026-09-26T00:00:00Z'],
    ['2026-09-10T00:00:00Z', '2026-09-22T00:00:00Z'],
  ),
  task(
    't4',
    'Test',
    ['2026-09-24T00:00:00Z', '2026-09-30T00:00:00Z'],
    ['2026-09-22T00:00:00Z', '2026-09-28T00:00:00Z'],
  ),
  task(
    't5',
    'Launch',
    ['2026-09-28T00:00:00Z', '2026-10-02T00:00:00Z'],
    ['2026-09-30T00:00:00Z', '2026-10-03T00:00:00Z'],
  ),
];

const dataset = new Dataset<PlannedProps>({
  entries,
  timeZone: 'UTC',
  fields: [{ key: PLANNED_START }, { key: PLANNED_END }],
  plugins: [plannedVsActual()],
});

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  a11yLabel: 'Planned vs actual Gantt',
});

// The e2e spec zooms the chart through this handle.
declare global {
  interface Window {
    __gantt: Gantt;
  }
}
window.__gantt = gantt;
