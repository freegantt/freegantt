import './harness-nav.ts';
import {
  Gantt,
  Dataset,
  attemptMutation,
  now,
  tooltips,
  contextMenu,
  inlineEditing,
  watchAllErrors,
} from 'freegantt';
import type {
  ChromePlugin,
  DatasetEventMap,
  Entry,
  EntryInput,
  GridCellRenderer,
  GridColumnInput,
} from 'freegantt';
import { demoTreeEntryInputs, demoFieldOptions, SEGMENTED_PARENT_ID } from '../fixtures/demo-dataset.js';
import type { DemoEntryProps } from '../fixtures/demo-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { zoomPresetsWithSixHour } from './six-hour-preset.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { fakeServer } from './fake-server.js';
import { lockEntries } from './plugins/lock-entries.js';
import { subtreeUnlock } from './plugins/subtree-unlock.js';
import { bufferKind } from './plugins/buffer-kind.js';
import type { BufferKindProps } from './plugins/buffer-kind.js';
import { riskKind } from './plugins/risk-kind.js';
import type { RiskKindProps } from './plugins/risk-kind.js';
import { overBudgetRows } from './plugins/over-budget-rows.js';
import { selectionShortcuts } from './plugins/selection-shortcuts.js';
import { popupDemo } from './plugins/popup-demo.js';
import { mountPageBrief } from './docs/page-brief.js';

// The block above the Gantt names what this page demonstrates, the config that does it,
// and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'editing-and-data');

// `bufferKind()`/`riskKind()` (harness/plugins/*) each write one of their own keys, and each reads
// its own `when`/`command` rule off a row this page marks. A chrome plugin declares no Field of its
// own, so this page adds each plugin's exported props to its own, and declares both in `fields`
// below — a chrome plugin installs after Field registration closes (ADR 0011).
interface EditingDataProps extends DemoEntryProps, BufferKindProps, RiskKindProps {
  buffer?: boolean;
  risk?: boolean;
  note?: string;
}

// #473: the one Entry a per-entry lock rule opens `note` under — `subtreeUnlock()`'s checkbox below
// unlocks this Entry's whole subtree, and nothing outside it.
const NOTE_UNLOCK_ROOT_ID = 'program';

// ADR 0018: this page's own words for two rows, read back by the two kind plugins' own rules — no
// plugin holds a list of the ids it owns.
const BUFFER_ENTRY_ID = 'entry-30';
const RISK_ENTRY_ID = 'entry-40';

function withKindProps(entry: EntryInput<DemoEntryProps>): EntryInput<EditingDataProps> {
  if (entry.id === BUFFER_ENTRY_ID) return { ...entry, props: { ...entry.props, buffer: true } };
  if (entry.id === RISK_ENTRY_ID) return { ...entry, props: { ...entry.props, risk: true } };
  return entry;
}

// S5.10: one Dataset plugin owns every lock on this page — the checkbox below writes its
// `locked` Field (#496), so the page keeps no lock state of its own. `Dataset.plugins` is
// read-only, so it installs here, at construction.
const locks = lockEntries();

// #473: `note` is locked (`editable: false`) everywhere, and this plugin's `setLockRule` is the
// only door that opens it — one subtree at a time, never the whole Field.
const notes = subtreeUnlock('note');

const dataset = new Dataset<EditingDataProps>({
  entries: demoTreeEntryInputs.map(withKindProps),
  timeZone: 'UTC',
  fields: [
    ...demoFieldOptions.fields,
    { key: 'buffer' },
    { key: 'risk' },
    { key: 'consumed' },
    { key: 'accepted' },
    { key: 'note', editable: false },
  ],
  plugins: [locks, notes],
});

// #517: stands in for a server this page polls. It carries the page's own list from page load, so
// its scripted revisions build on what the page actually shows.
const server = fakeServer(dataset.entries.all.map((entry) => entry.toInput()));

// A hard boundary a `beforeEntryMove` veto below enforces — dropping a bar before it is refused. A
// week out from today, so this labelled Date line and the unlabelled Today line land at two
// different x's instead of one.
const mobilization = dataset.time.addDays(now(), 7);

/** The one parent this page draws with segments (ADR 0026, #421) — three child Entries on one row.
 *  Locking it and dragging a neighbour is the hard case for the cascade: three spans to translate,
 *  not one envelope. */
const drawsChildrenAsSegments = (entry: Entry): boolean => entry.id === SEGMENTED_PARENT_ID;

