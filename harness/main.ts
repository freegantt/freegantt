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
  definePlugin,
  diamond,
  timeShading,
  daysOfWeek,
} from 'freegantt';
import type {
  Entry,
  GridColumnInput,
  RowSource,
  DatasetEventMap,
  EntryVariant,
  GridCellRenderer,
  HeaderRenderer,
} from 'freegantt';
import { SEGMENTED_PARENT_ID, demoFieldOptions, demoTreeEntryInputs } from '../fixtures/demo-dataset.js';
import type { DemoEntryProps } from '../fixtures/demo-dataset.js';
import { mountGanttToolbar } from './gantt-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { logEverything } from './plugins/log-everything.js';
import { selectionShortcuts } from './plugins/selection-shortcuts.js';
import { popupDemo } from './plugins/popup-demo.js';
import { lockEntries } from './plugins/lock-entries.js';
import { mountPageBrief } from './docs/page-brief.js';

// The block above the Gantt names what this page demonstrates, the config that does it,
// and the spec section that governs it — the one thing a reader new to the library needs first.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'generic-demo');

// S5.8: `editable` is the Field's own answer now (#142), so no column here restates it.
// Name, Start, End and Budget take their Fields' own defaults and are editable.
//
// Duration still shows a refused cell: it is a `compute` Field and has no stored home to write back
// to (ADR 0005: the Rollup would overwrite an edit on the next commit).
const GRID_COLUMNS: readonly GridColumnInput[] = [
  'name',
  'start',
  'end',
  { field: 'duration', align: 'start' },
  { field: 'cost', header: 'Budget' },
];

// S5.10: one Dataset plugin owns every lock on this page — the checkbox below and the
// right-click Lock/Unlock items both write its `locked` Field (#496), so the page keeps no lock
// state of its own. `Dataset.plugins` is read-only, so it is installed here, at construction.
const locks = lockEntries();

// `DemoEntryProps` is the fixture's own published shape, and the page states nothing about it. A
// hand-written copy here drifted from it the moment ADR 0018 added `milestone`.
const dataset = new Dataset<DemoEntryProps>({
  entries: demoTreeEntryInputs,
  timeZone: 'UTC',
  ...demoFieldOptions,
  plugins: [locks],
});

// S3 direct manipulation demo (editing.html's own `mobilization` date line): a hard boundary a
// `beforeEntryMove` veto below enforces — dropping a bar before it is refused. A week out from
// today, not today itself — so this labelled Date line and the unlabelled Today line wrapper
// (`todayLine`'s own default) land at two different x's instead of one, and this page shows both
// (#319 follow-up).
const mobilization = dataset.time.addDays(now(), 7);

/** The one parent this page draws with segments. A predicate, not a Field match, because the page
 *  names a single id — `hierarchy.ts` shows the other half, where a written Field decides it and
 *  undo carries it. */
const drawsChildrenAsSegments = (entry: Entry): boolean => entry.id === SEGMENTED_PARENT_ID;

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  gridColumns: GRID_COLUMNS,
  // #157: the pane is as wide as its columns, and stays that way when the budget column comes and
  // goes below. The number this replaces was hand-tuned to one column set.
  gridWidth: 'fitColumns',
  // What decides which parents draw their children as bars on their own row? This rule (#421).
  // `entry-16` draws its three legs on one row; every other Entry draws its own single bar. Before
  // ADR 0026 this picture needed a Segment — a second id space that only the library understood.
  rowSource: { source: 'entries', tree: true, childrenAsSegments: drawsChildrenAsSegments },
  dateLines: [{ placeAt: mobilization, label: 'Mobilization', className: 'demo-mobilization-line' }],
  // #318: the default (`'belowHeader'`) anchors below the header, which a scrolled-up row's
  // own bar can still reach — this page's own "Program" summary bar does, right where it lands.
  // The header itself never scrolls, so anchoring the label there instead is the one placement no
  // row can ever paint under.
  dateLineLabelPlacement: 'inHeader',
});
gantt.panToToday();

// A test seam only (`hierarchy.ts` writes the same two globals): it hands an e2e test the public
// `Gantt` and `Dataset`, nothing else. `Window.__dataset` is a bare `Dataset` — every e2e read of it
// (`start`, `end`, `id`) sits on `Entry`, outside either page's own declared fields, so no cast is
// needed to bridge two harness pages' differently-fielded instances.
window.__dataset = dataset;
window.__gantt = gantt;

mountGanttToolbar({
  gantt,
  container: document.querySelector<HTMLDivElement>('#toolbar')!,
});

