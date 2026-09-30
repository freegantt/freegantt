// A toggle column on plain boolean Fields. `e2e/toggle-column.spec.ts` drives it with the mouse and
// the keyboard, and reads the accessible names the library writes. Nothing here writes an ARIA
// attribute: the library owns them.

import { Gantt, Dataset } from 'freegantt';
import { sampleEntryInputs } from '../../fixtures/sample-dataset.js';

const dataset = new Dataset({
  entries: sampleEntryInputs.slice(0, 6),
  timeZone: 'UTC',
  fields: [
    { key: 'done', type: 'boolean', editable: true },
    { key: 'flag', type: 'boolean', editable: true },
  ],
});

new Gantt({
  container: document.querySelector<HTMLElement>('#gantt')!,
  dataset,
  a11yLabel: 'Toggle column',
  gridColumns: [
    { field: 'name', flex: 1 },
    {
      field: 'done',
      header: 'Done',
      width: 70,
      align: 'center',
      headerRenderer: () => ({ text: '✔' }),
      toggle: { on: { tag: 'span', text: '●' }, off: { tag: 'span', text: '○' } },
    },
    { field: 'flag', header: 'Flag', width: 70, align: 'center', toggle: true },
  ],
});