const BUDGET_THRESHOLD = 5000;

// S5.4: `gridCellRenderer` is plain `GanttOptions`, no plugin needed — the same `cost`
// value `overBudgetRows()` below reads through `entry.read('cost')`, painted the cell's own way.
const overBudgetCell: GridCellRenderer = ({ column, value, fieldValue }) =>
  column.field === 'cost' && typeof fieldValue === 'number' && fieldValue > BUDGET_THRESHOLD
    ? { class: { 'demo-over-budget': true }, text: value }
    : undefined;

const GRID_COLUMNS: readonly GridColumnInput[] = ['name', 'start', 'end', { field: 'cost', header: 'Cost' }];

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  gridColumns: GRID_COLUMNS,
  gridWidth: 'fitColumns',
  rowSource: { source: 'entries', tree: true, childrenAsSegments: drawsChildrenAsSegments },
  dateLines: [{ placeAt: mobilization, label: 'Mobilization', className: 'demo-mobilization-line' }],
  dateLineLabelPlacement: 'inHeader',
  gridCellRenderer: overBudgetCell,
});
gantt.panToToday();

// #489: proof the anchor fix holds. Zoom past "Hour" (two zoom-outs) to reach it, or pick it
// straight off the time-scale picker below. `mountGanttToolbar` reads `gantt.zoomPresets` once, at
// mount time, so this runs first.
gantt.zoomPresets = zoomPresetsWithSixHour(gantt);

// A test seam, the same one every other harness page exposes.
window.__dataset = dataset;
window.__gantt = gantt;

mountGanttToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

const log = document.querySelector<HTMLDivElement>('#log')!;

function logLine(text: string): void {
  prependLogLine(log, text);
}

// ---- Selection readout ------------------------------------------------------------------------

const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const nameInput = document.querySelector<HTMLInputElement>('#rename-input')!;
const renameBtn = document.querySelector<HTMLButtonElement>('#rename-btn')!;
const removeBtn = document.querySelector<HTMLButtonElement>('#remove-btn')!;
const costBtn = document.querySelector<HTMLButtonElement>('#cost-btn')!;
const noteBtn = document.querySelector<HTMLButtonElement>('#note-btn')!;
const lockCheckbox = document.querySelector<HTMLInputElement>('#lock-checkbox')!;
const unlockSubtreeCheckbox = document.querySelector<HTMLInputElement>('#unlock-subtree-checkbox')!;

function renderSelection(): void {
  const ids = gantt.selectedEntryIds;
  selectionReadout.textContent = ids.length === 0 ? 'No selection' : `Selected: ${ids.join(', ')}`;
}

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
  costBtn.disabled = none;
  noteBtn.disabled = none;
}

// The lock veto, made visible: the checkbox locks every currently selected entry, and reads back locked
// exactly when the whole selection already is. Checking it is a real dataset write — it commits, it
// logs like any other change, and one undo lifts it (#156).
function refreshLockCheckbox(): void {
  const ids = gantt.selectedEntryIds;
  lockCheckbox.disabled = ids.length === 0;
  lockCheckbox.checked = ids.length > 0 && ids.every((id) => locks.isLocked(id));
}

// #473: undo/redo can close or open the subtree without the checkbox ever firing its own `change`
// event, so the checkbox reads `notes.isOpen()` fresh on every selection sync, not just on click.
function refreshUnlockCheckbox(): void {
  unlockSubtreeCheckbox.checked = notes.isOpen(NOTE_UNLOCK_ROOT_ID);
}

function syncSelectionUi(): void {
  renderSelection();
  refreshNameInput();
  refreshMutationButtons();
  refreshLockCheckbox();
  refreshUnlockCheckbox();
}

gantt.on('selectionChange', syncSelectionUi);
dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  syncSelectionUi();
});

// Who reports a refusal? The library, on one subscription over both emitters — the lock
// plugin's and the mobilization veto's own `refuse(reason)` words arrive here, so this page keeps
// no refusal callback of its own.
const toast = document.querySelector<HTMLDivElement>('#toast')!;

function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
}

function hideToast(): void {
  toast.hidden = true;
  toast.textContent = '';
}

watchAllErrors([dataset, gantt], (report) => {
  const reason = report.reason === undefined ? '' : ` · ${report.reason}`;
  logLine(`error · ${report.severity} · ${report.by} · ${report.code}${reason}`);
  if (report.severity !== 'info' || report.reason !== undefined) showToast(report.message);
});

