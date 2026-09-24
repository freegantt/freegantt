// data/ — the checks and the ordering a whole-list write runs before it stages anything (#496).
// `entries.load()` is the one caller today; `entries.sync()` (#517) shares every function here, so
// none of them read the store or a transaction — each is pure over the list a caller handed in.

import type { EntryId, StoredEntry } from '../model/index.js';
import {
  DuplicateEntryIdError,
  EntryNotFoundError,
  MutationDuringExtensionHookError,
  ParentCycleError,
  TransactionAlreadyOpenError,
} from '../model/index.js';

/** One row's parent, as whichever hierarchy source is current names it (ADR 0020) — never the raw
 *  `parentId` field. A plugin source may answer out of a `props` key instead, so a batch check that
 *  read `parentId` would check a field the tree does not use. */
export type BatchParentResolver = (entry: StoredEntry) => EntryId | undefined;

/** Every id whose parent chain loops back onto itself, self-parenting included — one colouring
 *  walk over the whole batch (O(n), the same shape `hierarchy-source.ts`'s `breakCycles` walks),
 *  not one walk per entry: a chain shared by a deep batch is walked once, not once per descendant.
 *  Walks `byId` — the batch, never the live store — so this answers the same question
 *  `EntryStore.#assertParentValid`'s walk does, over a list nothing has staged yet.
 *
 *  `settled` holds every id a finished walk already cleared, so a later start skips it outright.
 *  `visiting` holds only the current walk's own chain, so revisiting one of its own ids is the loop
 *  signal; revisiting a `settled` id just means this chain runs into ground a prior walk already
 *  charted, cycle or not. */
function cycleMemberIds(
  entries: readonly StoredEntry[],
  byId: ReadonlyMap<EntryId, StoredEntry>,
  parentOf: BatchParentResolver,
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
      const entry = byId.get(current);
      current = entry === undefined ? undefined : parentOf(entry);
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
 * two entries name the same id (`DuplicateEntryIdError`), an entry's parent names an id outside
 * the batch (`EntryNotFoundError`), or a chain of parents loops (`ParentCycleError`). `parentOf`
 * asks whichever hierarchy source is current (ADR 0020), so a plugin source's own key is checked
 * the same as core's `parentId` — the tree `load` then builds reads that source too, and a row a
 * plugin re-parents must be checked against the parent it will actually get. `load` replaces every
 * entry, so "outside the batch" means exactly that — there is no existing store to fall back on for
 * a parent the list itself does not name.
 *
 * Throws on the first violation it finds; nothing about this list has staged when it does.
 */
export function assertEntryBatchIsSound(
  entries: readonly StoredEntry[],
  operation: string,
  parentOf: BatchParentResolver,
): void {
  const byId = new Map<EntryId, StoredEntry>();
  for (const entry of entries) {
    if (byId.has(entry.id)) throw new DuplicateEntryIdError(entry.id, operation, 'duplicate-in-list');
    byId.set(entry.id, entry);
  }
  for (const entry of entries) {
    const parentId = parentOf(entry);
    if (parentId !== undefined && !byId.has(parentId)) {
      throw new EntryNotFoundError(parentId, operation);
    }
  }
  const cycleMembers = cycleMemberIds(entries, byId, parentOf);
  for (const entry of entries) {
    if (cycleMembers.has(entry.id)) throw new ParentCycleError(entry.id);
  }
}

/** The order `entries.all` takes after a whole-list write: each id in the position the caller listed
 *  it, first to last (#496 Q1). `load` stages its adds in this order. Sync's future order Field
 *  (#528) writes each id's position here as that id's `siblingIndex`, so a caller with no sort
 *  column of their own reads the list's own order back unchanged. */
export function listOrderOf(entries: readonly StoredEntry[]): readonly EntryId[] {
  return entries.map((entry) => entry.id);
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
