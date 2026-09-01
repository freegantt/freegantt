import './harness-nav.ts';
import { Gantt, Dataset, attemptMutation } from '../src/api/index.js';
import type { Entry, FieldContext, GridColumnInput, RowSource, Theme, TimeUnit } from '../src/api/index.js';
import { demoFieldOptions, demoTreeEntryInputs } from '../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';

const GRID_WITH_BUDGET: readonly GridColumnInput[] = [
  'name',
  'start',
  'end',
  'duration',
  { field: 'cost', header: 'Budget' },
];
const GRID_WITHOUT_BUDGET: readonly GridColumnInput[] = ['name', 'start', 'end', 'duration'];

const dataset = new Dataset<{ cost?: number; team?: string }, { cost: number; team?: string }>({
  entries: demoTreeEntryInputs,
  timeZone: 'UTC',
  ...demoFieldOptions,
});

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  gridColumns: GRID_WITH_BUDGET,
  rowSource: { source: 'entries', tree: true },
});
gantt.panToToday();

mountTimelineToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

const nameInput = document.querySelector<HTMLInputElement>('#rename-input')!;
const renameBtn = document.querySelector<HTMLButtonElement>('#rename-btn')!;
const removeBtn = document.querySelector<HTMLButtonElement>('#remove-btn')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const toggleBudgetBtn = document.querySelector<HTMLButtonElement>('#toggle-budget-btn')!;
const reparentBtn = document.querySelector<HTMLButtonElement>('#reparent-btn')!;
const rowsSourceBtn = document.querySelector<HTMLButtonElement>('#rows-source-btn')!;
const packRowsBtn = document.querySelector<HTMLButtonElement>('#pack-rows-btn')!;
const filterTeamBtn = document.querySelector<HTMLButtonElement>('#filter-team-btn')!;
const sortNameBtn = document.querySelector<HTMLButtonElement>('#sort-name-btn')!;
const expandAllBtn = document.querySelector<HTMLButtonElement>('#expand-all-btn')!;
const collapseAllBtn = document.querySelector<HTMLButtonElement>('#collapse-all-btn')!;

function refreshNameInput(): void {
  const entries = gantt.selectionEntries;
  if (entries.length === 0) {
    nameInput.value = '';
    return;
  }
  const firstName = entries[0]!.name;
  nameInput.value = entries.every((entry) => entry.name === firstName) ? firstName : '';
}

function refreshMutationButtons(): void {
  const none = gantt.selectionEntries.length === 0;
  nameInput.disabled = none;
  renameBtn.disabled = none;
  removeBtn.disabled = none;
}

function renderSelection(): void {
  const ids = gantt.selection;
  selectionReadout.textContent = ids.length === 0 ? 'Selection: (none)' : `Selection: ${ids.join(', ')}`;
}

function syncSelectionUi(): void {
  refreshNameInput();
  refreshMutationButtons();
  renderSelection();
}

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
  redoBtn.disabled = !dataset.canRedo;
}

gantt.on('selectionChange', syncSelectionUi);
dataset.on('change', () => {
  syncSelectionUi();
  refreshHistoryButtons();
});

renameBtn.addEventListener('click', () => {
  const entries = gantt.selectionEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const entry of entries) dataset.entries.update(entry.id, { name: nameInput.value });
    });
  });
});

removeBtn.addEventListener('click', () => {
  const entries = gantt.selectionEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const entry of entries) dataset.entries.remove(entry.id);
    });
  });
});

undoBtn.addEventListener('click', () => {
  attemptMutation(() => dataset.undo());
});

redoBtn.addEventListener('click', () => {
  attemptMutation(() => dataset.redo());
});

refreshHistoryButtons();
syncSelectionUi();

const snapUnitSelect = document.querySelector<HTMLSelectElement>('#snap-unit')!;
const snapIncrementInput = document.querySelector<HTMLInputElement>('#snap-increment')!;

