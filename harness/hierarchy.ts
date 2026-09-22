// S4.11 harness (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md, D-S4-34): one Gantt, one fixture,
// nine toolbar controls, and the S2 changeset log — every acceptance box is easier to believe when the
// reader sees the rows each edit produced.

import './harness-nav.ts';
import { Dataset, Gantt, ScrollAxis, attemptMutation, inlineEditing } from 'freegantt';
import type {
  DatasetEventMap,
  Entry,
  EntryInput,
  EntryVariant,
  GridColumnsChange,
  GridColumnInput,
  RowSource,
} from 'freegantt';
import { hierarchyEntryInputs, hierarchyFieldOptions } from '../fixtures/hierarchy-dataset.js';
import type { HierarchyEntryProps } from '../fixtures/hierarchy-dataset.js';
import { phaseHierarchy } from './plugins/phase-hierarchy.js';
import type { PhaseProps } from './plugins/phase-hierarchy.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'hierarchy');

declare global {
  interface Window {
    __dataset: Dataset;
    __gantt: Gantt;
    /** `main.ts`'s own seam (#256) — declared once, here, beside the two globals it joins. */
    __fixedFinishEntryId: string;
  }
}

// S5.8, D-S5-19: `editable` is the Field's own answer now (#142), so no column here restates it.
// Name, Start, End and Cost stay open on `CORE_FIELDS`'/`hierarchyFieldOptions`'s own defaults.
// End stays editable here: this page drags the handle pair, and one answer gates the cell editor and
// that handle alike. `main.ts` shows the refusal instead, on one row (#256).
const GRID_WITH_COST: readonly GridColumnInput[] = [
  'name',
  'start',
  'end',
  { field: 'cost', header: 'Cost' },
  { field: 'hours', header: 'Hours' },
];
const GRID_WITHOUT_COST: readonly GridColumnInput[] = [
  'name',
  'start',
  'end',
  { field: 'hours', header: 'Hours' },
];

const toolbar = document.querySelector<HTMLDivElement>('#toolbar')!;
const rowsModeSelect = document.querySelector<HTMLSelectElement>('#rows-mode')!;
const toggleCostBtn = document.querySelector<HTMLButtonElement>('#toggle-cost-col')!;
const filterTeamBtn = document.querySelector<HTMLButtonElement>('#filter-team-btn')!;
const sortFieldSelect = document.querySelector<HTMLSelectElement>('#sort-field')!;
const expandAllBtn = document.querySelector<HTMLButtonElement>('#expand-all-btn')!;
const collapseAllBtn = document.querySelector<HTMLButtonElement>('#collapse-all-btn')!;
const reparentBtn = document.querySelector<HTMLButtonElement>('#reparent-btn')!;
const phaseBtn = document.querySelector<HTMLButtonElement>('#phase-btn')!;
const customEditorCheckbox = document.querySelector<HTMLInputElement>('#custom-editor-checkbox')!;
const costBtn = document.querySelector<HTMLButtonElement>('#cost-btn')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const crewDaysBtn = document.querySelector<HTMLButtonElement>('#crew-days-btn')!;
const log = document.querySelector<HTMLDivElement>('#log')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const gridColumnsReadout = document.querySelector<HTMLParagraphElement>('#grid-columns-readout')!;

let costColumnVisible = true;
let filterTeam: 'alpha' | 'beta' | null = null;
const paneScroll = { x: new ScrollAxis(), y: new ScrollAxis() };

// #421 C7: one variant for the crew-lead row's day bars. `hours` carries `rollUp: 'sum'`, so an
// ancestor reads an aggregate for it too — `worker` does not roll up, so only a day itself ever
// answers it, and that is the rule (`entry-rule.ts`, "a match is equality, never has a value" reads
// the same way here: no ancestor's rollup can forge this one). `worker` prints on the bar; `filled`
// picks the look, so an open day reads differently from a covered one at a glance.
const crewDayVariant: EntryVariant<HierarchyProps> = {
  name: 'crew-day',
  when: (entry) => entry.read('worker') !== undefined,
  paint: ({ entry }) => ({
    class: {
      'crew-day-filled': entry.read('filled') === true,
      'crew-day-open': entry.read('filled') !== true,
    },
  }),
  barLabels: { field: 'worker' },
  css: `
    .crew-day-filled { background: var(--fg-accent, #2f6feb); }
    .crew-day-open { background: repeating-linear-gradient(45deg, #cbd5e1, #cbd5e1 6px, #e2e8f0 6px, #e2e8f0 12px); }
  `,
};

const dataset = createDataset();
const gantt = mountGantt(dataset);

window.__dataset = dataset;
window.__gantt = gantt;

