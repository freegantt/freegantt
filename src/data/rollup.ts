// data/ — the Rollup: `data/`'s own commit step (never an extender occupant, D-S2-22), giving a
// roll-up-kind parent every rolling-up Field from its children, bottom-up, on every commit
// (`01` §2.5/§2.6, S4.2). A leaf module — only `data/build-commit-change-set.ts` (commit path) and
// `data/transaction.ts` (construction path) name it (D-S4-7, `rollup-is-removable`); delete this file
// and every entry keeps its authored values — the same stored result a consumer gets from
// `rollUpKinds: 'none'`.

import type { Entry, EntryId, EntryKind, FieldContext, FieldUpdated } from '../model/index.js';
import { AggregatorFailedError } from '../model/index.js';
import type { EntryEdits } from './edit-extension.js';
import { ancestorsOf, buildEffectiveEntries, childrenByParent, depthOf } from './entry-tree.js';
import { editProposesField, overlayStoredEdit, readField, writeOntoEntry } from './fields/field-access.js';
import type { FieldRegistry } from './fields/field-registry.js';

export interface RollUpEditSets {
  /** The transaction body's edits — the Rollup yields to a field proposed here (D-S2-22). */
  readonly body: EntryEdits;
  /** Body plus extension-hook edits — used to read effective child values. */
  readonly merged: EntryEdits;
}

/** Adds, removes and body edits the commit path has not written yet. Construction omits this. */
export interface PendingRollUp {
  readonly added: readonly Entry[];
  readonly removed: readonly Entry[];
  readonly edits: RollUpEditSets;
}

function collectTouchedIds(
  entries: ReadonlyMap<EntryId, Entry>,
  added: readonly Entry[],
  removed: readonly Entry[],
  proposed: EntryEdits,
): ReadonlySet<EntryId> {
  const touched = new Set<EntryId>();
  for (const entry of added) touched.add(entry.id);
  for (const entry of removed) {
    touched.add(entry.id);
    const parentId = entries.get(entry.id)?.parentId;
    if (parentId !== undefined) touched.add(parentId);
  }
  for (const id of proposed.keys()) touched.add(id);
  for (const [id, edit] of proposed) {
    if ('parentId' in edit) {
      const former = entries.get(id)?.parentId;
      if (former !== undefined) touched.add(former);
    }
  }
  return touched;
}

function parentsToRecompute(
  entries: ReadonlyMap<EntryId, Entry>,
  kinds: ReadonlySet<EntryKind>,
  touched: ReadonlySet<EntryId> | undefined,
): readonly EntryId[] {
  if (kinds.size === 0) return [];

  const parents = new Set<EntryId>();
  if (touched === undefined) {
    for (const entry of entries.values()) {
      if (kinds.has(entry.kind)) parents.add(entry.id);
    }
  } else {
    for (const id of touched) {
      for (const ancestor of ancestorsOf(id, entries)) parents.add(ancestor);
      const entry = entries.get(id);
      if (entry !== undefined && kinds.has(entry.kind)) parents.add(id);
    }
  }

  const filtered = Array.from(parents).filter((id) => {
    const entry = entries.get(id);
    return entry !== undefined && kinds.has(entry.kind);
  });

  const depthById = new Map<EntryId, number>();
  for (const id of filtered) depthById.set(id, depthOf(id, entries));

  return filtered.sort((a, b) => depthById.get(b)! - depthById.get(a)!);
}

function effectiveEntry(
  id: EntryId,
  entries: ReadonlyMap<EntryId, Entry>,
  merged: EntryEdits,
  computed: ReadonlyMap<EntryId, Entry>,
): Entry | undefined {
  const rolled = computed.get(id);
  if (rolled) return rolled;
  const current = entries.get(id);
  if (!current) return undefined;
  const edit = merged.get(id);
  return edit ? overlayStoredEdit(current, edit) : current;
}

/**
 * Construction omits `pending` and walks every deriving parent. Commit passes adds, removes and
 * edits; the pass then builds the effective tree and walks only the ancestors it must (D-S4-8).
 */
export function rollUpFields(
  committed: ReadonlyMap<EntryId, Entry>,
  pending: PendingRollUp | undefined,
  registry: FieldRegistry,
  rollUpKinds: ReadonlySet<EntryKind>,
  ctx: FieldContext,
): readonly FieldUpdated[] {
  if (rollUpKinds.size === 0) return [];

  const rollingFields = registry.rollingUpFields();
  if (rollingFields.length === 0) return [];

  const added = pending?.added ?? [];
  const removed = pending?.removed ?? [];
  const emptyEdits: EntryEdits = new Map();
  const body = pending?.edits.body ?? emptyEdits;
  const merged = pending?.edits.merged ?? emptyEdits;
  // Effective tree includes extender and autoGroup overlays so a parent promoted on this commit
  // is already a roll-up Kind when `parentsToRecompute` reads `entry.kind` (D-S4-17).
  const entries =
    pending === undefined ? committed : buildEffectiveEntries(committed, added, removed, merged);
  const touched = pending === undefined ? undefined : collectTouchedIds(committed, added, removed, merged);

  const byParent = childrenByParent(entries);
  const parents = parentsToRecompute(entries, rollUpKinds, touched);
  const computed = new Map<EntryId, Entry>();
  const updated: FieldUpdated[] = [];

  for (const parentId of parents) {
    const parent = entries.get(parentId);
    if (!parent) continue;

    const childIds = byParent.get(parentId);
    if (!childIds || childIds.length === 0) continue;

    const children: Entry[] = [];
    for (const childId of childIds) {
      const child = effectiveEntry(childId, entries, merged, computed);
      if (child) children.push(child);
    }
    if (children.length === 0) continue;

    let effectiveParent = effectiveEntry(parentId, entries, merged, computed) ?? parent;

    for (const field of rollingFields) {
      if (editProposesField(body.get(parentId), field)) continue;

      const aggregator = registry.aggregator(field.rollUp);
      if (!aggregator) continue;

      let value: unknown;
      try {
        value = aggregator(children, effectiveParent, { ...ctx, field: field.key });
      } catch {
        throw new AggregatorFailedError(field.key, field.rollUp, parentId);
      }

      if (value === undefined) continue;

      const from = readField(effectiveParent, field, ctx);
      if (registry.valuesEqual(String(field.key), from, value)) continue;

      updated.push({ store: 'entries', id: parentId, field: field.key, from, to: value });
      effectiveParent = writeOntoEntry(effectiveParent, field, value);
    }

    computed.set(parentId, effectiveParent);
  }

  return updated;
}
