// data/ — the five-stage commit pipeline (C1): body edits → extension hook → autoGroup promotion →
// rollup → fold. The only module that imports `rollup.ts` and `hierarchy.ts` on the commit path
// (`rollup-is-removable`, `autogroup-is-removable`).

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  DatasetHierarchy,
  EntityAdded,
  EntityRemoved,
  Entry,
  EntryId,
  EntryKind,
  FieldContext,
  FieldUpdated,
  StoredEdit,
  StoreRowUpdated,
} from '../model/index.js';
import { diffEdit, foldChangeSet } from './change-set.js';
import type { EditRequest, StoredEdits } from './edit-extension.js';
import { reconcileExtenderEdits } from './entry-reader.js';
import { buildEffectiveEntries } from './entry-tree.js';
import {
  mergeStoredEditsByEntry,
  overlayStoredEdit,
  proposedKeysOf,
  statesProposedKeys,
} from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { promoteNewParents } from './hierarchy.js';
import { rollUpFields } from './rollup.js';
import { isDevMode } from './dev-mode.js';

/** Staged entry-store state the commit pipeline reads — mirrors `TransactionalEntryStore` without
 *  importing `transaction.ts` (cycle avoidance). */
export interface CommitChangeSetEntryStore {
  committedById(): ReadonlyMap<EntryId, Entry>;
  pendingAdded(): readonly EntityAdded[];
  pendingRemoved(): readonly EntityRemoved[];
  pendingEdits(): StoredEdits;
}

/** Staged plugin-store state the commit pipeline reads — mirrors `TransactionalPluginStores` without
 *  importing `transaction.ts` (cycle avoidance). */
export interface CommitChangeSetPluginStores {
  pendingRows(removedEntryIds: readonly EntryId[]): readonly StoreRowUpdated[];
}

/** What `buildCommitChangeSet` reads off a transaction's staged state. */
export interface CommitChangeSetInput {
  readonly entries: CommitChangeSetEntryStore;
  readonly pluginStores: CommitChangeSetPluginStores;
  extraEditsFor(request: EditRequest): StoredEdits;
  readonly hierarchy: DatasetHierarchy;
  readonly fields: FieldRegistry;
  readonly fieldContext: FieldContext;
  readonly rollUpKinds: ReadonlySet<EntryKind>;
  nextChangeSetId(): ChangeSetId;
}

export function diffEdits(
  byId: ReadonlyMap<EntryId, Entry>,
  edits: StoredEdits,
  fields: FieldRegistry,
  ctx: FieldContext,
): FieldUpdated[] {
  const updated: FieldUpdated[] = [];
  for (const [id, edit] of edits) updated.push(...diffEdit(byId, id, edit, fields, ctx));
  return updated;
}

/** Which Fields an edit writes, however it states them: a storage key it holds, or a proposed key.
 *  `proposedKeys` is bookkeeping on the edit, never a Field, so it is not one of them (#197).
 *
 *  `meta` is the *container* a meta-sourced Field writes through, never a Field in its own right. An
 *  edit that states `proposedKeys` already names the real Field inside `meta`, so the raw loop skips
 *  `meta` for such an edit (#209) — including it unconditionally made two different meta-sourced
 *  Fields on one Entry intersect on "meta" and I4 refuse a transaction that writes no Field twice. An
 *  edit with no stated `proposedKeys` still needs the raw `meta` key, because nothing else names what
 *  it wrote. */
function fieldsWrittenBy(edit: StoredEdit): ReadonlySet<string> {
  const states = statesProposedKeys(edit);
  const keys = new Set<string>(proposedKeysOf(edit));
  for (const key of Object.keys(edit)) {
    if (key === 'proposedKeys') continue;
    if (states && key === 'meta') continue;
    keys.add(key);
  }
  return keys;
}

function guardExtensionHookDoesNotOverwriteBody(proposed: StoredEdits, extenderEdits: StoredEdits): void {
  if (!isDevMode()) return;
  for (const [id, edit] of extenderEdits) {
    const bodyEdit = proposed.get(id);
    if (!bodyEdit) continue;
    const bodyFields = fieldsWrittenBy(bodyEdit);
    for (const field of fieldsWrittenBy(edit)) {
      if (bodyFields.has(field)) {
        throw new Error(
          `buildCommitChangeSet: the extension hook proposed field "${field}" on entry "${String(id)}", ` +
            'which the transaction body already proposed (I4)',
        );
      }
    }
  }
}

