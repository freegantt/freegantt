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
  watchAllErrors,
} from '../src/api/index.js';
import type {
  Entry,
  FieldContext,
  GridColumnInput,
  RowSource,
  DatasetDocument,
  DatasetEventMap,
  GanttPlugin,
  RendererByKind,
  CellRenderer,
  HeaderRenderer,
} from '../src/api/index.js';
import { demoFieldOptions, demoTreeEntryInputs } from '../fixtures/demo-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { logEverything } from './plugins/log-everything.js';
import { selectionShortcuts } from './plugins/selection-shortcuts.js';
import { popupDemo } from './plugins/popup-demo.js';
import { lockEntries } from './plugins/lock-entries.js';
import { weekendShading } from './plugins/weekend-shading.js';

// S5.8, D-S5-19: `editable` is the Field's own answer now (#142), so no column here restates it.
// Name, Start, End and Budget take their Fields' own defaults and are editable.
//
// Duration still shows a refused cell: it is `compute`-sourced and has no stored home to write back
// to (ADR 0005: the Rollup would overwrite an edit on the next commit).
const GRID_COLUMNS: readonly GridColumnInput[] = [
  'name',
  'start',
  'end',
  { field: 'duration', align: 'start' },
  { field: 'cost', header: 'Budget' },
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

// A test seam only (`hierarchy.ts` writes the same two globals): it hands an e2e test the public
// `Gantt` and `Dataset`, nothing else. `Window.__dataset` binds to `hierarchy.ts`'s field shape;
// this page declares its own fields, so the cast stands in for that one shared declaration. Every
// e2e read of it (`segments`, `start`, `end`, `id`) sits on `Entry`, outside either page's fields.
// The double cast through `unknown` is evidence, not a shortcut: `Dataset<TFields>` gives no common
// type two differently-fielded instances both satisfy, so no single cast bridges them. #226's
// `gantt.dataset` getter does not close it, and was not expected to: the mismatch is between two
// harness pages' declared field shapes, not between a Gantt and the Dataset it holds.
window.__dataset = dataset as unknown as typeof window.__dataset;
window.__gantt = gantt;

mountGanttToolbar({
  gantt,
  container: document.querySelector<HTMLDivElement>('#toolbar')!,
});

const nameInput = document.querySelector<HTMLInputElement>('#rename-input')!;
const renameBtn = document.querySelector<HTMLButtonElement>('#rename-btn')!;
const removeBtn = document.querySelector<HTMLButtonElement>('#remove-btn')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const toggleBudgetBtn = document.querySelector<HTMLButtonElement>('#toggle-budget-btn')!;
const reparentBtn = document.querySelector<HTMLButtonElement>('#reparent-btn')!;
const rowsSourceBtn = document.querySelector<HTMLButtonElement>('#rows-source-btn')!;
const packRowsBtn = document.querySelector<HTMLButtonElement>('#pack-rows-btn')!;
const filterTeamBtn = document.querySelector<HTMLButtonElement>('#filter-team-btn')!;
const sortNameBtn = document.querySelector<HTMLButtonElement>('#sort-name-btn')!;

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

// ADR 0010: the Selection holds Segments, not Entries. The readout names both — the Entries the
// picked Segments belong to, and how many Segments are picked — so the page shows the unit the
// ADR introduced instead of hiding it behind the Entries alone.
function renderSelection(): void {
  const entryIds = gantt.selectedEntryIds;
  const segmentCount = gantt.selectedSegmentIds.length;
  selectionReadout.textContent =
    entryIds.length === 0
      ? 'No selection'
      : `Selected: ${entryIds.join(', ')} · ${segmentCount} segment${segmentCount === 1 ? '' : 's'}`;
}

function syncSelectionUi(): void {
  refreshNameInput();
  refreshMutationButtons();
  renderSelection();
}

const log = document.querySelector<HTMLDivElement>('#log')!;

gantt.on('selectionChange', syncSelectionUi);
dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  syncSelectionUi();
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

// Why no `attemptMutation` wrapper here? A refused command is silent, not thrown (`plans/02` §3),
// and §4.1 says a `beforeChange` veto leaves the Selection untouched. The contract is public.
removeBtn.addEventListener('click', () => {
  gantt.commands.run('freegantt.deleteSelection');
});

syncSelectionUi();

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

// #248 S4-3: grouped and pack used to be local flags mirroring gantt.rowSource. Now that the
// getter reads back resolved (S4-2), the page reads both off the Gantt instead of holding a
// second copy.
//
// filterTeam stays local for a narrower reason than "the Gantt cannot read it back". The Gantt reads
// the filter closure back fine — ResolvedEntriesRowSource extends EntriesRowSource. What it cannot
// read back is the team name captured *inside* that closure, and the button cycles through those
// names. sortByName is a different case: gantt.rowSource.sort answers it, so it is a second copy of
// what the library already holds. See #254.
let filterTeam: 'core' | 'edge' | 'launch' | null = null;
const NEXT_FILTER_TEAM: Record<'core' | 'edge' | 'launch' | 'off', 'core' | 'edge' | 'launch' | null> = {
  off: 'core',
  core: 'edge',
  edge: 'launch',
  launch: null,
};
let sortByName = false;

function applyRowSource(next: { grouped: boolean; pack: boolean }): void {
  const heightMode: 'fixed' | 'pack' = next.pack ? 'pack' : 'fixed';
  const shared = {
    heightMode,
    ...(filterTeam !== null && !next.grouped
      ? { filter: (entry: Entry, fields?: FieldContext) => fields?.read(entry, 'team') === filterTeam }
      : {}),
    ...(sortByName && !next.grouped ? { sort: { field: 'name' as const } } : {}),
  };
  const source: RowSource = next.grouped
    ? {
        source: 'group',
        groupBy: (entry: Entry, fields?: FieldContext) => String(fields?.read(entry, 'team') ?? 'unassigned'),
        ...shared,
      }
    : { source: 'entries', tree: true, ...shared };
  gantt.rowSource = source;
  refreshRowSourceUi();
}

function refreshRowSourceUi(): void {
  const { source, heightMode } = gantt.rowSource;
  const grouped = source === 'group';
  rowsSourceBtn.textContent = grouped ? 'Show tree' : 'Group by team';
  packRowsBtn.textContent = heightMode === 'pack' ? 'Stack bars (fixed rows)' : 'Pack overlapping bars';
  filterTeamBtn.disabled = grouped;
  sortNameBtn.disabled = grouped;
  filterTeamBtn.textContent = filterTeam === null ? 'Filter team: off' : `Filter team: ${filterTeam}`;
  sortNameBtn.textContent = sortByName ? 'Sort by name: on' : 'Sort by name: off';
}

rowsSourceBtn.addEventListener('click', () => {
  const { source, heightMode } = gantt.rowSource;
  applyRowSource({ grouped: source !== 'group', pack: heightMode === 'pack' });
});

packRowsBtn.addEventListener('click', () => {
  const { source, heightMode } = gantt.rowSource;
  applyRowSource({ grouped: source === 'group', pack: heightMode !== 'pack' });
});

filterTeamBtn.addEventListener('click', () => {
  const { source, heightMode } = gantt.rowSource;
  if (source === 'group') return;
  filterTeam = NEXT_FILTER_TEAM[filterTeam ?? 'off'];
  applyRowSource({ grouped: false, pack: heightMode === 'pack' });
});

sortNameBtn.addEventListener('click', () => {
  const { source, heightMode } = gantt.rowSource;
  if (source === 'group') return;
  sortByName = !sortByName;
  applyRowSource({ grouped: false, pack: heightMode === 'pack' });
});

refreshRowSourceUi();

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

// Who reports a refusal? The library, on one subscription over both emitters (D-S5-42) — the lock
// plugin's `refuse(reason)` words arrive here, so this page keeps no refusal callback of its own.
watchAllErrors([dataset, gantt], (report) => {
  const reason = report.reason === undefined ? '' : ` · ${report.reason}`;
  prependLogLine(log, `error · ${report.severity} · ${report.by} · ${report.code}${reason}`);
});

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

// #256: which cells may change? One row's finish date is fixed by contract. Its End cell refuses the
// editor, it paints no end handle, and the bar refuses a move — a move writes both dates, so it
// writes the pinned one too. Its start edge still resizes, because that writes `start` alone. Every
// other row is untouched.
//
// `Field.editable` says which Fields are writable at all; this says which of them are writable
// *here*. That per-entry axis is what a Field declaration has no room for, and before #256 this page
// could show no refusal at all: the only lock available was a whole-Field one, on the very Field
// this page demonstrates resize with.
const FIXED_FINISH_ENTRY = 'entry-13';
gantt.setCapabilityRule('edit', (entry, field) =>
  entry.id === FIXED_FINISH_ENTRY && field === 'end' ? false : undefined,
);

// A test seam, beside `__dataset`/`__gantt` above: an e2e test asks the page which row it pinned,
// rather than naming a fixture row of its own.
window.__fixedFinishEntryId = FIXED_FINISH_ENTRY;

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

// #195, D-S5-36: install and uninstall name one plugin. The page never restates the installed set,
// so a plugin installed elsewhere on this page cannot be dropped by this button.
toggleLoggingBtn.addEventListener('click', () => {
  const installed = gantt.hasPlugin('harness.logEverything');
  if (installed) {
    gantt.uninstallPlugin('harness.logEverything');
    toggleLoggingBtn.textContent = 'Install logging plugin';
  } else {
    gantt.installPlugin(logEverything(writeLog));
    toggleLoggingBtn.textContent = 'Remove logging plugin';
  }
});

// #178: the page keeps the plugin object, the same way it keeps `lockEntries()`'s. That handle is
// how page scope reaches what the plugin built in `setup()` — it replaces a module-level stash the
// plugin used to keep for its callers, which two Gantts on one page would have shared (I2).
const demoPopup = popupDemo();
gantt.installPlugin(selectionShortcuts(writeLog));
gantt.installPlugin(demoPopup);

const popupBtn = document.querySelector<HTMLButtonElement>('#open-popup-btn')!;
popupBtn.addEventListener('click', () => {
  const selected = gantt.selectedEntryIds[0];
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
  column.field === 'cost' && typeof fieldValue === 'number' && fieldValue > BUDGET_THRESHOLD
    ? { class: { 'demo-over-budget': true }, text: value }
    : undefined;
// Bug hunt (S5 fixes): headerRenderer had a live setter with nothing painting it — this demo is the
// harness's own manual check that the wiring fix reaches a real Gantt, not just the test suite.
const demoHeaderRenderer: HeaderRenderer = ({ column }) => ({
  class: { 'demo-header': true },
  text: column.header,
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

// S5.6, D-S5-15/D-S5-16, [S5-A2]: weekendShading() is written against the public surface alone
// ('freegantt', harness/plugins/weekend-shading.ts) — no core edit, no private import. Installed
// from the start; the checkbox removes it live through the same `uninstallPlugin` verb every
// other plugin toggle on this page already uses (I8: no remount).
gantt.installPlugin(weekendShading());

const weekendToggle = document.querySelector<HTMLInputElement>('#weekend-shading-toggle')!;
weekendToggle.addEventListener('change', () => {
  if (weekendToggle.checked) {
    gantt.installPlugin(weekendShading());
    writeLog('weekendShading: installed');
  } else {
    gantt.uninstallPlugin('demo.weekendShading');
    writeLog('weekendShading: removed');
  }
});

// Which commands does an entry menu show? — Delete, Lock and Unlock, the same three for the
// right-clicked bar, its grid row, or `Shift+F10` on a selected row (context-menu.ts and the
// keymap both resolve through `resolveActedOn`, `api/command.ts`). Right-clicking empty timeline
// or an unpopulated grid stretch leaves `ctx.entry` undefined, so none of the three show there —
// background right-clicks stay on "Collapse all"/"Expand all".
//
// Why is one of them the library's own? — `freegantt.deleteSelection` ships with core (#212, ADR
// 0010) and is already bound to the `Delete` key, so the page adds nothing for Delete. It reads
// `ctx.target.segmentIds`: a grid-row Delete removes every Segment the row owns, and an Entry with
// no Segments left is gone too, with no special case.
//
// What does the page still own? — Lock and Unlock, because a lock is this demo's own policy, not
// a library concept. They read `ctx.target.entryIds`: a lock is a property of the whole record, so
// picking one Segment of a multi-bar Entry still locks the Entry it belongs to.
const ENTRY_CONTEXT_COMMAND_IDS = ['freegantt.deleteSelection', 'demo.lockEntry', 'demo.unlockEntry'];

function entryContextActions(): GanttPlugin {
  return {
    id: 'harness.entryContextActions',
    setup(ctx) {
      ctx.commands.register({
        id: 'demo.lockEntry',
        label: 'Lock',
        // #212's second symptom: offer "Lock" exactly when the acted-on set has something left to
        // lock, and lock only those — an already-locked Entry in the same set is left alone rather
        // than re-locked for no reason.
        when: (cmdCtx) => (cmdCtx.target?.entryIds ?? []).some((id) => !locks.isLocked(id)),
        run: (cmdCtx) => {
          ctx.dataset.transaction(() => {
            for (const id of cmdCtx.target?.entryIds ?? []) {
              if (locks.isLocked(id)) continue;
              locks.lock(id);
              prependLogLine(log, `entries · ${id} · locked (right-click menu)`);
            }
          });
        },
      });
      ctx.commands.register({
        id: 'demo.unlockEntry',
        label: 'Unlock',
        when: (cmdCtx) => (cmdCtx.target?.entryIds ?? []).some((id) => locks.isLocked(id)),
        run: (cmdCtx) => {
          ctx.dataset.transaction(() => {
            for (const id of cmdCtx.target?.entryIds ?? []) {
              if (!locks.isLocked(id)) continue;
              locks.unlock(id);
              prependLogLine(log, `entries · ${id} · unlocked (right-click menu)`);
            }
          });
        },
      });
      // No disposer: `ctx.disposables` already retracts both commands (review P4).
    },
  };
}

// S5.5, D-S5-13/14: the two shipped built-ins, installed straight from `plugins: [...]` — no config
// table, no core edit (`[S5-A1]`'s dogfood gate). Hover a bar for its name and dates; right-click a
// bar or its grid row for an entry-only menu ("Delete"/"Lock"/"Unlock" — `items` below drops the
// background-only defaults for that target), or the timeline canvas for "Collapse all"/"Expand all";
// `Shift+F10` opens the same entry menu for a selected row.
// S5.8, D-S5-19: `inlineEditing()` joins them — double-click Name, Start or Budget to edit in place.
gantt.installPlugin(tooltips());
gantt.installPlugin(
  contextMenu({
    items: ({ entry, defaults }) =>
      entry !== undefined
        ? defaults.filter((item) => 'command' in item && ENTRY_CONTEXT_COMMAND_IDS.includes(item.command))
        : defaults,
  }),
);
gantt.installPlugin(inlineEditing());
gantt.installPlugin(entryContextActions());
