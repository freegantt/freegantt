// data/ — Field-aware changeset building (D-S4-2, D-S2-7). The ChangeSet shape itself is a model/
// type (model/change-set.ts) — model/ is a leaf and MutationCancelledError needs to carry one.

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  Entry,
  EntityAdded,
  EntityRemoved,
  EntryId,
  FieldContext,
  FieldKey,
  FieldUpdated,
} from '../model/index.js';
import type { StoredEdit } from './edit-extension.js';
import { authoredFieldKeysOf, overlayStoredEdit, readField } from './fields/field-access.js';
import type { FieldRegistry, ResolvedField } from './fields/field-registry.js';

/** `true` when a field's `from` and `to` are the same value — such a field is not recorded (D-S2-7). */
export function fieldsEqual(field: FieldKey, from: unknown, to: unknown, registry: FieldRegistry): boolean {
  return registry.valuesEqual(field, from, to);
}

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
  if (fieldsEqual(field, from, to, registry)) return;
  seen.add(key);
  rows.push({ store: 'entries', id, field, from, to });
}

function readDeclared(entry: Entry, field: ResolvedField, ctx: FieldContext): unknown {
  return readField(entry, field, ctx);
}

/**
 * Every `FieldUpdated` row an `edit` produces against the entry's current stored values, per D-S2-7's
 * equality table — a field set back to its original value is not recorded. Shared by both producers of
 * an edit in one transaction: the body's own `proposed` edits, and an extender's returned `EntryEdits`.
 * `edit` is `StoredEdit` — every field already carries a storage-shaped value. An `id` absent from
 * `entries` yields no rows — nothing to diff against.
 *
 * A declared-key write (`{ cost: 500 }`) emits one row keyed `cost`, never a `meta` row. A whole-`meta`
 * write emits the `meta` row first, then one row per changed declared meta Field (D-S4-2).
 */
export function diffEdit(
  entries: ReadonlyMap<EntryId, Entry>,
  id: EntryId,
  edit: StoredEdit,
  registry: FieldRegistry,
  ctx: FieldContext,
): readonly FieldUpdated[] {
  const current = entries.get(id);
  if (!current) return [];

  const next = overlayStoredEdit(current, edit);
  const authored = authoredFieldKeysOf(edit);
  const rows: FieldUpdated[] = [];
  const seen = new Set<string>();

  const emit = (field: FieldKey, from: unknown, to: unknown): void => {
    pushRow(rows, seen, id, field, from, to, registry);
  };

  const wroteMeta = authored.has('meta') || (authored.size === 0 && 'meta' in edit);
  if (wroteMeta) emit('meta', current.meta, next.meta);

  if (authored.size > 0) {
    for (const field of registry.all) {
      if (!authored.has(String(field.key))) continue;
      if (field.key === 'meta') continue;
      emit(field.key, readDeclared(current, field, ctx), readDeclared(next, field, ctx));
    }
    if (authored.has('meta')) {
      for (const field of registry.all) {
        if (field.source.from !== 'meta') continue;
        emit(field.key, readDeclared(current, field, ctx), readDeclared(next, field, ctx));
      }
    }
    return rows;
  }

  for (const field of Object.keys(edit) as (keyof StoredEdit)[]) {
    if (field === 'meta') continue;
    const declared = registry.get(field);
    if (declared) {
      emit(field, readDeclared(current, declared, ctx), readDeclared(next, declared, ctx));
      continue;
    }
    emit(field, (current as unknown as Record<string, unknown>)[field], edit[field]);
  }
  return rows;
}

/**
 * Folds a transaction's raw contributions into the changeset it will commit, or `undefined` when the
 * net effect is empty (D-S2-24 step 6 stops here; no store write, no event).
 *
 * An `add` and a `remove` of the same id inside one transaction cancel — the changeset describes the
 * transaction's net effect, not its intermediate steps, which is what makes undo exact and a sync
 * adapter idempotent. A cancelled id's field updates are dropped too: nothing about an entity that
 * never persisted belongs in the changeset.
 */
export function foldChangeSet(
  id: ChangeSetId,
  origin: ChangeOrigin,
  added: readonly EntityAdded[],
  removed: readonly EntityRemoved[],
  updated: readonly FieldUpdated[],
): ChangeSet | undefined {
  const addedIds = new Set(added.map((entry) => entry.entity.id));
  const removedIds = new Set(removed.map((entry) => entry.entity.id));
  const cancelled = new Set([...addedIds].filter((entryId) => removedIds.has(entryId)));

  const foldedAdded = cancelled.size === 0 ? added : added.filter((entry) => !cancelled.has(entry.entity.id));
  const foldedRemoved =
    cancelled.size === 0 ? removed : removed.filter((entry) => !cancelled.has(entry.entity.id));
  const foldedUpdated = cancelled.size === 0 ? updated : updated.filter((entry) => !cancelled.has(entry.id));

  if (foldedAdded.length === 0 && foldedRemoved.length === 0 && foldedUpdated.length === 0) return undefined;

  return { id, origin, added: foldedAdded, removed: foldedRemoved, updated: foldedUpdated };
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