/** The fixture's own published `HierarchyEntryProps` (`cost`, `team`, plus the crew-lead row's own
 *  keys, #421 C7) — imported, never hand-copied, so this page cannot drift from the fixture it reads
 *  (J41) — plus the one the hierarchy plugin declares (ADR 0020). */
type HierarchyProps = HierarchyEntryProps & PhaseProps;

function createDataset(
  entries: readonly EntryInput<HierarchyProps>[] = hierarchyEntryInputs,
): Dataset<HierarchyProps> {
  return new Dataset<HierarchyProps>({
    entries: structuredClone([...entries]),
    timeZone: 'UTC',
    ...hierarchyFieldOptions,
    // ADR 0020: the tree is whatever the hierarchy source answers. This plugin answers `phaseId`
    // first and `parentId` after it, so the fixture nests exactly as authored until the
    // `phase-btn` below writes a phase id.
    plugins: [phaseHierarchy()],
  });
}

function mountGantt(next: Dataset<HierarchyProps>): Gantt {
  return new Gantt({
    container: '#gantt',
    dataset: next,
    gridColumns: costColumnVisible ? GRID_WITH_COST : GRID_WITHOUT_COST,
    rowSource: freshRowSource(rowsModeSelect.value),
    range: 'fitDataset',
    scroll: paneScroll,
    plugins: [inlineEditing()],
    variants: [crewDayVariant],
    // A locked crew day withholds one capability from itself alone — every other bar on the page
    // keeps the library default (#421 C7, box: "a bar's own capabilities differ from its siblings").
    capabilities: { resize: (entry) => entry.read('locked') !== true },
  });
}

// #429: the fresh source for a `source` switch (tree, flat or grouped) — a fresh source carries no
// filter and no sort, the same rule `main.ts`'s own `applyGrouping` follows. It is also the one
// literal `mountGantt` reads at first mount, when nothing has set a filter or a sort yet.
function freshRowSource(rowsMode: string): RowSource {
  if (rowsMode === 'grouped') {
    return { source: 'group', groupBy: (entry: Entry) => String(entry.read('team') ?? 'unassigned') };
  }
  // #421 C7: `req-1` draws its day children as segments on every entries-sourced arrangement — flat or tree —
  // the same rule either way, because a segment rule is orthogonal to nesting (README hard rule 5).
  return { source: 'entries', tree: rowsMode === 'tree', childrenAsSegments: { showDaysOnRow: true } };
}

// #248 S4-3, #429: the page holds no second copy of an answer `gantt.rowSource` already gives — a
// filter or sort change reads it back and spreads its own key, the way `main.ts`'s own buttons do
// (`docs/07-row-source-updates.md`). `filterTeam` stays local for the reason `main.ts` documents:
// the getter hands back the filter closure, not the team name captured inside it.
function applyRowsMode(): void {
  filterTeam = null;
  gantt.rowSource = freshRowSource(rowsModeSelect.value);
  syncRowSourceControls();
}

function applyFilter(): void {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  gantt.rowSource = {
    ...current,
    filter: filterTeam === null ? undefined : (entry: Entry) => entry.read('team') === filterTeam,
  };
  syncRowSourceControls();
}

function applySort(): void {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  const sortField = sortFieldSelect.value;
  gantt.rowSource = {
    ...current,
    sort: sortField === 'none' ? undefined : { field: sortField as 'start' | 'cost' | 'name' },
  };
  syncRowSourceControls();
}

// UI state that mirrors the row source reads it back from `gantt.rowSource`, not from a local copy.
function syncRowSourceControls(): void {
  const current = gantt.rowSource;
  const grouped = current.source === 'group';
  filterTeamBtn.disabled = grouped;
  sortFieldSelect.disabled = grouped;
  filterTeamBtn.textContent = filterTeam === null ? 'Filter team: off' : `Filter team: ${filterTeam}`;
  sortFieldSelect.value = current.source === 'entries' ? (current.sort?.field ?? 'none') : 'none';
}

function syncCostColumnLabel(): void {
  toggleCostBtn.textContent = costColumnVisible ? 'Hide cost column' : 'Show cost column';
}

function logLine(text: string): void {
  prependLogLine(log, text);
}

function renderSelection(): void {
  const ids = gantt.selectedEntryIds;
  selectionReadout.textContent = ids.length === 0 ? 'Selection: (none)' : `Selection: ${ids.join(', ')}`;
}

/** S5.7, D-S5-18: one status line for every `gridColumnsChange` — a resize drag, a reorder drop, and
 *  the `toggle-cost-col` button's own `gantt.gridColumns = […]` assignment all fire it through the
 *  same commit sequence, so this one line covers all three. */
function renderGridColumns({ to }: GridColumnsChange): void {
  gridColumnsReadout.textContent = `Columns: ${to.map((column) => `${String(column.field)} (${column.width ?? 'flex'}px)`).join(', ')}`;
  logLine(`[gridColumnsChange] ${to.map((column) => String(column.field)).join(', ')}`);
}

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
  redoBtn.disabled = !dataset.canRedo;
  costBtn.disabled = gantt.selectedEntries.length === 0;
}

