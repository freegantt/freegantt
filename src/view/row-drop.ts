// view/ — the one resolver a vertical drag's preview and commit both call (#425). `layout/` answers
// "where is the pointer" (`row-drop-zone.ts`) and "what tree place is that" (`row-drop-target.ts`);
// `data/sibling-order.ts` answers "what does placing it there write". Only `view/` can ask the two
// questions those pure layers cannot: does the moved Entry's own capability and lock state allow
// this, and would the drop land inside the Entry's own subtree. This file asks both, in order, and
// turns the answer into one verdict a preview paints and a commit writes without asking twice.

import type { Entry, EntryId, RowId, TreePlace } from '../model/index.js';
import type { RowDropZone } from '../layout/row-drop-zone.js';
import { ROW_DROP_ZONE_KIND } from '../layout/row-drop-zone.js';
import type { DropPlace, RowsForDrop } from '../layout/row-drop-target.js';
import { dropPlaceFor } from '../layout/row-drop-target.js';
import { siblingBlockMove } from '../data/sibling-order.js';

/** Why a drop refuses. `'groupHeader'` — the zone named a header row, which stands for no Entry to
 *  land on or under. `'entryGone'` — the row plan is a stale mid-drag snapshot and its subject is
 *  an id the Dataset no longer holds (`dropPlaceFor`'s own doc). `'ownDescendant'` — the target sits
 *  inside the moved Entry's own subtree, the cycle `EntryStore` would otherwise throw on.
 *  `'capability'` — the moved Entry's own `reorder` capability, its `siblingIndex` cell, or a
 *  plugin's place rule refuses the gesture outright, a same-parent drop included. `'parentLocked'` —
 *  `reorder` is open and a same-parent drop would land, but this drop crosses into a different
 *  parent and the Entry's `parentId` cell, or a plugin's place rule, refuses that crossing.
 *  `'ancestorLocked'` — this file never returns it (`resolveRowDrop` answers place, never time); the
 *  gesture pipeline does, for a drop whose Rollup would change a date an ancestor's lock holds
 *  (`gesture-pipeline.ts`'s `#refusedWhereDatesHold`). Unlike `'parentLocked'`, which refuses the
 *  moved Entry's own `parentId` cell, this refuses a date cell somewhere above it that the move never
 *  names directly. */
export type RowDropRefusal =
  'groupHeader' | 'entryGone' | 'ownDescendant' | 'capability' | 'parentLocked' | 'ancestorLocked';

/** One Entry a `place` drop writes. `at` is the call-time index the pipeline's `entries.update`
 *  names for this Entry — a rank into the group as it stood when that call ran, not the final rank
 *  every call together produces (`SiblingBlockMove`'s own doc covers why the two differ).
 *  `place`/`currentPlace` are the final Tree place and the Tree place the Entry held before the
 *  drop — what the `entryMove` payload reports. */
export interface PlacedEntry {
  readonly id: EntryId;
  readonly parentId: EntryId | undefined;
  readonly at: number;
  readonly place: TreePlace;
  readonly currentPlace: TreePlace;
}

/** One vertical drag's verdict. `timeOnly` — the pointer sits over the source row, or this row
 *  source offers no vertical drop at all, so the drag can only move time. `place` — the drop lands;
 *  `moves` lists the write every moved Entry's `entries.update` call makes, grabbed Entry first.
 *  `refused` — no rule lets the drop land there; `rowId` is the row the refusal style paints on,
 *  `undefined` for a drop past the last row. */
export type RowDrop =
  | { readonly kind: 'timeOnly' }
  | { readonly kind: 'place'; readonly place: DropPlace; readonly moves: readonly PlacedEntry[] }
  | { readonly kind: 'refused'; readonly rowId: RowId | undefined; readonly reason: RowDropRefusal };

/** What `resolveRowDrop` reads. `movedTopMost` is the grabbed Entry, then any co-selected Entry
 *  with no selected ancestor, in row order — the pipeline builds this list once per gesture and
 *  hands the same one to preview and commit. `canPlace` is `ResolvedCapabilities.canPlace` (#425).
 *  `verticalDropOffered` is `false` for a row source that does not mirror the tree — a
 *  plugin-owned hierarchy, a sorted source, a grouped source. A `childrenAsSegments` row still
 *  takes an `into` drop then: appending a child reads no sibling order, so it needs no mirror. */
