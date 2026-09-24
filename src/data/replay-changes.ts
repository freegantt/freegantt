// data/ — the pure diff behind undo, redo and `dataset.replay()` (#517 amendment, ADR 0035): a
// recorded `ChangeSet` no longer applies blind. It applies onto the store's current values, the same
// way `entries.sync()` overwrites a local edit the server has not seen. A sync between the step's
// recording and its replay leaves rows that no longer match what they last wrote; this file decides,
// row by row, what still has something to write and what a sync has already settled. It also keeps
// the tree sound: a row that would land a raw `parentId` loop or a dangling one is dropped instead,
// never stored and never raised. Every sibling group the step touches replays dense, 0..n-1, the same
// math `buildCommitChangeSet` runs on a live write.

import type {
  ChangeSet,
  EntityAdded,
  EntityRemoved,
  EntryId,
  FieldUpdated,
  StoredEntry,
  StoreRowUpdated,
  UpdatedRow,
} from '../model/index.js';
import { mergeUpdatedRows } from './change-set.js';
import { applyFieldRow, readFieldRow } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { checkHierarchyAnswers } from './hierarchy-source.js';
import type { ParentIndex } from './hierarchy-source.js';
import { renumberSiblingGroups } from './sibling-order.js';
import type { SiblingChange, SiblingPlacement } from './sibling-order.js';
import { rollUpFreshBatch } from './transaction.js';
import type { TransactionalPluginStores, TransactionData } from './transaction.js';

/** Drops `entity.parentId`, the way `applyFieldRow` drops an optional key an edit clears: no stored
 *  key at all, never a key holding `undefined` (`exactOptionalPropertyTypes`). */
function asRoot(entity: StoredEntry): StoredEntry {
  const next: Record<string, unknown> = { ...entity };
  delete next['parentId'];
  return next as unknown as StoredEntry;
}

/** An `added` row whose id already exists is skipped — the server's re-sent copy stays. Runs after
 *  `recordedRowsToReplay`, the same order `EntryStore.endTransaction` applies a changeset in: a
 *  replace's own `removed` row clears the slot first, so its `added` row lands instead of being read
 *  as "still there, must be a sync." Every kept row lands on `working` before any of them is judged
 *  for its parent — a subtree remove's own `added` rows recorded a child before its parent (the order
 *  the cascade removed them in), and judging row by row would root that child, reading its own soon-
 *  to-be-restored parent as "still missing."
 *
 *  A kept entity whose `parentId` names an id absent from `working`, once every kept row has landed,
 *  lands as a root instead: the server removed that parent since the step was recorded, and a
 *  re-added entity has no place of its own to fall back to, unlike an existing entry a dropped
 *  `parentId` row simply leaves where it was. This never throws — `#assertParentValid`'s door onto a
 *  live store is `EntryStore.add`/`update`, neither of which replay calls. */
function addedRowsToReplay(
  rows: readonly EntityAdded[],
  working: Map<EntryId, StoredEntry>,
): readonly EntityAdded[] {
  const kept = rows.filter((row) => !working.has(row.entity.id));
  for (const row of kept) working.set(row.entity.id, row.entity);
  return kept.map((row) => {
    if (row.entity.parentId === undefined || working.has(row.entity.parentId)) return row;
    const entity = asRoot(row.entity);
    working.set(entity.id, entity);
    return { ...row, entity };
  });
}

/** A `removed` row whose id is already gone is skipped. A kept row removes the entity as `working`
 *  holds it now — no cascade here: which descendant this step also carries away is not settled until
 *  every `added` row, every `parentId` row and the loop check have all landed. `cascadeIdsToReplay`
 *  runs later, over that final tree. */
function recordedRowsToReplay(
  rows: readonly EntityRemoved[],
  working: Map<EntryId, StoredEntry>,
): readonly EntityRemoved[] {
  const removed: EntityRemoved[] = [];
  for (const row of rows) {
    const entity = working.get(row.entity.id);
    if (!entity) continue; // already gone
    removed.push({ store: 'entries', entity });
    working.delete(row.entity.id);
  }
  return removed;
}

/** Every id still in `working` whose raw `parentId` chain reaches a `removed` id, read from the
 *  step's finished tree — after every `added` row, every `parentId` row and the loop check have all
 *  landed — rather than the committed one. An id this same step reparents away from a removed
 *  ancestor, in the very row that named the removal, never cascades: it already carries a new, sound
 *  parent by the time this walk runs, the same reach `entries.remove()` gives a live write. A
 *  descendant of a descendant cascades too, one level at a time; a cascaded id's own child sees its
 *  parent already gone from `working` by the time this walk reaches it, so it cascades next. */
