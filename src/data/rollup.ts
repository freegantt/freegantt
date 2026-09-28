// data/ — the Rollup: `data/`'s own commit step (never an extender occupant), giving every
// parent (an Entry with at least one child, ADR 0013 — there is no stored classification) its
// rolling-up Fields from its children, bottom-up, on every commit (`01` §2.5/§2.6, S4.2). A leaf
// module — only `data/build-commit-change-set.ts` (commit path) and `data/transaction.ts`
// (construction path) name it (`rollup-is-removable`); delete this file and every entry keeps
// its authored values.

import type { StoredEntry, EntryId, FieldUpdated, HierarchySource } from '../model/index.js';
import { AggregatorFailedError } from '../model/index.js';
import { isNoOpFieldWrite } from './change-set.js';
import type { ProposedEdits } from './edit-extension.js';
import {
  ancestorsOf,
  buildEffectiveEntries,
  childIdsByParent,
  commitMovesNoRow,
  depthOf,
  parentIdIn,
} from './entry-tree.js';
import { checkHierarchyAnswers, parentIdFrom, storedParentSource } from './hierarchy-source.js';
import type { ParentIndex } from './hierarchy-source.js';
import {
  createRollUpContext,
  editProposesField,
  entryAfterEdit,
  readField,
  readingChildrenFrom,
  readingHypotheticalRows,
  readingParentFrom,
  writeOntoEntry,
} from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';

export interface RollUpEditSets {
  /** Body plus extension-hook edits. A rolling-up Field proposed on an entry that still has
   *  children at commit is overwritten, not yielded to (2026-09-24 ruling). An entry that loses its
   *  last child in this same transaction keeps a proposal on that Field, because the Field is no
   *  longer the Rollup's to own (`clearDerivedValues`). Also used to read effective child values. */
  readonly merged: ProposedEdits;
}

/** The two trees the Rollup walks (ADR 0020).
 *
 *  The committed one is the store's own checked index, memoized per revision — the pass reads it
 *  rather than re-deriving the same answer, so the store and the Rollup can never disagree
 *  about who a row's parent was. The source answers for the **effective** tree instead: the one this
 *  commit leaves once its adds, removes and cascades land, which no revision holds and no index
 *  can hold. */
export interface RollUpTree {
  readonly committedParents: ParentIndex;
  /** `EntryStore.committedChildIds()` — the committed tree's own child index, read back rather than
   *  re-derived when a commit proves it cannot have moved a row (`committedTreeStillAnswers` below,
   *  #421 C4). */
  readonly committedChildIds: ReadonlyMap<EntryId, readonly EntryId[]>;
  readonly source: HierarchySource;
}

/** Adds, removes and body edits the commit path has not written yet. Construction omits this. */
export interface PendingRollUp {
  readonly added: readonly StoredEntry[];
  readonly removed: readonly StoredEntry[];
  readonly edits: RollUpEditSets;
}

/**
 * Which rows this operation makes stale. `entries` is the tree **before** the operation, and
 * `parentIdOf` reads it the way the rest of the library does (ADR 0020).
 *
 * The former parent of a row that moved is the reason this asks a pre-edit row at all: a live
 * `parent()` answers the new parent, so the old one would never be recomputed and a move would leave
 * a stale aggregate behind. It reads the **source**, unconditionally, rather than asking whether the
 * edit named `parentId` — a plugin source may answer out of a `props` key, so a row can move with no
 * `parentId` write to spot. The new parent needs no entry here: `parentsToRecompute` walks the
 * ancestors of every touched id in the post-operation tree.
 *
 * `parentIdOf` reads a **checked** index (`RollUpTree.committedParents`), so a row whose former
 * parent link core dropped as a cycle-closer has no former parent here. That is the right answer —
 * a dropped link never was a parent — and it is stated because two files have to be read to see it
 * (`V1`).
 */
function collectTouchedIds(
  entries: ReadonlyMap<EntryId, StoredEntry>,
  added: readonly StoredEntry[],
  removed: readonly StoredEntry[],
  proposed: ProposedEdits,
  parentIdOf: HierarchySource,
): ReadonlySet<EntryId> {
  const formerParentOf = (id: EntryId): EntryId | undefined => {
    const before = entries.get(id);
    return before === undefined ? undefined : parentIdFrom(parentIdOf, before);
  };
  const touched = new Set<EntryId>();
  for (const entry of added) touched.add(entry.id);
  for (const entry of removed) {
    touched.add(entry.id);
    const parentId = formerParentOf(entry.id);
    if (parentId !== undefined) touched.add(parentId);
  }
  for (const id of proposed.keys()) {
    touched.add(id);
    const former = formerParentOf(id);
    if (former !== undefined) touched.add(former);
  }
  return touched;
}

