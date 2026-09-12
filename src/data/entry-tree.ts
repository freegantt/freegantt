// data/ — shared entry-tree helpers for hierarchy and rollup passes (S4 review C2).

import type { HierarchySource, StoredEntry, EntryId, ProposedEdits } from '../model/index.js';
import { entryAfterEdit } from './fields/field-access.js';
import { parentIdFrom } from './hierarchy-source.js';

export function buildEffectiveEntries(
  committed: ReadonlyMap<EntryId, StoredEntry>,
  added: readonly StoredEntry[],
  removed: readonly StoredEntry[],
  proposed: ProposedEdits,
): ReadonlyMap<EntryId, StoredEntry> {
  const map = new Map(committed);
  for (const entry of removed) map.delete(entry.id);
  for (const entry of added) map.set(entry.id, entry);
  for (const [id, edit] of proposed) {
    const current = map.get(id);
    if (current) map.set(id, entryAfterEdit(current, edit));
  }
  return map;
}

/** The entries `ids` names, as this transaction's body leaves them. Builds one entry per named id
 *  instead of copying the whole dataset, because the drag preview runs this on every frame and the
 *  hot path allocates only what it uses (I5). `buildEffectiveEntries` above stays the commit path's
 *  form: a commit must also apply `added` and `removed`, which a per-id read cannot see. */
export function effectiveEntriesFor(
  committed: ReadonlyMap<EntryId, StoredEntry>,
  proposed: ProposedEdits,
  ids: Iterable<EntryId>,
): ReadonlyMap<EntryId, StoredEntry> {
  const map = new Map<EntryId, StoredEntry>();
  for (const id of ids) {
    const current = committed.get(id);
    if (current === undefined) continue;
    const edit = proposed.get(id);
    map.set(id, edit === undefined ? current : entryAfterEdit(current, edit));
  }
  return map;
}

/** `id` as `proposed` leaves it, without allocating a map to answer it — `EditRequest.entryAfterEdits`
 *  (D-S5-45)'s own implementation for a preview frame, where `effectiveEntriesFor` above (built for a
 *  named few ids at once) would still allocate a one-entry `Map` on every call. `entryAfterEdit`
 *  itself allocates only when `id` actually has an edit pending. */
export function entryAfterEdits(
  committed: ReadonlyMap<EntryId, StoredEntry>,
  proposed: ProposedEdits,
  id: EntryId,
): StoredEntry | undefined {
  const current = committed.get(id);
  if (current === undefined) return undefined;
  const edit = proposed.get(id);
  return edit === undefined ? current : entryAfterEdit(current, edit);
}

/** Every walk below asks `parentIdOf` which Entry is the parent (ADR 0020), never `entry.parentId`
 *  — core's own source answers that field, and a plugin's source answers something else. Hand these
 *  a **checked** source (`checkHierarchyAnswers`): a chain that loops never terminates otherwise. */
export function childIdsByParent(
  entries: ReadonlyMap<EntryId, StoredEntry>,
  parentIdOf: HierarchySource,
): Map<EntryId, EntryId[]> {
  const byParent = new Map<EntryId, EntryId[]>();
  for (const entry of entries.values()) {
    const parentId = parentIdFrom(parentIdOf, entry);
    if (parentId === undefined) continue;
    const siblings = byParent.get(parentId);
    if (siblings) siblings.push(entry.id);
    else byParent.set(parentId, [entry.id]);
  }
  return byParent;
}

export function depthOf(
  id: EntryId,
  entries: ReadonlyMap<EntryId, StoredEntry>,
  parentIdOf: HierarchySource,
): number {
  let depth = 0;
  let current = entries.get(id);
  let parentId = current === undefined ? undefined : parentIdFrom(parentIdOf, current);
  while (parentId !== undefined) {
    depth += 1;
    current = entries.get(parentId);
    parentId = current === undefined ? undefined : parentIdFrom(parentIdOf, current);
  }
  return depth;
}

export function ancestorsOf(
  id: EntryId,
  entries: ReadonlyMap<EntryId, StoredEntry>,
  parentIdOf: HierarchySource,
): readonly EntryId[] {
  const result: EntryId[] = [];
  let current = entries.get(id);
  let parentId = current === undefined ? undefined : parentIdFrom(parentIdOf, current);
  while (parentId !== undefined) {
    result.push(parentId);
    current = entries.get(parentId);
    parentId = current === undefined ? undefined : parentIdFrom(parentIdOf, current);
  }
  return result;
}
