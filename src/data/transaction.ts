// data/ — the transaction runner: the only place that mints TxToken, and the sole path from a set of
// store mutations to one committed ChangeSet (D-S2-24). Imports no history and no view — both are
// subscribers to the `change` event this file emits, never callers of it.

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  DatasetEventMap,
  StoredEntry,
  EntryId,
  FieldLockRule,
  FieldUpdated,
  HierarchySource,
  PluginStoreName,
  StoreRowUpdated,
} from '../model/index.js';
import type { SiblingChange, SiblingGroupKey } from './sibling-order.js';
import {
  MutationCancelledError,
  MutationDuringExtensionHookError,
  MutationDuringNotificationError,
} from '../model/index.js';
import { buildCommitChangeSet } from './build-commit-change-set.js';
import { buildDerivedValuesDroppedReport, buildRefusalReport, raiseErrorOn } from './error-reporting.js';
import type { EditRequest, ProposedEdits } from './edit-extension.js';
import type { EditsReading } from './entry-reader.js';
import type { EventBus } from './event-bus.js';
import { RefusalNote } from './event-bus.js';
import type { FieldAccess } from './fields/field-access.js';
import { rollUpFields } from './rollup.js';
import type { ParentIndex } from './hierarchy-source.js';
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
  committedById(): ReadonlyMap<EntryId, StoredEntry>;
  /** The committed rows' checked parents, memoized per revision — see `EntryStore.committedParents`. */
  committedParents(): ParentIndex;
  /** The committed rows' children, by parent id — see `EntryStore.committedChildIds`. */
  committedChildIds(): ReadonlyMap<EntryId, readonly EntryId[]>;
  beginTransaction(token: TxToken): void;
  pendingAdded(): readonly { store: 'entries'; entity: StoredEntry }[];
  pendingRemoved(): readonly { store: 'entries'; entity: StoredEntry }[];
  pendingEdits(): ProposedEdits;
  /** This write set's own sibling-order log, in call order — see `EntryStore.pendingSiblingChanges`. */
  pendingSiblingChanges(): readonly SiblingChange[];
  /** `group`'s committed member ids, in sibling order — see `EntryStore.committedSiblingIds`. */
  committedSiblingIds(group: SiblingGroupKey): readonly EntryId[];
  /** `group`'s live member count — see `EntryStore.liveSiblingGroupSize`. */
  liveSiblingGroupSize(group: SiblingGroupKey): number;
  /** `entry`'s checked group — see `EntryStore.checkedSiblingGroupOf`. */
  checkedSiblingGroupOf(id: EntryId, entry: StoredEntry): EntryId | undefined;
  endTransaction(token: TxToken, changeSet: ChangeSet | undefined): void;
  /** Writes Field rows into committed entries with no `beforeChange`/`change` and no history. */
  writeCommittedFieldRows(updated: readonly FieldUpdated[]): void;
  /** Raises every hierarchy answer core refused for the committed rows — see
   *  `EntryStore.reportRefusedHierarchyAnswers`. */
  reportRefusedHierarchyAnswers(): void;
}

/** What `runTransaction` reads off the plugin stores (D-S5-24) — the same three transaction steps
 *  `TransactionalEntryStore` has, and deliberately not the concrete `PluginStores` type, for this
 *  file's usual cycle-avoidance reason. `reserve`/`read` exist for a plugin, never for this file. */
