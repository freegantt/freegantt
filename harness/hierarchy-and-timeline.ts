// #435, #436, #470, S1.12/S1.13: one Gantt over the hierarchy fixture — tree, roll-ups, row
// sources, segmented rows, and the timeline navigation surface — plus one small second Gantt where a
// feature needs its own Dataset: an owning parent's Fields opt out of the roll-up dataset-wide, so it
// cannot share a Dataset with the rows that roll up above.

import './harness-nav.ts';
import {
  Dataset,
  Gantt,
  attemptMutation,
  daysOfWeek,
  diffMs,
  inlineEditing,
  spansTime,
  timeShading,
} from 'freegantt';
import type {
  DatasetEventMap,
  DateLineInput,
  Duration,
  Entry,
  EntryInput,
  EntryVariant,
  Field,
  GridColumnInput,
  RowSource,
} from 'freegantt';
import { hierarchyEntryInputs, hierarchyFieldOptions } from '../fixtures/hierarchy-dataset.js';
import type { HierarchyEntryProps } from '../fixtures/hierarchy-dataset.js';
import { phaseHierarchy } from './plugins/phase-hierarchy.js';
import type { PhaseProps } from './plugins/phase-hierarchy.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { prependChangeSet } from './change-log.js';
import { mountPageBrief } from './docs/page-brief.js';

declare global {
  interface Window {
    __dataset: Dataset;
    __gantt: Gantt;
    __owningParentGantt: Gantt;
  }
}

mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'hierarchy-and-timeline');

/** The fixture's own published shape (`cost`, `team`, the crew-lead row's own keys), plus the
 *  phase-hierarchy plugin's own `phaseId` (ADR 0020) — imported, never hand-copied, so this page
 *  cannot drift from either one. */
type HierarchyProps = HierarchyEntryProps & PhaseProps;

// How long is the work under this row? A leaf's own span; a parent's is the sum of its leaves'
// spans, so the gaps between them do not count.
const WORK: Field<Duration> = {
  key: 'work',
  type: 'duration',
  compute: (entry, ctx): Duration | undefined => {
    const rows = ctx.hasChildren(entry) ? ctx.leaves(entry) : [entry];
    const spans = rows.filter(spansTime);
    return spans.length === 0
      ? undefined
      : { value: spans.reduce((ms, row) => ms + diffMs(row.end, row.start), 0), unit: 'millisecond' };
  },
  column: { header: 'Work', align: 'end', width: 72 },
};

const GRID_COLUMNS: readonly GridColumnInput[] = [
  'name',
  'start',
  'end',
  'duration',
  'work',
  { field: 'cost', header: 'Cost' },
  { field: 'hours', header: 'Hours' },
];

// #436: entirely before the fixed range the Timeline panel offers, and entirely after it — the
// fixture's own "Site hold" (Mar 22–24) is the "after" case, so only the "before" case needs a row
// of its own.
const OUT_OF_RANGE_BEFORE: EntryInput<HierarchyProps> = {
  id: 'early-survey',
  name: 'Site survey',
  start: '2026-02-20',
  end: '2026-02-25',
};

const FIXED_RANGE = { start: '2026-03-01', end: '2026-03-21' };

// A parent with a real gap between its children, for the Work column: every other parent in the
// fixture has children that overlap in time, so its own Work already exceeds its Duration (the
// leaves' spans double-count the overlap) — this is the one row that shows the opposite, a gap
// nobody works through. Both children sit inside the March fixture window, so Program's own
// envelope, and the fitDataset range built from it, stay on the existing story.
const GAP_DEMO_ENTRIES: EntryInput<HierarchyProps>[] = [
  { id: 'gap-demo', name: 'Gap demo', parentId: 'program' },
  {
    id: 'gap-demo-a',
    name: 'Early stretch',
    parentId: 'gap-demo',
    start: '2026-03-01T00:00:00Z',
    end: '2026-03-03T00:00:00Z',
  },
  {
    id: 'gap-demo-b',
    name: 'Late stretch',
    parentId: 'gap-demo',
    start: '2026-03-10T00:00:00Z',
    end: '2026-03-12T00:00:00Z',
  },
];