const nameInput = document.querySelector<HTMLInputElement>('#rename-input')!;
const renameBtn = document.querySelector<HTMLButtonElement>('#rename-btn')!;
const removeBtn = document.querySelector<HTMLButtonElement>('#remove-btn')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const activationReadout = document.querySelector<HTMLParagraphElement>('#activation-readout')!;
const pointerActivationSelect = document.querySelector<HTMLSelectElement>('#pointer-activation-select')!;
const undoChordOffCheckbox = document.querySelector<HTMLInputElement>('#undo-chord-off-checkbox')!;
const allChordsOffCheckbox = document.querySelector<HTMLInputElement>('#all-chords-off-checkbox')!;
const toggleBudgetBtn = document.querySelector<HTMLButtonElement>('#toggle-budget-btn')!;
const lockGridCheckbox = document.querySelector<HTMLInputElement>('#lock-grid-checkbox')!;
const reparentBtn = document.querySelector<HTMLButtonElement>('#reparent-btn')!;
const rowsSourceBtn = document.querySelector<HTMLButtonElement>('#rows-source-btn')!;
const filterTeamBtn = document.querySelector<HTMLButtonElement>('#filter-team-btn')!;
const sortNameBtn = document.querySelector<HTMLButtonElement>('#sort-name-btn')!;
const segmentRowBtn = document.querySelector<HTMLButtonElement>('#segment-row-btn')!;

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

// ADR 0010, ADR 0025, #421: the Selection holds Entries. A former Segment is its own child Entry
// now, so the readout names the Entries alone — there is no separate Segment count left to show.
function renderSelection(): void {
  const entryIds = gantt.selectedEntryIds;
  selectionReadout.textContent = entryIds.length === 0 ? 'No selection' : `Selected: ${entryIds.join(', ')}`;
}

function syncSelectionUi(): void {
  refreshNameInput();
  refreshMutationButtons();
  renderSelection();
}

const log = document.querySelector<HTMLDivElement>('#log')!;

gantt.on('selectionChange', syncSelectionUi);

// #434: entryActivate fires on a click, an Enter, or (chosen below) a double-click — independent
// of Selection, so this readout moves even when capabilities.select refuses the same row. The
// count (a running total since page load, not per entry) is what tells a fixed double-click apart
// from the three-fires-per-double-click bug (#434) that looked identical from the cause alone.
let activationCount = 0;
gantt.on('entryActivate', ({ entry, cause }) => {
  activationCount += 1;
  activationReadout.textContent = `Activated: ${entry.name} (${cause}) ×${activationCount}`;
});

// #434: `pointerActivation` defaults to `'click'` so a bar's double-click never fights a grid
// cell's own double-click editor. The select reconfigures it live, the same shape gridResizable's does.
pointerActivationSelect.addEventListener('change', () => {
  gantt.pointerActivation = pointerActivationSelect.value === 'dblclick' ? 'dblclick' : 'click';
});

// #262: convenienceChords takes a per-command map or a single `boolean` for every convenience
// chord at once. "All off" already turns undo's chord off, so once it is checked the undo checkbox
// would lie by sitting unchecked — force it to agree and disable it instead of leaving a false
// state on screen.
let undoChordOffWanted = false;
function applyConvenienceChords(): void {
  if (allChordsOffCheckbox.checked) {
    gantt.convenienceChords = false;
  } else if (undoChordOffWanted) {
    gantt.convenienceChords = { 'freegantt.undo': false, 'freegantt.redo': false };
  } else {
    gantt.convenienceChords = true;
  }
  undoChordOffCheckbox.checked = allChordsOffCheckbox.checked || undoChordOffWanted;
  undoChordOffCheckbox.disabled = allChordsOffCheckbox.checked;
}
undoChordOffCheckbox.addEventListener('change', () => {
  undoChordOffWanted = undoChordOffCheckbox.checked;
  applyConvenienceChords();
});
allChordsOffCheckbox.addEventListener('change', applyConvenienceChords);
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

// S5.7: the page keeps no copy of which columns show. One list above declares the
// columns; `hideGridColumn` takes one off the screen and leaves the widths and the order the user
// set on the other four alone, and `hiddenGridColumns` says which are off right now.
toggleBudgetBtn.addEventListener('click', () => {
  const wasHidden = gantt.hiddenGridColumns.includes('cost');
  if (wasHidden) gantt.showGridColumn('cost');
  else gantt.hideGridColumn('cost');
  toggleBudgetBtn.textContent = wasHidden ? 'Hide Budget' : 'Show Budget';
});

