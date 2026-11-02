// The connector seam, as a consumer meets it: a plugin names two Entries and core draws the line.
// No dependency code exists on this page. The plugin keeps its own list of related pairs.
import { mountHarnessChrome } from './harness-nav.js';
import { Gantt, Dataset } from 'freegantt';
import { seededEntryInputs } from '../fixtures/seeded-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { mountPageBrief } from './docs/page-brief.js';
import { relatedTo } from './plugins/related-to.js';
import type { RelatedPair } from './plugins/related-to.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'related-to');

const dataset = new Dataset({ entries: seededEntryInputs({ count: 60 }), timeZone: 'UTC' });

// Three pairs: neighbours, a pair a few rows apart, and a pair at opposite ends of the list.
// The last one always has an end outside the window.
const all = dataset.entries.all;
const first = all[0]!;
const last = all[all.length - 1]!;
const pairs: readonly RelatedPair[] = [
  { id: 'near', fromEntryId: first.id, toEntryId: all[1]!.id },
  { id: 'few-rows', fromEntryId: all[2]!.id, toEntryId: all[6]!.id },
  { id: 'far', fromEntryId: first.id, toEntryId: last.id },
];

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  plugins: [relatedTo(pairs)],
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
  readout.innerHTML = `Connectors drawn: <b>${drawn}</b> of ${pairs.length}`;
}
gantt.on('navigationChange', () => {
  requestAnimationFrame(showConnectorCount);
});
requestAnimationFrame(showConnectorCount);
