// data/ — autoGroup promotion: a `'span'` that gains its first child becomes `'group'` in the same
// commit (D-S4-17). A leaf — only `data/transaction.ts` names it (`autogroup-is-removable`); delete
// this file and autoGroup never runs — the consumer must set Kind themselves (D-S4-18).

import type { DatasetHierarchy, Entry, EntryEdits, EntryId, StoredEdit } from '../model/index.js';
import { overlayStoredEdit } from './fields/field-access.js';

const EMPTY_EDITS: EntryEdits = Object.freeze(new Map());

/** Adds, removes and overlays the commit path has not written yet. Construction omits this. */
export interface PendingHierarchy {
  readonly added: readonly Entry[];
  readonly removed: readonly Entry[];
  readonly edits: EntryEdits;
}

function buildEffectiveEntries(
  committed: ReadonlyMap<EntryId, Entry>,
  added: readonly Entry[],
  removed: readonly Entry[],
  proposed: EntryEdits,
): ReadonlyMap<EntryId, Entry> {
  const map = new Map(committed);
  for (const entity of removed) map.delete(entity.id);
  for (const entity of added) map.set(entity.id, entity);
  for (const [id, edit] of proposed) {
    const current = map.get(id);
    if (current) map.set(id, overlayStoredEdit(current, edit));
  }
  return map;
}

function childCount(parentId: EntryId, entries: ReadonlyMap<EntryId, Entry>): number {
  let count = 0;
  for (const entry of entries.values()) {
    if (entry.parentId === parentId) count += 1;
  }
  return count;
}

function kindIsProposed(edits: EntryEdits, id: EntryId): boolean {
  const edit = edits.get(id);
  return edit !== undefined && 'kind' in edit;
}

/**
 * Call: `promoteNewParents(committed, pending, dataset.hierarchy)`.
 * Returns `{ kind: 'group' }` edits for each `'span'` that just gained its first child.
 * Construction passes `proposed` as `undefined` and promotes every `'span'` that already has children.
 */
export function promoteNewParents(
  entries: ReadonlyMap<EntryId, Entry>,
  proposed: PendingHierarchy | undefined,
  hierarchy: DatasetHierarchy,
): EntryEdits {
  if (!hierarchy.autoGroup) return EMPTY_EDITS;

  const effective =
    proposed === undefined
      ? entries
      : buildEffectiveEntries(entries, proposed.added, proposed.removed, proposed.edits);

  const result = new Map<EntryId, StoredEdit>();
  const seen = new Set<EntryId>();
  for (const entry of effective.values()) {
    const parentId = entry.parentId;
    if (parentId === undefined || seen.has(parentId)) continue;
    seen.add(parentId);

    const parent = effective.get(parentId);
    if (!parent || parent.kind !== 'span') continue;
    if (childCount(parentId, effective) === 0) continue;
    if (proposed !== undefined && childCount(parentId, entries) !== 0) continue;
    if (proposed !== undefined && kindIsProposed(proposed.edits, parentId)) continue;

    result.set(parentId, { kind: 'group' });
  }
  return result.size === 0 ? EMPTY_EDITS : result;
}