function cascadeIdsToReplay(
  working: Map<EntryId, StoredEntry>,
  removedIds: ReadonlySet<EntryId>,
): { readonly removed: readonly EntityRemoved[]; readonly cascadeIds: readonly EntryId[] } {
  const childrenOf = new Map<EntryId, EntryId[]>();
  for (const [id, entity] of working) {
    if (entity.parentId === undefined) continue;
    const siblings = childrenOf.get(entity.parentId);
    if (siblings) siblings.push(id);
    else childrenOf.set(entity.parentId, [id]);
  }

  const removed: EntityRemoved[] = [];
  const cascadeIds: EntryId[] = [];
  const seen = new Set<EntryId>(removedIds);
  const pending: EntryId[] = [...removedIds];
  while (pending.length > 0) {
    for (const childId of childrenOf.get(pending.pop()!) ?? []) {
      if (seen.has(childId)) continue;
      seen.add(childId);
      const entity = working.get(childId);
      if (!entity) continue; // defensive: already gone
      removed.push({ store: 'entries', entity });
      working.delete(childId);
      cascadeIds.push(childId);
      pending.push(childId);
    }
  }
  return { removed, cascadeIds };
}

/** Every id this step relocates within or across a sibling group, paired for `renumberSiblingGroups`:
 *  an added entity (`at` is its snapshot rank), a kept `siblingIndex` row (`at` is the row's `to`), or
 *  an id whose checked parent — read post-cascade, off `working`'s own settled `parentId` — no longer
 *  matches the group it was committed under (`at` is its unchanged rank, the nearest sound slot in the
 *  new group). Read after the cascade, so a removed id neither departs from nor places into a group
 *  this step is still deciding: `removedIds` already names it, and a departure is all it gets. No
 *  departure for an added id — it has no committed group to leave. An added id the cascade then
 *  carries away in the same step never places either: `working` no longer holds it, `removedIds`
 *  already does, and that departure is all it gets. */
function siblingChangesToReplay(
  working: ReadonlyMap<EntryId, StoredEntry>,
  addedIds: ReadonlySet<EntryId>,
  removedIds: ReadonlySet<EntryId>,
  keptSiblingIndexRows: ReadonlyMap<EntryId, number>,
  checkedParents: ParentIndex,
  committedParents: ParentIndex,
): readonly SiblingChange[] {
  const placedIds: EntryId[] = [];
  const placed = new Set<EntryId>();
  const place = (id: EntryId): void => {
    if (placed.has(id)) return;
    placed.add(id);
    placedIds.push(id);
  };
  for (const id of addedIds) if (working.has(id)) place(id);
  for (const id of keptSiblingIndexRows.keys()) if (working.has(id)) place(id);
  for (const id of working.keys()) {
    if (addedIds.has(id) || checkedParents.get(id) === committedParents.get(id)) continue;
    place(id);
  }

  const departures: SiblingChange[] = [];
  for (const id of removedIds) departures.push({ id });
  for (const id of placedIds) if (!addedIds.has(id)) departures.push({ id });

  const placements: SiblingPlacement[] = placedIds.map((id) => {
    const entity = working.get(id)!;
    return { id, group: checkedParents.get(id), at: keptSiblingIndexRows.get(id) ?? entity.siblingIndex };
  });
  placements.sort((a, b) => a.at - b.at);

  return [...departures, ...placements];
}

/** A Field row for an id gone after the replay, or whose current value already equals `to`
 *  (`registry.valuesEqual`), is skipped. A `parentId` row naming a target absent from `working` is
 *  skipped too — the entry stays under its current parent, the nearest sound place available, and
 *  this never raises: `change` carries exactly what still applies (§2b's skip rule extended to
 *  hierarchy). Every other `parentId` row lands, even one that provisionally makes two rows in the
 *  same step look like each other's ancestor — `revertLoopingParentRows` judges the whole step's rows
 *  together, once every one of them has landed, never one row against the others' unwritten state.
 *  Every other kind of row overwrites: `from` is the value `working` holds now, never the recorded
 *  `from`. A kept row lands back on `working`, so a duplicate row for the same id and Field diffs
 *  against what this step already wrote. */
