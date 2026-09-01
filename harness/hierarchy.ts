// S4.11 harness (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md, D-S4-34): one Gantt, one fixture,
// nine toolbar controls, and the S2 changeset log — every acceptance box is easier to believe when the
// reader sees the rows each edit produced.

import './harness-nav.ts';
import { Dataset, Gantt, attemptMutation } from '../src/api/index.js';
import type {
  DatasetDocument,
  DatasetEventMap,
  Entry,
  EntryInput,
  FieldContext,
  GridColumnInput,
  RowHeightMode,
  RowSource,
} from '../src/api/index.js';
import { hierarchyEntryInputs, hierarchyFieldOptions } from '../fixtures/hierarchy-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';

declare global {
  interface Window {
    __dataset: Dataset<{ cost: number }, { cost: number }>;
    __gantt: Gantt;
  }
}

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
const costBtn = document.querySelector<HTMLButtonElement>('#cost-btn')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-btn')!;
const importBtn = document.querySelector<HTMLButtonElement>('#import-btn')!;
const documentJson = document.querySelector<HTMLTextAreaElement>('#document-json')!;
const log = document.querySelector<HTMLDivElement>('#log')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;

let autoGroup = true;
let costColumnVisible = true;
let filterTeam: 'alpha' | 'beta' | null = null;
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
      groupBy: (entry: Entry, fields?: FieldContext) => fields?.read<string>(entry, 'team') ?? 'unassigned',
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
  const ids = gantt.selection;
  selectionReadout.textContent = ids.length === 0 ? 'Selection: (none)' : `Selection: ${ids.join(', ')}`;
}

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
  redoBtn.disabled = !dataset.canRedo;
  costBtn.disabled = gantt.selectionEntries.length === 0;
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
}

function preservePaneScroll(run: () => void): void {
  const pane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane');
  const scrollTop = pane?.scrollTop ?? 0;
  const scrollLeft = pane?.scrollLeft ?? 0;
  run();
  const nextPane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane');
  if (nextPane === null) return;
  nextPane.scrollTop = scrollTop;
  nextPane.scrollLeft = scrollLeft;
  nextPane.dispatchEvent(new Event('scroll'));
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

function rebuildGantt(preserveScroll = false): void {
  if (preserveScroll) preservePaneScroll(remountGantt);
  else remountGantt();
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
  const entries = gantt.selectionEntries;
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
    rebuildGantt(false);
    refreshHistoryButtons();
    renderSelection();
    logLine('[load] imported document');
  } catch (error) {
    logLine(`import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});
