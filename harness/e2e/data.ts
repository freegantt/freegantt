// e2e fixture for S2.4 (plans/s2-data-core/s2.4-live-binding.md §5): the mutation half of the live
// binding, exercised the way an app author would — add/rename/move/remove buttons calling
// `dataset.entries.add/update/remove`, and a changeset log built from each `ChangeSet`, never a
// re-read. Rename/move/remove target `gantt.selectedEntryIds` (S3.1), not a parallel entry picker.
// The lock checkbox writes the core `locked` Field (#612) directly: an app write always commits, so
// checking it lands like any other change, and undo lifts it.
//
// S2.5 (plans/s2-data-core/s2.5-undo-redo.md §5) adds the undo/redo buttons, `disabled` bound to
// `dataset.canUndo`/`canRedo`, and the log line's origin tag — a reader watches a cascade go away in
// one row on undo, which is the thing the design exists to guarantee.

// The library holds no save format (ADR 0016): this page persists nothing across a reload. An
// application that must keep this Dataset reads `dataset.entries.all` and its plugins' stores, and
// restores by handing that same shape to `new Dataset()`.

import { Dataset, Gantt, MS, attemptMutation, addMs, now, watchAllErrors } from 'freegantt';
import type { DatasetEventMap, Entry, StoredEntry, ComputeContext, GridColumnInput } from 'freegantt';
import { mountTimelineToolbar } from '../timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from '../change-log.js';

declare global {
  interface Window {
    __dataset: Dataset;
  }
}

// #142 shipped the core-Field override, and #256 gave it its first call site. This page declares
// End read-only for the whole Dataset, which is the blunt, document-level lock. It can, because it
// demonstrates mutation and undo/redo rather than drag-resize. `main.ts` shows the other half: the
// same answer narrowed to one row through `capabilities.edit`.
//
// `editable` is a Field declaration, code this page already holds — nothing carries it anywhere.
// All three states sit below, and two doors read them (ADR 0015). End is `'api'`: the Move buttons
// shift it, and no user may drag or type it. `contractId` is `'never'`: it arrives with the entry
// and nothing in this app may change it. Cost declares nothing, so it stays open to both doors.
// ADR 0013: a rolling-up parent's cell is read-only, and #470 retired the seam that let a Field
// reopen it — the split is this page's own policy now, in `splitCostOverLeaves` below, not a Field
// declaration.
const COST_FIELDS = {
  fieldTypes: {
    money: { rollUp: 'sum' as const },
  },
  fields: [
    { key: 'cost' as const, type: 'money', column: { header: 'Cost', align: 'end' as const } },
    // #142 gave the core-Field override its first call site, and #256 its first e2e. `'api'` is what
    // this page always meant by it: the toolbar moves a bar by a day, and the End cell and the End
    // resize handle both stay dead.
    { key: 'end' as const, editable: 'api' as const },
    // The lock. A contract id comes in with the entry and nothing here may rewrite it, so
    // `entries.update()` refuses it as flatly as the grid does.
    { key: 'contractId' as const, editable: false },
    // A `compute` Field has no stored home (ADR 0005): its value is read on every frame, never
    // written back. `ctx.leaves(entry).length` is the bottom-row count under this row — 1 for a
    // leaf. The Leaves column shows why a deeper branch takes more of the cost `splitCostOverLeaves`
    // spreads below: the split gives every leaf one share.
    {
      key: 'leafCount' as const,
      compute: (entry: StoredEntry, ctx: ComputeContext) => ctx.leaves(entry).length,
      column: { header: 'Leaves', align: 'end' as const, width: 80 },
    },
  ],
};

