// data/ — autoGroup promotion: a `'span'` that gains its first child becomes `'group'` in the same
// commit (D-S4-17). A leaf — only `data/build-commit-change-set.ts` (commit path) and
// `data/transaction.ts` (construction path) name it (`autogroup-is-removable`); delete this file and
// autoGroup never runs — the consumer must set Kind themselves (D-S4-18).

import type { DatasetHierarchy, Entry, EntryId, StoredEdit, StoredEdits } from '../model/index.js';
import { buildEffectiveEntries, childCountByParent } from './entry-tree.js';

const EMPTY_EDITS: StoredEdits = Object.freeze(new Map());

/** Adds, removes and overlays the commit path has not written yet. Construction omits this. */
export interface PendingHierarchy {
  readonly added: readonly Entry[];
  readonly removed: readonly Entry[];
  readonly edits: StoredEdits;
}

function kindIsProposed(edits: StoredEdits, id: EntryId): boolean {
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
): StoredEdits {
  if (!hierarchy.autoGroup) return EMPTY_EDITS;

  const effective =
    proposed === undefined
      ? entries
      : buildEffectiveEntries(entries, proposed.added, proposed.removed, proposed.edits);

  const committedCounts =
    proposed === undefined ? childCountByParent(effective) : childCountByParent(entries);

  const result = new Map<EntryId, StoredEdit>();
  const seen = new Set<EntryId>();
  for (const entry of effective.values()) {
    const parentId = entry.parentId;
    if (parentId === undefined || seen.has(parentId)) continue;
    seen.add(parentId);

    const parent = effective.get(parentId);
    if (!parent || parent.kind !== 'span') continue;
    if (proposed !== undefined && (committedCounts.get(parentId) ?? 0) !== 0) continue;
    if (proposed !== undefined && kindIsProposed(proposed.edits, parentId)) continue;

    result.set(parentId, { kind: 'group' });
  }
  return result.size === 0 ? EMPTY_EDITS : result;
}
