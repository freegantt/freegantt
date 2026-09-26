// data/ — the four-stage commit pipeline (C1, ADR 0013 dropped the autoGroup promotion stage): body
// edits → extension hook → rollup → fold. The only module that imports `rollup.ts` on the commit path
// (`rollup-is-removable`).

import type {
  ChangeOrigin,
  ChangeSet,
  ChangeSetId,
  EntityAdded,
  EntityRemoved,
  StoredEntry,
  EntryId,
  FieldLockRule,
  FieldUpdated,
  HierarchySource,
  StoreRowUpdated,
} from '../model/index.js';
import { SiblingIndexOutOfRangeError } from '../model/index.js';
import {
  diffEdit,
  foldChangeSet,
  foldRollUpRowsOntoAdded,
  foldSiblingRanks,
  mergeUpdatedRows,
} from './change-set.js';
import type { EditRequest, ProposedEdit, ProposedEdits } from './edit-extension.js';
import { createEditRequest } from './edit-request.js';
import type { CommitReport } from './error-reporting.js';
import { buildRollUpOverwroteProposalReport, buildDerivedValuesDroppedReport } from './error-reporting.js';
import type { EditsReading } from './entry-reader.js';
import { EXTENDER_OPERATION } from './entry-reader.js';
import { mergeProposedEditsByEntry, entryAfterEdit, proposedKeysOf } from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';
import { rollUpFields } from './rollup.js';
import type { ParentIndex } from './hierarchy-source.js';
import type { SiblingChange, SiblingGroupKey, SiblingPlacement } from './sibling-order.js';
import { isDevMode } from './dev-mode.js';

/** Staged entry-store state the commit pipeline reads — mirrors `TransactionalEntryStore` without
 *  importing `transaction.ts` (cycle avoidance). */
export interface CommitChangeSetEntryStore {
  committedById(): ReadonlyMap<EntryId, StoredEntry>;
  /** The committed rows' checked parents, memoized per revision — see `EntryStore.committedParents`. */
  committedParents(): ParentIndex;
  /** The committed rows' children, by parent id — see `EntryStore.committedChildIds`. */
  committedChildIds(): ReadonlyMap<EntryId, readonly EntryId[]>;
  pendingAdded(): readonly EntityAdded[];
  pendingRemoved(): readonly EntityRemoved[];
  pendingEdits(): ProposedEdits;
  /** This write set's own sibling-order log, in call order (ADR 0034) — every `add`, `update` and
   *  `remove` that moved an entry within or across a group logged one entry here. The renumber pass
   *  below is this log's one reader. */
  pendingSiblingChanges(): readonly SiblingChange[];
  /** `group`'s committed member ids, in sibling order — what the renumber pass below seeds each
   *  touched group's replay from, one call per distinct group. */
  committedSiblingIds(group: SiblingGroupKey): readonly EntryId[];
  /** `group`'s live member count — the committed count with this transaction's own writes folded in,
   *  the same count `add()`/`update()` range-check a body write's explicit `siblingIndex` against.
   *  The extender cascade's own moves range-check against this too — see `EntryStore.liveSiblingGroupSize`. */
  liveSiblingGroupSize(group: SiblingGroupKey): number;
  /** `entry`'s group, checked the way a body write's own group already is — see
   *  `EntryStore.checkedSiblingGroupOf`. The extender cascade reads a group through this too, never
   *  through the raw hierarchy source, so a cascade edit on an already-refused entry counts against
   *  the same group the body's own writes would. */
  checkedSiblingGroupOf(id: EntryId, entry: StoredEntry): EntryId | undefined;
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
  /** The commit path's own door onto the extension hook (#232) — see
   *  `TransactionData.extraEditsReadingFor`. */
  extraEditsReadingFor(request: EditRequest): EditsReading;
  readonly fields: FieldRegistry;
  readonly fieldAccess: FieldAccess;
  /** The tree the Rollup walks (ADR 0020) — see `TransactionData.hierarchySource`. */
  readonly hierarchySource: HierarchySource;
  /** The per-entry lock rule `createEditRequest`'s `editableOf` reads (#473) — see
   *  `TransactionData.lockRule`. */
  readonly lockRule: FieldLockRule;
  nextChangeSetId(): ChangeSetId;
}