// S4.2: a small tree proves cost rolls up through ancestors in one changeset; undo reverts all rows.
// ADR 0013: "Phase" derives because it has children. It authors no classification, and no dates —
// the Rollup fills its span from Task A and Task B's own subtrees.
//
// #466 step 5: Task B carries two children of its own, so the tree has one more level than "every
// row is a leaf of the phase" would show — `leafCount` reads 1 at Task A, 2 at Task B, 3 at Phase,
// and a cost split by leaf count gives Task B two shares against Task A's one.
const ROLLUP_TREE = [
  { id: 'phase', name: 'Phase' },
  {
    id: 'task-a',
    name: 'Task A',
    parentId: 'phase',
    start: '2026-01-01',
    end: '2026-01-10',
    props: { cost: 100, contractId: 'C-4417' },
  },
  { id: 'task-b', name: 'Task B', parentId: 'phase' },
  {
    id: 'task-b1',
    name: 'Task B1',
    parentId: 'task-b',
    start: '2026-01-15',
    end: '2026-01-18',
    props: { cost: 200, contractId: 'C-4418' },
  },
  {
    id: 'task-b2',
    name: 'Task B2',
    parentId: 'task-b',
    start: '2026-01-18',
    end: '2026-01-20',
    props: { cost: 200, contractId: 'C-4419' },
  },
];

/** This page's own Field values (ADR 0011) — `cost` is what `splitCostOverLeaves` below writes,
 *  and `contractId` is read-only here. `leafCount` is not here: it is a `compute` Field with no
 *  stored home, so it never appears in a props type. */
interface DataPageProps {
  cost: number;
  contractId?: string;
}

const dataset = new Dataset<DataPageProps>({
  entries: ROLLUP_TREE,
  timeZone: 'UTC',
  ...COST_FIELDS,
});
// The library's own default (`name`, `start`, `end`), plus this page's own Fields — `cost` was
// always readable here; `leafCount` is what #466 step 5 adds a column for.
const GRID_COLUMNS: readonly GridColumnInput[] = ['name', 'start', 'end', 'cost', 'leafCount'];

const gantt = new Gantt({ container: '#gantt', dataset, gridColumns: GRID_COLUMNS });
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
}

function bindGantt(): void {
  gantt.on('selectionChange', syncSelectionUi);
}

function bindDataset(): void {
  dataset.on('change', onChange);
  dataset.on('historyChange', refreshHistoryButtons);
}

// Who reports a refusal? The library, on one subscription over both emitters — this page keeps
// no refusal callback of its own.
function bindErrors(): void {
  watchAllErrors([dataset, gantt], (report) => {
    const reason = report.reason === undefined ? '' : ` · ${report.reason}`;
    logLine(`error · ${report.severity} · ${report.by} · ${report.code}${reason}`);
  });
}

// The lock, made visible: checking the box writes the core `locked` Field (#612) on the current
// first entry. The write itself is a dataset write, so it logs like any other change and one undo
// lifts it (#156).
lockCheckbox.addEventListener('change', () => {
  const id = firstEntryId();
  if (id === undefined) return;
  attemptMutation(() => dataset.entries.update(id, { locked: lockCheckbox.checked ? true : undefined }));
});

bindDataset();
bindGantt();
bindErrors();

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
        // A selected row with no bar has no dates to shift (ADR 0012) — skip it, same as a row
        // with no grip to grab under a drag gesture.
        if (entry.start === undefined || entry.end === undefined) continue;
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

// ADR 0013: a rolling-up parent's cell is the Rollup's, never a caller's — #470 retired the one
// seam that let a Field reopen it, so this button now writes the split itself, over public API.
// Every leaf takes an equal share, and the rounding remainder lands on the last one, so the sum
// reads back exactly what the button asked for once the Rollup re-aggregates it. A deeper subtree
// therefore takes more of the total than a shallow sibling, because it holds more leaves.
// `entry.leaves()` names them, self included when `entry` has no children of its own.
function splitCostOverLeaves(entry: Entry<DataPageProps>, total: number): void {
  const leaves = entry.leaves();
  const share = Math.floor(total / leaves.length);
  let distributed = 0;
  leaves.forEach((leaf, index) => {
    const last = index === leaves.length - 1;
    const amount = last ? total - distributed : share;
    distributed += amount;
    dataset.entries.update(leaf.id, { cost: amount });
  });
}

costBtn.addEventListener('click', () => {
  const entries = gantt.selectedEntries;
  if (entries.length === 0) return;
  attemptMutation(() => {
    dataset.transaction(() => {
      for (const selected of entries) splitCostOverLeaves(selected, 500);
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
