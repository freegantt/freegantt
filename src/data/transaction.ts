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
  FieldUpdated,
} from '../model/index.js';
import { MutationCancelledError, MutationDuringNotificationError } from '../model/index.js';
import { diffEdit, foldChangeSet } from './change-set.js';
import type { EditExtender, EntryEdits } from './edit-extension.js';
import type { EventBus } from './event-bus.js';

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
  snapshot(): ReadonlyMap<EntryId, Entry>;
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
  /** Core, not an extender occupant (D-S2-22): rolls up derived spans on every commit. Always called —
   *  `noRollUp` until S2.3 lands the real one — so the sequence is one shape from the first step to the
   *  last, not a step that is sometimes skipped. */
  rollUp: (entries: ReadonlyMap<EntryId, Entry>, proposed: EntryEdits) => readonly FieldUpdated[];
}

/** The no-op `rollUp` every `TransactionData` gets until S2.3 lands span derivation (D-S2-22): an
 *  always-invoked step that yields nothing, not a conditionally-skipped one. */
export const noRollUp = (): readonly FieldUpdated[] => [];

function mergeEdits(base: EntryEdits, extra: EntryEdits): EntryEdits {
  if (extra.size === 0) return base;
  const merged = new Map(base);
  for (const [id, edit] of extra) merged.set(id, { ...merged.get(id), ...edit });
  return merged;
}

const isDevMode = (): boolean => (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;

/**
 * The commit path (`plans/s2-data-core/s2.2-transactions-and-changesets.md` §2.3): run the body, call
 * the extension hook once, roll up derived spans, fold everything into one `ChangeSet`, and — unless it
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

  const snapshot = data.entries.snapshot();
  const proposed = data.entries.pendingEdits();
  const addedEntities = data.entries.pendingAdded();
  const removedEntities = data.entries.pendingRemoved();

  const bodyUpdated: FieldUpdated[] = [];
  for (const [id, edit] of proposed) bodyUpdated.push(...diffEdit(snapshot, id, edit));

  const extenderEdits = data.editExtender({ entries: snapshot, proposed });
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
    extenderUpdated.push(...diffEdit(snapshot, id, edit));
  }

  const rollupUpdated = data.rollUp(snapshot, mergeEdits(proposed, extenderEdits));

  const changeSet = foldChangeSet(data.nextChangeSetId(), origin, addedEntities, removedEntities, [
    ...bodyUpdated,
    ...extenderUpdated,
    ...rollupUpdated,
  ]);

  if (!changeSet) {
    data.entries.endTransaction(token, undefined);
    return result;
  }

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

  data.notifying = true;
  try {
    data.bus.emit('change', { changeSet });
  } finally {
    data.notifying = false;
  }

  return result;
}
