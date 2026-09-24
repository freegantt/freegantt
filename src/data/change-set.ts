// data/ — Field-aware changeset building (D-S4-2, D-S2-7). The ChangeSet shape itself is a model/
// type (model/change-set.ts) — model/ is a leaf and MutationCancelledError needs to carry one.

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  StoredEntry,
  EntityAdded,
  EntityRemoved,
  EntryId,
  FieldKey,
  FieldUpdated,
  StoreName,
  UpdatedRow,
} from '../model/index.js';
import type { ProposedEdit } from './edit-extension.js';
import { applyFieldRow, proposedKeysOf, entryAfterEdit, readField } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { renumberSiblingGroups } from './sibling-order.js';
import type { SiblingChange, SiblingGroupKey } from './sibling-order.js';

function pushRow(
  rows: FieldUpdated[],
  seen: Set<string>,
  id: EntryId,
  field: FieldKey,
  from: unknown,
  to: unknown,
  registry: FieldRegistry,
): void {
  const key = String(field);
  if (seen.has(key)) return;
  if (registry.valuesEqual(field, from, to)) return;
  seen.add(key);
  rows.push({ store: 'entries', id, field, from, to });
}

/**
 * Every `FieldUpdated` row an `edit` produces against the entry's current stored values, per D-S2-7's
 * equality table — a field set back to its original value is not recorded. Shared by both producers of
 * an edit in one transaction: the body's own `proposed` edits, and the extension hook's own
 * `ProposedEdits`. `edit` is a `ProposedEdit` — `proposedKeys` is required (ADR 0011), so it always
 * states which Fields it writes. An `id` absent from `entries` yields no rows — nothing to diff
 * against.
 *
 * One row per Field key, walked off the registry (ADR 0011) — never a path into `props`. A declared
 * key (`{ cost: 500 }`) emits one row keyed `cost`; there is no whole-bag row to emit alongside it,
 * because `props` is not itself a Field.
 */
export function diffEdit(
  entries: ReadonlyMap<EntryId, StoredEntry>,
  id: EntryId,
  edit: ProposedEdit,
  registry: FieldRegistry,
  access: FieldAccess,
): readonly FieldUpdated[] {
  const current = entries.get(id);
  if (!current) return [];

  const next = entryAfterEdit(current, edit);
  const authored = proposedKeysOf(edit);
  const rows: FieldUpdated[] = [];
  const seen = new Set<string>();

  const emit = (field: FieldKey, from: unknown, to: unknown): void => {
    pushRow(rows, seen, id, field, from, to, registry);
  };

  for (const field of registry.all) {
    if (!authored.has(String(field.key))) continue;
    emit(field.key, readField(current, field, access), readField(next, field, access));
  }
  return rows;
}

/**
 * Call: `mergeUpdatedRows([userRow, rollupRow], registry)` — one net row per `(store, id, field)`.
 *
 * A commit's own stages can each propose a row for the same key: the body writes `end` and, in the
 * same transaction, the Rollup recomputes `end` for the same entry. One `updated` array holding both
 * rows lets undo apply them in order and land on the middle value, not the one a reader actually saw
 * (#517 review) — `invertChangeSet` inverts row by row and keeps their order, so two rows for one key
 * invert to two rows too. This is the one place that collapses them: `from` is the first row's `from`,
 * `to` is the last row's `to`, and a key whose net change is nothing (`registry.valuesEqual` for a
 * Field, `Object.is` for a store row) drops out the way `pushRow` already drops a no-op edit.
 *
 * Keys by nested lookup — store, then id, then Field for an entries row — never by a joined string.
 * An id or a Field key can itself hold a colon, so a joined string like `entries:a:b:c` cannot tell
 * `(id 'a:b', field 'c')` apart from `(id 'a', field 'b:c')`; nesting never has to tell them apart.
 */