syncSelectionUi();

// ---- Change the data ---------------------------------------------------------------------------

const addBtn = document.querySelector<HTMLButtonElement>('#add-entry')!;

let nextNewId = 1;

addBtn.addEventListener('click', () => {
  const id = `new-${nextNewId++}`;
  const start = now();
  attemptMutation(() =>
    dataset.entries.add({ id, name: 'New entry', start, end: dataset.time.addDays(start, 1) }),
  );
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
// and a locked entry's removal is refused the same way a locked entry's edit is.
removeBtn.addEventListener('click', () => {
  gantt.commands.run('freegantt.deleteSelection');
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

// ---- Per-entry lock rule (#473) -----------------------------------------------------------------

// A store row belongs to one Entry, so the page asks first that Program still exists — after a
// Remove or an Import without it, the box logs why and stays clear instead of throwing.
unlockSubtreeCheckbox.addEventListener('change', () => {
  if (!dataset.entries.has(NOTE_UNLOCK_ROOT_ID)) {
    logLine('note: the Program entry is gone — no subtree to unlock');
    refreshUnlockCheckbox();
    return;
  }
  if (unlockSubtreeCheckbox.checked) notes.openSubtree(NOTE_UNLOCK_ROOT_ID);
  else notes.closeSubtree(NOTE_UNLOCK_ROOT_ID);
});

// `dataset.editableOf` is the same answer `entries.update()` writes against (I14) — asking first
// means the button logs a clear refusal instead of an uncaught `FieldNotEditableError`.
noteBtn.addEventListener('click', () => {
  const entries = gantt.selectedEntries;
  if (entries.length === 0) return;
  const writable = entries.filter((entry) => dataset.editableOf(entry.id, 'note') !== 'never');
  if (writable.length === 0) {
    logLine("note: every selected entry is locked — unlock Program's subtree first");
    return;
  }
  // A mixed selection writes the open rows and says which ones it skipped, so a locked row in the
  // middle of a selection is a line in the log, not a silently dropped write.
  const skipped = entries.filter((entry) => !writable.includes(entry));
  if (skipped.length > 0) {
    logLine(`note: skipped ${skipped.length} locked row(s) — ${skipped.map((entry) => entry.id).join(', ')}`);
  }
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const entry of writable) dataset.entries.update(entry.id, { note: 'Reviewed' });
    });
  });
});

// ---- Vetoes -------------------------------------------------------------------------------------

const holdDropCheckbox = document.querySelector<HTMLInputElement>('#hold-drop')!;

lockCheckbox.addEventListener('change', () => {
  const ids = gantt.selectedEntryIds;
  if (ids.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const id of ids) {
        if (lockCheckbox.checked) locks.lock(id);
        else locks.unlock(id);
      }
    });
  });
});

let releaseHold: ((allow: boolean) => void) | undefined;

