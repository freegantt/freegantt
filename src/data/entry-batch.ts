// data/ — the checks and the ordering a whole-list write runs before it stages anything (#496).
// `entries.load()` is the one caller today; `entries.sync()` (#517) shares every function here, so
// none of them read the store or a transaction — each is pure over the list a caller handed in.

import type { EntryId, FieldUpdated, FlatEntryInput, HierarchySource, StoredEntry } from '../model/index.js';
import {
  DuplicateEntryIdError,
  entryId,
  EntryNotFoundError,
  MutationDuringExtensionHookError,
  ParentCycleError,
  TransactionAlreadyOpenError,
} from '../model/index.js';
import { siblingIndexesInListOrder } from './sibling-order.js';
import { checkHierarchyAnswers } from './hierarchy-source.js';
import type { ParentIndex, UnplacedEntry } from './hierarchy-source.js';
import { toEntries } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import type { FieldRegistry } from './fields/field-registry.js';

/** Every id whose `parentId` chain loops back onto itself, self-parenting included — one colouring
 *  walk over the whole batch (O(n), the same shape `hierarchy-source.ts`'s `breakCycles` walks),
 *  not one walk per entry: a chain shared by a deep batch is walked once, not once per descendant.
 *  Walks `byId` — the batch, never the live store — so this answers the same question
 *  `EntryStore.#assertParentValid`'s walk does, over a list nothing has staged yet.
 *
 *  `settled` holds every id a finished walk already cleared, so a later start skips it outright.
 *  `visiting` holds only the current walk's own chain, so revisiting one of its own ids is the loop
 *  signal; revisiting a `settled` id just means this chain runs into ground a prior walk already
 *  charted, cycle or not. */
/** The two fields every check in this file reads — `id` and `parentId` — nothing more, so a check
 *  runs over an `UnplacedEntry` before `readEntryBatch` has placed it, or over a placed
 *  `StoredEntry` just as well. */
type EntryRow = Pick<StoredEntry, 'id' | 'parentId'>;

function cycleMemberIds(
  entries: readonly EntryRow[],
  byId: ReadonlyMap<EntryId, EntryRow>,
): ReadonlySet<EntryId> {
  const settled = new Set<EntryId>();
  const visiting = new Set<EntryId>();
  const members = new Set<EntryId>();

  for (const start of entries) {
    if (settled.has(start.id)) continue;
    const chain: EntryId[] = [];
    let current: EntryId | undefined = start.id;
    while (current !== undefined && !settled.has(current) && !visiting.has(current)) {
      visiting.add(current);
      chain.push(current);
      current = byId.get(current)?.parentId;
    }
    // `current` is still in this walk's own `visiting` set, so the chain arrived back at an id it
    // already passed — everything from that id to the end of the chain is one loop.
    if (current !== undefined && visiting.has(current)) {
      const loopStart = chain.indexOf(current);
      for (const id of chain.slice(loopStart)) members.add(id);
    }
    for (const id of chain) {
      visiting.delete(id);
      settled.add(id);
    }
  }
  return members;
}

/**
 * Every reason a whole-list write refuses the batch, checked before any of it stages (#496 Q2):
 * two entries name the same id (`DuplicateEntryIdError`), an entry's `parentId` names an id outside
 * the batch (`EntryNotFoundError`), or a chain of `parentId`s loops (`ParentCycleError`). `load`
 * replaces every entry, so "outside the batch" means exactly that — there is no existing store to
 * fall back on for a `parentId` the list itself does not name.
 *
 * Throws on the first violation it finds; nothing about this list has staged when it does.
 */
export function assertEntryBatchIsSound(entries: readonly EntryRow[], operation: string): void {
  const byId = new Map<EntryId, EntryRow>();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new DuplicateEntryIdError(entry.id, operation, 'duplicate-in-list');
    byId.set(entry.id, entry);
  }
  for (const entry of entries) {
    if (entry.parentId !== undefined && !byId.has(entry.parentId)) {
      throw new EntryNotFoundError(entry.parentId, operation);
    }
  }
  const cycleMembers = cycleMemberIds(entries, byId);
  for (const entry of entries) {
    if (cycleMembers.has(entry.id)) throw new ParentCycleError(entry.id);
  }
}

