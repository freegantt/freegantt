// data/ — the per-field equality table that decides whether a field actually moved, and the functions
// that build a ChangeSet from it (plans/s2-data-core/README.md D-S2-7). The ChangeSet shape itself is a
// model/ type (model/change-set.ts) — model/ is a leaf and MutationCancelledError needs to carry one.

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  CoreFieldKey,
  Entry,
  EntityAdded,
  EntityRemoved,
  EntryEdit,
  EntryId,
  FieldKey,
  FieldUpdated,
} from '../model/index.js';

export type {
  StoreName,
  ChangeOrigin,
  CoreFieldKey,
  FieldKey,
  EntityAdded,
  EntityRemoved,
  FieldUpdated,
  ChangeSet,
} from '../model/index.js';

type FieldComparator = (from: unknown, to: unknown) => boolean;

const byReference: FieldComparator = (from, to) => from === to;

/** Element-wise on `start`/`end` — our own type, so this is not walking consumer data. A resize
 * gesture rebuilds the array every frame; `===` would record a change on every commit that changed
 * nothing (D-S2-7). */
const segmentsEqual: FieldComparator = (from, to) => {
  const a = from as Entry['segments'];
  const b = to as Entry['segments'];
  if (a === b) return true;
  if (a === undefined || b === undefined || a.length !== b.length) return false;
  return a.every((span, index) => span.start === b[index]?.start && span.end === b[index]?.end);
};

/** Adding a field to `Entry` fails `typecheck` until it is given a comparator here (D-S2-7). Exhaustive
 * over the **core** set only; a field S5 declares carries its own `equals` and defaults to `Object.is`
 * (D-S2-26), which is why `fieldsEqual` below falls back to `byReference` for a key not in this table. */
const coreComparators = {
  name: byReference,
  kind: byReference,
  parentId: byReference,
  progress: byReference,
  start: byReference,
  end: byReference,
  segments: segmentsEqual,
  meta: byReference,
} satisfies Record<CoreFieldKey, FieldComparator>;

/** `true` when a field's `from` and `to` are the same value — such a field is not recorded (D-S2-7). */
export function fieldsEqual(field: FieldKey, from: unknown, to: unknown): boolean {
  const comparator = (coreComparators as Record<string, FieldComparator | undefined>)[field];
  return (comparator ?? byReference)(from, to);
}

/**
 * Every `FieldUpdated` row an `edit` produces against the entry's current stored values, per D-S2-7's
 * equality table — a field set back to its original value is not recorded. Shared by both producers of
 * an edit in one transaction: the body's own `proposed` edits, and an extender's returned `EntryEdits`
 * (S2.2 §2.2). Assumes `edit`'s fields already carry storage-shaped values (an `Instant`, not a loose
 * `InstantInput`) — the mutator that built `edit` normalizes through `time/` first, so this function
 * only compares, never converts. An `id` absent from `entries` yields no rows — nothing to diff against.
 */
export function diffEdit(
  entries: ReadonlyMap<EntryId, Entry>,
  id: EntryId,
  edit: EntryEdit,
): readonly FieldUpdated[] {
  const current = entries.get(id);
  if (!current) return [];

  const updated: FieldUpdated[] = [];
  for (const field of Object.keys(edit) as (keyof EntryEdit)[]) {
    const to = edit[field];
    const from = (current as unknown as Record<string, unknown>)[field];
    if (!fieldsEqual(field, from, to)) updated.push({ store: 'entries', id, field, from, to });
  }
  return updated;
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