export interface RowDropInput {
  readonly zone: RowDropZone;
  readonly movedTopMost: readonly Entry[];
  readonly rows: RowsForDrop;
  canPlace(entry: Entry, parentId: EntryId | undefined): boolean;
  readonly verticalDropOffered: boolean;
}

/**
 * Where a vertical drag lands, or why it does not.
 *
 * Order matters: a header answer short-circuits before any Entry is asked anything; a cycle check
 * runs for every moved Entry before any capability is asked, because a capability refusal and a
 * cycle refusal read as two different reasons and the cycle is the cheaper of the two to rule out.
 */
export function resolveRowDrop(input: RowDropInput): RowDrop {
  const { zone, movedTopMost, rows, verticalDropOffered } = input;

  if (zone.kind === ROW_DROP_ZONE_KIND.sourceRow) return { kind: 'timeOnly' };
  if (!verticalDropOffered && !intoChildrenAsSegmentsRow(zone, rows)) return { kind: 'timeOnly' };

  const answer = dropPlaceFor(zone, rows);
  if ('refused' in answer) return { kind: 'refused', rowId: answer.rowId, reason: answer.refused };
  const place = answer;

  for (const entry of movedTopMost) {
    if (landsInsideOwnSubtree(entry, place.parentId, rows)) {
      return { kind: 'refused', rowId: place.rowId, reason: 'ownDescendant' };
    }
  }

  for (const entry of movedTopMost) {
    // Asking `canPlace` with the Entry's own current parent isolates "may it reorder at all" from
    // "may it cross into this parent": a same-parent answer never trips the second half
    // (`ResolvedCapabilities.canPlace`'s own rule), so a `false` here can only be the first half.
    // ADR 0038: a plugin's place rule also gets a say on this same-parent call — a rule that closes
    // a parent entirely (not just to a crossing) reads as this same 'capability' refusal.
    if (!input.canPlace(entry, entry.parent()?.id)) {
      return { kind: 'refused', rowId: place.rowId, reason: 'capability' };
    }
    if (!input.canPlace(entry, place.parentId)) {
      return { kind: 'refused', rowId: place.rowId, reason: 'parentLocked' };
    }
  }

  return { kind: 'place', place, moves: movesFor(movedTopMost, place, rows) };
}

/** True for a `row` zone naming a `childrenAsSegments` row — the one row shape that still takes an
 *  `into` drop when `verticalDropOffered` is `false` (this file's own doc comment on the input). */
function intoChildrenAsSegmentsRow(zone: RowDropZone, rows: RowsForDrop): boolean {
  return zone.kind === ROW_DROP_ZONE_KIND.row && rows.rows[zone.rowIndex]?.childrenAsSegments === true;
}

/** True while `parentId` names `entry` itself or one of its ancestors — the cycle a drop onto an
 *  Entry's own descendant would create. Walks up from the target, never down from `entry`'s own
 *  subtree, so the cost is the target's depth, not the moved Entry's size. */
function landsInsideOwnSubtree(entry: Entry, parentId: EntryId | undefined, rows: RowsForDrop): boolean {
  let ancestor = parentId === undefined ? undefined : rows.entryOf(parentId);
  while (ancestor !== undefined) {
    if (ancestor.id === entry.id) return true;
    ancestor = ancestor.parent();
  }
  return false;
}

/** The write every moved Entry's `entries.update` call makes, once every Entry has cleared both
 *  checks above. `targetSiblings` is the target group's own committed order — the same list
 *  `place.index` was read against — moved ids already in that group included. */
function movesFor(
  movedTopMost: readonly Entry[],
  place: DropPlace,
  rows: RowsForDrop,
): readonly PlacedEntry[] {
  const byId = new Map(movedTopMost.map((entry) => [entry.id, entry]));
  const targetGroup =
    place.parentId === undefined ? rows.rootEntries() : rows.entryOf(place.parentId)!.children();
  const block = siblingBlockMove({
    movedIds: movedTopMost.map((entry) => entry.id),
    targetSiblings: targetGroup.map((entry) => entry.id),
    index: place.index,
  });
  return block.calls.map(({ id, at }) => {
    const entry = byId.get(id)!; // Every call names a moved id, and every moved id is in `byId`.
    return {
      id,
      parentId: place.parentId,
      at,
      place: { parentId: place.parentId, siblingIndex: block.finalRanks.get(id)! },
      currentPlace: { parentId: entry.parent()?.id, siblingIndex: entry.read('siblingIndex') as number },
    };
  });
}