export function mergeUpdatedRows(
  rows: readonly UpdatedRow[],
  registry: FieldRegistry,
): readonly UpdatedRow[] {
  interface Bucket {
    from: unknown;
    last: UpdatedRow;
  }

  const entriesBuckets = new Map<EntryId, Map<FieldKey, Bucket>>();
  const storeBuckets = new Map<StoreName, Map<EntryId, Bucket>>();
  const order: Bucket[] = [];

  const bucketFor = (row: UpdatedRow): Bucket => {
    if (row.store === 'entries') {
      const byField = entriesBuckets.get(row.id) ?? new Map<FieldKey, Bucket>();
      entriesBuckets.set(row.id, byField);
      const existing = byField.get(row.field);
      if (existing) return existing;
      const created: Bucket = { from: row.from, last: row };
      byField.set(row.field, created);
      order.push(created);
      return created;
    }
    const byId = storeBuckets.get(row.store) ?? new Map<EntryId, Bucket>();
    storeBuckets.set(row.store, byId);
    const existing = byId.get(row.id);
    if (existing) return existing;
    const created: Bucket = { from: row.from, last: row };
    byId.set(row.id, created);
    order.push(created);
    return created;
  };

  for (const row of rows) {
    bucketFor(row).last = row;
  }

  const merged: UpdatedRow[] = [];
  for (const { from, last } of order) {
    const to = last.to;
    const equal = last.store === 'entries' ? registry.valuesEqual(last.field, from, to) : Object.is(from, to);
    if (equal) continue;
    merged.push({ ...last, from, to });
  }
  return merged;
}

/**
 * Folds a transaction's raw contributions into the changeset it will commit, or `undefined` when the
 * net effect is empty (D-S2-24 step 6 stops here; no store write, no event).
 *
 * `added` and `removed` already carry the write set's own net effect (`EntryStore.stageAdd`,
 * `stageRemove`), not its intermediate steps: an id added and removed inside one transaction, with no
 * row this store held before it opened, is absent from both by the time it reaches here — nothing
 * about an entity that never persisted belongs in the changeset. An id this store held before the
 * transaction, removed and then re-added, is a replace, and shows up in both lists on purpose — undo
 * needs the old row back, not its absence, so this function does not treat that overlap as a cancel.
 * It only asks whether anything survived the write set's own fold.
 *
 * `updated` holds both row kinds (D-S5-24), so a transaction whose only write is a plugin-store row
 * is not empty and does commit (#156).
 */
export function foldChangeSet(
  id: ChangeSetId,
  origin: ChangeOrigin,
  added: readonly EntityAdded[],
  removed: readonly EntityRemoved[],
  updated: readonly UpdatedRow[],
): ChangeSet | undefined {
  if (added.length === 0 && removed.length === 0 && updated.length === 0) return undefined;
  return { id, origin, added, removed, updated };
}

/**
 * Call: `foldRollUpRowsOntoAdded(addedEntities, rollupUpdated, fields)`.
 *
 * An added entity carries the value a Rollup row settles on, not a row of its own: nothing reads an
 * Entries row for an id that has no prior committed value to diff against (the commit pipeline and a
 * replay both apply this, and a whole-list write folds the same way onto its own placed batch). Every
 * `rollupUpdated` row keyed to an id in `added` folds onto that entity in the order it arrives; every
 * other row is the caller's own to place. An empty `rollupUpdated`, or one naming no added id, returns
 * `added` unchanged.
 */
export function foldRollUpRowsOntoAdded(
  added: readonly EntityAdded[],
  rollupUpdated: readonly FieldUpdated[],
  fields: FieldRegistry,
): readonly EntityAdded[] {
  const rowsById = new Map<EntryId, FieldUpdated[]>();
  for (const row of rollupUpdated) {
    const rows = rowsById.get(row.id) ?? [];
    rows.push(row);
    rowsById.set(row.id, rows);
  }
  if (rowsById.size === 0) return added;
  return added.map((row) => {
    const rows = rowsById.get(row.entity.id);
    if (rows === undefined) return row;
    const entity = rows.reduce(
      (acc, fieldRow) => applyFieldRow(acc, fieldRow.field, fieldRow.to, fields),
      row.entity,
    );
    return { ...row, entity };
  });
}

