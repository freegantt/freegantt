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
  FieldContext,
  FieldUpdated,
  SegmentId,
  StoreRowUpdated,
} from '../model/index.js';
import { MutationCancelledError, MutationDuringNotificationError } from '../model/index.js';
import { buildCommitChangeSet } from './build-commit-change-set.js';
import { buildDerivedValuesDroppedReport, buildRefusalReport, raiseErrorOn } from './error-reporting.js';
import type { EditRequest, ProposedEdits } from './edit-extension.js';
import type { EditsReading } from './entry-reader.js';
import type { EventBus } from './event-bus.js';
import { RefusalNote } from './event-bus.js';
import { rollUpFields } from './rollup.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { isDevMode } from './dev-mode.js';

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
  pendingEdits(): ProposedEdits;
  /** Which of `start`/`end`/`segments` the body itself named on each pending edit, before
   *  reconciliation added or paired the rest (#232) — see `EntryStore.pendingAuthoredEnvelopeKeys`. */
  pendingAuthoredEnvelopeKeys(): ReadonlyMap<EntryId, ReadonlySet<string>>;
  endTransaction(token: TxToken, changeSet: ChangeSet | undefined): void;
  /** Writes Field rows into committed entries with no `beforeChange`/`change` and no history. */
  writeCommittedFieldRows(updated: readonly FieldUpdated[]): void;
}

/** What `runTransaction` reads off the plugin stores (D-S5-24) — the same three transaction steps
 *  `TransactionalEntryStore` has, and deliberately not the concrete `PluginStores` type, for this
 *  file's usual cycle-avoidance reason. `reserve`/`read` exist for a plugin, never for this file. */
export interface TransactionalPluginStores {
  beginTransaction(token: TxToken): void;
  pendingRows(removedEntryIds: readonly EntryId[]): readonly StoreRowUpdated[];
  endTransaction(token: TxToken, changeSet: ChangeSet | undefined): void;
}

/** What `runTransaction` needs from a Dataset's live state. Structural, not `DatasetState` itself, for
 *  the same reason as `TransactionalEntryStore` above — `dataset-state.ts` imports this file, so this
 *  file must not import `dataset-state.ts` back. */
export interface TransactionData {
  readonly entries: TransactionalEntryStore;
  readonly pluginStores: TransactionalPluginStores;
  /** The one door onto the extension hook (D4, D-S2-6): calls the current occupant and returns
   *  what it wrote. A method, not a fixed field, because `ctx.edits.setExtender` composes onto the
   *  occupant while plugins set up (D-S5-23) — this always calls whichever one is current (#209 Q5).
   *
   *  Reports each Entry's authored envelope keys alongside the reconciled `ProposedEdits`, because the
   *  commit path needs to tell the hook's own `start`/`end`/`segments` write from one
   *  `reconcileEnvelope` derived on the hook's behalf, and `ProposedEdit.proposedKeys` conflates the two
   *  (#232). `DatasetState.extraEditsReadingFor` is this method's one implementation; the friend function
   *  `extraEditsFor(dataset, request)` the drag preview calls (`api/dataset.ts`, ADR 0007) is a
   *  separate, narrower door onto the same occupant. It is not a `Dataset` method (#250 S6-1). */
  extraEditsReadingFor(request: EditRequest): EditsReading;
  /** 0 = no transaction open. Only `runTransaction` reads or writes this (D-S2-8's nesting rule).
   *  `EntryStore` read it for a while, to tell a standalone `update()` from one joining a caller's
   *  open transaction — and that made the derived-write refusal a consumer's to opt out of, because
   *  `dataset.transaction()` is public (Q7, BUILD-LOG). Nothing outside this file reads it again:
   *  how deeply a write is nested is not a permission. */
  openTransactions: number;
  /** Set while `beforeChange`/`change` handlers are fanning out; a transaction started while this is
   *  `true` throws before running its body (D-S2-9, D-S2-25). Only `runTransaction` reads or writes
   *  this. */
  notifying: boolean;
  /** Mints from a per-instance counter (D-S2-18) — identity two writers never need to agree on, not a
   *  sync token. */
  nextChangeSetId(): ChangeSetId;
  readonly bus: EventBus<DatasetEventMap>;
  readonly fields: FieldRegistry;
  readonly fieldContext: FieldContext;
  bumpDatasetRevision(): void;
  /** The commit path's real counter (ADR 0012) — see `CommitChangeSetInput.mintSegmentId`, the
   *  structurally-narrower shape `buildCommitChangeSet` actually reads. */
  mintSegmentId(): SegmentId;
}

/**
 * Writes rolled-up or promoted Field rows straight into the store, with no `beforeChange`/`change`
 * and no history record. Construction uses this after a pure pass produces corrections that must
 * land before anyone reads the dataset.
 */
function writeConstructionUpdates(data: TransactionData, updated: readonly FieldUpdated[]): void {
  if (updated.length === 0) return;
  data.entries.writeCommittedFieldRows(updated);
  data.bumpDatasetRevision();
}

