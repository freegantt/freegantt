// S4.11 harness (plans/s4-hierarchy-and-rows/s4.11-harness-and-gate.md, D-S4-34): one Gantt, one fixture,
// nine toolbar controls, and the S2 changeset log — every acceptance box is easier to believe when the
// reader sees the rows each edit produced.

import './harness-nav.ts';
import { Dataset, Gantt, attemptMutation } from '../src/api/index.js';
import type {
  ChangeSet,
  DatasetDocument,
  DatasetEventMap,
  Entry,
  EntryInput,
  GridColumnInput,
  RowHeightMode,
  RowSource,
} from '../src/api/index.js';
import { hierarchyEntryInputs, hierarchyFieldOptions } from '../fixtures/hierarchy-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';

declare global {
  interface Window {
    __dataset: Dataset<{ cost: number }, { cost: number }>;
    __gantt: Gantt;
  }
}

type HierarchyMeta = { cost: number; team: string };

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

function entryInputsFromDataset(): EntryInput<HierarchyMeta>[] {
  return dataset.entries.all.map((entry) => ({
    id: entry.id,
    name: entry.name,
    ...(entry.parentId !== undefined ? { parentId: entry.parentId } : {}),
    ...(entry.kind !== 'span' ? { kind: entry.kind } : {}),
    start: entry.start,
    end: entry.end,
    ...(entry.segments !== undefined ? { segments: entry.segments } : {}),
    ...(entry.meta !== undefined ? { meta: entry.meta as HierarchyMeta } : {}),
  }));
}

function createDataset(
  autoGroupOn: boolean,
  entries: readonly EntryInput<HierarchyMeta>[] = hierarchyEntryInputs,
): Dataset<{ cost: number }, { cost: number }> {
  return new Dataset<{ cost: number }, { cost: number }>({
    entries: structuredClone(entries),
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

function teamOf(entry: Entry): string | undefined {
  return (entry.meta as HierarchyMeta | undefined)?.team;
}

function parentIdsWithChildren(): string[] {
  const parents = new Set<string>();
  for (const entry of dataset.entries.all) {
    if (entry.parentId !== undefined) parents.add(entry.parentId);
  }
  return [...parents];
}

function buildRowSource(): RowSource {
  const heightMode: RowHeightMode = heightModeSelect.value === 'pack' ? 'pack' : 'fixed';
  const rowsMode = rowsModeSelect.value;
  const sortField = sortFieldSelect.value;
  const shared = {
    heightMode,
    ...(filterTeam !== null && rowsMode !== 'grouped'
      ? { filter: (entry: Entry) => teamOf(entry) === filterTeam }
      : {}),
    ...(sortField !== 'none' && rowsMode !== 'grouped'
      ? { sort: { field: sortField as 'start' | 'cost' | 'name' } }
      : {}),
  };

  if (rowsMode === 'grouped') {
    return {
      source: 'group',
      groupBy: (entry: Entry) => teamOf(entry) ?? 'unassigned',
      ...shared,
    };
  }
  if (rowsMode === 'flat') {
    return { source: 'entries', tree: false, ...shared };
  }
  return { source: 'entries', tree: true, ...shared };
}

function applyRowSource(): void {
  gantt.rowSource = buildRowSource();
  filterTeamBtn.disabled = rowsModeSelect.value === 'grouped';
  sortFieldSelect.disabled = rowsModeSelect.value === 'grouped';
  filterTeamBtn.textContent = filterTeam === null ? 'Filter team: off' : `Filter team: ${filterTeam}`;
  toggleCostBtn.textContent = costColumnVisible ? 'Hide cost column' : 'Show cost column';
}

function logLine(text: string): void {
  const row = document.createElement('div');
  row.textContent = text;
  log.prepend(row);
}

function logChangeSet(changeSet: ChangeSet): void {
  const tag = `[${changeSet.origin}]`;
  for (const { store, entity } of changeSet.added) logLine(`${tag} ${store} · ${entity.id} · added`);
  for (const { store, entity } of changeSet.removed) logLine(`${tag} ${store} · ${entity.id} · removed`);
  for (const { store, id, field, from, to } of changeSet.updated) {
    logLine(`${tag} ${store} · ${id} · ${field} · ${String(from)} → ${String(to)}`);
  }
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
  logChangeSet(changeSet);
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

function rebuildGantt(preserveScroll = false): void {
  const pane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane');
  const scrollTop = preserveScroll && pane ? pane.scrollTop : 0;
  const scrollLeft = preserveScroll && pane ? pane.scrollLeft : 0;
  const collapsed = [...gantt.collapsed];

  gantt.destroy();
  gantt = mountGantt(dataset);
  window.__gantt = gantt;
  gantt.collapsed = collapsed;
  applyRowSource();
  mountTimelineToolbar({ gantt, container: toolbar });
  bindGantt();

  const nextPane = document.querySelector<HTMLElement>('#gantt .fg-timeline-pane');
  if (nextPane && preserveScroll) {
    nextPane.scrollTop = scrollTop;
    nextPane.scrollLeft = scrollLeft;
    nextPane.dispatchEvent(new Event('scroll'));
  }
}

function rebuildDataset(nextAutoGroup: boolean): void {
  const entries = entryInputsFromDataset();
  dataset.off('change', onChange);
  gantt.destroy();
  autoGroup = nextAutoGroup;
  dataset = createDataset(autoGroup, entries);
  window.__dataset = dataset;
  bindDataset();
  rebuildGantt(true);
  refreshHistoryButtons();
  renderSelection();
  logLine(`[load] autoGroup ${autoGroup ? 'on' : 'off'}`);
}

bindDataset();
bindGantt();
mountTimelineToolbar({ gantt, container: toolbar });
applyRowSource();
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
  gantt.collapsed = [];
});

collapseAllBtn.addEventListener('click', () => {
  gantt.collapsed = parentIdsWithChildren();
});

autoGroupCheckbox.addEventListener('change', () => {
  const next = autoGroupCheckbox.checked;
  autoGroupCheckbox.disabled = true;
  try {
    rebuildDataset(next);
  } finally {
    autoGroupCheckbox.disabled = false;
    autoGroupCheckbox.checked = autoGroup;
  }
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
    let imported = Dataset.fromJSON<{ cost: number }, { cost: number }>(doc, hierarchyFieldOptions);
    if (!autoGroup) {
      const entries = imported.entries.all.map((entry) => ({
        id: entry.id,
        name: entry.name,
        ...(entry.parentId !== undefined ? { parentId: entry.parentId } : {}),
        ...(entry.kind !== 'span' ? { kind: entry.kind } : {}),
        start: entry.start,
        end: entry.end,
        ...(entry.segments !== undefined ? { segments: entry.segments } : {}),
        ...(entry.meta !== undefined ? { meta: entry.meta as HierarchyMeta } : {}),
      }));
      imported = createDataset(false, entries);
    }
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