const STATUS_CHECK_LINE: DateLineInput = { placeAt: '2026-03-10', label: 'Status check' };

// #421 C7: one variant for the crew-lead row's day bars. `hours` carries `rollUp: 'sum'`, so an
// ancestor reads an aggregate for it too; `worker` does not roll up, so only a day itself ever
// answers it. Its label uses `insideOrNone` (#435): each day tile sits edge to edge with the next,
// so a label too wide for its own tile paints no label at all, never one that spills into the
// neighbour.
const crewDayVariant: EntryVariant<HierarchyProps> = {
  name: 'crew-day',
  when: (entry) => entry.read('worker') !== undefined,
  paint: ({ entry }) => ({
    class: {
      'crew-day-filled': entry.read('filled') === true,
      'crew-day-open': entry.read('filled') !== true,
    },
  }),
  barLabels: { field: 'worker', policy: 'insideOrNone' },
  css: `
    .crew-day-filled { background: var(--fg-bar-fill); }
    .crew-day-open { background: repeating-linear-gradient(45deg, var(--rule) 0, var(--rule) 6px, var(--surface-sunk) 6px, var(--surface-sunk) 12px); }
  `,
};

const dataset = new Dataset<HierarchyProps>({
  entries: structuredClone([...hierarchyEntryInputs, OUT_OF_RANGE_BEFORE, ...GAP_DEMO_ENTRIES]),
  timeZone: 'UTC',
  ...hierarchyFieldOptions,
  fields: [...hierarchyFieldOptions.fields, WORK],
  // ADR 0020: the tree is whatever the hierarchy source answers. This plugin answers `phaseId`
  // first and `parentId` after it, so the fixture nests exactly as authored until the phase button
  // below writes a phase id.
  plugins: [phaseHierarchy()],
});

const rowsModeSelect = document.querySelector<HTMLSelectElement>('#rows-mode')!;
const sortFieldSelect = document.querySelector<HTMLSelectElement>('#sort-field')!;
const filterTeamBtn = document.querySelector<HTMLButtonElement>('#filter-team-btn')!;
const reparentBtn = document.querySelector<HTMLButtonElement>('#reparent-btn')!;
const phaseBtn = document.querySelector<HTMLButtonElement>('#phase-btn')!;
const moveGateTopBtn = document.querySelector<HTMLButtonElement>('#move-gate-top-btn')!;
const crewDaysBtn = document.querySelector<HTMLButtonElement>('#crew-days-btn')!;
const localeSelect = document.querySelector<HTMLSelectElement>('#locale-select')!;
const rangeModeSelect = document.querySelector<HTMLSelectElement>('#range-mode')!;
const dateLinesCheckbox = document.querySelector<HTMLInputElement>('#date-lines-checkbox')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const log = document.querySelector<HTMLDivElement>('#log')!;

let filterTeam: 'alpha' | 'beta' | null = null;

// #429: the fresh source for a `source` switch (tree, flat or grouped). A fresh source carries no
// filter and no sort. It is also the one literal the Gantt reads at first mount.
function freshRowSource(rowsMode: string): RowSource {
  if (rowsMode === 'grouped') {
    return { source: 'group', groupBy: (entry: Entry) => String(entry.read('team') ?? 'unassigned') };
  }
  // #421 C7: "Framing crew" draws its day children as segments on every entries-sourced
  // arrangement, flat or tree alike — a segment rule is orthogonal to nesting.
  return { source: 'entries', tree: rowsMode !== 'flat', childrenAsSegments: { showDaysOnRow: true } };
}