/**
 * `priorByParent` reads the tree as it stood before this operation. An id that had children there
 * and has none in `byParent` (the post-operation tree) just lost its last child — ADR 0013 demotes
 * it, so it still needs a visit even though `isParent` on the new tree says no.
 */
function parentsToRecompute(
  entries: ReadonlyMap<EntryId, StoredEntry>,
  byParent: ReadonlyMap<EntryId, readonly EntryId[]>,
  priorByParent: ReadonlyMap<EntryId, readonly EntryId[]>,
  touched: ReadonlySet<EntryId> | undefined,
  parentIdOf: HierarchySource,
): readonly EntryId[] {
  const isParent = (id: EntryId): boolean => (byParent.get(id)?.length ?? 0) > 0;
  const wasParent = (id: EntryId): boolean => (priorByParent.get(id)?.length ?? 0) > 0;
  const needsVisit = (id: EntryId): boolean => isParent(id) || wasParent(id);

  const candidates = new Set<EntryId>();
  if (touched === undefined) {
    for (const id of entries.keys()) {
      if (needsVisit(id)) candidates.add(id);
    }
  } else {
    for (const id of touched) {
      for (const ancestor of ancestorsOf(id, entries, parentIdOf)) candidates.add(ancestor);
      if (needsVisit(id)) candidates.add(id);
    }
  }

  const filtered = Array.from(candidates).filter(needsVisit);

  const depthById = new Map<EntryId, number>();
  for (const id of filtered) depthById.set(id, depthOf(id, entries, parentIdOf));

  return filtered.sort((a, b) => depthById.get(b)! - depthById.get(a)!);
}

/**
 * A demoted Entry — a parent that just lost its last child — has nothing left to calculate from
 * (ADR 0013: "demotion leaves no dates"). It keeps its name and drops every rolling-up Field, the
 * same "Aggregator says no value" clear the main loop runs, run here with no Aggregator to ask
 * because there are no children left to ask one.
 */
function clearDerivedValues(
  parent: StoredEntry,
  registry: FieldRegistry,
  access: FieldAccess,
  parentId: EntryId,
  updated: FieldUpdated[],
  merged: ProposedEdits,
  authoredKeys: ReadonlySet<string> | undefined,
): StoredEntry {
  let effectiveParent = parent;

  for (const field of registry.rollingUpFields()) {
    // The field stopped rolling up in this same transaction, so a write to it — the body's own, or
    // an extension hook's cascade — is an ordinary cell edit now, not a rolled-up value to clear:
    // the write already landed on `parent` and stands (2026-09-24 ruling). A cascade write is a
    // caller-side write like the body's, so this reads the merged edits, which carry both sources.
    // A delta batch carries no `merged` (it has already landed its own writes on `parent` before
    // this pass runs), so `authoredKeys` names the same thing for it: a key the delta itself named
    // for this id.
    if (editProposesField(merged.get(parentId), field)) continue;
    if (authoredKeys?.has(String(field.key)) === true) continue;
    const from = readField(effectiveParent, field, access);
    if (from === undefined) continue;
    updated.push({ store: 'entries', id: parentId, field: field.key, from, to: undefined });
    effectiveParent = writeOntoEntry(effectiveParent, field, undefined);
  }

  return effectiveParent;
}

function effectiveEntry(
  id: EntryId,
  entries: ReadonlyMap<EntryId, StoredEntry>,
  merged: ProposedEdits,
  computed: ReadonlyMap<EntryId, StoredEntry>,
): StoredEntry | undefined {
  const rolled = computed.get(id);
  if (rolled) return rolled;
  const current = entries.get(id);
  if (!current) return undefined;
  const edit = merged.get(id);
  return edit ? entryAfterEdit(current, edit) : current;
}

/** What one Rollup pass produced. `overwrittenProposals` names the rows where a same-transaction
 *  proposal — the body's own, or an extension-hook cascade's — named a rolling-up Field on a parent
 *  that has children by the end of this operation, and the Rollup overwrote it anyway. The Rollup
 *  owns every rolling-up Field of an entry that is a parent at commit, in a transaction or not (ADR
 *  0013, decision 5, 2026-09-24 ruling). A caller with no extension hook installed and no proposal
 *  that outlives the entry's promotion never sees a row here. */
