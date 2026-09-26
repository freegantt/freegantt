// data/ — the batch entries.syncChanges() checks, places and diffs: the committed rows with a delta
// laid on top. Pure over what the caller hands in; it opens no transaction and commits nothing.

import { DuplicateEntryIdError, entryId } from '../model/index.js';
import type { EntryDelta, EntryId, FlatEntryInput, HierarchySource, StoredEntry } from '../model/index.js';
import { assertEntryBatchIsSound } from './entry-batch.js';
import { toEntry, toEntryAfterUpsert } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { checkHierarchyAnswers } from './hierarchy-source.js';
import type { ParentIndex, UnplacedEntry } from './hierarchy-source.js';
import { siblingIndexesAfterDelta } from './sibling-order.js';
import type { DeltaPlacement, SiblingGroupKey } from './sibling-order.js';

/** The committed rows `readBatchAfterDelta` lays a delta on top of — the three facts it reads off
 *  the store, never the store itself: the committed rows by id, the checked tree, and each group's
 *  committed member order. */
export interface CommittedEntries {
  readonly byId: ReadonlyMap<EntryId, StoredEntry>;
  readonly parents: ParentIndex;
  readonly siblingIdsOf: (group: SiblingGroupKey) => readonly EntryId[];
}

/** What `readBatchAfterDelta` hands back: the rows the delta leaves, checked and placed, and the
 *  checked tree those rows now agree with. */
export interface BatchAfterDelta {
  readonly entries: readonly StoredEntry[];
  readonly parents: ParentIndex;
  /** The Field keys the delta named, per id — the derived-values report reads only these. */
  readonly authoredKeys: ReadonlyMap<EntryId, ReadonlySet<string>>;
}

/**
 * The committed rows plus a delta, read as one batch: each upsert row read onto the entry it
 * changes or adds, each remove id's subtree dropped, the result checked sound, and every touched
 * row placed among its siblings. Pure: it reads no store and stages nothing.
 */
export function readBatchAfterDelta(
  committed: CommittedEntries,
  delta: EntryDelta,
  context: EntryReadContext,
  registry: FieldRegistry,
  hierarchySource: HierarchySource,
  operation: string,
): BatchAfterDelta {
  const upsertRows = delta.upsert ?? [];
  const removeIds = new Set((delta.remove ?? []).map((id) => entryId(id)));
  assertDeltaIsSound(upsertRows, removeIds, operation);

  const { merged, authoredKeys } = overlayUpserts(committed.byId, upsertRows, context, registry, operation);
  const upsertedIds = new Set(upsertRows.map((row) => entryId(row.id)));
  const removed = removedSubtrees(merged, removeIds, upsertedIds, hierarchySource);

  const kept = [...merged.values()].filter((row) => !removed.has(row.id));
  assertEntryBatchIsSound(kept, operation);

  const keptById = new Map<EntryId, UnplacedEntry>(kept.map((row) => [row.id, row]));
  const { parents } = checkHierarchyAnswers(keptById, hierarchySource);

  const placements = placementsFor(upsertRows, upsertedIds, keptById, parents, committed);
  const ranks = siblingIndexesAfterDelta(
    [...removed],
    placements,
    committed.siblingIdsOf,
    (id) => committed.parents.get(id),
    operation,
  );

  const entries = kept.map((row) => ({
    ...row,
    siblingIndex: ranks.get(row.id) ?? committedSiblingIndexOf(row.id, committed, operation),
  }));

  return { entries, parents, authoredKeys };
}

/** A row `siblingIndexesAfterDelta` did not rank must already be a committed row — `placementsFor`
 *  places every new row and every kept row whose checked group moved, so an unranked row is one
 *  neither, and its committed rank stands. If that invariant ever breaks, this throws a named
 *  error instead of a bare `TypeError` from a missing lookup. */
function committedSiblingIndexOf(id: EntryId, committed: CommittedEntries, operation: string): number {
  const row = committed.byId.get(id);
  if (row === undefined) {
    throw new Error(`${operation}: "${id}" has no rank and no committed row to fall back to`);
  }
  return row.siblingIndex;
}

/** An id twice in `upsert` throws (`assertEntryBatchIsSound` cannot catch this on its own: two rows
 *  for one id overlay onto a single map slot before it ever sees the list). An id in both `upsert`
 *  and `remove` throws too — a server that sends both has a bug, and picking a winner hides it. */
function assertDeltaIsSound(
  upsertRows: readonly FlatEntryInput[],
  removeIds: ReadonlySet<EntryId>,
  operation: string,
): void {
  const seen = new Set<EntryId>();
  for (const row of upsertRows) {
    const id = entryId(row.id);
    if (seen.has(id)) throw new DuplicateEntryIdError(id, operation, 'duplicate-in-list');
    seen.add(id);
    if (removeIds.has(id)) throw new DuplicateEntryIdError(id, operation, 'upsert-and-remove');
  }
}