function fieldRowToReplay(
  row: FieldUpdated,
  working: Map<EntryId, StoredEntry>,
  registry: FieldRegistry,
  access: FieldAccess,
): FieldUpdated | undefined {
  const current = working.get(row.id);
  if (!current) return undefined;
  if (row.field === 'parentId' && row.to !== undefined && !working.has(row.to as EntryId)) {
    return undefined;
  }
  const from = readFieldRow(current, row.field, registry, access);
  if (registry.valuesEqual(row.field, from, row.to)) return undefined;
  working.set(row.id, applyFieldRow(current, row.field, row.to, registry));
  return { store: 'entries', id: row.id, field: row.field, from, to: row.to };
}

/** Every id whose raw `parentId` chain in `working` loops back onto itself, self-parenting included —
 *  the same walk `entry-batch.ts`'s `cycleMemberIds` runs over a whole-list write's own batch, run
 *  here over the batch this replay is building instead. */
function loopedIds(working: ReadonlyMap<EntryId, StoredEntry>): ReadonlySet<EntryId> {
  const settled = new Set<EntryId>();
  const visiting = new Set<EntryId>();
  const members = new Set<EntryId>();

  for (const startId of working.keys()) {
    if (settled.has(startId)) continue;
    const chain: EntryId[] = [];
    let current: EntryId | undefined = startId;
    while (current !== undefined && !settled.has(current) && !visiting.has(current)) {
      visiting.add(current);
      chain.push(current);
      current = working.get(current)?.parentId;
    }
    // `current` is still in this walk's own `visiting` set, so the chain arrived back at an id it
    // already passed — everything from that id to the end of the chain is one loop.
    if (current !== undefined && visiting.has(current)) {
      const loopStart = chain.indexOf(current);
      for (const id of chain.slice(loopStart)) members.add(id);
    }
    for (const id of chain) {
      visiting.delete(id);
      settled.add(id);
    }
  }
  return members;
}

/** Judges the whole step's `parentId` rows together, after every one of them has already landed on
 *  `working` (`fieldRowToReplay` only refuses a row whose target is missing outright, not one that
 *  provisionally loops with another row from the same step). A loop left standing is broken one row
 *  at a time: revert this step's own row that closes it, back to the value it held before this step
 *  touched it, then look again — until none is left. With no foreign write between the step's
 *  recording and its replay, the tree these rows rebuild is one the store already held committed, so
 *  there is nothing left to revert (`loopedIds` finds nothing, and the loop below never runs).
 *
 *  Returns the ids whose `parentId` row was reverted — `changesToReplay` drops that row from the
 *  changeset it emits, the same way a dangling target already does. */
function revertLoopingParentRows(
  working: Map<EntryId, StoredEntry>,
  registry: FieldRegistry,
  parentIdRows: ReadonlyMap<EntryId, FieldUpdated>,
): ReadonlySet<EntryId> {
  const remaining = new Map(parentIdRows);
  const reverted = new Set<EntryId>();
  for (;;) {
    const looped = loopedIds(working);
    if (looped.size === 0) return reverted;
    const closingId = [...looped].find((id) => remaining.has(id));
    if (closingId === undefined) return reverted; // defensive: this pass never meets a foreign loop
    const row = remaining.get(closingId)!;
    working.set(closingId, applyFieldRow(working.get(closingId)!, 'parentId', row.from, registry));
    remaining.delete(closingId);
    reverted.add(closingId);
  }
}

/** A store row that writes a value (`to` is not `undefined`) for an entity gone after the replay is
 *  dropped — no orphan rows. A deletion row (`to` is `undefined`) is judged by the store alone: it
 *  applies whenever the store still holds something to delete, entity gone or not — the step recorded
 *  that deletion row beside the entry's `removed` row, applied the same way whether that entity is
 *  still there to carry it. Otherwise both kinds read the store's own committed value fresh
 *  (`committedRow`) and overwrite the same way a Field row does; an identical value writes nothing. */
function storeRowToReplay(
  row: StoreRowUpdated,
  working: ReadonlyMap<EntryId, StoredEntry>,
  pluginStores: TransactionalPluginStores,
): StoreRowUpdated | undefined {
  const from = pluginStores.committedRow(row.store, row.id);
  if (row.to === undefined)
    return from === undefined ? undefined : { store: row.store, id: row.id, from, to: undefined };
  if (!working.has(row.id)) return undefined;
  if (Object.is(from, row.to)) return undefined;
  return { store: row.store, id: row.id, from, to: row.to };
}

