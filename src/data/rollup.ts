// data/ — the Rollup: `data/`'s own commit step (never an extender occupant, D-S2-22), giving every
// parent (an Entry with at least one child, ADR 0013 — there is no stored classification) its
// rolling-up Fields from its children, bottom-up, on every commit (`01` §2.5/§2.6, S4.2). A leaf
// module — only `data/build-commit-change-set.ts` (commit path) and `data/transaction.ts`
// (construction path) name it (D-S4-7, `rollup-is-removable`); delete this file and every entry keeps
// its authored values.

import type { StoredEntry, EntryId, FieldUpdated, HierarchySource } from '../model/index.js';
import { AggregatorFailedError } from '../model/index.js';
import type { ProposedEdits } from './edit-extension.js';
import { ancestorsOf, buildEffectiveEntries, childIdsByParent, depthOf } from './entry-tree.js';
import { checkHierarchyAnswers, parentIdFrom, storedParentSource } from './hierarchy-source.js';
import type { ParentIndex } from './hierarchy-source.js';
import {
  createRollUpContext,
  editProposesField,
  entryAfterEdit,
  proposedKeysOf,
  readField,
  readingChildrenFrom,
  readingHypotheticalRows,
  readingParentFrom,
  writeOntoEntry,
} from './fields/field-access.js';
import type { FieldAccess } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';

export interface RollUpEditSets {
  /** The transaction body's edits — the Rollup yields to a field proposed here (D-S2-22). */
  readonly body: ProposedEdits;
  /** Body plus extension-hook edits — used to read effective child values. */
  readonly merged: ProposedEdits;
}

/** The two trees the Rollup walks (ADR 0020).
 *
 *  The committed one is the store's own checked index, memoized per revision — the pass reads it
 *  rather than re-deriving the same answer (`F6`), so the store and the Rollup can never disagree
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
      if (isParent(id)) candidates.add(id);
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
): StoredEntry {
  let effectiveParent = parent;

  for (const field of registry.rollingUpFields()) {
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

/** What one Rollup pass produced. `cascadeDropped` names the rows where an extension-hook cascade —
 *  never the transaction body, which already yields (D-S2-22) — proposed a rolling-up Field on a
 *  parent and the Rollup overwrote it anyway (ADR 0013, decision 5). A caller with no extension hook
 *  installed never sees a row here: `merged` equals `body` with nothing installed, so no edit can
 *  reach a parent through `merged` alone. */
export interface RollUpResult {
  readonly updated: readonly FieldUpdated[];
  readonly cascadeDropped: readonly FieldUpdated[];
}

const NO_ROLLUP_RESULT: RollUpResult = Object.freeze({ updated: [], cascadeDropped: [] });

/** A checked parent index, read back as a `HierarchySource` — the shape every walk in
 *  `entry-tree.ts` takes (ADR 0020). */
function parentIdIn(parentById: ReadonlyMap<EntryId, EntryId>): HierarchySource {
  return (entry) => parentById.get(entry.id);
}

/** True when this commit's `added`, `removed` and `merged` edits leave every row's place in the
 *  tree untouched: no Entry is added or removed, and no edit proposes `parentId`.
 *
 *  Only asked under core's own hierarchy source (`storedParentSource` reads `parentId` and nothing
 *  else). A plugin's source is an arbitrary function that may read any field, so no commit can be
 *  proven not to move a row under it — that source keeps today's re-check on every commit. Whether a
 *  source could declare the keys it reads is #426, out of scope here. */
function commitMovesNoRow(
  added: readonly StoredEntry[],
  removed: readonly StoredEntry[],
  merged: ProposedEdits,
): boolean {
  if (added.length > 0 || removed.length > 0) return false;
  for (const edit of merged.values()) {
    if (proposedKeysOf(edit).has('parentId')) return false;
  }
  return true;
}

/**
 * Construction omits `pending` and walks every deriving parent. Commit passes adds, removes and
 * edits; the pass then builds the effective tree and walks only the ancestors it must (D-S4-8).
 */