/**
 * Runs the Rollup once against `data`'s freshly built entries, with no proposed edits — every
 * `new Dataset(...)` gets this (`01` §2.6, D-S2-22): a parent given children only through the
 * initial array gets real rolled-up values before anyone reads it, not just after the first later
 * transaction touches one of those children. Structure alone decides who is a parent (ADR 0013) —
 * there is no promotion pass to run first any more.
 *
 * Writes any correction straight into the store and returns early if there is none. There is no
 * `beforeChange`/`change` here and no history record (S2.5) — construction emits nothing (`01` §2.6),
 * so this bypasses `runTransaction` entirely rather than opening a transaction only to suppress its
 * notifications. A `'load'` origin arrives with its own producer later (D-S2-11).
 *
 * The only caller of `rollUpFields` outside `build-commit-change-set.ts`'s commit path — both keep
 * `rollup-is-removable` (D-S4-7) honest.
 *
 * ADR 0013 decision 5: a construction array that authors a rolling-up Field on an entry that already
 * has children in that same array gets it dropped here, and this raises **one** aggregate warning
 * for the whole construction — never one per value.
 */
export function applyConstructionRollUp(data: TransactionData): void {
  const byId = data.entries.committedById();
  const { updated } = rollUpFields(byId, undefined, data.fields, data.fieldContext, () =>
    data.mintSegmentId(),
  );
  writeConstructionUpdates(data, updated);

  const dropped = updated.filter((row) => row.to === undefined);
  if (dropped.length > 0) {
    raiseErrorOn(data.bus, buildDerivedValuesDroppedReport(dropped));
  }
}

/** Opens the write set on every store one transaction spans. Entries and plugin stores stage
 *  together and close together, so a plugin row and an entry edit are never half-committed. */
function beginStores(data: TransactionData, token: TxToken): void {
  data.entries.beginTransaction(token);
  data.pluginStores.beginTransaction(token);
}

/** Closes every store's write set, applying `changeSet` or — with `undefined` — discarding it. */
function endStores(data: TransactionData, token: TxToken, changeSet: ChangeSet | undefined): void {
  data.entries.endTransaction(token, changeSet);
  data.pluginStores.endTransaction(token, changeSet);
}

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
    throw new MutationDuringNotificationError('commitChangeSet');
  }

  const token: TxToken = {} as TxToken;
  beginStores(data, token);

  if (isDevMode()) {
    Object.freeze(changeSet.added);
    Object.freeze(changeSet.removed);
    Object.freeze(changeSet.updated);
    Object.freeze(changeSet);
  }

  data.notifying = true;
  // #210: `refuse(reason)` is the one way a vetoing handler says why. The note collects the words;
  // the bus still answers the same boolean it always did.
  const note = new RefusalNote();
  let allowed: boolean;
  try {
    allowed = data.bus.emit('beforeChange', { changeSet, refuse: note.refuse });
  } catch (error) {
    endStores(data, token, undefined);
    throw error;
  } finally {
    data.notifying = false;
  }

  if (!allowed) {
    endStores(data, token, undefined);
    const refusal = new MutationCancelledError(changeSet, note.reason);
    // S5.12, D-S5-40: the refusal is reported as well as thrown. A `beforeChange` handler that ran
    // beside the vetoing one never learns the outcome, and `attemptMutation` swallows the throw — so
    // the throw alone reaches nobody who needs to show the user what happened. `buildRefusalReport`
    // (`data/error-reporting.ts`) is the one place that shape is built; it reads `refusal.message`
    // rather than rebuilding it, since `model/errors.ts` already owns that wording. No `fallback`:
    // this site printed nothing before and stays silent. `changeSet` is not copied onto the report —
    // `cause` already holds the error that carries it.
    raiseErrorOn(
      data.bus,
      buildRefusalReport({ code: 'mutation-cancelled', event: 'beforeChange', note, cause: refusal }),
    );
    throw refusal;
  }

  endStores(data, token, changeSet);

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
    throw new MutationDuringNotificationError('dataset.transaction');
  }

  const token: TxToken = {} as TxToken;
  const outermost = data.openTransactions === 0;
  data.openTransactions += 1;
  if (outermost) beginStores(data, token);

  let result: T;
  try {
    result = body(token);
  } catch (error) {
    data.openTransactions -= 1;
    if (outermost) endStores(data, token, undefined);
    throw error;
  }
  data.openTransactions -= 1;
  if (!outermost) return result; // nested: joins the outer transaction, commits nothing itself (D-S2-8)

  try {
    const changeSet = buildCommitChangeSet(data, origin);

    if (!changeSet) {
      endStores(data, token, undefined);
      return result;
    }

    // Discard the body's write set. `commitChangeSet` opens its own transaction to apply the folded
    // rows — a second `beginTransaction` here would wipe the overlay instead of closing it.
    endStores(data, token, undefined);
    commitChangeSet(data, changeSet);
    return result;
  } catch (error) {
    endStores(data, token, undefined);
    throw error;
  }
}
