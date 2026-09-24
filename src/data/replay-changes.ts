// data/ — the pure diff behind undo, redo and `dataset.replay()` (#517 amendment, ADR 0035): a
// recorded `ChangeSet` no longer applies blind. It applies onto the store's current values, the same
// way `entries.sync()` overwrites a local edit the server has not seen. A sync between the step's
// recording and its replay leaves rows that no longer match what they last wrote; this file decides,
// row by row, what still has something to write and what a sync has already settled.

import type {
  ChangeSet,
  EntityAdded,
  EntityRemoved,
  EntryId,
  FieldUpdated,
  StoredEntry,
  StoreRowUpdated,
  UpdatedRow,
} from '../model/index.js';
import { applyFieldRow, readFieldRow } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';
import type { TransactionalPluginStores, TransactionData } from './transaction.js';

/** Every committed id under `id`, through the committed child index — the same worklist shape
 *  `EntryStore.#subtreeOf` walks for `entries.remove()`'s own cascade, run here over ids instead of
 *  live rows. `seen` guards a source that loops, so a bad tree cascades finitely instead of forever. */
function committedDescendantsOf(
  id: EntryId,
  committedChildIds: ReadonlyMap<EntryId, readonly EntryId[]>,
): readonly EntryId[] {
  const found: EntryId[] = [];
  const seen = new Set<EntryId>([id]);
  const pending: EntryId[] = [id];
  while (pending.length > 0) {
    for (const childId of committedChildIds.get(pending.pop()!) ?? []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      found.push(childId);
      pending.push(childId);
    }
  }
  return found;
}

/** An `added` row whose id already exists is skipped — the server's re-sent copy stays. Runs after
 *  `removedRowsToReplay`, the same order `EntryStore.endTransaction` applies a changeset in: a
 *  replace's own `removed` row clears the slot first, so its `added` row lands instead of being read
 *  as "still there, must be a sync." A kept row lands on `working`, so a later row in the same step
 *  sees it. */
function addedRowsToReplay(
  rows: readonly EntityAdded[],
  working: Map<EntryId, StoredEntry>,
): readonly EntityAdded[] {
  const kept: EntityAdded[] = [];
  for (const row of rows) {
    if (working.has(row.entity.id)) continue;
    kept.push(row);
    working.set(row.entity.id, row.entity);
  }
  return kept;
}

/** A `removed` row whose id is already gone is skipped. A kept row removes the entity as `working`
 *  holds it now, and cascades to every committed descendant this step does not itself remove — the
 *  same reach `entries.remove()` has — so an undo or a redo never strands a child under a parent that
 *  just left. Their plugin-store rows go with them (`changesToReplay`'s `pendingRows` call). */
function removedRowsToReplay(
  rows: readonly EntityRemoved[],
  working: Map<EntryId, StoredEntry>,
  committedChildIds: ReadonlyMap<EntryId, readonly EntryId[]>,
): { readonly removed: readonly EntityRemoved[]; readonly cascadeIds: readonly EntryId[] } {
  const recordedIds = new Set(rows.map((row) => row.entity.id));
  const removed: EntityRemoved[] = [];
  const cascadeIds: EntryId[] = [];
  const cascadeSeen = new Set<EntryId>();

  const remove = (id: EntryId): void => {
    const entity = working.get(id);
    if (!entity) return;
    removed.push({ store: 'entries', entity });
    working.delete(id);
  };

  for (const row of rows) {
    if (!working.has(row.entity.id)) continue; // already gone
    remove(row.entity.id);
    for (const descendantId of committedDescendantsOf(row.entity.id, committedChildIds)) {
      if (recordedIds.has(descendantId) || cascadeSeen.has(descendantId) || !working.has(descendantId)) {
        continue;
      }
      cascadeSeen.add(descendantId);
      cascadeIds.push(descendantId);
      remove(descendantId);
    }
  }
  return { removed, cascadeIds };
}

/** A Field row for an id gone after the replay, or whose current value already equals `to`
 *  (`registry.valuesEqual`), is skipped. Otherwise it overwrites: `from` is the value `working` holds
 *  now, never the recorded `from`. A kept row lands back on `working`, so a duplicate row for the
 *  same id and Field diffs against what this step already wrote. */
function fieldRowToReplay(
  row: FieldUpdated,
  working: Map<EntryId, StoredEntry>,
  registry: FieldRegistry,
  access: FieldAccess,
): FieldUpdated | undefined {
  const current = working.get(row.id);
  if (!current) return undefined;
  const from = readFieldRow(current, row.field, registry, access);
  if (registry.valuesEqual(row.field, from, row.to)) return undefined;
  working.set(row.id, applyFieldRow(current, row.field, row.to, registry));
  return { store: 'entries', id: row.id, field: row.field, from, to: row.to };
}

/** A store row for an entity gone after the replay is dropped — no orphan rows. Otherwise it reads
 *  the store's own committed value fresh (`committedRow`) and overwrites the same way a Field row
 *  does; an identical value writes nothing. */
function storeRowToReplay(
  row: StoreRowUpdated,
  working: ReadonlyMap<EntryId, StoredEntry>,
  pluginStores: TransactionalPluginStores,
): StoreRowUpdated | undefined {
  if (!working.has(row.id)) return undefined;
  const from = pluginStores.committedRow(row.store, row.id);
  if (Object.is(from, row.to)) return undefined;
  return { store: row.store, id: row.id, from, to: row.to };
}

/**
 * The changes that replaying `changeSet` still has to write, onto `data`'s current committed rows —
 * "the changes to replay." `undefined` when nothing is left to write, the same as an empty recorded
 * `ChangeSet`: no `beforeChange`, no `change`.
 *
 * Recorded rows keep the order `changeSet` gave them. A cascade's extra `removed` rows and their
 * plugin-store rows are appended after, never interleaved with the rows the step itself named.
 *
 * Judges `removed`, then `added`, then `updated` — the same order `EntryStore.endTransaction` applies
 * a committed changeset in. A replace (a remove and a re-add of one id) names that id in both
 * `removed` and `added`; judging `removed` first clears the slot before `added` asks whether the id is
 * already there, so a replace's own pair never reads as "the server got here first."
 *
 * Call: `changesToReplay(data, invertChangeSet(step))` (undo), `changesToReplay(data, { ...step,
 * origin: 'redo' })` (redo), or `changesToReplay(data, changeSet)` (`dataset.replay`).
 */
export function changesToReplay(data: TransactionData, changeSet: ChangeSet): ChangeSet | undefined {
  const working = new Map(data.entries.committedById());

  const { removed, cascadeIds } = removedRowsToReplay(
    changeSet.removed,
    working,
    data.entries.committedChildIds(),
  );
  const added = addedRowsToReplay(changeSet.added, working);

  const updated: UpdatedRow[] = [];
  for (const row of changeSet.updated) {
    const replayed =
      row.store === 'entries'
        ? fieldRowToReplay(row, working, data.fields, data.fieldAccess)
        : storeRowToReplay(row, working, data.pluginStores);
    if (replayed) updated.push(replayed);
  }
  if (cascadeIds.length > 0) updated.push(...data.pluginStores.pendingRows(cascadeIds));

  if (added.length === 0 && removed.length === 0 && updated.length === 0) return undefined;
  return { id: data.nextChangeSetId(), origin: changeSet.origin, added, removed, updated };
}
