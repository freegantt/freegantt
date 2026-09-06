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
  Segment,
  SegmentId,
  UpdatedRow,
} from '../model/index.js';
import type { StoredEdit } from './edit-extension.js';
import { proposedKeysOf, overlayStoredEdit } from './fields/field-access.js';
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
 * `StoredEdits`. `edit` is `StoredEdit` — every field already carries a storage-shaped value. An `id`
 * absent from
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
  const authored = proposedKeysOf(edit);
  const rows: FieldUpdated[] = [];
  const seen = new Set<string>();

  const emit = (field: FieldKey, from: unknown, to: unknown): void => {
    pushRow(rows, seen, id, field, from, to, registry);
  };

  const wroteMeta = authored.has('meta') || (authored.size === 0 && 'meta' in edit);
  if (wroteMeta) emit('meta', current.meta, next.meta);

  if (authored.size > 0) {
    for (const field of registry.all) {
      if (field.key === 'meta') continue;
      if (!authored.has(String(field.key)) && !authored.has('meta')) continue;
      emit(field.key, ctx.read(current, field.key), ctx.read(next, field.key));
    }
    return rows;
  }

  for (const field of Object.keys(edit) as (keyof StoredEdit)[]) {
    if (field === 'meta' || field === 'proposedKeys') continue;
    const declared = registry.get(field);
    if (declared) {
      emit(field, ctx.read(current, field), ctx.read(next, field));
      continue;
    }
    // `field` is `keyof StoredEdit` narrowed to "not a declared Field" here — genuinely open, so
    // this cast is load-bearing, the same as entry-store.ts's `applyFieldRow` cast.
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
 * adapter idempotent. A cancelled id's field updates are dropped too, a plugin row's included:
 * nothing about an entity that never persisted belongs in the changeset.
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

/**
 * Every `SegmentId` this committed `ChangeSet` took out of the Dataset (review finding 8, #212). An
 * Entry the commit removed contributes all its own; a `segments` field row contributes what it
 * dropped. `view/gantt-shell.ts#forgetSegmentsTheDatasetDropped` reads this instead of checking the
 * whole Selection against `entryIdOfSegment` (finding 6) on every commit — an edit with no removed
 * Entry and no `segments` row costs nothing past building this one empty `Set`.
 */
export function segmentIdsDroppedBy(changeSet: ChangeSet): ReadonlySet<SegmentId> {
  const dropped = new Set<SegmentId>();
  for (const { entity } of changeSet.removed) {
    for (const segment of entity.segments) dropped.add(segment.id);
  }
  for (const row of fieldRowsOf(changeSet)) {
    if (row.field !== 'segments') continue;
    // `FieldUpdated.from`/`to` are `unknown` — genuinely open for a consumer field. `'segments'` is a
    // core Field, though, so this cast is load-bearing, the same as `entry-store.ts#applyFieldRow`'s.
    const before = row.from as readonly Segment[];
    const afterIds = new Set((row.to as readonly Segment[]).map((segment) => segment.id));
    for (const segment of before) if (!afterIds.has(segment.id)) dropped.add(segment.id);
  }
  return dropped;
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