/**
 * Runs the five commit stages against staged store state and returns a folded `ChangeSet`, or
 * `undefined` when the net effect is empty (D-S2-24 step 6).
 *
 * A plugin-store row counts toward "empty" exactly as a Field row does (D-S5-24, #156). Collecting the
 * rows here, rather than only where entries are diffed, is what lets a transaction whose only write is
 * a plugin row still commit: it builds a changeset, so `runTransaction` does not return early, and the
 * ordinary commit emits `change`, records one undo step, and bumps `datasetRevision` once.
 */
export function buildCommitChangeSet(
  data: CommitChangeSetInput,
  origin: ChangeOrigin,
): ChangeSet | undefined {
  const byId = data.entries.committedById();
  const proposed = data.entries.pendingEdits();
  const addedEntities = data.entries.pendingAdded();
  const removedEntities = data.entries.pendingRemoved();
  const added = addedEntities.map((row) => row.entity);
  const removed = removedEntities.map((row) => row.entity);

  const bodyUpdated = diffEdits(byId, proposed, data.fields, data.fieldContext);

  // The extender's cascade is reconciled against the state its own edit lands on — committed entries
  // overlaid with this transaction's body edits, plus the entries this transaction itself adds — not
  // against `byId` alone (#212 R2 fix-plan review, finding A). `byId` is pre-transaction: an entry the
  // body just added is absent from it, and an entry whose Segments the body just rewrote still shows
  // its old ones there, so reconciling against `byId` would restore the envelope against Segments the
  // commit is about to replace.
  const effectiveForExtender = buildEffectiveEntries(byId, added, removed, proposed);
  // The hook is judged against `effectiveForExtender` above, so it must be able to read that same
  // state, not just `byId` (D-S5-45) — `entryAfterEdits` is that map's own `.get`, already built for
  // reconciliation, so this costs nothing extra at commit.
  const extenderEdits = reconcileExtenderEdits(
    effectiveForExtender,
    data.extraEditsFor({
      entries: byId,
      proposed,
      entryAfterEdits: (id) => effectiveForExtender.get(id),
    }),
  );
  guardExtensionHookDoesNotOverwriteBody(proposed, extenderEdits);
  const extenderUpdated = diffEdits(byId, extenderEdits, data.fields, data.fieldContext);

  const mergedBodyAndExtender = mergeStoredEditsByEntry(proposed, extenderEdits);
  const hierarchyEdits = promoteNewParents(
    byId,
    { added, removed, edits: mergedBodyAndExtender },
    data.hierarchy,
  );
  const hierarchyUpdated = diffEdits(byId, hierarchyEdits, data.fields, data.fieldContext);

  // An added entity folds in its own extender cascade too, not only its hierarchy promotion — an
  // `EditExtender` that rewrites `segments` on an entity this same transaction adds must still land
  // on the entity the changeset publishes (#212 R2 fix-plan review, finding A): the earlier code here
  // overlaid `hierarchyEdits` alone, so a reconciled extender edit for a same-transaction add computed
  // a correct `StoredEdit` upstream but never reached the stored entity.
  const extraEditsForAdded = mergeStoredEditsByEntry(extenderEdits, hierarchyEdits);
  const addedEntitiesForFold =
    extraEditsForAdded.size === 0
      ? addedEntities
      : addedEntities.map((row) => {
          const extra = extraEditsForAdded.get(row.entity.id);
          return extra === undefined ? row : { ...row, entity: overlayStoredEdit(row.entity, extra) };
        });

  const rollupUpdated = rollUpFields(
    byId,
    {
      added: addedEntitiesForFold.map((row) => row.entity),
      removed,
      edits: { body: proposed, merged: mergeStoredEditsByEntry(mergedBodyAndExtender, hierarchyEdits) },
    },
    data.fields,
    data.rollUpKinds,
    data.fieldContext,
  );

  // Removing an entry removes its plugin rows in the same changeset, so the removed ids go in here.
  const pluginRows = data.pluginStores.pendingRows(removed.map((entry) => entry.id));

  return foldChangeSet(data.nextChangeSetId(), origin, addedEntitiesForFold, removedEntities, [
    ...bodyUpdated,
    ...extenderUpdated,
    ...hierarchyUpdated,
    ...rollupUpdated,
    ...pluginRows,
  ]);
}
