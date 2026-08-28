// data/ — undo/redo (plans/s2-data-core/s2.5-undo-redo.md). A subscriber to `change`, not a step in the
// commit path: `data/transaction.ts` imports nothing from this file, and `history-is-removable`
// (`.dependency-cruiser.cjs`, D-S2-23) allows exactly one importer, `data/dataset-state.ts`, which
// constructs it. Delete this file and its one construction line and the commit path is unchanged, byte
// for byte. Everything here goes through `on('change')`/`transaction()` and `commitChangeSet` — the same
// surface a consumer would have to write this file themselves (D-S2-24).

import type {
  ChangeSet,
  ChangeSetId,
  DatasetEventMap,
  EntityAdded,
  EntityRemoved,
  FieldUpdated,
} from '../model/index.js';
import { commitChangeSet } from './transaction.js';
import type { TransactionData } from './transaction.js';

export interface HistoryOptions {
  /** How many undoable transactions the stack keeps. Oldest drops first once full (D-S2-13). */
  capacity?: number;
}

const DEFAULT_CAPACITY = 100;

function invert(id: ChangeSetId, changeSet: ChangeSet): ChangeSet {
  const added: EntityAdded[] = changeSet.removed.map(({ store, entity }) => ({ store, entity }));
  const removed: EntityRemoved[] = changeSet.added.map(({ store, entity }) => ({ store, entity }));
  const updated: FieldUpdated[] = changeSet.updated.map((row) => ({ ...row, from: row.to, to: row.from }));
  return { id, origin: 'undo', added, removed, updated };
}

/** Undo and redo over a Dataset's committed changesets (§2 of the step file). A stack plus a cursor:
 *  everything below the cursor is undoable, everything at or above it (up to the stack's own top) is
 *  redoable. Recording, capacity, and the cursor all live here — the commit path knows none of it. */
export class History {
  readonly #data: TransactionData;
  readonly #capacity: number;
  #stack: ChangeSet[] = [];
  #cursor = 0;

  constructor(data: TransactionData, options: HistoryOptions = {}) {
    this.#data = data;
    this.#capacity = options.capacity ?? DEFAULT_CAPACITY;
    data.bus.on('change', this.#onChange);
  }

  /** Stops recording. `data/dataset-state.ts` never calls this today — a `Dataset` has no `dispose()`
   *  yet — but it exists so a future one, or a test, can unwind the subscription cleanly. */
  dispose(): void {
    this.#data.bus.off('change', this.#onChange);
  }

  get canUndo(): boolean {
    return this.#cursor > 0;
  }

  get canRedo(): boolean {
    return this.#cursor < this.#stack.length;
  }

  /** Applies the changeset at the cursor inverted (`to`→`from`, `added`↔`removed`) with
   *  `origin: 'undo'`. A no-op when `canUndo` is `false`. Neither re-runs the extension hook nor the
   *  span rollup — `commitChangeSet` writes exactly the inverted rows and nothing else (§2.2). A
   *  refused undo (a `beforeChange` handler returning `false`) throws `MutationCancelledError` and
   *  leaves the stack exactly where it was — the cursor only moves once the commit below returns. */
  undo(): void {
    if (!this.canUndo) return;
    const changeSet = this.#stack[this.#cursor - 1]!;
    commitChangeSet(this.#data, invert(this.#data.nextChangeSetId(), changeSet));
    this.#cursor -= 1;
  }

  /** Re-applies the changeset just above the cursor exactly as recorded, with `origin: 'redo'`. A
   *  no-op when `canRedo` is `false`. */
  redo(): void {
    if (!this.canRedo) return;
    const changeSet = this.#stack[this.#cursor]!;
    commitChangeSet(this.#data, { ...changeSet, id: this.#data.nextChangeSetId(), origin: 'redo' });
    this.#cursor += 1;
  }

  /** The whole coupling to the rest of `data/`. The origin filter names what it records, not what it
   *  ignores — `'undo'` and `'redo'` are skipped today, and a future `'load'` origin (D-S2-11) needs no
   *  edit here either. */
  #onChange = ({ changeSet }: DatasetEventMap['change']): void => {
    if (changeSet.origin === 'user') this.#record(changeSet);
  };

  /** A new user edit while the cursor sits below the top clears everything above it (§2.2) — that is
   *  what truncating to the cursor before pushing does. At capacity the oldest entry drops; the cursor
   *  always ends at the new top, so `canUndo` reads true for every entry the stack still holds. */
  #record(changeSet: ChangeSet): void {
    this.#stack.length = this.#cursor;
    this.#stack.push(changeSet);
    if (this.#stack.length > this.#capacity) this.#stack.shift();
    this.#cursor = this.#stack.length;
  }
}