/** The committed rows with every upsert laid on top, in upsert order: a known id takes
 *  `toEntryAfterUpsert`'s partial edit, an unknown id takes `toEntry`'s fresh read and joins the
 *  map. Also records each id's authored keys — a kept id's from `toEntryAfterUpsert`, a new id's
 *  from its own row (flat keys and nested `props` keys alike, `id` and `props` themselves excluded). */
function overlayUpserts(
  committedById: ReadonlyMap<EntryId, StoredEntry>,
  upsertRows: readonly FlatEntryInput[],
  context: EntryReadContext,
  registry: FieldRegistry,
  operation: string,
): {
  readonly merged: Map<EntryId, UnplacedEntry>;
  readonly authoredKeys: Map<EntryId, ReadonlySet<string>>;
} {
  const merged = new Map<EntryId, UnplacedEntry>(committedById);
  const authoredKeys = new Map<EntryId, ReadonlySet<string>>();
  for (const row of upsertRows) {
    const id = entryId(row.id);
    const current = merged.get(id);
    if (current !== undefined) {
      // `current` is a committed row cast down to `UnplacedEntry` when it entered `merged`; it still
      // carries `siblingIndex` at runtime, and `toEntryAfterUpsert` never touches that key.
      const reading = toEntryAfterUpsert(row, current as StoredEntry, context, registry, operation);
      merged.set(id, reading.entry);
      authoredKeys.set(id, reading.namedKeys);
    } else {
      merged.set(id, toEntry(row, context, registry, operation));
      const flatKeys = Object.keys(row as unknown as Readonly<Record<string, unknown>>);
      const nestedKeys = Object.keys(row.props ?? {});
      const keys = new Set([...flatKeys, ...nestedKeys]);
      keys.delete('id');
      keys.delete('props');
      authoredKeys.set(id, keys);
    }
  }
  return { merged, authoredKeys };
}

/** Every id a `remove` entry's subtree covers, walked over the delta's own tree (`merged`, upserts
 *  included) so a reparent inside the same delta is seen. An unknown remove id is dropped. The walk
 *  never removes, and never descends into, an upserted id — the rule `entries.remove()` follows
 *  through the hierarchy source, and what lets an upserted row whose parent is removed throw
 *  `EntryNotFoundError` through the ordinary tree check, direct parent or grandparent alike. */
function removedSubtrees(
  merged: ReadonlyMap<EntryId, UnplacedEntry>,
  removeIds: ReadonlySet<EntryId>,
  upsertedIds: ReadonlySet<EntryId>,
  hierarchySource: HierarchySource,
): ReadonlySet<EntryId> {
  if (removeIds.size === 0) return new Set<EntryId>();

  const { parents } = checkHierarchyAnswers(merged, hierarchySource);
  const childrenOf = new Map<EntryId | undefined, EntryId[]>();
  for (const id of merged.keys()) {
    const parentId = parents.get(id);
    const siblings = childrenOf.get(parentId);
    if (siblings) siblings.push(id);
    else childrenOf.set(parentId, [id]);
  }

  const removed = new Set<EntryId>();
  for (const startId of removeIds) {
    if (!merged.has(startId) || upsertedIds.has(startId)) continue;
    const pending: EntryId[] = [startId];
    for (let head = 0; head < pending.length; head += 1) {
      const id = pending[head]!;
      if (removed.has(id) || upsertedIds.has(id)) continue;
      removed.add(id);
      for (const child of childrenOf.get(id) ?? []) pending.push(child);
    }
  }
  return removed;
}

/** Every row this delta places, in the order `siblingIndexesAfterDelta` replays them: each upserted
 *  id, in upsert order, that is new, names a `siblingIndex`, or whose checked group moved; then every
 *  other kept id whose checked group moved with no edit naming it — only a hierarchy source's refused
 *  answer changing shape does that. */
function placementsFor(
  upsertRows: readonly FlatEntryInput[],
  upsertedIds: ReadonlySet<EntryId>,
  kept: ReadonlyMap<EntryId, UnplacedEntry>,
  parents: ParentIndex,
  committed: CommittedEntries,
): readonly DeltaPlacement[] {
  const placements: DeltaPlacement[] = [];
  const placed = new Set<EntryId>();

  for (const row of upsertRows) {
    const id = entryId(row.id);
    if (!kept.has(id)) continue;
    const isNew = !committed.byId.has(id);
    const reparented = !isNew && parents.get(id) !== committed.parents.get(id);
    if (!isNew && row.siblingIndex === undefined && !reparented) continue;
    placements.push({ id, group: parents.get(id), namedIndex: row.siblingIndex, isNew });
    placed.add(id);
  }

  for (const id of committed.byId.keys()) {
    if (placed.has(id) || upsertedIds.has(id) || !kept.has(id)) continue;
    if (parents.get(id) === committed.parents.get(id)) continue;
    placements.push({ id, group: parents.get(id), namedIndex: undefined, isNew: false });
  }

  return placements;
}