export interface RollUpResult {
  readonly updated: readonly FieldUpdated[];
  readonly overwrittenProposals: readonly FieldUpdated[];
}

const NO_ROLLUP_RESULT: RollUpResult = Object.freeze({ updated: [], overwrittenProposals: [] });

/** The Entries, parent lookup, and child indexes one Rollup pass walks. */
interface RollUpWalk {
  readonly entries: ReadonlyMap<EntryId, StoredEntry>;
  readonly parentOfEffective: HierarchySource;
  readonly byParent: ReadonlyMap<EntryId, readonly EntryId[]>;
  readonly priorByParent: ReadonlyMap<EntryId, readonly EntryId[]>;
  readonly touched: ReadonlySet<EntryId> | undefined;
  readonly merged: ProposedEdits;
}

/** Call: `committedTreeStillAnswers(pending, tree)`. Does the store's committed index already hold
 *  the right parent and child answers? True only when this commit cannot have moved a row, so
 *  re-deriving either half would only recompute what `tree` already carries. */
function committedTreeStillAnswers(pending: PendingRollUp, tree: RollUpTree): boolean {
  return (
    tree.source === storedParentSource &&
    commitMovesNoRow(pending.added, pending.removed, pending.edits.merged)
  );
}

/** Call: `rollUpWalkFrom(committed, pending, tree)`. Construction omits `pending` and walks every
 *  deriving parent on the committed tree. Commit builds the effective tree — so a parent promoted
 *  on this commit is already a parent when `parentsToRecompute` asks structure — and walks only the
 *  ancestors it must. The tree this pass walks is checked: a source that loops would make
 *  `ancestorsOf` and `depthOf` run forever. Nothing is reported from either half: the effective tree
 *  is one no commit has landed yet, and the commit raises the committed one's refusals once it
 *  lands. */
function rollUpWalkFrom(
  committed: ReadonlyMap<EntryId, StoredEntry>,
  pending: PendingRollUp | undefined,
  tree: RollUpTree,
): RollUpWalk {
  const parentOfPrior = parentIdIn(tree.committedParents);
  if (pending === undefined) {
    return {
      entries: committed,
      parentOfEffective: parentOfPrior,
      byParent: childIdsByParent(committed, parentOfPrior),
      priorByParent: tree.committedChildIds,
      touched: undefined,
      merged: new Map(),
    };
  }

  const { added, removed, edits } = pending;
  const merged = edits.merged;
  const entries = buildEffectiveEntries(committed, added, removed, merged);
  const reuseCommitted = committedTreeStillAnswers(pending, tree);
  const parentOfEffective = reuseCommitted
    ? parentOfPrior
    : parentIdIn(checkHierarchyAnswers(entries, tree.source).parents);
  return {
    entries,
    parentOfEffective,
    byParent: reuseCommitted ? tree.committedChildIds : childIdsByParent(entries, parentOfEffective),
    priorByParent: reuseCommitted ? tree.committedChildIds : childIdsByParent(committed, parentOfPrior),
    touched: collectTouchedIds(committed, added, removed, merged, parentOfPrior),
    merged,
  };
}

/** Call: `effectiveChildrenOf(childIds, entries, merged, computed)`. Each child as this bottom-up
 *  walk has already written it — a rolled-up parent the pass just settled, else the effective row
 *  after merged edits. */
function effectiveChildrenOf(
  childIds: readonly EntryId[],
  entries: ReadonlyMap<EntryId, StoredEntry>,
  merged: ProposedEdits,
  computed: ReadonlyMap<EntryId, StoredEntry>,
): StoredEntry[] {
  const children: StoredEntry[] = [];
  for (const childId of childIds) {
    const child = effectiveEntry(childId, entries, merged, computed);
    if (child !== undefined) children.push(child);
  }
  return children;
}

/**
 * Construction omits `pending` and walks every deriving parent. Commit passes adds, removes and
 * edits; the pass then builds the effective tree and walks only the ancestors it must.
 *
 * `freshBatchAuthoredKeys` is a construction-shape-only concern: a delta batch (`syncChanges`) has
 * already landed its own writes on `committed` before this pass runs, with no `merged` to carry them
 * — this is where it names, per id, the keys the delta itself authored, so a demoted parent's own
 * authored write to a rolling-up Field stands instead of being cleared alongside the rest.
 */
