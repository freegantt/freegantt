import './harness-nav.ts';
import {
  Gantt,
  Dataset,
  attemptMutation,
  now,
  addMs,
  MS,
  tooltips,
  contextMenu,
  inlineEditing,
} from '../src/api/index.js';
import type {
  Entry,
  FieldContext,
  GridColumnInput,
  RowSource,
  Theme,
  TimeUnit,
  DatasetDocument,
  DatasetEventMap,
  GanttPlugin,
  RendererByKind,
  CellRenderer,
  HeaderRenderer,
} from '../src/api/index.js';
import { demoFieldOptions, demoTreeEntryInputs } from '../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { logEverything } from './plugins/log-everything.js';
import { selectionShortcuts } from './plugins/selection-shortcuts.js';
import { popupDemo } from './plugins/popup-demo.js';
import { lockEntries } from './plugins/lock-entries.js';

// S5.8, D-S5-19: Name, Start and Budget are editable (double-click, or Enter on the selected row's
// first editable column); End and Duration stay read-only (Duration is `compute`-sourced and has no
// stored home to write back to — ADR 0005: the Rollup would overwrite an edit on the next commit).
const GRID_COLUMNS: readonly GridColumnInput[] = [
  { field: 'name', editable: true },
  { field: 'start', editable: true },
  'end',
  { field: 'duration', align: 'start' },
  { field: 'cost', header: 'Budget', editable: true },
];

// S5.10, D-S5-24: one Dataset plugin owns every lock on this page — the checkbox below and the
// right-click Lock/Unlock items both write its store, so the page keeps no lock state of its own.
// `Dataset.plugins` is read-only, so it is installed here, at construction.
const locks = lockEntries();

const dataset = new Dataset<{ cost?: number; team?: string }, { cost: number; team?: string }>({
  entries: demoTreeEntryInputs,
  timeZone: 'UTC',
  ...demoFieldOptions,
  plugins: [locks],
});

// S3 direct manipulation demo (editing.html's own `mobilization` date line): a hard boundary a
// `beforeEntryMove` veto below enforces — dropping a bar before it is refused.
const mobilization = now();

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  gridColumns: GRID_COLUMNS,
  // #157: the pane is as wide as its columns, and stays that way when the budget column comes and
  // goes below. The number this replaces was hand-tuned to one column set.
  gridWidth: 'fitColumns',
  rowSource: { source: 'entries', tree: true },
  dateLines: [{ placeAt: mobilization, label: 'Mobilization', className: 'demo-mobilization-line' }],
});
gantt.panToToday();

mountTimelineToolbar({
  gantt,
  container: document.querySelector<HTMLDivElement>('#toolbar')!,
  showFit: true,
  showLocale: true,
  showTodayLineToggle: true,
});

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
  const entries = gantt.selectedEntries;
  if (entries.length === 0) {
    nameInput.value = '';
    return;
  }
  const firstName = entries[0]!.name;
  nameInput.value = entries.every((entry) => entry.name === firstName) ? firstName : '';
}

function refreshMutationButtons(): void {
  const none = gantt.selectedEntries.length === 0;
  nameInput.disabled = none;
  renameBtn.disabled = none;
  removeBtn.disabled = none;
}

function renderSelection(): void {
  const ids = gantt.selectedIds;
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

const log = document.querySelector<HTMLDivElement>('#log')!;

gantt.on('selectionChange', syncSelectionUi);
dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  syncSelectionUi();
  refreshHistoryButtons();
});

renameBtn.addEventListener('click', () => {
  const entries = gantt.selectedEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const entry of entries) dataset.entries.update(entry.id, { name: nameInput.value });
    });
  });
});