// #432: one config key locks both grid-pane resize affordances — the splitter and every column's
// own resizer grip — live, with no per-column sweep and no event veto.
lockGridCheckbox.addEventListener('change', () => {
  gantt.gridResizable = !lockGridCheckbox.checked;
});

reparentBtn.addEventListener('click', () => {
  attemptMutation(() => {
    dataset.entries.update('entry-18', { parentId: 'entry-1' });
  });
});

// #248 S4-3, #254: the page holds no copy of an answer gantt.rowSource already gives. Each setting
// button spreads the source it just read and replaces its own key, so changing the sort leaves the
// filter alone and neither button re-authors the other.
//
// filterTeam is the one local, and it stays for a narrower reason than "the Gantt cannot read it
// back". The Gantt reads the filter closure back fine — ResolvedEntriesRowSource extends
// EntriesRowSource. What it cannot read back is the team name captured *inside* that closure, and
// the button cycles through those names.
let filterTeam: 'core' | 'edge' | 'launch' | null = null;
const NEXT_FILTER_TEAM: Record<'core' | 'edge' | 'launch' | 'off', 'core' | 'edge' | 'launch' | null> = {
  off: 'core',
  core: 'edge',
  edge: 'launch',
  launch: null,
};

/** The one button that rebuilds instead of spreading: it switches `source`, and a fresh source
 *  carries no filter and no sort. Both settings reset together, so neither outlives the switch. */
function applyGrouping(grouped: boolean): void {
  filterTeam = null;
  const next: RowSource = grouped
    ? { source: 'group', groupBy: (entry: Entry) => String(entry.read('team') ?? 'unassigned') }
    : { source: 'entries', tree: true, childrenAsSegments: drawsChildrenAsSegments };
  gantt.rowSource = next;
  refreshRowSourceUi();
}

function refreshRowSourceUi(): void {
  const current = gantt.rowSource;
  const grouped = current.source === 'group';
  const sorted = current.source !== 'custom' && current.sort !== undefined;
  const drawsSegments = current.source === 'entries' && current.childrenAsSegments !== undefined;
  rowsSourceBtn.textContent = grouped ? 'Show tree' : 'Group by team';
  filterTeamBtn.disabled = grouped;
  sortNameBtn.disabled = grouped;
  // A group source has no `childrenAsSegments` key to spread, so the rule has nowhere to live.
  segmentRowBtn.disabled = grouped;
  segmentRowBtn.textContent = drawsSegments
    ? "Open entry-16's legs into rows"
    : "Draw entry-16's legs as segments";
  filterTeamBtn.textContent = filterTeam === null ? 'Filter team: off' : `Filter team: ${filterTeam}`;
  sortNameBtn.textContent = sorted ? 'Sort by name: on' : 'Sort by name: off';
}

rowsSourceBtn.addEventListener('click', () => {
  applyGrouping(gantt.rowSource.source !== 'group');
});

filterTeamBtn.addEventListener('click', () => {
  if (gantt.rowSource.source !== 'entries') return;
  filterTeam = NEXT_FILTER_TEAM[filterTeam ?? 'off'];
  const team = filterTeam;
  // #495 follow-up: `filterRows` is the read-back-and-spread shorthand — the sort and
  // `childrenAsSegments` the two buttons below own both survive untouched.
  gantt.filterRows(team === null ? undefined : (entry: Entry) => entry.read('team') === team);
  refreshRowSourceUi();
});

// #421: the same three Entries, drawn two ways. Drawn as segments, they are three bars on one row; released,
// they are three ordinary rows. One config key moves between the two, live, with no reload.
segmentRowBtn.addEventListener('click', () => {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  gantt.rowSource = {
    ...current,
    childrenAsSegments: current.childrenAsSegments === undefined ? drawsChildrenAsSegments : undefined,
  };
  refreshRowSourceUi();
});

sortNameBtn.addEventListener('click', () => {
  const current = gantt.rowSource;
  if (current.source !== 'entries') return;
  // #495 follow-up: `sortRows` is `filterRows`'s sibling — same shorthand, `sort` instead of `filter`.
  gantt.sortRows(current.sort === undefined ? { field: 'name' } : undefined);
  refreshRowSourceUi();
});

refreshRowSourceUi();

// ---- Mutation extras (S2): add entry, set cost, lock/veto, entries dump ----