gantt.on('beforeEntryMove', ({ start, refuse }) => {
  if (start < mobilization) {
    releaseHold?.(false);
    releaseHold = undefined;
    // The page says why once, here. Core carries the words to the report, and the one
    // `watchAllErrors` subscription above toasts them.
    return refuse('Too early — the drop is before mobilization.');
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

// ---- Plugins over the public contract ------------------------------------------------------------

const writeLog = (line: string): void => logLine(line);

// Review H1: bufferKind(), riskKind(), overBudgetRows(), selectionShortcuts() and popupDemo() all
// live in `harness/plugins/`, written against 'freegantt' alone.
let kindPlugins: readonly ChromePlugin[] = [];

function installKindPlugins(): void {
  kindPlugins = [bufferKind(), riskKind()];
  for (const plugin of kindPlugins) gantt.installPlugin(plugin);
}

/** `hasPlugin` first: a caller may already have dropped one of the two, and the verbs are strict
 *  where an assignment form would be quiet (D-S5-36). */
function uninstallKindPlugins(): void {
  for (const plugin of kindPlugins) if (gantt.hasPlugin(plugin)) gantt.uninstallPlugin(plugin);
  kindPlugins = [];
}

installKindPlugins();

const kindPluginsToggle = document.querySelector<HTMLInputElement>('#kind-plugins-toggle')!;
kindPluginsToggle.addEventListener('change', () => {
  if (kindPluginsToggle.checked) {
    installKindPlugins();
    writeLog('bufferKind + riskKind: installed');
  } else {
    uninstallKindPlugins();
    writeLog('bufferKind + riskKind: removed');
  }
});

// S5.6, D-S5-15/D-S5-16: dogfoods the `rowStripe` half of `DecorationInput` — the same `cost` Field
// the grid cell renderer above reddens one cell of, stated the other way: this plugin marks the
// whole row.
gantt.installPlugin(overBudgetRows(BUDGET_THRESHOLD));

const overBudgetRowsToggle = document.querySelector<HTMLInputElement>('#over-budget-rows-toggle')!;
overBudgetRowsToggle.addEventListener('change', () => {
  if (overBudgetRowsToggle.checked) {
    gantt.installPlugin(overBudgetRows(BUDGET_THRESHOLD));
    writeLog('overBudgetRows: installed');
  } else {
    gantt.uninstallPlugin('demo.overBudgetRows');
    writeLog('overBudgetRows: removed');
  }
});

// S5.2, D-S5-6/D-S5-7: a plugin registers its own command and binds `Mod+K` to it — no toggle, it
// is always on, the way a real keymap addition would be.
gantt.installPlugin(selectionShortcuts(writeLog));

// #178: the page keeps the plugin object, the handle to what `popupDemo()` built in its own view().
const demoPopup = popupDemo();
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

// The three shipped built-ins, installed as values — hover a bar for its dates, right-click for the
// menu, double-click a Name, Start, End or Cost cell to edit it in place.
gantt.installPlugin(tooltips());
gantt.installPlugin(contextMenu());
gantt.installPlugin(inlineEditing());

// ---- Document: JSON export and import ------------------------------------------------------------

const exportBtn = document.querySelector<HTMLButtonElement>('#export-btn')!;
const importBtn = document.querySelector<HTMLButtonElement>('#import-btn')!;
const documentJson = document.querySelector<HTMLTextAreaElement>('#document-json')!;

// A read-only dump — every stored Entry, through the row's own copy door. The library holds no save
// format to round-trip through (ADR 0016); an application that persists a Dataset reads this door
// and its own plugins' stores. `toInput()` is exactly the shape `entries.add()` takes (ADR 0017).
exportBtn.addEventListener('click', () => {
  const all = dataset.entries.all.map((entry) => entry.toInput());
  documentJson.value = JSON.stringify(all, null, 2);
  logLine(`document · exported ${all.length} entries`);
});

function parseDocument(json: string): EntryInput<EditingDataProps>[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return undefined;
  }
  return Array.isArray(parsed) ? (parsed as EntryInput<EditingDataProps>[]) : undefined;
}

// Import is a load (#496): the pasted document may list a child before its parent, and `load`
// replaces every entry in one commit regardless of the order they arrive in. It is a full fresh
// start, not a merge — it clears undo, so the toolbar's Undo button goes dark right after.
importBtn.addEventListener('click', () => {
  const parsed = parseDocument(documentJson.value);
  if (parsed === undefined) {
    logLine('document · import failed · not a JSON array');
    return;
  }
  attemptMutation(() => dataset.entries.load(parsed));
  logLine(`document · imported ${parsed.length} entries`);
});

// #517: sync all is a poll, not a fresh start — it diffs the server's whole list against the live
// data. A kept row keeps its selection and collapse state. It records no undo step of its own, so
// the user's own edits stay undoable across a poll (docs/11-server-data.md), and an undo never
// writes over a value the poll brought in. A poll that finds nothing new commits nothing, so the
// toolbar's Undo button holds whatever it already showed.
const syncAllBtn = document.querySelector<HTMLButtonElement>('#sync-all-btn')!;
syncAllBtn.addEventListener('click', () => {
  const rows = server.fetchRows();
  const landed = attemptMutation(() => dataset.entries.syncAll(rows));
  logLine(landed ? 'document · synced from the server' : 'document · sync refused · server list not applied');
});

// #527: sync changes takes only the rows a server changed, not the whole list — a key a row leaves
// out keeps its stored value, and an id the delta does not name is untouched. It shares every other
// rule sync all follows: no undo step, no cleared Redo, and the same refusals.
const syncChangesBtn = document.querySelector<HTMLButtonElement>('#sync-changes-btn')!;
syncChangesBtn.addEventListener('click', () => {
  const delta = server.fetchChanges();
  const landed = attemptMutation(() => dataset.entries.syncChanges(delta));
  logLine(
    landed
      ? 'document · synced changes from the server'
      : 'document · sync refused · server delta not applied',
  );
});
