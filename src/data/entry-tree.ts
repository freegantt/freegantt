// data/ — shared entry-tree helpers for hierarchy and rollup passes (S4 review C2).

import type { Entry, EntryId, StoredEdits } from '../model/index.js';
import { overlayStoredEdit } from './fields/field-access.js';

export function buildEffectiveEntries(
  committed: ReadonlyMap<EntryId, Entry>,
  added: readonly Entry[],
  removed: readonly Entry[],
  proposed: StoredEdits,
): ReadonlyMap<EntryId, Entry> {
  const map = new Map(committed);
  for (const entry of removed) map.delete(entry.id);
  for (const entry of added) map.set(entry.id, entry);
  for (const [id, edit] of proposed) {
    const current = map.get(id);
    if (current) map.set(id, overlayStoredEdit(current, edit));
  }
  return map;
}

/** The entries `ids` names, as this transaction's body leaves them. Builds one entry per named id
 *  instead of copying the whole dataset, because the drag preview runs this on every frame and the
 *  hot path allocates only what it uses (I5). `buildEffectiveEntries` above stays the commit path's
 *  form: a commit must also apply `added` and `removed`, which a per-id read cannot see. */
export function effectiveEntriesFor(
  committed: ReadonlyMap<EntryId, Entry>,
  proposed: StoredEdits,
  ids: Iterable<EntryId>,
): ReadonlyMap<EntryId, Entry> {
  const map = new Map<EntryId, Entry>();
  for (const id of ids) {
    const current = committed.get(id);
    if (current === undefined) continue;
    const edit = proposed.get(id);
    map.set(id, edit === undefined ? current : overlayStoredEdit(current, edit));
  }
  return map;
}

/** `id` as `proposed` leaves it, without allocating a map to answer it — `EditRequest.entryAfterEdits`
 *  (D-S5-45)'s own implementation for a preview frame, where `effectiveEntriesFor` above (built for a
 *  named few ids at once) would still allocate a one-entry `Map` on every call. `overlayStoredEdit`
 *  itself allocates only when `id` actually has an edit pending. */
export function entryAfterEdits(
  committed: ReadonlyMap<EntryId, Entry>,
  proposed: StoredEdits,
  id: EntryId,
): Entry | undefined {
  const current = committed.get(id);
  if (current === undefined) return undefined;
  const edit = proposed.get(id);
  return edit === undefined ? current : overlayStoredEdit(current, edit);
}

export function childIdsByParent(entries: ReadonlyMap<EntryId, Entry>): Map<EntryId, EntryId[]> {
  const byParent = new Map<EntryId, EntryId[]>();
  for (const entry of entries.values()) {
    if (entry.parentId === undefined) continue;
    const siblings = byParent.get(entry.parentId);
    if (siblings) siblings.push(entry.id);
    else byParent.set(entry.parentId, [entry.id]);
  }
  return byParent;
}

export function childCountByParent(entries: ReadonlyMap<EntryId, Entry>): Map<EntryId, number> {
  const counts = new Map<EntryId, number>();
  for (const entry of entries.values()) {
    if (entry.parentId === undefined) continue;
    counts.set(entry.parentId, (counts.get(entry.parentId) ?? 0) + 1);
  }
  return counts;
}

export function depthOf(id: EntryId, entries: ReadonlyMap<EntryId, Entry>): number {
  let depth = 0;
  let current = entries.get(id);
  while (current?.parentId !== undefined) {
    depth += 1;
    current = entries.get(current.parentId);
  }
  return depth;
}

export function ancestorsOf(id: EntryId, entries: ReadonlyMap<EntryId, Entry>): readonly EntryId[] {
  const result: EntryId[] = [];
  let current = entries.get(id)?.parentId;
  while (current !== undefined) {
    result.push(current);
    current = entries.get(current)?.parentId;
  }
  return result;
}
