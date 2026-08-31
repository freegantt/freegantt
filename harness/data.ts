// e2e fixture for S2.4 (plans/s2-data-core/s2.4-live-binding.md §5): the mutation half of the live
// binding, exercised the way an app author would — add/rename/move/remove buttons calling
// `dataset.entries.add/update/remove`, and a changeset log built from each `ChangeSet`, never a
// re-read (D-S2-17). Rename/move/remove target `gantt.selection` (S3.1), not a parallel entry picker.
// The lock checkbox is D-S2-25's `beforeChange` veto, made visible: the bar does
// not move and the calling button's own `catch` reads `MutationCancelledError`.
//
// S2.5 (plans/s2-data-core/s2.5-undo-redo.md §5) adds the undo/redo buttons, `disabled` bound to
// `dataset.canUndo`/`canRedo`, and the log line's origin tag — a reader watches a cascade go away in
// one row on undo, which is the thing the design exists to guarantee.

// S2.6 (plans/s2-data-core/s2.6-serialization.md §3) adds export/import over toJSON/fromJSON.
// Import replaces the dataset and rebuilds the Gantt, which is the proof that a Gantt survives a
// rebind (or the finding against destroy() if it does not).

import './harness-nav.ts';
import { Dataset, Gantt, MS, MutationCancelledError, addMs, now } from '../src/api/index.js';
import type { ChangeSet, DatasetDocument, DatasetEventMap } from '../src/api/index.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';

declare global {
  interface Window {
    __dataset: Dataset<{ cost: number }, { cost: number }>;
  }
}

const COST_FIELDS = {
  fieldTypes: { money: { rollUp: 'sum' as const } },
  fields: [{ key: 'cost' as const, type: 'money' }],
};

// S4.2: a small tree proves cost rolls up through ancestors in one changeset; undo reverts all rows.
const ROLLUP_TREE = [
  { id: 'phase', name: 'Phase', kind: 'group' as const },
  {
    id: 'task-a',
    name: 'Task A',
    parentId: 'phase',
    start: '2026-01-01',
    end: '2026-01-10',
    meta: { cost: 100 },
  },
  {
    id: 'task-b',
    name: 'Task B',
    parentId: 'phase',
    start: '2026-01-15',
    end: '2026-01-20',
    meta: { cost: 200 },
  },
];

let dataset = new Dataset<{ cost: number }, { cost: number }>({
  entries: ROLLUP_TREE,
  timeZone: 'UTC',
  ...COST_FIELDS,
});
let gantt = new Gantt({ container: '#gantt', dataset });
window.__dataset = dataset;

const toolbar = document.querySelector<HTMLDivElement>('#toolbar')!;
mountTimelineToolbar({ gantt, container: toolbar });

const nameInput = document.querySelector<HTMLInputElement>('#rename-input')!;
const addBtn = document.querySelector<HTMLButtonElement>('#add-entry')!;
const renameBtn = document.querySelector<HTMLButtonElement>('#rename-btn')!;
const moveBackBtn = document.querySelector<HTMLButtonElement>('#move-back-btn')!;
const moveFwdBtn = document.querySelector<HTMLButtonElement>('#move-fwd-btn')!;
const removeBtn = document.querySelector<HTMLButtonElement>('#remove-btn')!;
const costBtn = document.querySelector<HTMLButtonElement>('#cost-btn')!;
const undoBtn = document.querySelector<HTMLButtonElement>('#undo-btn')!;
const redoBtn = document.querySelector<HTMLButtonElement>('#redo-btn')!;
const exportBtn = document.querySelector<HTMLButtonElement>('#export-btn')!;
const importBtn = document.querySelector<HTMLButtonElement>('#import-btn')!;
const documentJson = document.querySelector<HTMLTextAreaElement>('#document-json')!;
const lockCheckbox = document.querySelector<HTMLInputElement>('#lock-checkbox')!;
const log = document.querySelector<HTMLDivElement>('#log')!;
const selectionReadout = document.querySelector<HTMLParagraphElement>('#selection-readout')!;

let nextNewId = 1;

/** The store's own current first entry — dynamic, so a remove/reorder keeps "the first entry"
 *  honest rather than pinning an id from before the page's mutations started. */
function firstEntryId(): string | undefined {
  return dataset.entries.all[0]?.id;
}

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
  moveBackBtn.disabled = none;
  moveFwdBtn.disabled = none;
  removeBtn.disabled = none;
  costBtn.disabled = none;
}