export interface TransactionalPluginStores {
  beginTransaction(token: TxToken): void;
  pendingRows(removedEntryIds: readonly EntryId[]): readonly StoreRowUpdated[];
  endTransaction(token: TxToken, changeSet: ChangeSet | undefined): void;
  /** `id`'s committed row in `store`, with no write set overlaid — what replay reads as a store row's
   *  current value before it decides whether to overwrite it (`data/replay-changes.ts`). */
  committedRow(store: PluginStoreName, id: EntryId): object | undefined;
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
   *  `DatasetState.extraEditsReadingFor` is this method's one implementation; the friend function
   *  `extraEditsFor(dataset, request)` the drag preview calls (`api/dataset.ts`, ADR 0007) is a
   *  separate, narrower door onto the same occupant. It is not a `Dataset` method (#250 S6-1). */
  extraEditsReadingFor(request: EditRequest): EditsReading;
  /** 0 = no transaction open. Only `runTransaction` reads or writes this (D-S2-8's nesting rule).
   *  `EntryStore` read it for a while, to tell a standalone `update()` from one joining a caller's
   *  open transaction — and that made the derived-write refusal a consumer's to opt out of, because
   *  `dataset.transaction()` is public (Q7, ADR 0013's appendix — still open). Nothing outside this file reads it again:
   *  how deeply a write is nested is not a permission. */
  openTransactions: number;
  /** Set while `beforeChange`/`change` handlers are fanning out; a transaction started while this is
   *  `true` throws before running its body (D-S2-9, D-S2-25). `runTransaction` and `commitChangeSet`
   *  read and write this; `data/history.ts` also sets it while `historyChange` handlers run. */
  notifying: boolean;
  /** Set while the extension hook's current occupant is running (#323). A nested write through the
   *  store does not join the hook's own transaction — `openTransactions` is already back to 0 by the
   *  time the hook runs, since `runTransaction` closes the body's count before calling
   *  `buildCommitChangeSet` — so a transaction started while this is `true` throws before running its
   *  body, the same way the `notifying` guard above does. `runTransaction` here and `PluginStores`'
   *  own `#write` (`data/plugin-store.ts`, #323) both read this — `#write` has a "join the open
   *  transaction" branch of its own that a plain `runTransaction` call would bypass, so it checks the
   *  flag before that branch runs, not only inside `runTransaction`. Only
   *  `DatasetState.extraEditsReadingFor`/`extraEditsFor` write it, around their one call to the
   *  occupant. */
  runningExtensionHook: boolean;
  /** Mints from a per-instance counter (D-S2-18) — identity two writers never need to agree on, not a
   *  sync token. */
  nextChangeSetId(): ChangeSetId;
  readonly bus: EventBus<DatasetEventMap>;
  readonly fields: FieldRegistry;
  readonly fieldAccess: FieldAccess;
  /** The tree the Rollup walks (ADR 0020). A getter, not a fixed field, because a plugin composes
   *  onto the occupant while it sets up — the store and the Rollup read the same one, which is why
   *  a plugin that changes the tree has changed the Rollup and the two can never disagree. */
  readonly hierarchySource: HierarchySource;
  /** The per-entry lock rule `createEditRequest`'s `editableOf` reads (#473) — a getter, not a fixed
   *  field, for the same reason `hierarchySource` above is one: a plugin composes onto the occupant
   *  while it sets up. */
  readonly lockRule: FieldLockRule;
  bumpDatasetRevision(): void;
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
  const { updated } = rollUpFields(byId, undefined, data.fields, data.fieldAccess, {
    committedParents: data.entries.committedParents(),
    committedChildIds: data.entries.committedChildIds(),
    source: data.hierarchySource,
  });
  writeConstructionUpdates(data, updated);

  const dropped = updated.filter((row) => row.to === undefined);
  if (dropped.length > 0) {
    const report = buildDerivedValuesDroppedReport(dropped);
    raiseErrorOn(data.bus, report, () => console.warn(`FreeGantt: ${report.message}`));
  }
}

/**
 * The Rollup, run once against a batch of entries that is not (yet) the store's own committed rows
 * — construction's own shape (no `pending`, `committedChildIds` unread whenever `pending` is
 * `undefined`), open to more than one caller. `entries.load()` (#496) is one: it replaces every
 * entry, so it must roll up the input batch's own checked parents, never the store's.
 * `changesToReplay` (`replay-changes.ts`, #517) is the other: undo and redo re-roll the working batch
 * they are about to commit, the same construction shape, so a plain undo never demotes a parent that
 * just lost its last child.
 *
 * `rollUpFields` itself stays a leaf only this file and the commit path may import
 * (`rollup-is-removable`, D-S4-7) — this is the one door onto it for `load` (`entry-store.ts`) and
 * for replay (`replay-changes.ts`).
 */
export function rollUpFreshBatch(
  data: Pick<TransactionData, 'fields' | 'fieldAccess'>,
  byId: ReadonlyMap<EntryId, StoredEntry>,
  committedParents: ParentIndex,
  source: HierarchySource,
): readonly FieldUpdated[] {
  return rollUpFields(byId, undefined, data.fields, data.fieldAccess, {
    committedParents,
    committedChildIds: new Map(),
    source,
  }).updated;
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
 * or inverting a recorded `ChangeSet` never goes near `data.editExtender` or `rollUpFields`. The tail,
 * once `change` has fanned out, raises the hierarchy answers core refused for this commit — a handler
 * that writes in response starts a commit of its own, after this one.
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
    raiseErrorOn(data.bus, buildRefusalReport({ event: 'beforeChange', note, cause: refusal }));
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

  // Which hierarchy answers did core refuse? Asked once the commit is whole — both stores closed,
  // the revision bumped, `change` delivered — so a handler that writes starts a commit of its own.
  // A throwing `change` subscriber skips it on purpose: a `finally` would let a throwing `error`
  // handler hide that first throw, and the next commit reports every refusal that still holds.
  data.entries.reportRefusedHierarchyAnswers();
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
  if (data.runningExtensionHook) {
    throw new MutationDuringExtensionHookError('dataset.transaction');
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