/**
 * The changes that replaying `changeSet` still has to write, onto `data`'s current committed rows —
 * "the changes to replay." `undefined` when nothing is left to write, the same as an empty recorded
 * `ChangeSet`: no `beforeChange`, no `change`.
 *
 * Recorded rows keep the order `changeSet` gave them. A cascade's extra `removed` rows and their
 * plugin-store rows are appended after, never interleaved with the rows the step itself named.
 *
 * Judges the step's recorded `removed` rows first, then `added`, then `updated` — the same order
 * `EntryStore.endTransaction` applies a committed changeset in. A replace (a remove and a re-add of
 * one id) names that id in both `removed` and `added`; judging `removed` first clears the slot before
 * `added` asks whether the id is already there, so a replace's own pair never reads as "the server got
 * here first." The cascade itself judges last, once `added`, `updated` and the loop check have all
 * landed on `working` — only then does the step's own tree say which surviving id still hangs off a
 * removed one. The renumber pass judges last of all, once the cascade has settled who is even still
 * in the tree.
 *
 * Call: `changesToReplay(data, invertChangeSet(step))` (undo), `changesToReplay(data, { ...step,
 * origin: 'redo' })` (redo), or `changesToReplay(data, changeSet)` (`dataset.replay`).
 */
export function changesToReplay(data: TransactionData, changeSet: ChangeSet): ChangeSet | undefined {
  const working = new Map(data.entries.committedById());

  const recordedRemoved = recordedRowsToReplay(changeSet.removed, working);
  const added = addedRowsToReplay(changeSet.added, working);

  const updated: UpdatedRow[] = [];
  const parentIdRows = new Map<EntryId, FieldUpdated>();
  // A `siblingIndex` row is the renumber pass's own to write, below, never the plain diff's — the
  // same split `buildCommitChangeSet` makes between a body-authored row and the renumber pass's rank.
  const keptSiblingIndexRows = new Map<EntryId, number>();
  for (const row of changeSet.updated) {
    if (row.store === 'entries' && row.field === 'siblingIndex') {
      if (working.has(row.id)) keptSiblingIndexRows.set(row.id, row.to as number);
      continue;
    }
    const replayed =
      row.store === 'entries'
        ? fieldRowToReplay(row, working, data.fields, data.fieldAccess)
        : storeRowToReplay(row, working, data.pluginStores);
    if (!replayed) continue;
    updated.push(replayed);
    if (replayed.store === 'entries' && replayed.field === 'parentId')
      parentIdRows.set(replayed.id, replayed);
  }
  const reverted = revertLoopingParentRows(working, data.fields, parentIdRows);
  const soundUpdated =
    reverted.size === 0
      ? updated
      : updated.filter(
          (row) => !(row.store === 'entries' && row.field === 'parentId' && reverted.has(row.id)),
        );

  // The cascade runs last, over the step's finished tree: an id this same step reparented away from
  // a removed ancestor already has its new, sound parent by now, and never cascades with it. Nor does
  // an id this same step re-adds: a recorded `removed` row and an `added` row can name the same id — a
  // remove-then-re-add of one id, replayed as one step — and by the time the cascade runs, `working`
  // holds the fresh entity that row added, not the one the removed row named. That id keeps its
  // children.
  const addedIdsBeforeCascade = new Set(added.map((row) => row.entity.id));
  const recordedRemovedIds = new Set(
    recordedRemoved.map((row) => row.entity.id).filter((id) => !addedIdsBeforeCascade.has(id)),
  );
  const { removed: cascadeRemoved, cascadeIds } = cascadeIdsToReplay(working, recordedRemovedIds);
  // An id this same step adds and the cascade then carries away was never committed: the store never
  // held it, so it is not a removal either. It is dropped from `added` instead, below, and carries no
  // Field or store row of its own, the same as any other cascaded id.
  const cascadedAddedIds = new Set(cascadeIds.filter((id) => addedIdsBeforeCascade.has(id)));
  const survivingAdded =
    cascadedAddedIds.size === 0 ? added : added.filter((row) => !cascadedAddedIds.has(row.entity.id));
  const removed = [
    ...recordedRemoved,
    ...cascadeRemoved.filter((row) => !cascadedAddedIds.has(row.entity.id)),
  ];
  // A cascaded id's own recorded row — a rename, a move, a plugin-store write — landed on `working`
  // before the cascade judged it gone; that row is stale once the entity itself leaves, the same way
  // a removed entity carries no Field row of its own. It keeps only what the cascade itself writes:
  // its removal, above, and its store-deletion row, below.
  const cascadeIdSet = new Set(cascadeIds);
  const updatedWithoutCascaded =
    cascadeIdSet.size === 0 ? soundUpdated : soundUpdated.filter((row) => !cascadeIdSet.has(row.id));
  const cascadeStoreDeletionIds =
    cascadedAddedIds.size === 0 ? cascadeIds : cascadeIds.filter((id) => !cascadedAddedIds.has(id));
  if (cascadeStoreDeletionIds.length > 0)
    updatedWithoutCascaded.push(...data.pluginStores.pendingRows(cascadeStoreDeletionIds));

  // The renumber pass runs last of all, over the same finished tree: an added row, a reparent and the
  // cascade have all settled who is where, so every group this step actually touched can be replayed
  // dense in one pass, the same math `buildCommitChangeSet` runs on a live write.
  const addedIds = new Set(survivingAdded.map((row) => row.entity.id));
  const removedIds = new Set(removed.map((row) => row.entity.id));
  const checkedParents = checkHierarchyAnswers(working, data.hierarchySource).parents;
  const committedParents = data.entries.committedParents();
  const siblingChanges = siblingChangesToReplay(
    working,
    addedIds,
    removedIds,
    keptSiblingIndexRows,
    checkedParents,
    committedParents,
  );
  const siblingRanks =
    siblingChanges.length === 0
      ? new Map<EntryId, number>()
      : renumberSiblingGroups(
          siblingChanges,
          (group) => data.entries.committedSiblingIds(group),
          (id) => committedParents.get(id),
        );
  const rankedAdded = survivingAdded.map((row) => {
    const rank = siblingRanks.get(row.entity.id);
    return rank === undefined || rank === row.entity.siblingIndex
      ? row
      : { ...row, entity: { ...row.entity, siblingIndex: rank } };
  });
  for (const [id, rank] of siblingRanks) {
    if (addedIds.has(id) || removedIds.has(id)) continue;
    const current = working.get(id);
    if (current === undefined || current.siblingIndex === rank) continue;
    updatedWithoutCascaded.push({
      store: 'entries',
      id,
      field: 'siblingIndex',
      from: current.siblingIndex,
      to: rank,
    });
  }

  // The Rollup runs last of all, over the same finished tree, construction shape: it never demotes
  // a parent that just lost its last child, so plain undo of "add a first child to leaf p" keeps
  // whatever value the field-row replay above already restored on p, rather than clearing it the
  // way a live commit's demotion would. It never runs the extension hook — replay never does.
  const rollupRows = rollUpFreshBatch(data, working, checkedParents, data.hierarchySource);
  const rollupOnAdded = new Map<EntryId, FieldUpdated[]>();
  const rollupOnExisting: FieldUpdated[] = [];
  for (const row of rollupRows) {
    if (addedIds.has(row.id)) {
      const onto = rollupOnAdded.get(row.id) ?? [];
      onto.push(row);
      rollupOnAdded.set(row.id, onto);
    } else {
      rollupOnExisting.push(row);
    }
  }
  // A Rollup value on an id this step adds lands on the entity itself — there is no earlier row on
  // it to merge into, the same way `buildCommitChangeSet` writes a fresh parent's rolled-up value.
  const rolledAdded =
    rollupOnAdded.size === 0
      ? rankedAdded
      : rankedAdded.map((row) => {
          const rows = rollupOnAdded.get(row.entity.id);
          if (!rows) return row;
          let entity = row.entity;
          for (const rollupRow of rows)
            entity = applyFieldRow(entity, rollupRow.field, rollupRow.to, data.fields);
          return { ...row, entity };
        });
  // A Rollup row for a key the replay already writes folds into that row through the one-row-per-key
  // fold a commit's own body and Rollup share: the earlier row's `from` stands, and the Rollup's `to`
  // wins. Any other Rollup row is a fresh row, and a key whose net change is nothing drops out.
  const merged = mergeUpdatedRows([...updatedWithoutCascaded, ...rollupOnExisting], data.fields);

  if (rolledAdded.length === 0 && removed.length === 0 && merged.length === 0) return undefined;
  return {
    id: data.nextChangeSetId(),
    origin: changeSet.origin,
    added: rolledAdded,
    removed,
    updated: merged,
  };
}
