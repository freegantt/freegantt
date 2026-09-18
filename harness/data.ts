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

// The library holds no save format (ADR 0016): this page persists nothing across a reload. An
// application that must keep this Dataset reads `dataset.entries.all` and its plugins' stores, and
// restores by handing that same shape to `new Dataset()`.

import './harness-nav.ts';
import { Dataset, Gantt, MS, attemptMutation, addMs, now, watchAllErrors } from 'freegantt';
import type { DatasetEventMap, StoredEntry, EntryEdit, EntryEdits, EntryId, RollUpContext } from 'freegantt';
import { mountTimelineToolbar } from './timeline-toolbar.js';
import { prependChangeSet, prependLogLine } from './change-log.js';
import { lockEntries } from './plugins/lock-entries.js';
import { mountPageBrief } from './docs/page-brief.js';

// D-S5-29: what this page demonstrates, the config that does it, and the spec section that governs it.
mountPageBrief(document.querySelector<HTMLDivElement>('#page-brief')!, 'mutation');

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
// ADR 0013: a rolling-up parent's cell is read-only unless the page says what a write to it means.
// `money` rolls up with `sum`, so the write that reverses a sum is a split — read `distribute` as the
// Aggregator backwards. This page splits evenly and puts the rounding remainder on the last child,
// so the Rollup reads back exactly the number the button asked for. A page that wanted a split by
// duration, or by each child's current share, would write that here instead; the library ships no
// guessed default, because there is none to defend.
const COST_FIELDS = {
  fieldTypes: {
    money: {
      rollUp: 'sum' as const,
      distribute(
        total: number | undefined,
        _parent: StoredEntry,
        ctx: RollUpContext,
      ): EntryEdits | undefined {
        const children = ctx.children();
        if (total === undefined || children.length === 0) return undefined;
        const share = Math.floor(total / children.length);
        const edits = new Map<EntryId, EntryEdit>();
        children.forEach((child, index) => {
          const last = index === children.length - 1;
          edits.set(child.id, { cost: last ? total - share * (children.length - 1) : share });
        });
        return edits;
      },
    },
  },
  fields: [
    { key: 'cost' as const, type: 'money' },
    // #142 gave the core-Field override its first call site, and #256 its first e2e. `'api'` is what
    // this page always meant by it: the toolbar moves a bar by a day, and the End cell and the End
    // resize handle both stay dead.
    { key: 'end' as const, editable: 'api' as const },
    // The lock. A contract id comes in with the entry and nothing here may rewrite it, so
    // `entries.update()` refuses it as flatly as the grid does.
    { key: 'contractId' as const, editable: false },
  ],
};

// S4.2: a small tree proves cost rolls up through ancestors in one changeset; undo reverts all rows.
// ADR 0013: "Phase" derives because it has children. It authors no classification, and no dates —
// the Rollup fills its span from Task A and Task B.
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
  {
    id: 'task-b',
    name: 'Task B',
    parentId: 'phase',
    start: '2026-01-15',
    end: '2026-01-20',
    props: { cost: 200, contractId: 'C-4418' },
  },
];

// S5.10, D-S5-24: the lock checkbox writes this plugin's own store instead of the page keeping a
// flag of its own, and the plugin's `beforeChange` is what refuses the write. `Dataset.plugins` is
// read-only, so every Dataset this page builds — including the imported one below — installs a
// fresh one at construction.
const locks = lockEntries();

const dataset = new Dataset<{ cost: number; contractId?: string }>({
  entries: ROLLUP_TREE,
  timeZone: 'UTC',
  ...COST_FIELDS,
  plugins: [locks],
});
const gantt = new Gantt({ container: '#gantt', dataset });
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
  refreshHistoryButtons();
}

function bindGantt(): void {
  gantt.on('selectionChange', syncSelectionUi);
}

function bindDataset(): void {
  dataset.on('change', onChange);
}

// Who reports a refusal? The library, on one subscription over both emitters (D-S5-42) — the lock
// plugin's `refuse(reason)` words arrive here, so this page keeps no refusal callback of its own.
function bindErrors(): void {
  watchAllErrors([dataset, gantt], (report) => {
    const reason = report.reason === undefined ? '' : ` · ${report.reason}`;
    logLine(`error · ${report.severity} · ${report.by} · ${report.code}${reason}`);
  });
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

refreshHistoryButtons();
syncSelectionUi();
