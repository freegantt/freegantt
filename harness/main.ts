import './harness-nav.ts';
import { Gantt, Dataset, MutationCancelledError } from '../src/api/index.js';
import type { GridColumnInput, Theme } from '../src/api/index.js';
import type { TimeUnit } from '../src/model/index.js';
import { demoEntryInputs } from '../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';

const COST_TYPE = {
  money: {
    rollUp: 'sum' as const,
    formatValue: (value: unknown, ctx: { locale: Intl.LocalesArgument }) =>
      typeof value === 'number'
        ? new Intl.NumberFormat(ctx.locale, {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          }).format(value)
        : '',
    column: { align: 'end' as const, header: 'Cost' },
  },
};

const dataset = new Dataset({
  entries: demoEntryInputs.map((entry, i) => (i === 0 ? { ...entry, meta: { cost: 12_000 } } : entry)),
  timeZone: 'UTC',
  fieldTypes: COST_TYPE,
  fields: [{ key: 'cost', type: 'money' }],
});

const GRID_WITH_BUDGET: readonly GridColumnInput[] = [
  'name',
  'start',
  'duration',
  { field: 'cost', header: 'Budget' },
];
const GRID_WITHOUT_BUDGET: readonly GridColumnInput[] = ['name', 'start', 'duration'];

const gantt = new Gantt({ container: '#gantt', dataset, gridColumns: GRID_WITH_BUDGET });
// Zero-interaction visibility for the today line (S1.12, D-S1.12-14) — header readability follow-up
// pass 4. Needs no ResizeObserver measurement first: panToToday reads the already-resolved
// TimeScale, and the pane re-measures/re-renders on its own right after mount. `panToToday()`'s
// default `align: 'start'` leaves `todayLineMarginTicks`' worth of the timeline visible to the left
// of the line, the same landing a later "Today" button click reuses (S1.13 follow-up).
gantt.panToToday();

const toggleBudgetBtn = document.querySelector<HTMLButtonElement>('#toggle-budget-btn')!;
let budgetVisible = true;
toggleBudgetBtn.addEventListener('click', () => {
  budgetVisible = !budgetVisible;
  gantt.gridColumns = budgetVisible ? GRID_WITH_BUDGET : GRID_WITHOUT_BUDGET;
  toggleBudgetBtn.textContent = budgetVisible ? 'Hide Budget' : 'Show Budget';
});

mountTimelineToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

const nameInput = document.querySelector<HTMLInputElement>('#rename-input')!;
const renameBtn = document.querySelector<HTMLButtonElement>('#rename-btn')!;
const removeBtn = document.querySelector<HTMLButtonElement>('#remove-btn')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;

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
  try {
    dataset.transaction(() => {
      for (const entry of entries) dataset.entries.update(entry.id, { name: nameInput.value });
    });
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
});

removeBtn.addEventListener('click', () => {
  const entries = gantt.selectionEntries;
  if (entries.length === 0) return;
  try {
    dataset.transaction(() => {
      for (const entry of entries) dataset.entries.remove(entry.id);
    });
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
});

undoBtn.addEventListener('click', () => {
  try {
    dataset.undo();
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
});

redoBtn.addEventListener('click', () => {
  try {
    dataset.redo();
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
});

refreshHistoryButtons();
syncSelectionUi();

// Snap demo (D-S3-12): a drag always previews at full pixel resolution — this only controls where
// the *committed* start/end lands. 'tick' defers to whatever the active preset already steps by;
// 'none' matches holding Alt for every drag, not just the current one; hour/day/week let a visitor
// pick a coarser or finer grid than the preset's own tick, at any increment.
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