removeBtn.addEventListener('click', () => {
  const entries = gantt.selectedEntries;
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

// #195, D-S3-24: the page states the snap and nothing else. Round-tripping the resolved preset
// through `gantt.preset` built a one-off copy of a shipped preset, which the next zoom threw away.
function applySnapChoice(): void {
  const unit = snapUnitSelect.value;
  snapIncrementInput.disabled = unit === 'tick' || unit === 'none';
  gantt.snap =
    unit === 'tick' || unit === 'none'
      ? unit
      : { unit: unit as TimeUnit, increment: Math.max(1, Number(snapIncrementInput.value) || 1) };
}

snapUnitSelect.addEventListener('change', applySnapChoice);
snapIncrementInput.addEventListener('change', applySnapChoice);
applySnapChoice();

// S5.7, D-S5-34: the page keeps no copy of which columns show. One list above declares the
// columns; `hideGridColumn` takes one off the screen and leaves the widths and the order the user
// set on the other four alone, and `hiddenGridColumns` says which are off right now.
toggleBudgetBtn.addEventListener('click', () => {
  const wasHidden = gantt.hiddenGridColumns.includes('cost');
  if (wasHidden) gantt.showGridColumn('cost');
  else gantt.hideGridColumn('cost');
  toggleBudgetBtn.textContent = wasHidden ? 'Hide Budget' : 'Show Budget';
});

reparentBtn.addEventListener('click', () => {
  attemptMutation(() => {
    dataset.entries.update('entry-18', { parentId: 'entry-1' });
  });
});

let grouped = false;
let pack = false;
let filterTeam: 'core' | 'edge' | 'launch' | null = null;
const NEXT_FILTER_TEAM: Record<'core' | 'edge' | 'launch' | 'off', 'core' | 'edge' | 'launch' | null> = {
  off: 'core',
  core: 'edge',
  edge: 'launch',
  launch: null,
};
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
        groupBy: (entry: Entry, fields?: FieldContext) => String(fields?.read(entry, 'team') ?? 'unassigned'),
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
  filterTeam = NEXT_FILTER_TEAM[filterTeam ?? 'off'];
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

// ---- Mutation extras (S2): add entry, set cost, lock/veto, export/import (data.ts's own demo) ----

const addEntryBtn = document.querySelector<HTMLButtonElement>('#add-entry')!;
const costBtn = document.querySelector<HTMLButtonElement>('#cost-btn')!;
const lockCheckbox = document.querySelector<HTMLInputElement>('#lock-checkbox')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-btn')!;
const importBtn = document.querySelector<HTMLButtonElement>('#import-btn')!;
const documentJson = document.querySelector<HTMLTextAreaElement>('#document-json')!;

let nextNewId = 1;

addEntryBtn.addEventListener('click', () => {
  const id = `new-${nextNewId++}`;
  const start = now();
  attemptMutation(() => dataset.entries.add({ id, name: 'New entry', start, end: addMs(start, MS.DAY) }));
});

costBtn.addEventListener('click', () => {
  const entries = gantt.selectedEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const entry of entries) dataset.entries.update(entry.id, { cost: 500 });
    });
  });
});

// D-S2-25 / S5.10: the checkbox locks the dataset's current first entry through the same plugin the
// right-click menu uses. Locking is a real dataset write — it commits, it logs like every other
// change, and Ctrl+Z unlocks (#156). The refusal itself is the plugin's own `beforeChange`.
function firstEntryId(): string | undefined {
  return dataset.entries.all[0]?.id;
}

locks.onRefusal((id) => prependLogLine(log, `entries · ${id} · refused (locked)`));

lockCheckbox.addEventListener('change', () => {
  const id = firstEntryId();
  if (id === undefined) return;
  if (lockCheckbox.checked) locks.lock(id);
  else locks.unlock(id);
});

exportBtn.addEventListener('click', () => {
  documentJson.value = JSON.stringify(dataset.toJSON(), null, 2);
});

