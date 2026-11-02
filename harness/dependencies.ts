// The Dependency store, as a consumer meets it. `entryDependencies()` is one plugin on the Dataset.
// It keeps the Dependencies, and the Gantt draws a connector for each. No scheduling plugin is
// installed, so nothing moves: the lines show what is stored.
import { mountHarnessChrome } from './harness-nav.js';
import { Dataset, Gantt, entryDependencies } from 'freegantt';
import {
  dependencyEntryInputs,
  firstDependencies,
  secondDependencies,
} from '../fixtures/dependency-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { mountPageBrief } from './docs/page-brief.js';

mountHarnessChrome();
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'dependencies');

// Install the plugin on the Dataset, then keep the object: its methods write the Dependencies.
const dependencies = entryDependencies();
const dataset = new Dataset({ entries: dependencyEntryInputs, timeZone: 'UTC', plugins: [dependencies] });

// A host that loads Dependencies from a server calls replaceAll with the whole list. It records no
// undo step, and it throws for an unknown Entry id without changing anything.
dependencies.replaceAll(firstDependencies);

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  range: 'fitDataset',
  preset: 'weekAndMonth',
  gridWidth: 'fitColumns',
  rowSource: { source: 'entries', tree: true },
  a11yLabel: 'Dependencies Gantt',
});
mountGanttToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

declare global {
  interface Window {
    __dataset: Dataset;
    __gantt: Gantt;
    __dependencies: typeof dependencies;
  }
}
window.__dataset = dataset;
window.__gantt = gantt;
window.__dependencies = dependencies;

const readout = document.querySelector<HTMLSpanElement>('#dependency-readout')!;
function showDependencies(): void {
  const list = dependencies.all();
  const text = list.map((d) => `${d.id} (${d.type}, ${d.lag.value}d)`).join(', ');
  readout.innerHTML = `Dependencies: <b>${list.length}</b> — ${text}`;
}
showDependencies();

// Which set is on screen? The button swaps between the two.
let showingFirst = true;
document.querySelector<HTMLButtonElement>('#replace-dependencies-btn')!.addEventListener('click', () => {
  showingFirst = !showingFirst;
  dependencies.replaceAll(showingFirst ? firstDependencies : secondDependencies);
  showDependencies();
});

document.querySelector<HTMLButtonElement>('#collapse-foundation-btn')!.addEventListener('click', () => {
  gantt.collapse('foundation');
});

// Removing an Entry removes every Dependency that names it, in the same change set. Undo in the
// toolbar brings the Entry and its Dependencies back together.
document.querySelector<HTMLButtonElement>('#remove-entry-btn')!.addEventListener('click', () => {
  dataset.entries.remove('foundation-2');
});
dataset.on('change', showDependencies);
