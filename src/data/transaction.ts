// data/ — the transaction runner: the only place that mints TxToken, and the sole path from a set of
// store mutations to one committed ChangeSet (D-S2-24). Imports no history and no view — both are
// subscribers to the `change` event this file emits, never callers of it.

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  DatasetEventMap,
  Entry,
  EntryId,
  EntryKind,
  FieldContext,
  FieldUpdated,
} from '../model/index.js';
import { MutationCancelledError, MutationDuringNotificationError } from '../model/index.js';
import { diffEdit, foldChangeSet } from './change-set.js';
import type { EditExtender, EntryEdits } from './edit-extension.js';
import type { EventBus } from './event-bus.js';
import { mergeEntryEdits } from './fields/field-access.js';
import { rollUpFields } from './rollup.js';
import type { FieldRegistry } from './fields/field-registry.js';

/** Only `runTransaction` produces one. Store mutators require it, so a mutation outside a transaction
 *  does not typecheck — the belt to `docs/02` §3.6's `no-store-mutation-outside-transaction` braces.
 *  Deliberately carries no data: its only job is to gate at the type level who may call a mutator. */
export type TxToken = { readonly __brand: 'TxToken' };

/** What `runTransaction` itself reads off a `TxToken`-gated `EntryStore` — deliberately not the concrete
 *  `EntryStore` type (same cycle-avoidance reason as `TransactionData` below), and deliberately narrower
 *  than `EntryStore`'s own surface: `stageAdd`/`stageUpdate`/`stageRemove` exist for the transaction
 *  *body* (via its own `TxToken`) to call directly on `EntryStore`, never for `runTransaction` to call
 *  through this seam, so they are not named here. */
export interface TransactionalEntryStore {
  committedById(): ReadonlyMap<EntryId, Entry>;
  beginTransaction(token: TxToken): void;
  pendingAdded(): readonly { store: 'entries'; entity: Entry }[];
  pendingRemoved(): readonly { store: 'entries'; entity: Entry }[];
  pendingEdits(): EntryEdits;
  endTransaction(token: TxToken, changeSet: ChangeSet | undefined): void;
}

/** What `runTransaction` needs from a Dataset's live state. Structural, not `DatasetState` itself, for
 *  the same reason as `TransactionalEntryStore` above — `dataset-state.ts` imports this file, so this
 *  file must not import `dataset-state.ts` back. */
export interface TransactionData {
  readonly entries: TransactionalEntryStore;
  readonly editExtender: EditExtender;
  /** 0 = no transaction open. Only `runTransaction` reads or writes this (D-S2-8's nesting rule). */
  openTransactions: number;
  /** Set while `beforeChange`/`change` handlers are fanning out; a transaction started while this is
   *  `true` throws before running its body (D-S2-9, D-S2-25). Only `runTransaction` reads or writes
   *  this. */
  notifying: boolean;
  /** Mints from a per-instance counter (D-S2-18) — identity two writers never need to agree on, not a
   *  sync token. */
  nextChangeSetId(): ChangeSetId;
  readonly bus: EventBus<DatasetEventMap>;
  /** Kinds whose rolling-up Fields the Rollup derives from their children, every commit (`01` §2.5,
   *  D-S4-7). This file is the only one that turns it into a rollup call — `rollup-is-removable`
   *  (`.dependency-cruiser.cjs`) says so, which is what makes deleting `rollup.ts` a provable
   *  degradation to `rollUpKinds: 'none'`'s own behavior rather than a break. */
  readonly rollUpKinds: ReadonlySet<EntryKind>;
  readonly fields: FieldRegistry;
  readonly fieldContext: FieldContext;
  bumpDatasetRevision(): void;
}

/**
 * Runs the Rollup once against `data`'s freshly built entries, with no proposed edits — what a
 * fresh `Dataset(...)` and `Dataset.fromJSON(...)` share (`01` §2.6, D-S2-22): a `{ kind: 'group' }`
 * given children only through the initial array gets real rolled-up values before anyone reads it,
 * not just after the first later transaction touches one of those children.
 *
 * Writes any correction straight into the store and returns early if there is none. There is no
 * `beforeChange`/`change` here and no history record (S2.5) — construction emits nothing (`01` §2.6),
 * so this bypasses `runTransaction` entirely rather than opening a transaction only to suppress its
 * notifications. `origin: 'user'` is inert: the changeset this builds is never emitted or returned,
 * so nothing reads it — a `'load'` origin arrives with its own producer later (D-S2-11).
 *
 * The second and last caller of `rollUpFields` in `src/**`, alongside `runTransaction` below —
 * both in this file, which keeps `rollup-is-removable` (D-S4-7) honest.
 */
export function applyConstructionRollUp(data: TransactionData): void {
  const byId = data.entries.committedById();
  const updated = rollUpFields(byId, undefined, data.fields, data.rollUpKinds, data.fieldContext);
  if (updated.length === 0) return;

  const token: TxToken = {} as TxToken;
  data.entries.beginTransaction(token);
  data.entries.endTransaction(token, {
    id: data.nextChangeSetId(),
    origin: 'user',
    added: [],
    removed: [],
    updated,
  });
  data.bumpDatasetRevision();
}

