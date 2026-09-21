// data/ — the one place an `EditRequest` is built (#466). `build-commit-change-set.ts` (commit path)
// and `view/gesture-pipeline.ts` (preview path, through `api/dataset.ts`'s `extraEditsFor`) both call
// this instead of hand-building the object, so the two paths cannot answer `hasChildren`/`writeTarget`
// two different ways.

import { entryId } from '../model/index.js';
import type {
  EditRequest,
  EntryId,
  FieldKey,
  FieldLookup,
  HierarchySource,
  ProposedEdits,
  StoredEntry,
  WriteTarget,
} from '../model/index.js';
import { EMPTY_ENTRY_IDS } from './edit-extension.js';
import {
  buildEffectiveEntries,
  childIdsByParent,
  commitMovesNoRow,
  entryAfterEdits as effectiveEntryAt,
  parentIdIn,
} from './entry-tree.js';
import { entryAfterEdit } from './fields/field-access.js';
import { checkHierarchyAnswers, storedParentSource } from './hierarchy-source.js';
import { resolveWriteTarget } from './write-rule.js';

export interface CreateEditRequestOptions {
  readonly entries: ReadonlyMap<EntryId, StoredEntry>;
  readonly proposed: ProposedEdits;
  readonly added: readonly StoredEntry[];
  readonly removed: readonly StoredEntry[];
  readonly hierarchySource: HierarchySource;
  /** The store's own committed child index (`EntryStore.committedChildIds()`) — read back, never
   *  re-derived, on the commit that `commitMovesNoRow` proves cannot have moved a row (#421 C4). */
  readonly committedChildIds: ReadonlyMap<EntryId, readonly EntryId[]>;
  readonly fields: FieldLookup;
}

/** Builds the object `EditExtender` reads (D4, D-S2-6). The effective child index `hasChildren` and
 *  `writeTarget` both need is built lazily, on the first call that needs it, and never before — a
 *  preview frame that asks neither allocates nothing (I5). It shares `rollup.ts`'s own "this commit
 *  moves no row" shortcut (#421 C4, `entry-tree.ts`'s `commitMovesNoRow`) rather than repeating it:
 *  when nothing added, removed or reparented under core's own hierarchy source, the store's committed
 *  index already holds the answer, and no `Map` is walked to reach it. */
export function createEditRequest(options: CreateEditRequestOptions): EditRequest {
  const { entries, proposed, added, removed, hierarchySource, committedChildIds, fields } = options;

  const addedEntryIds = added.length === 0 ? EMPTY_ENTRY_IDS : new Set(added.map((entry) => entry.id));
  const removedEntryIds = removed.length === 0 ? EMPTY_ENTRY_IDS : new Set(removed.map((entry) => entry.id));
  const addedById =
    added.length === 0 ? undefined : new Map(added.map((entry) => [entry.id, entry] as const));

  let byParent: ReadonlyMap<EntryId, readonly EntryId[]> | undefined;
  function effectiveChildIds(): ReadonlyMap<EntryId, readonly EntryId[]> {
    if (byParent !== undefined) return byParent;
    const stillAnswers = hierarchySource === storedParentSource && commitMovesNoRow(added, removed, proposed);
    if (stillAnswers) {
      byParent = committedChildIds;
    } else {
      const effectiveEntries = buildEffectiveEntries(entries, added, removed, proposed);
      const parentOf = parentIdIn(checkHierarchyAnswers(effectiveEntries, hierarchySource).parents);
      byParent = childIdsByParent(effectiveEntries, parentOf);
    }
    return byParent;
  }

  function entryAfterEdits(id: EntryId | string): StoredEntry | undefined {
    const asId = entryId(id);
    if (removedEntryIds.has(asId)) return undefined;
    if (entries.has(asId)) return effectiveEntryAt(entries, proposed, asId);
    const addedEntry = addedById?.get(asId);
    if (addedEntry === undefined) return undefined;
    const edit = proposed.get(asId);
    return edit === undefined ? addedEntry : entryAfterEdit(addedEntry, edit);
  }

  function hasChildren(id: EntryId | string): boolean {
    return (effectiveChildIds().get(entryId(id))?.length ?? 0) > 0;
  }

  /** The resolver's own answer, unchanged — no fourth value and no reinterpretation, because
   *  `entries.update()` and `view/capability.ts` already ask it and a third reader must not
   *  disagree with them (I14). An undeclared key is the resolver's case to answer, not this
   *  function's. */
  function writeTarget(id: EntryId | string, field: FieldKey): WriteTarget {
    return resolveWriteTarget(hasChildren(id), fields.get(field));
  }

  return {
    entries,
    proposed,
    entryAfterEdits,
    addedEntryIds,
    removedEntryIds,
    hasChildren,
    writeTarget,
  };
}
