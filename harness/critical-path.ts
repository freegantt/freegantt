// Critical path, consumer meets it. `scheduling()` writes `float` and `critical` on each task. One variant
// rule paints the critical bars. The button prints the driving path of the selected task.
import { mountHarnessChrome } from './harness-nav.js';
import { Dataset, Gantt, entryDependencies, scheduling } from 'freegantt';
import type { EntryVariant } from 'freegantt';
import { criticalPathDependencies, criticalPathEntryInputs } from '../fixtures/critical-path-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { mountPageBrief } from './docs/page-brief.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'critical-path');

const dependencies = entryDependencies();
const plan = scheduling();
const dataset = new Dataset({
  entries: criticalPathEntryInputs,
  timeZone: 'UTC',
  plugins: [dependencies, plan],
});
dependencies.replaceAll(criticalPathDependencies);

// Which bars look critical? Those whose `critical` Field is true.
const criticalVariant: EntryVariant = {
  name: 'critical',
  when: { critical: true },
  paint: () => ({ class: { 'critical-bar': true } }),
  css: `.critical-bar { background: var(--fg-warn); }`,
};

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  range: 'fitDataset',
  preset: 'dayAndWeek',
  gridWidth: 'fitColumns',
  gridColumns: ['name', 'start', 'end', 'float', 'critical'],
  variants: [criticalVariant],
  a11yLabel: 'Critical path Gantt',
});
mountGanttToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

declare global {
  interface Window {
    __dataset: Dataset;
    __gantt: Gantt;
    __scheduling: typeof plan;
  }
}
window.__dataset = dataset;
window.__gantt = gantt;
window.__scheduling = plan;

const readout = document.querySelector<HTMLSpanElement>('#driving-path-readout')!;

// What does the button print? The names of the chain that holds the selected task in place.
document.querySelector<HTMLButtonElement>('#show-driving-path-btn')!.addEventListener('click', () => {
  const [selected] = gantt.selectedEntryIds;
  if (selected === undefined) {
    readout.textContent = 'Driving path: select a task';
    return;
  }
  const names = plan.drivingPath(selected).map((id) => dataset.entries.get(id)?.name ?? id);
  readout.textContent = `Driving path: ${names.join(' → ')}`;
});