const addEntryBtn = document.querySelector<HTMLButtonElement>('#add-entry')!;
const costBtn = document.querySelector<HTMLButtonElement>('#cost-btn')!;
const lockCheckbox = document.querySelector<HTMLInputElement>('#lock-checkbox')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-btn')!;
const documentJson = document.querySelector<HTMLTextAreaElement>('#document-json')!;

let nextNewId = 1;

addEntryBtn.addEventListener('click', () => {
  const id = `new-${nextNewId++}`;
  const start = now();
  attemptMutation(() =>
    dataset.entries.add({ id, name: 'New entry', start, end: dataset.time.addDays(start, 1) }),
  );
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

// S5.10: the checkbox locks the dataset's current first entry through the same plugin the
// right-click menu uses. Locking writes the plugin's `locked` Field — a real dataset write, so it
// commits, it logs like every other change, and Ctrl+Z unlocks (#156). The refusal itself is the
// plugin's own `beforeChange`.
function firstEntryId(): string | undefined {
  return dataset.entries.all[0]?.id;
}

// Who reports a refusal? The library, on one subscription over both emitters — the lock
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

// A read-only dump — every stored Entry, through the row's own copy door. The library holds no
// save format to round-trip through (ADR 0016); an application that persists a Dataset reads this
// door and its own plugins' stores, and restores by handing the same shape back to `new Dataset()`.
// `toInput()` is that shape, and it is exactly what `entries.add()` takes (ADR 0017).
exportBtn.addEventListener('click', () => {
  documentJson.value = JSON.stringify(
    dataset.entries.all.map((entry) => entry.toInput()),
    null,
    2,
  );
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

gantt.on('beforeEntryMove', (move) => {
  if (move.shiftsTime && move.start < mobilization) {
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

// Which moves changed the tree? `place` is present only then.
gantt.on('entryMove', (move) => {
  if (move.place === undefined) return;
  prependLogLine(
    log,
    `moved ${move.entry} under ${move.place.parentId ?? 'the root'} at ${move.place.siblingIndex}`,
  );
});

// #256: which cells may change? One row's finish date is fixed by contract. Its End cell refuses
// the editor, and it paints no end handle. The bar refuses a move too, because a move writes both
// dates. Its start edge still resizes, because that writes `start` alone. Every other row is
// untouched.
//
// `Field.editable` says which Fields are writable at all. This says which of them are writable
// *here*. A Field declaration has no room for that per-entry axis.
//
// Before #256 this page could show no refusal at all. The only lock was a whole-Field one, on the
// very Field this page demonstrates resize with.
const FIXED_FINISH_ENTRY = 'entry-13';
gantt.setCapabilityRule('edit', (entry, field) =>
  entry.id === FIXED_FINISH_ENTRY && field === 'end' ? false : undefined,
);

// A test seam, beside `__dataset`/`__gantt` above: an e2e test asks the page which row it pinned,
// rather than naming a fixture row of its own.
window.__fixedFinishEntryId = FIXED_FINISH_ENTRY;

// #195: the page writes the one rule it owns. Assigning `gantt.capabilities` would
// restate the whole capability config, and drop any other rule this page had set. Unchecking the box
// clears the rule rather than setting `resize: true`, so a group row stays unresizable.
lockResizeCheckbox.addEventListener('change', () => {
  if (lockResizeCheckbox.checked) gantt.setCapabilityRule('resize', false);
  else gantt.clearCapabilityRule('resize');
});

// #425: the same one-rule-at-a-time shape as `lockResizeCheckbox` above — a vertical drag is on by
// default, and this is the one page-owned rule that turns it off for every row at once.
const lockTreeCheckbox = document.querySelector<HTMLInputElement>('#lock-tree-checkbox')!;
lockTreeCheckbox.addEventListener('change', () => {
  if (lockTreeCheckbox.checked) gantt.setCapabilityRule('reorder', false);
  else gantt.clearCapabilityRule('reorder');
});

// ---- Plugins, commands, popups, renderers (S5) — plugins.html's own demo, over this same Gantt ----

const toggleLoggingBtn = document.querySelector<HTMLButtonElement>('#toggle-plugin-btn')!;

// Review H1: the three demo plugins live in `harness/plugins/` now, beside `overBudgetRows()` and
// the two kind plugins. This page and `plugins.ts` install one copy each. Each takes this page's own
// log writer, because each page owns its log panel.
const writeLog = (line: string): void => prependLogLine(log, line);

// #195: install and uninstall name one plugin. The page never restates the installed set,
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

// S5.4: `gridCellRenderer`/`headerRenderer` as plain `GanttOptions.*` — no plugin needed.
// ADR 0022: `diamond()` is core's own shipped glyph, so this page states only which rows wear one —
// the `milestone` Field the fixture writes on "Requirements review" (`fixtures/demo-dataset.ts`), so
// `update(id, { milestone: true })` would pin a second row with no code change here. The purple fill
// is an ordinary rule in `harness-chrome.css` (`.fg-bar-diamond { --fg-bar-fill: … }`), no JavaScript
// in between (refuted item 8) — `.fg-bar` already reads that token into `--fg-bar-fill-painted`, and
// `diamond()`'s own `::before` paints from it.
// `name: 'milestone'` tells ADR 0018's story on this page too — an app names a row in its own
// word, and `diamond()`'s look rides its class (`.fg-bar-diamond`) and `css`, neither of which reads
// the name, so renaming costs nothing.
// Every leaf entry already carries a `cost` (`fixtures/demo-dataset.ts`), so this reuses the
// existing dataset rather than adding renderer-only fixture data.
// The cell renderer branches on `ctx.fieldValue`, the `cost` Field's own value (review H3), and
// paints `ctx.value`, the string the library formatted from it.
const BUDGET_THRESHOLD = 5000;

const demoVariants: readonly EntryVariant<DemoEntryProps>[] = [
  diamond({ name: 'milestone', when: { milestone: true } }),
];
const demoGridCellRenderer: GridCellRenderer = ({ column, value, fieldValue }) =>
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
    gantt.variants = demoVariants;
    gantt.gridCellRenderer = demoGridCellRenderer;
    gantt.headerRenderer = demoHeaderRenderer;
  } else {
    gantt.variants = [];
    gantt.gridCellRenderer = undefined;
    gantt.headerRenderer = undefined;
  }
});
renderersToggle.dispatchEvent(new Event('change'));

// #404: timeShading() is the shipped built-in — 'freegantt' alone, no harness plugin behind it, and
// no page CSS (--fg-time-shading-fill covers the paint). Installed from the start; the checkbox
// removes it live through the same `uninstallPlugin` verb every other plugin toggle on this page
// already uses (I8: no remount).
gantt.installPlugin(timeShading([{ covers: daysOfWeek(6, 7), class: 'weekend' }]));

const timeShadingToggle = document.querySelector<HTMLInputElement>('#time-shading-toggle')!;
timeShadingToggle.addEventListener('change', () => {
  if (timeShadingToggle.checked) {
    gantt.installPlugin(timeShading([{ covers: daysOfWeek(6, 7), class: 'weekend' }]));
    writeLog('timeShading: installed');
  } else {
    gantt.uninstallPlugin('freegantt.timeShading');
    writeLog('timeShading: removed');
  }
});

// Which commands does an entry menu show? — Delete, Lock and Unlock, the same three for the
// right-clicked bar, its grid row, or the menu key on a selected row (context-menu.ts and the
// keymap both resolve through `resolveActedOn`, `api/command.ts`). Right-clicking empty timeline
// or an unpopulated grid stretch leaves `ctx.entry` undefined, so none of the three show there —
// background right-clicks stay on "Collapse all"/"Expand all".
//
// Why is one of them the library's own? — `freegantt.deleteSelection` ships with core (#212, ADR
// 0010) and is already bound to the `Delete` key, so the page adds nothing for Delete. It reads
// `ctx.target.entryIds` and removes every one of those records (`src/view/core-commands.ts` states
// the dispatch rule).
//
// What does the page still own? — Lock and Unlock, because a lock is this demo's own policy, not
// a library concept. They read `ctx.target.entryIds`: a lock is a property of the whole record.
const ENTRY_CONTEXT_COMMAND_IDS = ['freegantt.deleteSelection', 'demo.lockEntry', 'demo.unlockEntry'];

function entryContextActions() {
  return definePlugin({
    id: 'harness.entryContextActions',
    view(ctx) {
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
  });
}

// S5.5: the two shipped built-ins, installed straight from `plugins: [...]` — no config
// table, no core edit (`[S5-A1]`'s dogfood gate). Hover a bar for its name and dates; right-click a
// bar or its grid row for an entry-only menu ("Delete"/"Lock"/"Unlock" — `items` below drops the
// background-only defaults for that target), or the timeline canvas for "Collapse all"/"Expand all";
// The menu key opens the same entry menu for a selected row.
// S5.8: `inlineEditing()` joins them — double-click Name, Start or Budget to edit in place.
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