function applySnapChoice(): void {
  const unit = snapUnitSelect.value;
  snapIncrementInput.disabled = unit === 'tick' || unit === 'none';
  const snap =
    unit === 'tick' || unit === 'none'
      ? unit
      : { unit: unit as TimeUnit, increment: Math.max(1, Number(snapIncrementInput.value) || 1) };
  gantt.preset = { ...gantt.preset, snap };
}

snapUnitSelect.addEventListener('change', applySnapChoice);
snapIncrementInput.addEventListener('change', applySnapChoice);
applySnapChoice();

let budgetVisible = true;
toggleBudgetBtn.addEventListener('click', () => {
  budgetVisible = !budgetVisible;
  gantt.gridColumns = budgetVisible ? GRID_WITH_BUDGET : GRID_WITHOUT_BUDGET;
  toggleBudgetBtn.textContent = budgetVisible ? 'Hide Budget' : 'Show Budget';
});

reparentBtn.addEventListener('click', () => {
  attemptMutation(() => {
    dataset.entries.update('entry-18', { parentId: 'entry-1' });
  });
});

let grouped = false;
let pack = false;
let filterTeam: 'core' | 'edge' | 'launch' | null = null;
let sortByName = false;

function applyRowSource(): void {
  const heightMode: 'fixed' | 'pack' = pack ? 'pack' : 'fixed';
  const shared = {
    heightMode,
    ...(filterTeam !== null && !grouped
      ? { filter: (entry: Entry, fields?: FieldContext) => fields?.read(entry, 'team') === filterTeam }
      : {}),
    ...(sortByName && !grouped ? { sort: { field: 'name' as const } } : {}),
  };
  const next: RowSource = grouped
    ? {
        source: 'group',
        groupBy: (entry: Entry, fields?: FieldContext) => fields?.read<string>(entry, 'team') ?? 'unassigned',
        ...shared,
      }
    : { source: 'entries', tree: true, ...shared };
  gantt.rowSource = next;
  rowsSourceBtn.textContent = grouped ? 'Show tree' : 'Group by team';
  packRowsBtn.textContent = pack ? 'Stack bars (fixed rows)' : 'Pack overlapping bars';
  filterTeamBtn.disabled = grouped;
  sortNameBtn.disabled = grouped;
  filterTeamBtn.textContent = filterTeam === null ? 'Filter team: off' : `Filter team: ${filterTeam}`;
  sortNameBtn.textContent = sortByName ? 'Sort by name: on' : 'Sort by name: off';
}

rowsSourceBtn.addEventListener('click', () => {
  grouped = !grouped;
  applyRowSource();
});

packRowsBtn.addEventListener('click', () => {
  pack = !pack;
  applyRowSource();
});

filterTeamBtn.addEventListener('click', () => {
  if (grouped) return;
  filterTeam =
    filterTeam === null ? 'core' : filterTeam === 'core' ? 'edge' : filterTeam === 'edge' ? 'launch' : null;
  applyRowSource();
});

sortNameBtn.addEventListener('click', () => {
  if (grouped) return;
  sortByName = !sortByName;
  applyRowSource();
});

expandAllBtn.addEventListener('click', () => {
  gantt.expandAll();
});

collapseAllBtn.addEventListener('click', () => {
  gantt.collapseAll();
});

applyRowSource();

const THEME_STORAGE_KEY = 'freegantt-harness-theme';

function isTheme(value: string | null | undefined): value is Theme {
  return value === 'auto' || value === 'light' || value === 'dark';
}

function applyTheme(choice: Theme): void {
  gantt.theme = choice;
  if (choice === 'auto') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', choice);
  }
  localStorage.setItem(THEME_STORAGE_KEY, choice);
  document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset['themeChoice'] === choice));
  });
}

const stored = localStorage.getItem(THEME_STORAGE_KEY);
applyTheme(isTheme(stored) ? stored : 'auto');

document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((button) => {
  button.addEventListener('click', () => {
    const choice = button.dataset['themeChoice'];
    if (isTheme(choice)) applyTheme(choice);
  });
});