/**
 * Call: `foldSiblingRanks(siblingChanges, addedEntities, addedIds, removedIds, current,
 * committedSiblingIds, committedParentOf)`.
 *
 * The renumber pass's own tail (ADR 0034), shared by the commit pipeline and a replay: run
 * `renumberSiblingGroups` over `siblingChanges`, then place its ranks — onto the entity itself for
 * an added id (nothing reads a `siblingIndex` row for an id with no prior committed value to diff
 * against), onto a fresh row for a kept id whose rank differs from `current`'s value. A removed id
 * gets neither; its rank, if any, is spent. An empty `siblingChanges` renumbers nothing and returns
 * `added` unchanged with no rows.
 */
export function foldSiblingRanks(
  siblingChanges: readonly SiblingChange[],
  added: readonly EntityAdded[],
  addedIds: ReadonlySet<EntryId>,
  removedIds: ReadonlySet<EntryId>,
  current: ReadonlyMap<EntryId, StoredEntry>,
  committedSiblingIds: (group: SiblingGroupKey) => readonly EntryId[],
  committedParentOf: (id: EntryId) => EntryId | undefined,
): { readonly rankedAdded: readonly EntityAdded[]; readonly siblingIndexUpdated: readonly FieldUpdated[] } {
  if (siblingChanges.length === 0) return { rankedAdded: added, siblingIndexUpdated: [] };

  const siblingRanks = renumberSiblingGroups(siblingChanges, committedSiblingIds, committedParentOf);

  const rankedAdded = added.map((row) => {
    const rank = siblingRanks.get(row.entity.id);
    return rank === undefined || rank === row.entity.siblingIndex
      ? row
      : { ...row, entity: { ...row.entity, siblingIndex: rank } };
  });

  const siblingIndexUpdated: FieldUpdated[] = [];
  for (const [id, rank] of siblingRanks) {
    if (addedIds.has(id) || removedIds.has(id)) continue;
    const committed = current.get(id);
    if (committed === undefined || committed.siblingIndex === rank) continue;
    siblingIndexUpdated.push({
      store: 'entries',
      id,
      field: 'siblingIndex',
      from: committed.siblingIndex,
      to: rank,
    });
  }

  return { rankedAdded, siblingIndexUpdated };
}

/**
 * Call: `fieldRowsOf(changeSet).filter((row) => row.field === 'start')`.
 *
 * The Field rows of a committed changeset. `ChangeSet.updated` also carries plugin-store rows since
 * D-S5-24, and a store row holds a whole value rather than a Field, so it has no `field` to read. A
 * consumer that only wants Field rows filters through this instead of re-deriving the `store` check.
 */
export function fieldRowsOf(changeSet: ChangeSet): readonly FieldUpdated[] {
  return changeSet.updated.filter((row): row is FieldUpdated => row.store === 'entries');
}

/** Undo's recorded changeset, inverted: `added`↔`removed`, each `updated` row's `from`/`to` swapped,
 *  `origin: 'undo'`. Redo does not invert — it re-applies the recorded rows with `origin: 'redo'`. The
 *  `id` carried over is a placeholder only — `replay` mints a fresh one and ignores this one
 *  (`plans/s2-data-core/s2b-undo-replay-seam.md`). */
export function invertChangeSet(changeSet: ChangeSet): ChangeSet {
  return {
    id: changeSet.id,
    origin: 'undo',
    added: changeSet.removed.map(({ store, entity }) => ({ store, entity })),
    removed: changeSet.added.map(({ store, entity }) => ({ store, entity })),
    updated: changeSet.updated.map((row) => ({ ...row, from: row.to, to: row.from })),
  };
}
