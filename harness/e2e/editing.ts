import { Gantt, Dataset, addMs, attemptMutation, now, watchAllErrors, isTimeUnit, MS } from 'freegantt';
import type { DatasetEventMap } from 'freegantt';
import { demoEntryInputs } from '../../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from '../timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from '../change-log.js';
import { freezePastWork } from '../plugins/freeze-past-work.js';
import { zoomPresetsWithSixHour } from '../six-hour-preset.js';

// S5.10 visible acceptance (s5.10-dataset-plugins.md §4): a Dataset plugin the page installs through
// the public API alone. Check "Freeze past work" and every bar that already ended shows no resize
// handle and drags nowhere; a bar dragged into a parent whose own work is past refuses at the drop.
const pastWork = freezePastWork();

// `entry-1`'s own dates are dropped, so its span rolls up from its one child `entry-4` instead (ADR
// 0013), well before today — its grid row is what the drop-refusal drag targets, never its bar, so
// it sits further back with no need to stay on screen. `entry-2` ends only a day before today, close
// enough that `panToToday`'s own landing margin still keeps its bar on screen, so "Freeze past work"
// closes its `start`/`end` where a reader can watch it happen. `entry-3` is dated a few days after
// today, so it stays open while frozen — the bar a reader drags onto `entry-1` to watch the place
// rule refuse it.
const PAST_PARENT_ID = 'entry-1';
const PAST_CHILD_ID = 'entry-4';
const PAST_BAR_ID = 'entry-2';
const OPEN_ENTRY_ID = 'entry-3';
const today = now();
const daysFromToday = (count: number) => addMs(today, count * MS.DAY);
const freezeDemoEntryInputs = demoEntryInputs.map((entry) => {
  if (entry.id === PAST_PARENT_ID) return { ...entry, start: undefined, end: undefined };
  if (entry.id === PAST_CHILD_ID) {
    return { ...entry, parentId: PAST_PARENT_ID, start: daysFromToday(-10), end: daysFromToday(-8) };
  }
  if (entry.id === PAST_BAR_ID) return { ...entry, start: daysFromToday(-2), end: daysFromToday(-1) };
  if (entry.id === OPEN_ENTRY_ID) return { ...entry, start: daysFromToday(3), end: daysFromToday(5) };
  return entry;
});

const dataset = new Dataset({ entries: freezeDemoEntryInputs, timeZone: 'UTC', plugins: [pastWork] });
const mobilization = now();

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  todayLine: false,
  dateLines: [{ placeAt: mobilization, label: 'Mobilization', className: 'demo-mobilization-line' }],
});
gantt.panToToday();

// #489: a custom `tickIncrement > 1` preset — proof the anchor fix holds. Its gridlines sit at
// 00:00/06:00/12:00/18:00 in the dataset's zone and never drift off that grid during a pan.
gantt.zoomPresets = zoomPresetsWithSixHour(gantt);

mountTimelineToolbar({ gantt, container: document.querySelector<HTMLDivElement>('#toolbar')! });

const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const lockResize = document.querySelector<HTMLInputElement>('#lock-resize')!;
const holdDrop = document.querySelector<HTMLInputElement>('#hold-drop')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;
const log = document.querySelector<HTMLDivElement>('#log')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const snapUnitSelect = document.querySelector<HTMLSelectElement>('#snap-unit')!;
const freezePastWorkCheckbox = document.querySelector<HTMLInputElement>('#freeze-past-work')!;

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

// S5.12: one subscription over both emitters. Every refusal and every recovered fault the
// Dataset or the Gantt observes arrives here, and the page decides what to keep. Retention is the
// page's policy, so core keeps nothing: there is no `gantt.errors` to read.
//
// A Fault always toasts. A Refusal toasts when its author said why: `report.reason` is the words the
// vetoing handler passed to `refuse` (#210), so the page shows the library's own record instead of
// keeping a second copy of the same sentence. The mobilization veto below is that case.
//
// The past-work freeze reports nothing here: it closes a frozen bar's `start`/`end` and a past
// parent's own border, so no gesture ever arms and no drop ever reaches a refusal to report.
watchAllErrors([dataset, gantt], (report) => {
  const reason = report.reason === undefined ? '' : ` · ${report.reason}`;
  prependLogLine(log, `error · ${report.severity} · ${report.by} · ${report.code}${reason}`);
  if (report.severity !== 'info' || report.reason !== undefined) showToast(report.message);
});

let releaseHold: ((allow: boolean) => void) | undefined;

gantt.on('selectionChange', renderSelection);
gantt.on('beforeEntryMove', (move) => {
  if (move.shiftsTime && move.start < mobilization) {
    releaseHold?.(false);
    releaseHold = undefined;
    // The page says why once, here. Core carries the words to the report, and the one
    // `watchAllErrors` subscription above toasts them (#210).
    return move.refuse('Too early — the drop is before mobilization.');
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

// The freeze is a view policy, not a dataset write (#612): flipping it raises no `change` and leaves
// no undo step, only a fresh resolution `rulesChanged()` announces to the mounted Gantt.
freezePastWorkCheckbox.addEventListener('change', () => {
  if (freezePastWorkCheckbox.checked) pastWork.freeze();
  else pastWork.unfreeze();
});

dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  prependChangeSet(log, changeSet);
  renderSelection();
});
dataset.on('historyChange', refreshHistoryButtons);

// The page runs the library's own commands rather than calling `dataset.undo()` itself, so the
// buttons and a future default chord are one implementation, not two that can drift or double-fire
// The `window` listener below is the page's stand-in until a default keymap ships; it
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
//
// "Every 6 hours" is a `tickIncrement > 1` custom step (#489): anchored on the day it falls in, so
// it always lands on 00:00/06:00/12:00/18:00 and never drifts off the hour preset's own gridlines
// while panning.
function applySnapChoice(): void {
  const unit = snapUnitSelect.value;
  if (unit === 'tick' || unit === 'none') {
    gantt.snap = unit;
    return;
  }
  if (unit === 'sixHour') {
    gantt.snap = { unit: 'hour', increment: 6 };
    return;
  }
  if (!isTimeUnit(unit)) return;
  gantt.snap = { unit, increment: 1 };
}

snapUnitSelect.addEventListener('change', applySnapChoice);
applySnapChoice();

refreshHistoryButtons();
renderSelection();