function renderSelectionReadout(): void {
  const ids = gantt.selection;
  selectionReadout.textContent = ids.length === 0 ? 'Selection: (none)' : `Selection: ${ids.join(', ')}`;
}

function syncSelectionUi(): void {
  refreshNameInput();
  refreshMutationButtons();
  renderSelectionReadout();
}

function logLine(text: string): void {
  const row = document.createElement('div');
  row.textContent = text;
  log.prepend(row);
}

/** Built from the changeset alone (D-S2-17) — `from` is not a value a re-read of the dataset could
 *  ever produce. Every row is tagged with the changeset's own origin, so an undo's row reads
 *  `[undo]` right next to the field it reverted (S2.5 §5). */
function logChangeSet(changeSet: ChangeSet): void {
  const tag = `[${changeSet.origin}]`;
  for (const { store, entity } of changeSet.added) logLine(`${tag} ${store} · ${entity.id} · added`);
  for (const { store, entity } of changeSet.removed) logLine(`${tag} ${store} · ${entity.id} · removed`);
  for (const { store, id, field, from, to } of changeSet.updated) {
    logLine(`${tag} ${store} · ${id} · ${field} · ${String(from)} → ${String(to)}`);
  }
}

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
  redoBtn.disabled = !dataset.canRedo;
}

function onChange({ changeSet }: DatasetEventMap['change']): void {
  logChangeSet(changeSet);
  syncSelectionUi();
  refreshHistoryButtons();
}

// D-S2-25: while the checkbox is on, refuse any changeset touching the current first entry. Four
// lines, and it makes the veto visible on the same page as everything else.
function onBeforeChange({ changeSet }: DatasetEventMap['beforeChange']): void | false {
  if (!lockCheckbox.checked) return undefined;
  const lockedId = firstEntryId();
  const touchesLocked =
    changeSet.updated.some((u) => u.id === lockedId) ||
    changeSet.removed.some((r) => r.entity.id === lockedId);
  if (!touchesLocked) return undefined;
  logLine(`entries · ${lockedId} · refused (locked)`);
  return false;
}

function bindGantt(): void {
  gantt.on('selectionChange', syncSelectionUi);
}

function bindDataset(): void {
  dataset.on('change', onChange);
  dataset.on('beforeChange', onBeforeChange);
}

bindDataset();
bindGantt();

addBtn.addEventListener('click', () => {
  const id = `new-${nextNewId++}`;
  const start = now();
  dataset.entries.add({ id, name: 'New entry', start, end: addMs(start, MS.DAY) });
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

function move(deltaMs: number): void {
  const entries = gantt.selectionEntries;
  if (entries.length === 0) return;
  try {
    dataset.transaction(() => {
      for (const entry of entries) {
        dataset.entries.update(entry.id, {
          start: addMs(entry.start, deltaMs),
          end: addMs(entry.end, deltaMs),
        });
      }
    });
  } catch (error) {
    if (!(error instanceof MutationCancelledError)) throw error;
  }
}

moveBackBtn.addEventListener('click', () => move(-MS.DAY));
moveFwdBtn.addEventListener('click', () => move(MS.DAY));

costBtn.addEventListener('click', () => {
  const entries = gantt.selectionEntries;
  if (entries.length === 0) return;
  try {
    dataset.transaction(() => {
      for (const selected of entries) dataset.entries.update(selected.id, { cost: 500 });
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

exportBtn.addEventListener('click', () => {
  documentJson.value = JSON.stringify(dataset.toJSON(), null, 2);
});

importBtn.addEventListener('click', () => {
  try {
    const doc = JSON.parse(documentJson.value) as DatasetDocument<{ cost: number }>;
    dataset = Dataset.fromJSON<{ cost: number }, { cost: number }>(doc);
    window.__dataset = dataset;
    gantt.destroy();
    gantt = new Gantt({ container: '#gantt', dataset });
    bindDataset();
    bindGantt();
    toolbar.innerHTML = '';
    mountTimelineToolbar({ gantt, container: toolbar });
    syncSelectionUi();
    refreshHistoryButtons();
    logLine('[load] imported document');
  } catch (error) {
    logLine(`import failed: ${error instanceof Error ? error.message : String(error)}`);
  }
});

refreshHistoryButtons();
syncSelectionUi();