function onChange({ changeSet }: DatasetEventMap['change']): void {
  prependChangeSet(log, changeSet);
  renderSelection();
  refreshHistoryButtons();
  syncCrewDaysLabel();
}

function bindDataset(): void {
  dataset.on('change', onChange);
}

function bindGantt(): void {
  gantt.on('selectionChange', () => {
    renderSelection();
    refreshHistoryButtons();
  });
  gantt.on('gridColumnsChange', renderGridColumns);
  // S5.8, D-S5-19, U8: with the checkbox on, a Name edit never opens the built-in editor — this
  // opens `window.prompt` instead and writes through the ordinary `dataset.entries.update` path,
  // so the change log shows one `[change]` row either way (D-S5-19: "there is no second write
  // channel"). Only `field === 'name'` is intercepted — Start and Cost keep the built-in editor
  // even with the checkbox on, so the page can show both paths side by side.
  gantt.on('beforeEntryEdit', ({ entry, field }) => {
    if (!customEditorCheckbox.checked || field !== 'name') return;
    const next = window.prompt(`Rename "${entry.name}"`, entry.name);
    if (next !== null && next !== entry.name) {
      attemptMutation(() => dataset.entries.update(entry.id, { name: next }));
    }
    return false;
  });
  gantt.on('entryEdit', ({ entry, field, to }) => {
    logLine(`[entryEdit] ${String(entry.id)}.${String(field)} -> ${JSON.stringify(to)}`);
  });
}

bindDataset();
bindGantt();
mountTimelineToolbar({ gantt, container: toolbar });
syncRowSourceControls();
syncCostColumnLabel();
refreshHistoryButtons();
renderSelection();

rowsModeSelect.addEventListener('change', () => applyRowsMode());

toggleCostBtn.addEventListener('click', () => {
  costColumnVisible = !costColumnVisible;
  gantt.gridColumns = costColumnVisible ? GRID_WITH_COST : GRID_WITHOUT_COST;
  toggleCostBtn.textContent = costColumnVisible ? 'Hide cost column' : 'Show cost column';
});

filterTeamBtn.addEventListener('click', () => {
  if (rowsModeSelect.value === 'grouped') return;
  filterTeam = filterTeam === null ? 'alpha' : filterTeam === 'alpha' ? 'beta' : null;
  applyFilter();
});

sortFieldSelect.addEventListener('change', () => applySort());

expandAllBtn.addEventListener('click', () => {
  gantt.expandAll();
});

collapseAllBtn.addEventListener('click', () => {
  gantt.collapseAll();
});

reparentBtn.addEventListener('click', () => {
  attemptMutation(() => {
    dataset.entries.update('task-beta', { parentId: 'plain-parent' });
  });
});

// ADR 0020: one `phaseId` write moves the row, with no `parentId` edit anywhere. "Empty phase"
// gains a child, so it derives: the Rollup gives it the gate review's span and cost, and the
// `parent` variant paints it as a summary. A second click hands the row back.
phaseBtn.addEventListener('click', () => {
  const nested = dataset.entries.get('gate')?.parent()?.id === 'phase-empty';
  attemptMutation(() => {
    dataset.entries.update('gate', { phaseId: nested ? undefined : 'phase-empty' });
  });
  phaseBtn.textContent = nested
    ? 'Nest gate review under Empty phase (plugin tree)'
    : 'Hand gate review back to Phase A';
});

costBtn.addEventListener('click', () => {
  const entries = gantt.selectedEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const selected of entries) dataset.entries.update(selected.id, { cost: 500 });
    });
  });
});

undoBtn.addEventListener('click', () => {
  attemptMutation(() => dataset.undo());
});

redoBtn.addEventListener('click', () => {
  attemptMutation(() => dataset.redo());
});

// #421 C7: one Field write opens the segmented row into its own three rows, in one undo step, and the
// same write closes it back. Nothing here decides the row shape directly — `showDaysOnRow` does, and
// `childrenAsSegments` reads it (`freshRowSource`, above).
function syncCrewDaysLabel(): void {
  const drawsSegments = dataset.entries.get('req-1')?.read('showDaysOnRow') === true;
  crewDaysBtn.textContent = drawsSegments
    ? 'Open Framing crew into sub-rows'
    : 'Draw Framing crew days as segments';
}

crewDaysBtn.addEventListener('click', () => {
  const drawsSegments = dataset.entries.get('req-1')?.read('showDaysOnRow') === true;
  attemptMutation(() => dataset.entries.update('req-1', { showDaysOnRow: !drawsSegments }));
  syncCrewDaysLabel();
});

syncCrewDaysLabel();
