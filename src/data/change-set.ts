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
import { proposedKeysOf, entryAfterEdit, readField } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';

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