export function rollUpFields(
  committed: ReadonlyMap<EntryId, StoredEntry>,
  pending: PendingRollUp | undefined,
  registry: FieldRegistry,
  storeAccess: FieldAccess,
  tree: RollUpTree,
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

  const added = pending?.added ?? [];
  const removed = pending?.removed ?? [];
  const emptyEdits: ProposedEdits = new Map();
  const body = pending?.edits.body ?? emptyEdits;
  const merged = pending?.edits.merged ?? emptyEdits;
  // Effective tree includes extender overlays, so a parent promoted on this commit (a `parentId`
  // write lands its first child) is already a parent when `parentsToRecompute` asks structure.
  const entries =
    pending === undefined ? committed : buildEffectiveEntries(committed, added, removed, merged);
  // The tree this pass walks, checked (ADR 0020): a source that loops would make `ancestorsOf` and
  // `depthOf` below run forever. The committed half is the store's own index, already checked and
  // memoized per revision (`F6`) — this pass reads it rather than walking the whole Dataset a
  // second time to reach the same answer. Nothing is reported from either half: the effective tree
  // is one no commit has landed yet, and the store raises the committed one's refusals itself.
  const parentOfPrior = parentIdIn(tree.committedParents);
  // The store's committed index already holds the right answer when this commit cannot have moved a
  // row (#421 C4): `entries` and `committed` then share the same structure, so re-deriving either
  // half below would only recompute what `tree` already carries.
  const committedTreeStillAnswers =
    pending !== undefined && tree.source === storedParentSource && commitMovesNoRow(added, removed, merged);
  const parentOfEffective =
    pending === undefined || committedTreeStillAnswers
      ? parentOfPrior
      : parentIdIn(checkHierarchyAnswers(entries, tree.source).parents);
  const touched =
    pending === undefined ? undefined : collectTouchedIds(committed, added, removed, merged, parentOfPrior);

  const byParent = committedTreeStillAnswers
    ? tree.committedChildIds
    : childIdsByParent(entries, parentOfEffective);
  const priorByParent =
    pending === undefined || committedTreeStillAnswers
      ? byParent
      : childIdsByParent(committed, parentOfPrior);
  const parents = parentsToRecompute(entries, byParent, priorByParent, touched, parentOfEffective);
  const computed = new Map<EntryId, StoredEntry>();
  // A `compute` Field inside this pass asks `ctx.children()` and must see the pass's own effective
  // children — the store does not hold the value this bottom-up walk just gave a child (ADR 0017).
  // `ctx.hierarchyParentId()` gets the same treatment (ADR 0024): the pass's own effective parent,
  // never the store's committed one, which may not have this edit's hierarchy change yet.
  const passAccess = readingParentFrom(
    readingChildrenFrom(access, (id) =>
      (byParent.get(id) ?? [])
        .map((childId) => effectiveEntry(childId, entries, merged, computed))
        .filter((child): child is StoredEntry => child !== undefined),
    ),
    (entry) => parentIdFrom(parentOfEffective, entry),
  );
  const updated: FieldUpdated[] = [];
  const cascadeDropped: FieldUpdated[] = [];

  for (const parentId of parents) {
    const parent = entries.get(parentId);
    if (!parent) continue;

    const childIds = byParent.get(parentId);
    if (!childIds || childIds.length === 0) {
      // Demoted: `parentsToRecompute` only visits this id with no children left when it had
      // children before this operation (ADR 0013 — losing the last child demotes).
      computed.set(parentId, clearDerivedValues(parent, registry, access, parentId, updated));
      continue;
    }

    const children: StoredEntry[] = [];
    for (const childId of childIds) {
      const child = effectiveEntry(childId, entries, merged, computed);
      if (child) children.push(child);
    }
    if (children.length === 0) continue;

    let effectiveParent = effectiveEntry(parentId, entries, merged, computed) ?? parent;

    for (const field of rollingFields) {
      if (editProposesField(body.get(parentId), field)) continue;

      // A cascade — never the body, which already yielded above — proposed this cell. The Rollup
      // still owns it (decision 5): the write below runs anyway, and this parent+field pair is
      // reported once for the whole commit if it turns out to actually overwrite something.
      const cascadeProposed = editProposesField(merged.get(parentId), field);

      const aggregator = registry.aggregator(field.rollUp);
      if (!aggregator) continue;

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

      if (value === undefined) {
        // ADR 0013, decision 5/6 and #270: an Aggregator with no opinion means *no value* on a
        // parent — never "keep whatever is stored," which is stale by construction the moment
        // nothing but the Rollup may write this cell. `from === undefined` is already clear; there
        // is nothing to drop.
        if (from === undefined) continue;
        const row: FieldUpdated = { store: 'entries', id: parentId, field: field.key, from, to: undefined };
        updated.push(row);
        if (cascadeProposed) cascadeDropped.push(row);
        effectiveParent = writeOntoEntry(effectiveParent, field, undefined);
        continue;
      }

      if (registry.valuesEqual(String(field.key), from, value)) continue;

      const row: FieldUpdated = { store: 'entries', id: parentId, field: field.key, from, to: value };
      updated.push(row);
      if (cascadeProposed) cascadeDropped.push(row);
      effectiveParent = writeOntoEntry(effectiveParent, field, value);
    }

    computed.set(parentId, effectiveParent);
  }

  return { updated, cascadeDropped };
}