/** The ChangeSet a commit folded — `undefined` when its net effect is empty — and the reports it
 *  owes once it lands. A net-empty commit still owes them: the Rollup already dropped the value. */
export interface BuiltCommit {
  readonly changeSet: ChangeSet | undefined;
  readonly reports: readonly CommitReport[];
}

export function diffEdits(
  byId: ReadonlyMap<EntryId, StoredEntry>,
  edits: ProposedEdits,
  fields: FieldRegistry,
  access: FieldAccess,
): FieldUpdated[] {
  const updated: FieldUpdated[] = [];
  for (const [id, edit] of edits) updated.push(...diffEdit(byId, id, edit, fields, access));
  return updated;
}

/** Which Fields an edit writes. `proposedKeys` is required on every `ProposedEdit` (ADR 0011), so it
 *  always names the real Field — a declared `props` key by its own name, never the `props` container
 *  itself, which is bookkeeping on the edit, not a Field in its own right (#197). There is no more
 *  raw-key fallback: walking `Object.keys(edit)` would pick up `__brand`/`props`/`proposedKeys` as if
 *  they were Field names, which is exactly the bug this function existed to avoid. */
function fieldsWrittenBy(edit: ProposedEdit): ReadonlySet<string> {
  return proposedKeysOf(edit);
}

/** I4: the extension hook may not propose a Field the transaction body already proposed on the same
 *  Entry (#232). `start`/`end` are ordinary Fields here (ADR 0026 retired the Segment that used to
 *  make them a derived pair), so `fieldsWrittenBy` alone — no envelope carve-out — already answers
 *  what each side authored. */
