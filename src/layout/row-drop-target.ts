// layout/ — where does a vertical drag's zone place the dragged Entry in the tree (plans/01 §4,
// D-C). Pure: a caller hands in the resolved `RowDropZone` (`row-drop-zone.ts`) and the row plan
// it applies to, and reads back a `DropPlace` — a parent, a rank among its current children, the
// depth the Insertion line paints at, and the y that line sits on.

import type { Entry, EntryId, RowId } from '../model/index.js';
import type { PlannedRow } from './rows/row-source.js';
import { isPlannedHeaderRow } from './rows/row-source.js';
import type { RowDropSide, RowDropZone } from './row-drop-zone.js';
import { ROW_DROP_ZONE_KIND } from './row-drop-zone.js';

/** What `dropPlaceFor` reads about the row plan a `RowDropZone` names a row in. `layout/` cannot
 *  read a Dataset's root list itself (it may import only `time`, `model`), so the caller — the one
 *  holding the Dataset — hands the root order in through `rootEntries()`, the same way it already
 *  hands committed rows in through `rows`. */
export interface RowsForDrop {
  readonly rows: readonly PlannedRow[];
  rowTop(index: number): number;
  rowHeightAt(index: number): number;
  entryOf(id: EntryId): Entry | undefined;
  /** Every Entry at tree depth 0, in sibling order. */
  rootEntries(): readonly Entry[];
}

/** Where a drop places the dragged Entry: `parentId` and `index` are the Tree place it writes;
 *  `depth` and `lineY` are what the Insertion line paints (`lineY` is `undefined` for an `into`
 *  drop — a highlighted row needs no line). `rowId` is the row the drop style paints on;
 *  `undefined` only for a drop past the last row. `side` restates which third resolved this
 *  place, `'end'` for that same past-the-last-row drop. */
export interface DropPlace {
  readonly parentId: EntryId | undefined;
  readonly index: number;
  readonly depth: number;
  readonly lineY: number | undefined;
  readonly rowId: RowId | undefined;
  readonly side: RowDropSide | 'end';
}

/** A drop a Row drop zone resolves to no Tree place at all. `'groupHeader'` — the zone named a
 *  group header row, which stands for no Entry to become a parent or a sibling of. `'entryGone'` —
 *  the row plan is a stale mid-drag snapshot (`RowsForDrop`'s own doc) and the row's subject is an
 *  id the Dataset no longer holds; refusing is the only safe answer until the plan catches up. */
export type DropPlaceAnswer =
  DropPlace | { readonly refused: 'groupHeader' | 'entryGone'; readonly rowId: RowId };

/** Turns a resolved `RowDropZone` into where the drop lands, or a refusal. Takes only `'row'` and
 *  `'belowLastRow'` zones — `'sourceRow'` is a time-only move and never reaches here
 *  (`view/row-drop.ts` is the caller that tells the two apart). */
export function dropPlaceFor(
  zone: Extract<RowDropZone, { kind: 'row' | 'belowLastRow' }>,
  rows: RowsForDrop,
): DropPlaceAnswer {
  if (zone.kind === ROW_DROP_ZONE_KIND.belowLastRow) return belowLastRowPlace(rows);
  return rowZonePlace(zone, rows);
}

function belowLastRowPlace(rows: RowsForDrop): DropPlace {
  return {
    parentId: undefined,
    index: rows.rootEntries().length,
    depth: 0,
    lineY: rows.rowTop(rows.rows.length),
    rowId: undefined,
    side: 'end',
  };
}

function rowZonePlace(zone: Extract<RowDropZone, { kind: 'row' }>, rows: RowsForDrop): DropPlaceAnswer {
  const row = rows.rows[zone.rowIndex]!; // The zone this pass produced names one of this pass's own rows.
  if (isPlannedHeaderRow(row)) return { refused: 'groupHeader', rowId: row.id };

  const subjectId = row.entryIds[0]!; // A non-header row always names its own subject first.
  // A stale mid-drag plan (`RowsForDrop`'s own doc) can still name a subject the live Dataset has
  // already dropped — refuse the zone rather than crash on a row the next frame's plan will drop too.
  const subject = rows.entryOf(subjectId);
  if (subject === undefined) return { refused: 'entryGone', rowId: row.id };

  if (row.childrenAsSegments === true || zone.side === 'into') return intoPlace(row, subject);
  if (zone.side === 'before') return beforePlace(zone.rowIndex, row, subject, rows);
  return afterPlace(zone.rowIndex, row, subject, rows);
}

/** Landing inside the row's own subject: it becomes the target's newest child, appended last. */
function intoPlace(row: PlannedRow, subject: Entry): DropPlace {
  return {
    parentId: subject.id,
    index: subject.children().length,
    depth: row.depth + 1,
    lineY: undefined,
    rowId: row.id,
    side: 'into',
  };
}

/** Landing above the row: same group as the row's subject, at its own rank — the Insertion line
 *  sits on the row's own top edge, at the row's own depth. */
function beforePlace(rowIndex: number, row: PlannedRow, subject: Entry, rows: RowsForDrop): DropPlace {
  const parent = subject.parent();
  const siblings = parent?.children() ?? rows.rootEntries();
  return {
    parentId: parent?.id,
    index: rankOf(subject, siblings),
    depth: row.depth,
    lineY: rows.rowTop(rowIndex),
    rowId: row.id,
    side: 'before',
  };
}

/** Landing below the row. An expanded, expandable, non-segmented row's bottom edge is also its
 *  first child's top edge — the owner's rule (the last child's bottom zone reaches inside the
 *  group, the row right after it reaches outside): the drop becomes that first child, one depth
 *  deeper, on the very same y a `before` on the row below would paint. Any other row's bottom edge
 *  is a plain sibling boundary: same group as the row's subject, one rank past it. */
function afterPlace(rowIndex: number, row: PlannedRow, subject: Entry, rows: RowsForDrop): DropPlace {
  const lineY = rows.rowTop(rowIndex) + rows.rowHeightAt(rowIndex);
  if (row.expanded && row.expandable && row.childrenAsSegments !== true) {
    return { parentId: subject.id, index: 0, depth: row.depth + 1, lineY, rowId: row.id, side: 'after' };
  }
  const parent = subject.parent();
  const siblings = parent?.children() ?? rows.rootEntries();
  return {
    parentId: parent?.id,
    index: rankOf(subject, siblings) + 1,
    depth: row.depth,
    lineY,
    rowId: row.id,
    side: 'after',
  };
}

function rankOf(subject: Entry, siblings: readonly Entry[]): number {
  return siblings.findIndex((entry) => entry.id === subject.id);
}
