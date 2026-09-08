// S4.11 harness (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md, D-S4-34): one Gantt, one fixture,
// nine toolbar controls, and the S2 changeset log — every acceptance box is easier to believe when the
// reader sees the rows each edit produced.

import './harness-nav.ts';
import { Dataset, Gantt, ScrollModel, attemptMutation, inlineEditing } from '../src/api/index.js';
import type {
  DatasetDocument,
  DatasetEventMap,
  Entry,
  EntryInput,
  FieldContext,
  GridColumnsChange,
  GridColumnInput,
  RowHeightMode,
  RowSource,
} from '../src/api/index.js';
import { hierarchyEntryInputs, hierarchyFieldOptions } from '../fixtures/hierarchy-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'hierarchy');

declare global {
  interface Window {
    __dataset: Dataset<{ cost: number }, { cost: number }>;
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
];
const GRID_WITHOUT_COST: readonly GridColumnInput[] = ['name', 'start', 'end'];

const toolbar = document.querySelector<HTMLDivElement>('#toolbar')!;
const rowsModeSelect = document.querySelector<HTMLSelectElement>('#rows-mode')!;
const heightModeSelect = document.querySelector<HTMLSelectElement>('#height-mode')!;
const toggleCostBtn = document.querySelector<HTMLButtonElement>('#toggle-cost-col')!;
const filterTeamBtn = document.querySelector<HTMLButtonElement>('#filter-team-btn')!;
const sortFieldSelect = document.querySelector<HTMLSelectElement>('#sort-field')!;
const expandAllBtn = document.querySelector<HTMLButtonElement>('#expand-all-btn')!;
const collapseAllBtn = document.querySelector<HTMLButtonElement>('#collapse-all-btn')!;
const autoGroupCheckbox = document.querySelector<HTMLInputElement>('#autogroup-checkbox')!;
const reparentBtn = document.querySelector<HTMLButtonElement>('#reparent-btn')!;
const customEditorCheckbox = document.querySelector<HTMLInputElement>('#custom-editor-checkbox')!;
const costBtn = document.querySelector<HTMLButtonElement>('#cost-btn')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-btn')!;
const importBtn = document.querySelector<HTMLButtonElement>('#import-btn')!;
const documentJson = document.querySelector<HTMLTextAreaElement>('#document-json')!;
const log = document.querySelector<HTMLDivElement>('#log')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const gridColumnsReadout = document.querySelector<HTMLParagraphElement>('#grid-columns-readout')!;

let autoGroup = true;
let costColumnVisible = true;
let filterTeam: 'alpha' | 'beta' | null = null;
const paneScroll = new ScrollModel();
let dataset = createDataset(autoGroup);
let gantt = mountGantt(dataset);

window.__dataset = dataset;
window.__gantt = gantt;

function createDataset(
  autoGroupOn: boolean,
  entries: readonly EntryInput<{ cost: number }>[] = hierarchyEntryInputs,
): Dataset<{ cost: number }, { cost: number }> {
  return new Dataset<{ cost: number }, { cost: number }>({
    entries: structuredClone([...entries]),
    timeZone: 'UTC',
    hierarchy: { autoGroup: autoGroupOn },
    ...hierarchyFieldOptions,
  });
}

function mountGantt(next: Dataset<{ cost: number }, { cost: number }>): Gantt {
  return new Gantt({
    container: '#gantt',
    dataset: next,
    gridColumns: costColumnVisible ? GRID_WITH_COST : GRID_WITHOUT_COST,
    rowSource: buildRowSource(),
    range: 'fitDataset',
    scroll: paneScroll,
    plugins: [inlineEditing()],
  });
}

function buildRowSource(): RowSource {
  const heightMode: RowHeightMode = heightModeSelect.value === 'pack' ? 'pack' : 'fixed';
  const rowsMode = rowsModeSelect.value;
  const sortField = sortFieldSelect.value;
  const shared = {
    heightMode,
    ...(filterTeam !== null && rowsMode !== 'grouped'
      ? { filter: (entry: Entry, fields?: FieldContext) => fields?.read(entry, 'team') === filterTeam }
      : {}),
    ...(sortField !== 'none' && rowsMode !== 'grouped'
      ? { sort: { field: sortField as 'start' | 'cost' | 'name' } }
      : {}),
  };

  if (rowsMode === 'grouped') {
    return {
      source: 'group',
      groupBy: (entry: Entry, fields?: FieldContext) => String(fields?.read(entry, 'team') ?? 'unassigned'),
      ...shared,
    };
  }
  if (rowsMode === 'flat') {
    return { source: 'entries', tree: false, ...shared };
  }
  return { source: 'entries', tree: true, ...shared };
}

function syncFilterSortControls(): void {
  const grouped = rowsModeSelect.value === 'grouped';
  filterTeamBtn.disabled = grouped;
  sortFieldSelect.disabled = grouped;
  filterTeamBtn.textContent = filterTeam === null ? 'Filter team: off' : `Filter team: ${filterTeam}`;
}

function syncCostColumnLabel(): void {
  toggleCostBtn.textContent = costColumnVisible ? 'Hide cost column' : 'Show cost column';
}

function applyRowSource(): void {
  gantt.rowSource = buildRowSource();
  syncFilterSortControls();
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

function remountGantt(): void {
  const collapsed = [...gantt.collapsed];
  gantt.destroy();
  gantt = mountGantt(dataset);
  window.__gantt = gantt;
  gantt.collapsed = collapsed;
  applyRowSource();
  mountTimelineToolbar({ gantt, container: toolbar });
  bindGantt();
}

bindDataset();
bindGantt();
mountTimelineToolbar({ gantt, container: toolbar });
applyRowSource();
syncCostColumnLabel();
refreshHistoryButtons();
renderSelection();

rowsModeSelect.addEventListener('change', () => applyRowSource());
heightModeSelect.addEventListener('change', () => applyRowSource());

toggleCostBtn.addEventListener('click', () => {
  costColumnVisible = !costColumnVisible;
  gantt.gridColumns = costColumnVisible ? GRID_WITH_COST : GRID_WITHOUT_COST;
  toggleCostBtn.textContent = costColumnVisible ? 'Hide cost column' : 'Show cost column';
});

filterTeamBtn.addEventListener('click', () => {
  if (rowsModeSelect.value === 'grouped') return;
  filterTeam = filterTeam === null ? 'alpha' : filterTeam === 'alpha' ? 'beta' : null;
  applyRowSource();
});

sortFieldSelect.addEventListener('change', () => applyRowSource());

expandAllBtn.addEventListener('click', () => {
  gantt.expandAll();
});

collapseAllBtn.addEventListener('click', () => {
  gantt.collapseAll();
});

autoGroupCheckbox.addEventListener('change', () => {
  dataset.hierarchy = { autoGroup: autoGroupCheckbox.checked };
  autoGroup = dataset.hierarchy.autoGroup;
  logLine(`[load] autoGroup ${autoGroup ? 'on' : 'off'}`);
});

reparentBtn.addEventListener('click', () => {
  attemptMutation(() => {
    dataset.entries.update('task-beta', { parentId: 'plain-parent' });
  });
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

exportBtn.addEventListener('click', () => {
  documentJson.value = JSON.stringify(dataset.toJSON(), null, 2);
});

importBtn.addEventListener('click', () => {
  try {
    const doc = JSON.parse(documentJson.value) as DatasetDocument<{ cost: number }>;
    dataset.off('change', onChange);
    gantt.destroy();
    const imported = Dataset.fromJSON<{ cost: number }, { cost: number }>(doc, hierarchyFieldOptions);
    imported.hierarchy = { autoGroup };
    dataset = imported;
    window.__dataset = dataset;
    bindDataset();
    remountGantt();
    refreshHistoryButtons();
    renderSelection();
    logLine('[load] imported document');
  } catch (error) {
    logLine(`import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});
