// #126: fixed-width grid columns summing past the pane's own gridWidth used to clip silently
// (D-S1.8-13). #139: the same overflow with no width authored at all, plus the `flex` opt-out.
// This fixture is what e2e/grid-scroll.spec.ts drives.

import './harness-nav.ts';
import { Gantt, Dataset } from '../src/api/index.js';
import type { GridColumnInput } from '../src/api/index.js';
import { demoEntryInputs } from '../fixtures/demo-dataset.js';

const dataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });

const gridColumns: readonly GridColumnInput[] = [
  { field: 'name', width: 120 },
  { field: 'start', width: 120 },
  { field: 'end', width: 120 },
  { field: 'duration', width: 120 },
];

new Gantt({ container: '#gantt', dataset, gridColumns });

// #139: the same four columns with nothing authored. A Grid column is fixed-width by default — it
// takes its Field's declared width, or `--fg-column-width` — so this pane overflows and scrolls
// without a consumer sizing a single column by hand, which is what used to be impossible.
new Gantt({
  container: '#gantt-default',
  dataset,
  gridColumns: ['name', 'start', 'end', 'duration'],
});

// #139: `flex` is the one opt-out. The Name column shares whatever the fixed columns leave, so this
// pane never overflows however narrow it gets.
new Gantt({
  container: '#gantt-flex',
  dataset,
  gridColumns: [{ field: 'name', flex: 1 }, 'start'],
});
