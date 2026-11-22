// A panel that opens under one row, as wide as the whole Gantt. A bar-less spacer entry follows
// each task and holds the room. The live `rowHeight` callback gives the spacer the panel height.
// A row filter shows only the open task's spacer, so the other rows sit close. A plugin places the
// panel with `rowBox`.
import { mountHarnessChrome } from './harness-nav.js';
import { Gantt, Dataset } from 'freegantt';
import type { EntryInput } from 'freegantt';
import { seededEntryInputs } from '../fixtures/seeded-dataset.js';
import { mountPageBrief } from './docs/page-brief.js';
import { PANEL_HEIGHT_PX, inlineDetailsPanel, spacerIdFor } from './plugins/inline-details-panel.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'inline-details');

const ROW_HEIGHT_PX = 32;
const tasks = seededEntryInputs({ count: 24 }).map((task, index) => ({
  ...task,
  name: `Task ${index + 1}`,
}));
// Each task owns one spacer: an entry with no dates, so it draws no bar.
const entries: EntryInput[] = tasks.flatMap((task) => [
  task,
  { id: spacerIdFor(String(task.id)), name: '' } satisfies EntryInput,
]);

let openTaskId: string | undefined;

const panel = inlineDetailsPanel(
  (taskId) => {
    const task = tasks.find((candidate) => String(candidate.id) === taskId);
    return {
      title: task?.name ?? taskId,
      lines: ['Details panel', `Rows below it moved down by ${PANEL_HEIGHT_PX}px`],
    };
  },
  () => open(undefined),
);
const dataset = new Dataset({ entries, timeZone: 'UTC', plugins: [panel] });

/** A spacer is as tall as the panel. A task keeps the normal row height. */
function rowHeightOf({ entry }: { entry: { id: unknown } | undefined }): number {
  return String(entry?.id ?? '').endsWith(':panel') ? PANEL_HEIGHT_PX : ROW_HEIGHT_PX;
}

/** The rows the Gantt keeps: every task, and the spacer of the open task. */
function rowSourceFor(taskId: string | undefined) {
  return {
    source: 'entries' as const,
    tree: false,
    filter: (entry: { id: unknown }) => {
      const id = String(entry.id);
      return !id.endsWith(':panel') || id === (taskId === undefined ? undefined : spacerIdFor(taskId));
    },
  };
}

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  rowHeight: rowHeightOf,
  rowSource: rowSourceFor(undefined),
  a11yLabel: 'Inline details Gantt',
});

/** Opens the panel under one task and shuts every other. `undefined` shuts them all. */
function open(taskId: string | undefined): void {
  openTaskId = taskId;
  gantt.rowSource = rowSourceFor(taskId);
  panel.show(taskId);
}

gantt.on('entryActivate', ({ entry }) => {
  const id = String(entry.id);
  if (id.endsWith(':panel')) return;
  open(id === openTaskId ? undefined : id);
});

declare global {
  interface Window {
    __gantt: Gantt;
  }
}
window.__gantt = gantt;