function guardExtensionHookDoesNotOverwriteBody(proposed: ProposedEdits, extenderEdits: ProposedEdits): void {
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

/** The extender cascade's own share of the sibling-order log (ADR 0034): an extender edit that names
 *  `siblingIndex`, or one that lands its entry in a different group, moves that entry the same way an
 *  `entries.update()` call does — the entry's group before this edit compares against the group its
 *  edit reads to next, through the same hierarchy source the body's own writes read. Both groups come
 *  from `entryAfterEdits`, the row the transaction body (and, for an added entity, `add()` itself)
 *  leaves behind — never the stale pre-transaction row, so a body edit already staged on the same
 *  entity is not overwritten by a preview of the row as it looked before the transaction opened. An
 *  entity this same transaction added is not skipped: `addedEntitiesForFold` folds this edit's other
 *  fields onto it, but only this log can place it at a rank in a group.
 *
 *  Each group comes from `checkedSiblingGroupOf`, never the raw hierarchy source: an entity whose
 *  answer core refused counts against the same checked root group a body write against it already
 *  would, not an empty group of its own (see `EntryStore.checkedSiblingGroupOf`).
 *
 *  A named index outside the group throws the same error an explicit `entries.update()` write throws,
 *  labelled with the extender's own operation name rather than the caller's. The count it range-checks
 *  against is the store's own live count (`EntryStore.liveSiblingGroupSize`, the same one `update()`
 *  range-checks a body write against), adjusted for every earlier extender edit this same loop already
 *  placed — mirroring `EntryStore.#siblingMoveFor`'s own leave-then-place bookkeeping. */
function siblingChangesFromExtenderEdits(
  entryAfterEdits: (id: EntryId) => StoredEntry | undefined,
  extenderEdits: ProposedEdits,
  checkedSiblingGroupOf: (id: EntryId, entry: StoredEntry) => EntryId | undefined,
  liveSiblingGroupSize: (group: SiblingGroupKey) => number,
): SiblingPlacement[] {
  const changes: SiblingPlacement[] = [];
  const ownAdjustments = new Map<SiblingGroupKey, number>();
  const liveSize = (group: SiblingGroupKey): number =>
    liveSiblingGroupSize(group) + (ownAdjustments.get(group) ?? 0);

  for (const [id, edit] of extenderEdits) {
    const current = entryAfterEdits(id);
    if (current === undefined) continue;
    const explicitIndex = edit.siblingIndex !== undefined;
    const previousGroup = checkedSiblingGroupOf(id, current);
    const group = checkedSiblingGroupOf(id, entryAfterEdit(current, edit));
    if (!explicitIndex && group === previousGroup) continue;
    const othersCount = liveSize(group) - (group === previousGroup ? 1 : 0);
    const at = explicitIndex ? edit.siblingIndex! : othersCount;
    if (explicitIndex && (!Number.isInteger(at) || at < 0 || at > othersCount)) {
      throw new SiblingIndexOutOfRangeError(id, at, othersCount, EXTENDER_OPERATION);
    }
    changes.push({ id, group, at });
    ownAdjustments.set(previousGroup, (ownAdjustments.get(previousGroup) ?? 0) - 1);
    ownAdjustments.set(group, (ownAdjustments.get(group) ?? 0) + 1);
  }
  return changes;
}

/**
 * Runs the five commit stages against staged store state and returns the folded `ChangeSet`
 * (`undefined` when the net effect is empty, D-S2-24 step 6) and the reports it owes.
 *
 * A plugin-store row counts toward "empty" exactly as a Field row does (D-S5-24, #156). Collecting the
 * rows here, rather than only where entries are diffed, is what lets a transaction whose only write is
 * a plugin row still commit: it builds a changeset, so `runTransaction` does not return early, and the
 * ordinary commit emits `change`, records one undo step, and bumps `datasetRevision` once.
 */
export function buildCommitChangeSet(data: CommitChangeSetInput, origin: ChangeOrigin): BuiltCommit {
  const byId = data.entries.committedById();
  const proposed = data.entries.pendingEdits();
  const addedEntities = data.entries.pendingAdded();
  const removedEntities = data.entries.pendingRemoved();
  const added = addedEntities.map((row) => row.entity);
  const removed = removedEntities.map((row) => row.entity);
  // The extender's cascade is read against the state its own edit lands on — committed entries
  // overlaid with this transaction's body edits, plus the entries this transaction itself adds — not
  // against `byId` alone (#212 R2 fix-plan review, finding A). `byId` is pre-transaction: an entry the
  // body just added is absent from it, and an entry whose span the body just rewrote still shows its
  // old one there. `createEditRequest` (#466) is the one place this reconciliation, `hasChildren` and
  // `writeTarget` are built — the commit path and the preview path (`gesture-pipeline.ts`) both call
  // it, so neither can answer those two questions differently.
  const editRequest = createEditRequest({
    entries: byId,
    proposed,
    added,
    removed,
    hierarchySource: data.hierarchySource,
    committedChildIds: data.entries.committedChildIds(),
    fields: data.fields,
    lockRule: data.lockRule,
  });
  const extenderReading = data.extraEditsReadingFor(editRequest);
  const extenderEdits: ProposedEdits = extenderReading.stored;
  guardExtensionHookDoesNotOverwriteBody(proposed, extenderEdits);

  // One merge of the body's and the extender's edits, diffed once below (#232) — two separate diffs
  // of `proposed` and `extenderEdits` used to let one field reach the `ChangeSet` twice, with two
  // different `to` values, whenever an entry's envelope carried both a body-authored key and an
  // extender-authored one. `start`/`end` are ordinary Fields now (ADR 0026), so the merge needs no
  // envelope carve-out — `mergeProposedEditsByEntry` is the same per-entry merge any two edit sources
  // already use.
  const mergedBodyAndExtender = mergeProposedEditsByEntry(proposed, extenderEdits);
  const bodyAndExtenderUpdated = diffEdits(byId, mergedBodyAndExtender, data.fields, data.fieldAccess);

  // An added entity folds in its own extender cascade — an `EditExtender` that rewrites a Field on an
  // entity this same transaction adds must still land on the entity the changeset publishes (#212 R2
  // fix-plan review, finding A). There is no hierarchy-promotion cascade to fold in beside it any more
  // (ADR 0013): a parent is structural, so nothing writes a Field for gaining a child.
  const addedEntitiesForFold =
    extenderEdits.size === 0
      ? addedEntities
      : addedEntities.map((row) => {
          const extra = extenderEdits.get(row.entity.id);
          return extra === undefined ? row : { ...row, entity: entryAfterEdit(row.entity, extra) };
        });

  const { updated: rollupUpdated, overwrittenProposals } = rollUpFields(
    byId,
    {
      added: addedEntitiesForFold.map((row) => row.entity),
      removed,
      edits: { merged: mergedBodyAndExtender },
    },
    data.fields,
    data.fieldAccess,
    {
      committedParents: data.entries.committedParents(),
      committedChildIds: data.entries.committedChildIds(),
      source: data.hierarchySource,
    },
  );

  // ADR 0013, decision 5, and its 2026-09-24 ruling: the transaction body or an extension-hook
  // cascade proposed a rolling-up Field the Rollup owns, and the Rollup overwrote it anyway. One
  // report for the whole commit, never one per row. Collected, not raised: the commit raises it
  // once it lands.
  const reports: CommitReport[] = [];
  if (overwrittenProposals.length > 0) {
    reports.push({ report: buildRollUpOverwroteProposalReport(overwrittenProposals) });
  }

  // ADR 0013, decision 6: an entity `entries.add()` just created was already a parent by the time
  // this commit landed (a batch of `add()` calls in one transaction), and one of its rolling-up
  // Fields had nothing to roll up to. Reparenting an *existing* entity onto a new parent is not this
  // — that recompute stays silent (decision 6) — so only the ids this commit itself added qualify.
  const addedIds = new Set(addedEntitiesForFold.map((row) => row.entity.id));
  const addDropped = rollupUpdated.filter((row) => row.to === undefined && addedIds.has(row.id));
  if (addDropped.length > 0) {
    reports.push({ report: buildDerivedValuesDroppedReport(addDropped) });
  }

  // An added entity carries the values the commit settles on, not a row: nothing reads an Entries row
  // for an id that has no prior committed value to diff against. A Rollup row for an added id folds
  // onto that entity instead, the same reason the sibling rank below folds onto the entity too.
  const rollupUpdatedForOthers = rollupUpdated.filter((row) => !addedIds.has(row.id));
  const rolledUpEntitiesForFold = foldRollUpRowsOntoAdded(addedEntitiesForFold, rollupUpdated, data.fields);

  // Removing an entry removes its plugin rows in the same changeset, so the removed ids go in here.
  const pluginRows = data.pluginStores.pendingRows(removed.map((entry) => entry.id));

  // The renumber pass (ADR 0034): every write this transaction staged replays here, once, over the
  // committed groups it touched — after the Rollup, so a reparent's own group change is already
  // settled before order is decided for it. This pass owns every `siblingIndex` row: a write that
  // named the Field (`entries.update(id, { siblingIndex })`, or an extender edit that does the same)
  // already reached `bodyAndExtenderUpdated` through the ordinary diff, and that row is dropped here
  // outright rather than left for `mergeUpdatedRows` below: the renumber pass may settle a group back
  // to its committed order and write no row at all, and a merge would then keep the body's stale row
  // — the wrong net effect, not merely a duplicate one. The extender's own moves land after the
  // body's, so a cascade lands on top of whatever the body itself placed.
  const siblingChanges: readonly SiblingChange[] = [
    ...data.entries.pendingSiblingChanges(),
    ...siblingChangesFromExtenderEdits(
      (id) => editRequest.entryAfterEdits(id),
      extenderEdits,
      (id, entry) => data.entries.checkedSiblingGroupOf(id, entry),
      (group) => data.entries.liveSiblingGroupSize(group),
    ),
  ];
  const removedIds = new Set(removedEntities.map((row) => row.entity.id));
  const { rankedAdded: rankedEntitiesForFold, siblingIndexUpdated } = foldSiblingRanks(
    siblingChanges,
    rolledUpEntitiesForFold,
    addedIds,
    removedIds,
    byId,
    (group) => data.entries.committedSiblingIds(group),
    (id) => data.entries.committedParents().get(id),
  );
  const updatedWithoutBodySiblingIndex = bodyAndExtenderUpdated.filter((row) => row.field !== 'siblingIndex');

  // The body and the Rollup can each propose a row for the same (id, field) — the body's own `end`
  // write, then the Rollup's recompute of that same `end` once the write set settles. One net row per
  // key, not both in sequence: `invertChangeSet` keeps row order, so two rows for one key would invert
  // to two rows too, and undo would land on the middle value instead of the one committed here.
  const changeSet = foldChangeSet(
    data.nextChangeSetId(),
    origin,
    rankedEntitiesForFold,
    removedEntities,
    mergeUpdatedRows(
      [...updatedWithoutBodySiblingIndex, ...rollupUpdatedForOthers, ...pluginRows, ...siblingIndexUpdated],
      data.fields,
    ),
  );
  return { changeSet, reports };
}