const gantt = new Gantt<HierarchyProps>({
  container: '#gantt',
  dataset,
  gridColumns: GRID_COLUMNS,
  // #157: the pane sits on its columns' own right edge, and keeps sitting there as they change.
  gridWidth: 'fitColumns',
  rowSource: freshRowSource(rowsModeSelect.value),
  range: 'fitDataset',
  preset: 'weekAndMonth',
  plugins: [inlineEditing()],
  variants: [crewDayVariant],
  // A locked crew day withholds one capability from itself alone — every other bar on the page
  // keeps the library default.
  capabilities: { resize: (entry) => entry.read('locked') !== true },
  dateLines: [STATUS_CHECK_LINE],
});

window.__dataset = dataset;
window.__gantt = gantt;

mountGanttToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

// #404: weekends shade under the bars — the shipped built-in, the shipped fill, no CSS of this
// page's own.
gantt.installPlugin(timeShading([{ covers: daysOfWeek(6, 7) }]));

// #424: the selected row's own collapse state, read straight off `gantt.collapseStateOf` rather
// than scanned out of `gantt.collapsed` — the row tree's answer, not a set membership test.
function renderSelection(): void {
  const ids = gantt.selectedEntryIds;
  if (ids.length === 0) {
    selectionReadout.textContent = 'No selection';
    return;
  }
  const state = gantt.collapseStateOf(ids[0]!) ?? 'no row';
  selectionReadout.textContent = `Selected: ${ids.join(', ')} (${state})`;
}

// #429: the page holds no second copy of an answer `gantt.rowSource` already gives. A filter or
// sort change reads it back and spreads its own key (`docs/07-row-source-updates.md`).
// `filterTeam` stays local: the getter hands back the filter closure, not the team name inside it.
function applyRowsMode(): void {
  filterTeam = null;
  gantt.rowSource = freshRowSource(rowsModeSelect.value);
  syncRowSourceControls();
}

function applyFilter(): void {
  if (gantt.rowSource.source !== 'entries') return;
  // #495 follow-up: `filterRows` is the read-back-and-spread shorthand — the sort `applySort` owns
  // survives untouched.
  gantt.filterRows(filterTeam === null ? undefined : (entry: Entry) => entry.read('team') === filterTeam);
  syncRowSourceControls();
}

function applySort(): void {
  if (gantt.rowSource.source !== 'entries') return;
  const sortField = sortFieldSelect.value;
  // #495 follow-up: `sortRows` is `filterRows`'s sibling — same shorthand, `sort` instead of `filter`.
  gantt.sortRows(sortField === 'none' ? undefined : { field: sortField as 'start' | 'cost' | 'name' });
  syncRowSourceControls();
}

// UI state that mirrors the row source reads it back from `gantt.rowSource`, not from a local copy.
function syncRowSourceControls(): void {
  const current = gantt.rowSource;
  const grouped = current.source === 'group';
  filterTeamBtn.disabled = grouped;
  sortFieldSelect.disabled = grouped;
  crewDaysBtn.disabled = grouped;
  filterTeamBtn.textContent = filterTeam === null ? 'Filter team: off' : `Filter team: ${filterTeam}`;
  sortFieldSelect.value = current.source === 'entries' ? (current.sort?.field ?? 'none') : 'none';
}

// #421 C7: nothing here decides the row shape directly — `showDaysOnRow` does, and
// `childrenAsSegments` reads it (`freshRowSource`, above). This button writes the one Field the row
// source already matches on.
function syncCrewDaysLabel(): void {
  const drawsSegments = dataset.entries.get('req-1')?.read('showDaysOnRow') === true;
  crewDaysBtn.textContent = drawsSegments
    ? 'Open Framing crew into sub-rows'
    : 'Draw Framing crew days as segments';
}

dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  renderSelection();
  syncCrewDaysLabel();
});
gantt.on('selectionChange', renderSelection);
// #424 review point 1: a collapse or expand fires `collapseChange` alone, with no `selectionChange`
// and no dataset `change` — the readout needs this subscription too, or it goes stale.
gantt.on('collapseChange', renderSelection);

// S5.8: fires before the built-in editor opens. Cy's day is locked the same way its
// resize is (`capabilities.resize` above) — a double-click on it never opens an editor at all.
gantt.on('beforeEntryEdit', ({ entry }) => {
  if (entry.read('locked') === true) return false;
  return undefined;
});

