import './harness-nav.ts';
import { Gantt, Dataset, attemptMutation, now } from '../src/api/index.js';
import type { ChangeSet, DatasetEventMap } from '../src/api/index.js';
import type { TimeUnit } from '../src/model/index.js';
import { demoEntryInputs } from '../fixtures/demo-dataset.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';

const dataset = new Dataset({ entries: demoEntryInputs, timeZone: 'UTC' });
const mobilization = now();

const gantt = new Gantt({
  container: '#gantt',
  dataset,
  todayLine: false,
  dateLines: [{ placeAt: mobilization, label: 'Mobilization', className: 'fg-mobilization-line' }],
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

function renderSelection(): void {
  const ids = gantt.selection;
  selectionReadout.textContent = ids.length === 0 ? 'Selection: (none)' : `Selection: ${ids.join(', ')}`;
}

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
  redoBtn.disabled = !dataset.canRedo;
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

function showToast(message: string): void {
  toast.textContent = message;
  toast.hidden = false;
}

function hideToast(): void {
  toast.hidden = true;
  toast.textContent = '';
}

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

dataset.on('change', ({ changeSet }: DatasetEventMap['change']) => {
  logChangeSet(changeSet);
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
  const snap = unit === 'tick' || unit === 'none' ? unit : { unit: unit as TimeUnit, increment: 1 };
  gantt.preset = { ...gantt.preset, snap };
}

snapUnitSelect.addEventListener('change', applySnapChoice);
applySnapChoice();

refreshHistoryButtons();
renderSelection();
