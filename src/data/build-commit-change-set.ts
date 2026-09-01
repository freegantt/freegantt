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
} from '../model/index.js';
import { diffEdit, foldChangeSet } from './change-set.js';
import type { EditExtender, EntryEdits } from './edit-extension.js';
import { mergeEntryEdits, overlayStoredEdit } from './fields/field-access.js';
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
  pendingEdits(): EntryEdits;
}

/** What `buildCommitChangeSet` reads off a transaction's staged state. */
export interface CommitChangeSetInput {
  readonly entries: CommitChangeSetEntryStore;
  readonly editExtender: EditExtender;
  readonly hierarchy: DatasetHierarchy;
  readonly fields: FieldRegistry;
  readonly fieldContext: FieldContext;
  readonly rollUpKinds: ReadonlySet<EntryKind>;
  nextChangeSetId(): ChangeSetId;
}

export function diffEdits(
  byId: ReadonlyMap<EntryId, Entry>,
  edits: EntryEdits,
  fields: FieldRegistry,
  ctx: FieldContext,
): FieldUpdated[] {
  const updated: FieldUpdated[] = [];
  for (const [id, edit] of edits) updated.push(...diffEdit(byId, id, edit, fields, ctx));
  return updated;
}

function guardExtensionHookDoesNotOverwriteBody(proposed: EntryEdits, extenderEdits: EntryEdits): void {
  if (!isDevMode()) return;
  for (const [id, edit] of extenderEdits) {
    const bodyEdit = proposed.get(id);
    if (!bodyEdit) continue;
    for (const field of Object.keys(edit)) {
      if (field in bodyEdit) {
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

  const extenderEdits = data.editExtender({ entries: byId, proposed });
  guardExtensionHookDoesNotOverwriteBody(proposed, extenderEdits);
  const extenderUpdated = diffEdits(byId, extenderEdits, data.fields, data.fieldContext);

  const mergedBodyAndExtender = mergeEntryEdits(proposed, extenderEdits);
  const hierarchyEdits = promoteNewParents(
    byId,
    { added, removed, edits: mergedBodyAndExtender },
    data.hierarchy,
  );
  const hierarchyUpdated = diffEdits(byId, hierarchyEdits, data.fields, data.fieldContext);

  const addedEntitiesForFold =
    hierarchyEdits.size === 0
      ? addedEntities
      : addedEntities.map((row) => {
          const extra = hierarchyEdits.get(row.entity.id);
          return extra === undefined ? row : { ...row, entity: overlayStoredEdit(row.entity, extra) };
        });

  const rollupUpdated = rollUpFields(
    byId,
    {
      added: addedEntitiesForFold.map((row) => row.entity),
      removed,
      edits: { body: proposed, merged: mergeEntryEdits(mergedBodyAndExtender, hierarchyEdits) },
    },
    data.fields,
    data.rollUpKinds,
    data.fieldContext,
  );

  return foldChangeSet(data.nextChangeSetId(), origin, addedEntitiesForFold, removedEntities, [
    ...bodyUpdated,
    ...extenderUpdated,
    ...hierarchyUpdated,
    ...rollupUpdated,
  ]);
}