const isDevMode = (): boolean => (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;

/**
 * Applies an already-complete `ChangeSet` straight to the store and fans it out through
 * `beforeChange`/`change` (D-S2-9, D-S2-25) — the notify-and-apply tail every commit shares, with no
 * diffing, no extension hook, and no rollup: the caller hands over the exact rows to write. `runTransaction`
 * uses this once it has built a changeset from a body; `data/history.ts` uses it directly for undo/redo,
 * which is what "neither re-runs the extension hook" (`s2.5-undo-redo.md` §2.2) means in code — replaying
 * or inverting a recorded `ChangeSet` never goes near `data.editExtender` or `rollUpFields`.
 */
export function commitChangeSet(data: TransactionData, changeSet: ChangeSet): void {
  if (data.notifying) {
    throw new MutationDuringNotificationError(
      'commitChangeSet: cannot commit while beforeChange/change handlers are running',
    );
  }

  const token: TxToken = {} as TxToken;
  data.entries.beginTransaction(token);

  if (isDevMode()) {
    Object.freeze(changeSet.added);
    Object.freeze(changeSet.removed);
    Object.freeze(changeSet.updated);
    Object.freeze(changeSet);
  }

  data.notifying = true;
  let allowed: boolean;
  try {
    allowed = data.bus.emit('beforeChange', { changeSet });
  } catch (error) {
    data.entries.endTransaction(token, undefined);
    throw error;
  } finally {
    data.notifying = false;
  }

  if (!allowed) {
    data.entries.endTransaction(token, undefined);
    throw new MutationCancelledError(changeSet);
  }

  data.entries.endTransaction(token, changeSet);

  data.bumpDatasetRevision();

  data.notifying = true;
  try {
    data.bus.emit('change', { changeSet });
  } finally {
    data.notifying = false;
  }
}

/**
 * The commit path (`plans/s2-data-core/s2.2-transactions-and-changesets.md` §2.3): run the body, call
 * the extension hook once, roll up Fields, fold everything into one `ChangeSet`, and — unless it
 * is empty or a `beforeChange` handler refuses it — apply it and emit `change`.
 *
 * `body` takes a `TxToken` deliberately: it is how this file's own tests stage mutations directly
 * against `TransactionData.entries` without a public mutation API to call (that is S2.3's job). A
 * consumer-facing `body: () => T` is still assignable here — JS ignores an argument a callback never
 * declares — so nothing about `Dataset.transaction(fn)`'s public shape (`plans/02` §2) leaks a token.
 */
export function runTransaction<T>(
  data: TransactionData,
  body: (token: TxToken) => T,
  origin: ChangeOrigin,
): T {
  if (data.notifying) {
    throw new MutationDuringNotificationError(
      'transaction: cannot start a transaction while beforeChange/change handlers are running',
    );
  }

  const token: TxToken = {} as TxToken;
  const outermost = data.openTransactions === 0;
  data.openTransactions += 1;
  if (outermost) data.entries.beginTransaction(token);

  let result: T;
  try {
    result = body(token);
  } catch (error) {
    data.openTransactions -= 1;
    if (outermost) data.entries.endTransaction(token, undefined);
    throw error;
  }
  data.openTransactions -= 1;
  if (!outermost) return result; // nested: joins the outer transaction, commits nothing itself (D-S2-8)

  try {
    const byId = data.entries.committedById();
    const proposed = data.entries.pendingEdits();
    const addedEntities = data.entries.pendingAdded();
    const removedEntities = data.entries.pendingRemoved();
    const added = addedEntities.map((row) => row.entity);
    const removed = removedEntities.map((row) => row.entity);

    const bodyUpdated: FieldUpdated[] = [];
    for (const [id, edit] of proposed)
      bodyUpdated.push(...diffEdit(byId, id, edit, data.fields, data.fieldContext));

    const extenderEdits = data.editExtender({ entries: byId, proposed });
    const extenderUpdated: FieldUpdated[] = [];
    for (const [id, edit] of extenderEdits) {
      const bodyEdit = proposed.get(id);
      if (bodyEdit && isDevMode()) {
        for (const field of Object.keys(edit)) {
          if (field in bodyEdit) {
            throw new Error(
              `runTransaction: the extension hook proposed field "${field}" on entry "${String(id)}", ` +
                'which the transaction body already proposed (I4)',
            );
          }
        }
      }
      extenderUpdated.push(...diffEdit(byId, id, edit, data.fields, data.fieldContext));
    }

    const rollupUpdated = rollUpFields(
      byId,
      {
        added,
        removed,
        edits: { body: proposed, merged: mergeEntryEdits(proposed, extenderEdits) },
      },
      data.fields,
      data.rollUpKinds,
      data.fieldContext,
    );

    const changeSet = foldChangeSet(data.nextChangeSetId(), origin, addedEntities, removedEntities, [
      ...bodyUpdated,
      ...extenderUpdated,
      ...rollupUpdated,
    ]);

    if (!changeSet) {
      data.entries.endTransaction(token, undefined);
      return result;
    }

    // Discard the body's write set. `commitChangeSet` opens its own transaction to apply the folded
    // rows — a second `beginTransaction` here would wipe the overlay instead of closing it.
    data.entries.endTransaction(token, undefined);
    commitChangeSet(data, changeSet);
    return result;
  } catch (error) {
    data.entries.endTransaction(token, undefined);
    throw error;
  }
}
