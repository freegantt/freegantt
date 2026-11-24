// A panel that opens under one row, as wide as the whole Gantt. A plugin presents it with
// `ctx.view.presentRowDetail`. The Gantt measures the panel and pushes the rows below it down.
import { mountHarnessChrome } from './harness-nav.js';
import { Gantt, Dataset } from 'freegantt';
import { seededEntryInputs } from '../fixtures/seeded-dataset.js';
import { mountPageBrief } from './docs/page-brief.js';
import { inlineDetailsPanel } from './plugins/inline-details-panel.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'inline-details');

const tasks = seededEntryInputs({ count: 24 }).map((task, index) => ({
  ...task,
  name: `Task ${index + 1}`,
}));

let openTaskId: string | undefined;

const panel = inlineDetailsPanel(
  (taskId) => {
    const task = tasks.find((candidate) => String(candidate.id) === taskId);
    return {
      title: task?.name ?? taskId,
      lines: ['Details panel', 'Rows below it moved down by its height'],
    };
  },
  () => open(undefined),
);
const dataset = new Dataset({ entries: tasks, timeZone: 'UTC', plugins: [panel] });

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  a11yLabel: 'Inline details Gantt',
});

/** Opens the panel under one task and shuts every other. `undefined` shuts them all. */
function open(taskId: string | undefined): void {
  openTaskId = taskId;
  panel.show(taskId);
  showLayoutChanges();
}

gantt.on('entryActivate', ({ entry }) => {
  const id = String(entry.id);
  open(id === openTaskId ? undefined : id);
});

// Counts the frames that moved a row. A scroll adds none.
const layoutReadout = document.querySelector<HTMLSpanElement>('#layout-readout')!;
gantt.on('navigationChange', () => showLayoutChanges());
function showLayoutChanges(): void {
  requestAnimationFrame(() => {
    layoutReadout.textContent = `Row layout changes: ${panel.layoutChanges}`;
  });
}
showLayoutChanges();

declare global {
  interface Window {
    __gantt: Gantt;
  }
}
window.__gantt = gantt;