syncRowSourceControls();
renderSelection();
syncCrewDaysLabel();

rowsModeSelect.addEventListener('change', () => applyRowsMode());
sortFieldSelect.addEventListener('change', () => applySort());

filterTeamBtn.addEventListener('click', () => {
  if (rowsModeSelect.value === 'grouped') return;
  filterTeam = filterTeam === null ? 'alpha' : filterTeam === 'alpha' ? 'beta' : null;
  applyFilter();
});

reparentBtn.addEventListener('click', () => {
  attemptMutation(() => dataset.entries.update('task-beta', { parentId: 'plain-parent' }));
});

// ADR 0020: one `phaseId` write moves the row, with no `parentId` edit anywhere. "Empty phase"
// gains a child, so it derives: the Rollup gives it Gate review's own span and cost.
phaseBtn.addEventListener('click', () => {
  const nested = dataset.entries.get('gate')?.parent()?.id === 'phase-empty';
  attemptMutation(() => dataset.entries.update('gate', { phaseId: nested ? undefined : 'phase-empty' }));
  phaseBtn.textContent = nested
    ? 'Nest Gate review under Empty phase (plugin tree)'
    : 'Hand Gate review back to Phase A';
});

// ADR 0034: siblingIndex is an ordinary Field, so a move is one undo step like any other write —
// no parentId edit, no phase write, just a new rank in the group Gate review already sits in.
moveGateTopBtn.addEventListener('click', () => {
  attemptMutation(() => dataset.entries.update('gate', { siblingIndex: 0 }));
});

crewDaysBtn.addEventListener('click', () => {
  const drawsSegments = dataset.entries.get('req-1')?.read('showDaysOnRow') === true;
  attemptMutation(() => dataset.entries.update('req-1', { showDaysOnRow: !drawsSegments }));
});

localeSelect.addEventListener('change', () => {
  gantt.locale = localeSelect.value;
});

rangeModeSelect.addEventListener('change', () => {
  gantt.range = rangeModeSelect.value === 'fixed' ? FIXED_RANGE : 'fitDataset';
});

dateLinesCheckbox.addEventListener('change', () => {
  gantt.dateLines = dateLinesCheckbox.checked ? [STATUS_CHECK_LINE] : [];
});

// ---- Owning parent (#470): a second Dataset, because `rollUp: 'none'` is a Field's own answer —
// dataset-wide, not a per-entry opt-out — and the tree above relies on the ordinary roll-up for its
// own `start`/`end`. Two Datasets, two Fields tables, one page. ------------------------------------

const OWNING_PARENT_ENTRIES: EntryInput[] = [
  { id: 'phase', name: 'Phase', start: '2026-01-01', end: '2026-01-06' },
  { id: 'task-a', name: 'Task A', parentId: 'phase', start: '2026-01-01', end: '2026-01-02' },
  { id: 'task-b', name: 'Task B', parentId: 'phase', start: '2026-01-03', end: '2026-01-08' },
];

const owningParentDataset = new Dataset({
  entries: OWNING_PARENT_ENTRIES,
  timeZone: 'UTC',
  fields: [
    { key: 'start', rollUp: 'none' },
    { key: 'end', rollUp: 'none' },
  ],
});

const owningParentGantt = new Gantt({
  container: '#owning-parent-gantt',
  dataset: owningParentDataset,
  range: 'fitDataset',
  gridWidth: 'fitColumns',
  a11yLabel: 'Owning parent Gantt',
});
window.__owningParentGantt = owningParentGantt;

const owningParentUndoBtn = document.querySelector<HTMLButtonElement>('#owning-parent-undo-btn')!;

function refreshOwningParentUndo(): void {
  owningParentUndoBtn.disabled = !owningParentDataset.canUndo;
}

owningParentDataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
});
owningParentDataset.on('historyChange', refreshOwningParentUndo);

owningParentUndoBtn.addEventListener('click', () => attemptMutation(() => owningParentDataset.undo()));

refreshOwningParentUndo();