// Proves the round trip through the public `toJSON()`/`fromJSON()` surface alone (D-S2-6's own
// shape) without swapping this page's live `Gantt` — this page already wires a dozen other features
// straight to the one `gantt`/`dataset` pair, so a live rebind-on-import would mean re-attaching
// every one of those listeners to a fresh instance for one narrow proof. `data.html` already owns
// that fuller "swap the whole page" demo; this button stays a lighter, honest check: parse, rebuild
// a `Dataset` from the document, and log what came back — a `fromJSON` that throws (malformed JSON,
// a field the current `fieldTypes` doesn't declare) surfaces here exactly as it would for a consumer.
importBtn.addEventListener('click', () => {
  try {
    const doc = JSON.parse(documentJson.value) as DatasetDocument<{ cost?: number; team?: string }>;
    const imported = Dataset.fromJSON<{ cost?: number; team?: string }, { cost: number; team?: string }>(
      doc,
      demoFieldOptions,
    );
    prependLogLine(
      log,
      `[import] parsed ${imported.entries.all.length} entries — see data.html to load them live`,
    );
  } catch (error) {
    prependLogLine(log, `import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

// ---- Direct manipulation extras (S3): mobilization veto, async hold, resize lock ----

const holdDropCheckbox = document.querySelector<HTMLInputElement>('#hold-drop')!;
const lockResizeCheckbox = document.querySelector<HTMLInputElement>('#lock-resize')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;

function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
}

function hideToast(): void {
  toast.hidden = true;
  toast.textContent = '';
}

let releaseHold: ((allow: boolean) => void) | undefined;

gantt.on('beforeEntryMove', ({ start }) => {
  if (start < mobilization) {
    showToast('Too early — drop is before mobilization');
    releaseHold?.(false);
    releaseHold = undefined;
    return false;
  }
  hideToast();
  if (!holdDropCheckbox.checked) return undefined;
  showToast('Holding drop — uncheck Hold drop to confirm');
  return new Promise<void | false>((resolve) => {
    releaseHold = (allow) => resolve(allow ? undefined : false);
  });
});

holdDropCheckbox.addEventListener('change', () => {
  if (holdDropCheckbox.checked || releaseHold === undefined) return;
  releaseHold(true);
  releaseHold = undefined;
  hideToast();
});

// #195, D-S5-35: the page writes the one gesture it owns. Assigning `gantt.interactions` would
// restate the whole capability config, and drop any other rule this page had set. Unchecking the box
// clears the rule rather than setting `resize: true`, so a group row stays unresizable.
lockResizeCheckbox.addEventListener('change', () => {
  if (lockResizeCheckbox.checked) gantt.setCapabilityRule('resize', false);
  else gantt.clearCapabilityRule('resize');
});

// ---- Plugins, commands, popups, renderers (S5) — plugins.html's own demo, over this same Gantt ----

const toggleLoggingBtn = document.querySelector<HTMLButtonElement>('#toggle-plugin-btn')!;

// Review H1: the three demo plugins live in `harness/plugins/` now, beside `weekendShading()` and
// the two kind plugins. This page and `plugins.ts` install one copy each. Each takes this page's own
// log writer, because each page owns its log panel.
const writeLog = (line: string): void => prependLogLine(log, line);

toggleLoggingBtn.addEventListener('click', () => {
  const installed = gantt.plugins.some((plugin) => plugin.id === 'harness.logEverything');
  if (installed) {
    gantt.plugins = gantt.plugins.filter((plugin) => plugin.id !== 'harness.logEverything');
    toggleLoggingBtn.textContent = 'Install logging plugin';
  } else {
    gantt.plugins = [...gantt.plugins, logEverything(writeLog)];
    toggleLoggingBtn.textContent = 'Remove logging plugin';
  }
});

// #178: the page keeps the plugin object, the same way it keeps `lockEntries()`'s. That handle is
// how page scope reaches what the plugin built in `setup()` — it replaces a module-level stash the
// plugin used to keep for its callers, which two Gantts on one page would have shared (I2).
const demoPopup = popupDemo();
gantt.plugins = [...gantt.plugins, selectionShortcuts(writeLog), demoPopup];

const popupBtn = document.querySelector<HTMLButtonElement>('#open-popup-btn')!;
popupBtn.addEventListener('click', () => {
  const selected = gantt.selectedIds[0];
  if (selected === undefined) {
    writeLog('popup demo: select a bar first');
    return;
  }
  if (demoPopup.openOn(selected)) writeLog(`popup demo: opened on ${selected}`);
});

// S5.4, D-S5-10/11/12: `barRenderer`/`cellRenderer` as plain `GanttOptions.*` — no plugin needed.
// The demo tree's own "Requirements review" (`entry-4`) is already `kind: 'milestone'`, and every
// leaf entry already carries a `cost` (`fixtures/demo-dataset.ts`), so this reuses the existing
// dataset rather than adding renderer-only fixture data. `fg-bar-diamond`'s own shape is structural,
// from `entry.kind` alone (D-S4-24), outside a renderer's bounded scope (I13) — the demo renderer
// recolors it via the `--fg-bar-fill` custom property its own `::before` already reads.
// The cell renderer branches on `ctx.fieldValue`, the `cost` Field's own value (review H3), and
// paints `ctx.value`, the string the library formatted from it.
const BUDGET_THRESHOLD = 5000;

const demoBarRenderer: RendererByKind = {
  milestone: () => ({ class: { 'demo-milestone': true }, style: { '--fg-bar-fill': '#7b2cbf' } }),
};
const demoCellRenderer: CellRenderer = ({ column, value, fieldValue }) =>
  column.key === 'cost' && typeof fieldValue === 'number' && fieldValue > BUDGET_THRESHOLD
    ? { class: { 'demo-over-budget': true }, text: value }
    : undefined;
// Bug hunt (S5 fixes): headerRenderer had a live setter with nothing painting it — this demo is the
// harness's own manual check that the wiring fix reaches a real Gantt, not just the test suite.
const demoHeaderRenderer: HeaderRenderer = ({ column }) => ({
  class: { 'demo-header': true },
  text: column.header.toUpperCase(),
});

const renderersToggle = document.querySelector<HTMLInputElement>('#renderers-toggle')!;
renderersToggle.addEventListener('change', () => {
  if (renderersToggle.checked) {
    gantt.barRenderer = demoBarRenderer;
    gantt.cellRenderer = demoCellRenderer;
    gantt.headerRenderer = demoHeaderRenderer;
  } else {
    gantt.barRenderer = undefined;
    gantt.cellRenderer = undefined;
    gantt.headerRenderer = undefined;
  }
});
renderersToggle.dispatchEvent(new Event('change'));

// S5.5, D-S5-13/14: demo commands that only show up for an entry — the right-clicked bar, or its
// grid row (context-menu.ts resolves both the same way, through `ctx.view.dom.targetUnder`).
// Right-clicking empty timeline or an unpopulated grid stretch leaves `ctx.entry` undefined, so
// these three never appear there — background right-clicks stay on "Collapse all"/"Expand all".
const ENTRY_CONTEXT_COMMAND_IDS = ['demo.deleteEntry', 'demo.lockEntry', 'demo.unlockEntry'];

function entryContextActions(): GanttPlugin {
  return {
    id: 'harness.entryContextActions',
    setup(ctx) {
      ctx.commands.register({
        id: 'demo.deleteEntry',
        label: 'Delete',
        when: (cmdCtx) => cmdCtx.entry !== undefined,
        run: (cmdCtx) => {
          const entry = cmdCtx.entry;
          if (entry === undefined) return;
          attemptMutation(() => ctx.dataset.entries.remove(entry.id));
        },
      });
      ctx.commands.register({
        id: 'demo.lockEntry',
        label: 'Lock',
        when: (cmdCtx) => cmdCtx.entry !== undefined && !locks.isLocked(cmdCtx.entry.id),
        run: (cmdCtx) => {
          if (cmdCtx.entry === undefined) return;
          locks.lock(cmdCtx.entry.id);
          prependLogLine(log, `entries · ${cmdCtx.entry.id} · locked (right-click menu)`);
        },
      });
      ctx.commands.register({
        id: 'demo.unlockEntry',
        label: 'Unlock',
        when: (cmdCtx) => cmdCtx.entry !== undefined && locks.isLocked(cmdCtx.entry.id),
        run: (cmdCtx) => {
          if (cmdCtx.entry === undefined) return;
          locks.unlock(cmdCtx.entry.id);
          prependLogLine(log, `entries · ${cmdCtx.entry.id} · unlocked (right-click menu)`);
        },
      });
      // No disposer: `ctx.disposables` already retracts all three commands (review P4).
    },
  };
}

// S5.5, D-S5-13/14: the two shipped built-ins, installed straight from `plugins: [...]` — no config
// table, no core edit (`[S5-A1]`'s dogfood gate). Hover a bar for its name and dates; right-click a
// bar or its grid row for an entry-only menu ("Delete"/"Lock"/"Unlock" — `items` below drops the
// background-only defaults for that target), or the timeline canvas for "Collapse all"/"Expand all";
// `Shift+F10` opens the same entry menu for a selected row.
// S5.8, D-S5-19: `inlineEditing()` joins them — double-click Name, Start or Budget to edit in place.
gantt.plugins = [
  ...gantt.plugins,
  tooltips(),
  contextMenu({
    items: ({ entry, defaults }) =>
      entry !== undefined
        ? defaults.filter((item) => 'command' in item && ENTRY_CONTEXT_COMMAND_IDS.includes(item.command))
        : defaults,
  }),
  inlineEditing(),
  entryContextActions(),
];
