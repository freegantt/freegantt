// The connector seam and the connect gesture, as a consumer meets them: a plugin names two Entries
// and core draws the line. The user drags from a connector port to another bar, and the plugin
// stores the pair. No dependency code exists on this page.
import { mountHarnessChrome } from './harness-nav.js';
import { Gantt, Dataset } from 'freegantt';
import { seededEntryInputs } from '../fixtures/seeded-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { mountPageBrief } from './docs/page-brief.js';
import { relatedTo } from './plugins/related-to.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'related-to');

const related = relatedTo();
const dataset = new Dataset({
  entries: seededEntryInputs({ count: 60 }),
  timeZone: 'UTC',
  plugins: [related],
});

// Three pairs: neighbours, a pair a few rows apart, and a pair at opposite ends of the list.
// The last one always has an end outside the window.
const all = dataset.entries.all;
const first = all[0]!;
const last = all[all.length - 1]!;
const end = (entryId: typeof first.id) => ({ entryId, edge: 'end' as const });
const start = (entryId: typeof first.id) => ({ entryId, edge: 'start' as const });
related.relate({ from: end(first.id), to: start(all[1]!.id) });
related.relate({ from: end(all[2]!.id), to: start(all[6]!.id) });
related.relate({ from: end(first.id), to: start(last.id) });

// A locked Entry is read-only, so the page closes its `connect` capability: it shows no port.
const lockedEntry = all[4]!;
dataset.entries.update(lockedEntry.id, { locked: true });

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  capabilities: { connect: (entry) => (entry.read('locked') === true ? false : undefined) },
  a11yLabel: 'Related to Gantt',
});
mountGanttToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

declare global {
  interface Window {
    __gantt: Gantt;
  }
}
window.__gantt = gantt;

const readout = document.querySelector<HTMLSpanElement>('#connector-readout')!;
function showConnectorCount(): void {
  const drawn = document.querySelectorAll('#gantt [data-connector-id]').length;
  readout.innerHTML = `Connectors drawn: <b>${drawn}</b>`;
}
gantt.on('navigationChange', () => {
  requestAnimationFrame(showConnectorCount);
});
dataset.on('change', () => {
  requestAnimationFrame(showConnectorCount);
});
requestAnimationFrame(showConnectorCount);

// An async veto: the Gantt waits for the Promise, keeps the preview line drawn and dimmed, then
// connects. Escape ends the wait.
const HOLD_MS = 600;
const holdToggle = document.querySelector<HTMLInputElement>('#hold-connect')!;
gantt.on('beforeConnect', () =>
  holdToggle.checked ? new Promise<void>((resolve) => setTimeout(resolve, HOLD_MS)) : undefined,
);

const connectLog = document.querySelector<HTMLSpanElement>('#connect-log')!;
gantt.on('connect', ({ from, to }) => {
  connectLog.textContent = `Last connect: ${from.entryId} (${from.edge}) → ${to.entryId} (${to.edge})`;
});
const lockedNote = document.querySelector<HTMLSpanElement>('#locked-note')!;
lockedNote.textContent = `${lockedEntry.name} is locked and shows no port.`;
