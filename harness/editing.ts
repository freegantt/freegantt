import './harness-nav.ts';
import { Gantt, Dataset, attemptMutation, now, watchAllErrors, isTimeUnit } from '../src/api/index.js';
import type { DatasetEventMap } from '../src/api/index.js';
import { demoEntryInputs, separateSegments } from '../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { lockEntries } from './plugins/lock-entries.js';

// S5.10 visible acceptance (s5.10-dataset-plugins.md §4): a Dataset plugin the page installs through
// the public API alone. Check the box to lock one entry; drag its neighbour and the locked bar ghosts
// alongside it — the plugin's extender wrote its dates too — then the drop is refused.
// `entry-15` sits beside `entry-14` in the fixture's own window around today, so both bars are on
// screen when the page opens and a reader sees the ghost without panning first. The box starts
// unchecked, so this page's other demos drag against an empty lock store, cascading nothing.
const LOCKABLE_ENTRY_ID = 'entry-15';
const locks = lockEntries();

// #241: the locked Entry draws three Segments on purpose. A cascade that wrote `{ start, end }`
// would refuse here — an envelope names no Segment to move, so core has nothing to translate
// (`SegmentsOutOfSyncError`, `'ambiguous'`, D-S5-44) — and the demo would teach the shape the
// library rejects. So the page locks the hard case, and `lock-entries.ts` answers it with
// `moveEntryTo`. All three bars ghost together when `entry-14` drags.
const lockDemoEntryInputs = demoEntryInputs.map((entry) =>
  entry.id === LOCKABLE_ENTRY_ID && entry.start !== undefined
    ? { ...entry, segments: separateSegments(entry.start) }
    : entry,
);

const dataset = new Dataset({ entries: lockDemoEntryInputs, timeZone: 'UTC', plugins: [locks] });
const mobilization = now();

const gantt = new Gantt({
  container: '#gantt',
  dataset,
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
// This page already toasts the reason it knows for the two refusals it causes on purpose — the
// mobilization veto and the lock. So the toast here is for a Fault, which is the one thing nothing
// else on the page explains. `severity !== 'info'` is the same split telemetry routes on.
watchAllErrors([dataset, gantt], (report) => {
  prependLogLine(log, `error · ${report.severity} · ${report.by} · ${report.code}`);
  if (report.severity !== 'info') showToast(report.message);
});

let releaseHold: ((allow: boolean) => void) | undefined;

gantt.on('selectionChange', renderSelection);
gantt.on('beforeEntryMove', ({ start }) => {
  if (start < mobilization) {
    showToast('Too early — drop is before mobilization');
    releaseHold?.(false);
    releaseHold = undefined;
    return false;
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
    lockEntryCheckbox.checked ? locks.lock(LOCKABLE_ENTRY_ID) : locks.unlock(LOCKABLE_ENTRY_ID),
  );
});

locks.onRefusal((id) => {
  showToast(`Refused — ${id} is locked`);
  prependLogLine(log, `entries · ${id} · refused (locked)`);
});

dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  renderSelection();
  refreshHistoryButtons();
});

function undo(): void {
  attemptMutation(() => dataset.undo());
}

function redo(): void {
  attemptMutation(() => dataset.redo());
}

undoBtn.addEventListener('click', undo);
redoBtn.addEventListener('click', redo);

window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  e.preventDefault();
  if (e.shiftKey) redo();
  else undo();
});

lockResize.addEventListener('change', () => {
  gantt.interactions = lockResize.checked ? { resize: false } : {};
});

function applySnapChoice(): void {
  const unit = snapUnitSelect.value;
  if (unit === 'tick' || unit === 'none') {
    gantt.preset = { ...gantt.preset, snap: unit };
    return;
  }
  if (!isTimeUnit(unit)) return;
  gantt.preset = { ...gantt.preset, snap: { unit, increment: 1 } };
}

snapUnitSelect.addEventListener('change', applySnapChoice);
applySnapChoice();

refreshHistoryButtons();
renderSelection();