/** What a whole-list ingest hands its caller: the placed rows, in the order the caller listed them
 *  (#496 Q1), and the checked tree those rows now agree with — `load` and construction both stage
 *  their adds in this order and roll up against these same `parents`. */
export interface PlacedEntryBatch {
  readonly entries: readonly StoredEntry[];
  readonly parents: ParentIndex;
  /** Every entry whose authored `siblingIndex` disagreed with its list position — one aggregate
   *  `'sibling-index-dropped'` report per operation is the caller's to raise (`data/error-reporting.ts`).
   *  Empty when nobody authored the key, or every authored value already agreed. */
  readonly siblingIndexDropped: readonly FieldUpdated[];
}

/**
 * The one door construction and `load` both ingest a whole list of `FlatEntryInput` through (ADR
 * 0034): reads each input, checks the batch is sound, asks the hierarchy source, and gives every
 * entry its rank among its siblings from list position — the group a sibling belongs to is the
 * source's own checked answer (`checkHierarchyAnswers`), never a raw, unchecked `parentId`.
 *
 * An authored `siblingIndex` that disagrees with list position is dropped: list position always
 * wins, because it is the only answer that can hold for every row in the same batch at once.
 */
export function readEntryBatch(
  inputs: readonly FlatEntryInput[],
  context: EntryReadContext,
  registry: FieldRegistry,
  hierarchySource: HierarchySource,
  operation: string,
): PlacedEntryBatch {
  const unplaced = toEntries(inputs, context, registry, operation);
  assertEntryBatchIsSound(unplaced, operation);
  const byId = new Map<EntryId, UnplacedEntry>(unplaced.map((entry) => [entry.id, entry]));
  const { parents } = checkHierarchyAnswers(byId, hierarchySource);
  const ranks = siblingIndexesInListOrder(
    unplaced,
    (entry) => entry.id,
    (entry) => parents.get(entry.id),
  );
  const authoredSiblingIndex = new Map<EntryId, number>();
  for (const input of inputs) {
    if (input.siblingIndex !== undefined) authoredSiblingIndex.set(entryId(input.id), input.siblingIndex);
  }
  const siblingIndexDropped: FieldUpdated[] = [];
  const entries = unplaced.map((entry) => {
    const siblingIndex = ranks.get(entry.id) ?? 0;
    const authored = authoredSiblingIndex.get(entry.id);
    if (authored !== undefined && authored !== siblingIndex) {
      siblingIndexDropped.push({
        store: 'entries',
        id: entry.id,
        field: 'siblingIndex',
        from: authored,
        to: siblingIndex,
      });
    }
    return { ...entry, siblingIndex };
  });
  return { entries, parents, siblingIndexDropped };
}

/**
 * Refuses a whole-list write called from inside an already-open `dataset.transaction()` (#496 Q4,
 * #517 S9). `load` and sync are always their own transaction — unlike `add`/`update`/`remove`, which
 * join one already open (D-S2-8), a whole-list write replaces every entry in one step and must not
 * become a nested step inside a caller's own batch.
 */
export function assertNoOpenTransaction(openTransactions: number, operation: string): void {
  if (openTransactions > 0) throw new TransactionAlreadyOpenError(operation);
}

/**
 * Refuses a whole-list write called while the extension hook's current occupant is running (#323,
 * #496). `openTransactions` is already back to 0 by the time the hook runs (`data/transaction.ts`),
 * so `assertNoOpenTransaction` above never sees a hook-time call — an `EditExtender` that calls
 * `entries.load()` would pass it and corrupt the write set the hook's own caller still has open.
 * This closes that gap the same way `runTransaction` and `PluginStores#write` already do for
 * `add`/`update`/`remove`.
 */
export function assertNoRunningExtensionHook(runningExtensionHook: boolean, operation: string): void {
  if (runningExtensionHook) throw new MutationDuringExtensionHookError(operation);
}
