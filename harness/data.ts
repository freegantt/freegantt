// e2e fixture for S2.4 (plans/s2-data-core/s2.4-live-binding.md §5): the mutation half of the live
// binding, exercised the way an app author would — add/rename/move/remove buttons calling
// `dataset.entries.add/update/remove`, and a changeset log built from each `ChangeSet`, never a
// re-read (D-S2-17). Rename/move/remove target `gantt.selectedEntryIds` (S3.1), not a parallel entry picker.
// The lock checkbox is D-S2-25's `beforeChange` veto, made visible: the bar does
// not move and `attemptMutation` returns `false` instead of throwing. S5.10 moved the veto itself
// into a Dataset plugin (`plugins/lock-entries.ts`), so the flag lives in that plugin's own store.
//
// S2.5 (plans/s2-data-core/s2.5-undo-redo.md §5) adds the undo/redo buttons, `disabled` bound to
// `dataset.canUndo`/`canRedo`, and the log line's origin tag — a reader watches a cascade go away in
// one row on undo, which is the thing the design exists to guarantee.

// S2.6 (plans/s2-data-core/s2.6-serialization.md §3) adds export/import over toJSON/fromJSON.
// Import replaces the dataset and rebuilds the Gantt, which is the proof that a Gantt survives a
// rebind (or the finding against destroy() if it does not).

import './harness-nav.ts';
import { Dataset, Gantt, MS, attemptMutation, addMs, now } from '../src/api/index.js';
import type { DatasetDocument, DatasetEventMap } from '../src/api/index.js';
import { mountTimelineToolbar } from './timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { lockEntries } from './plugins/lock-entries.js';

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

// S5.10, D-S5-24: the lock checkbox writes this plugin's own store instead of the page keeping a
// flag of its own, and the plugin's `beforeChange` is what refuses the write. `Dataset.plugins` is
// read-only, so every Dataset this page builds — including the imported one below — installs a
// fresh one at construction.
let locks = lockEntries();

let dataset = new Dataset<{ cost: number }, { cost: number }>({
  entries: ROLLUP_TREE,
  timeZone: 'UTC',
  ...COST_FIELDS,
  plugins: [locks],
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
  moveBackBtn.disabled = none;
  moveFwdBtn.disabled = none;
  removeBtn.disabled = none;
  costBtn.disabled = none;
}

function renderSelectionReadout(): void {
  const ids = gantt.selectedEntryIds;
  selectionReadout.textContent = ids.length === 0 ? 'Selection: (none)' : `Selection: ${ids.join(', ')}`;
}

function syncSelectionUi(): void {
  refreshNameInput();
  refreshMutationButtons();
  renderSelectionReadout();
}

function logLine(text: string): void {
  prependLogLine(log, text);
}

function refreshHistoryButtons(): void {
  undoBtn.disabled = !dataset.canUndo;
  redoBtn.disabled = !dataset.canRedo;
}

function onChange({ changeSet }: DatasetEventMap['change']): void {
  prependChangeSet(log, changeSet);
  syncSelectionUi();
  refreshHistoryButtons();
}

function bindGantt(): void {
  gantt.on('selectionChange', syncSelectionUi);
}

function bindDataset(): void {
  dataset.on('change', onChange);
  locks.onRefusal((id) => logLine(`entries · ${id} · refused (locked)`));
}

// D-S2-25, made visible: checking the box locks the current first entry, and the plugin refuses
// every later changeset that touches it. The lock itself is a dataset write, so it logs like any
// other change and one undo lifts it (#156).
lockCheckbox.addEventListener('change', () => {
  const id = firstEntryId();
  if (id === undefined) return;
  attemptMutation(() => (lockCheckbox.checked ? locks.lock(id) : locks.unlock(id)));
});

bindDataset();
bindGantt();

addBtn.addEventListener('click', () => {
  const id = `new-${nextNewId++}`;
  const start = now();
  dataset.entries.add({ id, name: 'New entry', start, end: addMs(start, MS.DAY) });
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

function move(deltaMs: number): void {
  const entries = gantt.selectedEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const entry of entries) {
        dataset.entries.update(entry.id, {
          start: addMs(entry.start, deltaMs),
          end: addMs(entry.end, deltaMs),
        });
      }
    });
  });
}

moveBackBtn.addEventListener('click', () => move(-MS.DAY));
moveFwdBtn.addEventListener('click', () => move(MS.DAY));

costBtn.addEventListener('click', () => {
  const entries = gantt.selectedEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const selected of entries) dataset.entries.update(selected.id, { cost: 500 });
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

exportBtn.addEventListener('click', () => {
  documentJson.value = JSON.stringify(dataset.toJSON(), null, 2);
});

importBtn.addEventListener('click', () => {
  try {
    const doc = JSON.parse(documentJson.value) as DatasetDocument<{ cost: number }>;
    locks = lockEntries();
    dataset = Dataset.fromJSON<{ cost: number }, { cost: number }>(doc, { ...COST_FIELDS, plugins: [locks] });
    lockCheckbox.checked = false;
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