export function rollUpFields(
  committed: ReadonlyMap<EntryId, StoredEntry>,
  pending: PendingRollUp | undefined,
  registry: FieldRegistry,
  storeAccess: FieldAccess,
  tree: RollUpTree,
  freshBatchAuthoredKeys?: ReadonlyMap<EntryId, ReadonlySet<string>>,
): RollUpResult {
  const rollingFields = registry.rollingUpFields();
  if (rollingFields.length === 0) return NO_ROLLUP_RESULT;

  // Every row this pass reads is hypothetical — an effective parent, or a child carrying the value
  // this bottom-up walk just gave it — so the memo stands down for the whole pass (#300). It is not
  // enough that `DatasetState` stands it down while a transaction is open: the commit path runs
  // after the body closes and before the revision moves, so the memo would be live at the *old*
  // revision, and an Aggregator reading a child's `compute` Field would fold a stale value into a
  // parent's stored cell.
  const access = readingHypotheticalRows(storeAccess);
  const { entries, parentOfEffective, byParent, priorByParent, touched, merged } = rollUpWalkFrom(
    committed,
    pending,
    tree,
  );
  const parents = parentsToRecompute(entries, byParent, priorByParent, touched, parentOfEffective);
  const computed = new Map<EntryId, StoredEntry>();
  // A `compute` Field inside this pass asks `ctx.children(row)` and must see the pass's own
  // effective children — the store does not hold the value this bottom-up walk just gave a child
  // (ADR 0017). `readingChildrenFrom`'s default `hasChildren` follows the same effective tree
  // (#466), so `ctx.hasChildren(row)` cannot disagree with `ctx.children(row).length > 0` here.
  // `ctx.hierarchyParentId()` gets the same treatment (ADR 0024): the pass's own effective parent,
  // never the store's committed one, which may not have this edit's hierarchy change yet.
  const passAccess = readingParentFrom(
    readingChildrenFrom(access, (id) =>
      effectiveChildrenOf(byParent.get(id) ?? [], entries, merged, computed),
    ),
    (entry) => parentIdFrom(parentOfEffective, entry),
  );
  const updated: FieldUpdated[] = [];
  const overwrittenProposals: FieldUpdated[] = [];

  for (const parentId of parents) {
    const parent = entries.get(parentId);
    if (parent === undefined) continue;

    const childIds = byParent.get(parentId) ?? [];
    if (childIds.length === 0) {
      // Demoted: `parentsToRecompute` only visits this id with no children left when it had
      // children before this operation. Losing the last child demotes. An entry that stops being a
      // parent in this same transaction keeps the write to that Field: `clearDerivedValues` leaves
      // alone any field `merged` (body or cascade) proposed, rather than wiping the value that write
      // just landed.
      computed.set(
        parentId,
        clearDerivedValues(
          parent,
          registry,
          access,
          parentId,
          updated,
          merged,
          freshBatchAuthoredKeys?.get(parentId),
        ),
      );
      continue;
    }

    const children = effectiveChildrenOf(childIds, entries, merged, computed);
    if (children.length === 0) continue;

    let effectiveParent = effectiveEntry(parentId, entries, merged, computed) ?? parent;

    for (const field of rollingFields) {
      // The Rollup owns every rolling-up Field of a parent, in a transaction or not: a
      // same-transaction proposal — the body's own, or a cascade's — never wins over it once this
      // entry has children by the end of this operation. `merged` carries both sources, so this
      // parent+field pair is reported once for the whole commit if the write below turns out to
      // actually overwrite one of them.
      const wasProposed = editProposesField(merged.get(parentId), field);
      const aggregator = registry.aggregator(field.rollUp);
      if (aggregator === undefined) continue;

      // A throw becomes AggregatorFailedError, so the commit saves nothing.
      let value: unknown;
      try {
        value = aggregator(
          effectiveParent,
          createRollUpContext(passAccess, effectiveParent, children, field.key),
        );
      } catch (cause) {
        throw new AggregatorFailedError(field.key, field.rollUp, parentId, cause);
      }
      const from = readField(effectiveParent, field, access);
      // An Aggregator with no opinion means *no value* on a parent — never "keep whatever is stored,"
      // which is stale by construction the moment nothing but the Rollup may write this cell. Skip
      // only when the cell is already clear, or when a defined answer equals what is stored.
      if (value === undefined ? from === undefined : isNoOpFieldWrite(field.key, from, value, registry)) {
        continue;
      }

      const row: FieldUpdated = { store: 'entries', id: parentId, field: field.key, from, to: value };
      updated.push(row);
      if (wasProposed) overwrittenProposals.push(row);
      effectiveParent = writeOntoEntry(effectiveParent, field, value);
    }

    computed.set(parentId, effectiveParent);
  }

  return { updated, overwrittenProposals };
}
