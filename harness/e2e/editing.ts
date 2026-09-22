import { Gantt, Dataset, attemptMutation, now, watchAllErrors, isTimeUnit } from 'freegantt';
import type { DatasetEventMap } from 'freegantt';
import { demoEntryInputs, segmentChildrenOf } from '../../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from '../timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from '../change-log.js';
import { lockEntries } from '../plugins/lock-entries.js';

// S5.10 visible acceptance (s5.10-dataset-plugins.md §4): a Dataset plugin the page installs through
// the public API alone. Check the box to lock one entry; drag its neighbour and the locked bar ghosts
// alongside it — the plugin's extender wrote its dates too — then the drop is refused.
// `entry-15` sits beside `entry-14` in the fixture's own window around today, so both bars are on
// screen when the page opens and a reader sees the ghost without panning first. The box starts
// unchecked, so this page's other demos drag against an empty lock store, cascading nothing.
const LOCKABLE_ENTRY_ID = 'entry-15';
const locks = lockEntries();

// #241, ADR 0026: the locked row draws three bars on purpose, and each of them is a child Entry the
// row draws as a segment. That is the hard case for a cascade — three separate spans to translate, not one
// envelope — and locking it is what makes the demo worth watching: all three bars ghost together
// when `entry-14` drags, then the drop is refused.
//
// The three legs are what the lock holds, not their parent. A parent's dates roll up from its
// children (ADR 0013), so they are not the parent's to write; `lock-entries.ts` cascades with
// `moveEntryTo`, which writes the dates an Entry holds itself.
const LOCKED_BAR_IDS = ['entry-15-a', 'entry-15-b', 'entry-15-c'] as const;
const lockDemoEntryInputs = demoEntryInputs.flatMap((entry) =>
  entry.id === LOCKABLE_ENTRY_ID && entry.start !== undefined
    ? [{ ...entry, start: undefined, end: undefined }, ...segmentChildrenOf(LOCKABLE_ENTRY_ID, entry.start)]
    : [entry],
);

const dataset = new Dataset({ entries: lockDemoEntryInputs, timeZone: 'UTC', plugins: [locks] });
const mobilization = now();

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  // What decides which parents draw their children as bars on their own row? This rule (#421). It
  // names the one parent this page splits, so every other Entry keeps drawing its own single bar.
  rowSource: { source: 'entries', childrenAsSegments: (entry) => entry.id === LOCKABLE_ENTRY_ID },
  todayLine: false,
  dateLines: [{ placeAt: mobilization, label: 'Mobilization', className: 'demo-mobilization-line' }],
});
gantt.panToToday();

mountTimelineToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const lockResize = document.querySelector<HTMLInputElement>('#lock-resize')!;
const holdDrop = document.querySelector<HTMLInputElement>('#hold-drop')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const log = document.querySelector<HTMLDivElement>('#log')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const snapUnitSelect = document.querySelector<HTMLSelectElement>('#snap-unit')!;
const lockEntryCheckbox = document.querySelector<HTMLInputElement>('#lock-entry')!;

function renderSelection(): void {
  const ids = gantt.selectedEntryIds;
  selectionReadout.textContent = ids.length === 0 ? 'Selection: (none)' : `Selection: ${ids.join(', ')}`;
}

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
  redoBtn.disabled = !dataset.canRedo;
}

function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
}

function hideToast(): void {
  toast.hidden = true;
  toast.textContent = '';
}

// S5.12, D-S5-42: one subscription over both emitters. Every refusal and every recovered fault the
// Dataset or the Gantt observes arrives here, and the page decides what to keep. Retention is the
// page's policy, so core keeps nothing: there is no `gantt.errors` to read.
//
// A Fault always toasts. A Refusal toasts when its author said why: `report.reason` is the words the
// vetoing handler passed to `refuse` (#210), so the page shows the library's own record instead of
// keeping a second copy of the same sentence. The mobilization veto below is that case.
//
// The lock plugin refuses through `refuse(reason)` too, so this page keeps no refusal callback of
// its own — every refusal, whoever raised it, arrives here.
watchAllErrors([dataset, gantt], (report) => {
  const reason = report.reason === undefined ? '' : ` · ${report.reason}`;
  prependLogLine(log, `error · ${report.severity} · ${report.by} · ${report.code}${reason}`);
  if (report.severity !== 'info' || report.reason !== undefined) showToast(report.message);
});

let releaseHold: ((allow: boolean) => void) | undefined;

gantt.on('selectionChange', renderSelection);
gantt.on('beforeEntryMove', ({ start, refuse }) => {
  if (start < mobilization) {
    releaseHold?.(false);
    releaseHold = undefined;
    // The page says why once, here. Core carries the words to the report, and the one
    // `watchAllErrors` subscription above toasts them (#210).
    return refuse('Too early — the drop is before mobilization.');
  }
  hideToast();
  if (!holdDrop.checked) return undefined;
  showToast('Holding drop — uncheck Hold drop to confirm');
  return new Promise<void | false>((resolve) => {
    releaseHold = (allow) => resolve(allow ? undefined : false);
  });
});

holdDrop.addEventListener('change', () => {
  if (holdDrop.checked || releaseHold === undefined) return;
  releaseHold(true);
  releaseHold = undefined;
  hideToast();
});

// Locking is a real dataset write: it commits, it logs like every other change, and Ctrl+Z lifts
// it (#156) — which is what a plugin store buys over a `Set` on the page (D-S5-24).
lockEntryCheckbox.addEventListener('change', () => {
  attemptMutation(() =>
    LOCKED_BAR_IDS.forEach((id) => (lockEntryCheckbox.checked ? locks.lock(id) : locks.unlock(id))),
  );
});

dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  renderSelection();
  refreshHistoryButtons();
});

// The page runs the library's own commands rather than calling `dataset.undo()` itself, so the
// buttons and a future default chord are one implementation, not two that can drift or double-fire
// (D-S5-26). The `window` listener below is the page's stand-in until a default keymap ships; it
// goes when one does.
function undo(): void {
  attemptMutation(() => gantt.commands.run('freegantt.undo'));
}

function redo(): void {
  attemptMutation(() => gantt.commands.run('freegantt.redo'));
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

lockResize.addEventListener('change', () => {
  gantt.capabilities = lockResize.checked ? { resize: false } : {};
});

// `gantt.snap =`, never `gantt.preset = { ...gantt.preset, snap }`: the old spelling built a one-off
// copy of a shipped preset, and the next `zoomIn()` threw the snap away with it (`api/gantt.ts`).
function applySnapChoice(): void {
  const unit = snapUnitSelect.value;
  if (unit === 'tick' || unit === 'none') {
    gantt.snap = unit;
    return;
  }
  if (!isTimeUnit(unit)) return;
  gantt.snap = { unit, increment: 1 };
}

snapUnitSelect.addEventListener('change', applySnapChoice);
applySnapChoice();

refreshHistoryButtons();
renderSelection();
