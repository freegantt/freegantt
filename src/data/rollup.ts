// data/ — the Rollup: `data/`'s own commit step (never an extender occupant, D-S2-22), giving a
// roll-up-kind parent every rolling-up Field from its children, bottom-up, on every commit
// (`01` §2.5/§2.6, S4.2). A leaf module — only `data/build-commit-change-set.ts` (commit path) and
// `data/transaction.ts` (construction path) name it (D-S4-7, `rollup-is-removable`); delete this file
// and every entry keeps its authored values — the same stored result a consumer gets from
// `rollUpKinds: 'none'`.

import type { Entry, EntryId, EntryKind, FieldContext, FieldUpdated } from '../model/index.js';
import { AggregatorFailedError } from '../model/index.js';
import type { EntryEdits } from './edit-extension.js';
import { ancestorsOf, buildEffectiveEntries, childIdsByParent, depthOf } from './entry-tree.js';
import {
  createRollUpContext,
  editProposesField,
  overlayStoredEdit,
  readField,
  writeOntoEntry,
} from './fields/field-access.js';
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

/**
 * The Rollup writes `start`/`end` straight onto a roll-up-kind parent, the way `field.rollUp: 'min'`
 * / `'max'` above does — that pass alone can leave the parent's own Segments behind, drawing the span
 * they had before this commit (#212 R2 fix-plan review, finding B1). The envelope is the earliest
 * `start` and the latest `end` among the Segments (ADR 0010), so restoring it happens in two steps.
 * First, every Segment clamps into the parent's new `[start, end)` — a Segment the new span has moved
 * past no longer belongs outside it, so it collapses to the nearest edge rather than keeping a stretch
 * the parent no longer covers. Second, whichever Segment still does not reach an edge exactly —
 * because every Segment already sat inside the new span, or clamping only shortened it — widens to
 * reach that edge: the Segment with the earliest `start` moves it to the parent's new `start`, the one
 * with the latest `end` moves it to the parent's new `end`. One Segment plays both roles when the
 * parent draws only one, which is why this reduces to the old sole-Segment pairing in that case. A tie
 * picks the first Segment in array order, the same determinism `entries.add`/`entries.update` already
 * use for a positional match. This is chosen over the two other candidates the #212 R2 fix-plan review
 * named: rejecting a several-Segment roll-up parent at ingest would make `rollUpKinds` and "how many
 * Segments a consumer authors" interact, for no reason a consumer could predict; making the rolled-up
 * value computed-on-read for this case only would split `start`/`end`'s `field source` (`plans/01` §6,
 * ADR 0005) between stored and computed depending on how many Segments a parent happens to draw, which
 * is exactly the kind of `if (kind === ...)`-shaped special case the seams exist to avoid. Widening
 * alone — moving only the two extremal Segments, with no clamp — was tried first and rejected here: a
 * rolled-up span can also *shrink* past an interior Segment (a child removed, or moved to a narrower
 * range), and widening only the Segment that used to be extremal leaves the one it displaced still
 * outside the new envelope, so the invariant this function exists to restore would fail again one
 * Segment over.
 */
function widenSegmentsToEnvelope(
  parent: Entry,
  registry: FieldRegistry,
  ctx: FieldContext,
  parentId: EntryId,
  updated: FieldUpdated[],
): Entry {
  const segmentsField = registry.get('segments');
  if (!segmentsField || parent.segments.length === 0) return parent;

  const { start: targetStart, end: targetEnd } = parent;
  const clamp = (value: typeof targetStart): typeof targetStart => {
    if (value < targetStart) return targetStart;
    if (value > targetEnd) return targetEnd;
    return value;
  };

  let changed = false;
  let nextSegments = parent.segments.map((segment) => {
    const start = clamp(segment.start);
    const end = clamp(segment.end);
    if (start === segment.start && end === segment.end) return segment;
    changed = true;
    return { ...segment, start, end };
  });

  let earliestIndex = 0;
  let latestIndex = 0;
  for (let index = 1; index < nextSegments.length; index++) {
    if (nextSegments[index]!.start < nextSegments[earliestIndex]!.start) earliestIndex = index;
    if (nextSegments[index]!.end > nextSegments[latestIndex]!.end) latestIndex = index;
  }

  if (nextSegments[earliestIndex]!.start !== targetStart) {
    nextSegments = nextSegments.map((segment, index) =>
      index === earliestIndex ? { ...segment, start: targetStart } : segment,
    );
    changed = true;
  }
  if (nextSegments[latestIndex]!.end !== targetEnd) {
    nextSegments = nextSegments.map((segment, index) =>
      index === latestIndex ? { ...segment, end: targetEnd } : segment,
    );
    changed = true;
  }

  if (!changed) return parent;

  const from = readField(parent, segmentsField, ctx);
  updated.push({ store: 'entries', id: parentId, field: segmentsField.key, from, to: nextSegments });
  return writeOntoEntry(parent, segmentsField, nextSegments);
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

  const byParent = childIdsByParent(entries);
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
        value = aggregator(children, effectiveParent, createRollUpContext(ctx, field.key));
      } catch (cause) {
        throw new AggregatorFailedError(field.key, field.rollUp, parentId, cause);
      }

      if (value === undefined) continue;

      const from = readField(effectiveParent, field, ctx);
      if (registry.valuesEqual(String(field.key), from, value)) continue;

      updated.push({ store: 'entries', id: parentId, field: field.key, from, to: value });
      effectiveParent = writeOntoEntry(effectiveParent, field, value);
    }

    effectiveParent = widenSegmentsToEnvelope(effectiveParent, registry, ctx, parentId, updated);
    computed.set(parentId, effectiveParent);
  }

  return updated;
}
