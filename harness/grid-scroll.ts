// #126: fixed-width grid columns summing past the pane's own gridWidth used to clip silently
// (D-S1.8-13). This fixture is what e2e/grid-scroll.spec.ts drives.

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
