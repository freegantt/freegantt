// view/ — where one keyboard step puts an Entry in the tree. A step is up, down, indent or outdent.
// It names a Tree place the same way a row drop does, then asks the same two rules a drop asks:
// `placementRefusal` for the Entry and the parent it would land under, and `verticalDropOffered` for
// the row source. This file turns the answer into one verdict a command commits without asking twice.

import type { Entry, EntryId } from '../model/index.js';
import type { DropPlace, RowsForDrop } from '../layout/row-drop-target.js';
import { placedEntriesFor, placementRefusal, ROW_DROP_REFUSAL_TEXT } from './row-drop.js';
import type { PlacedEntry, PlacementRefusal, RowDropInput } from './row-drop.js';

/** One keyboard step. `up` and `down` swap the Entry with a sibling. `indent` makes it the last child
 *  of the sibling above it. `outdent` makes it the next sibling of its parent. */
export type EntryStep = 'up' | 'down' | 'indent' | 'outdent';

/** Why a step changes nothing. `'firstSibling'` and `'lastSibling'` — `up` or `down` has no sibling to
 *  swap with. `'noSiblingAbove'` — `indent` has no parent to move under. `'topLevel'` — `outdent` has
 *  no parent to leave. `'rowsOutOfTreeOrder'` — the row source does not mirror the tree, so a tree
 *  place would not show where the row went. The rest are `PlacementRefusal`'s. */
export type EntryStepRefusal =
  'firstSibling' | 'lastSibling' | 'noSiblingAbove' | 'topLevel' | 'rowsOutOfTreeOrder' | PlacementRefusal;

/** What a screen reader hears for each refusal. One sentence each, and the first says nothing moved. */
export const ENTRY_STEP_REFUSAL_TEXT: Readonly<Record<EntryStepRefusal, string>> = Object.freeze({
  firstSibling: 'Nothing moved. This entry is the first of its siblings.',
  lastSibling: 'Nothing moved. This entry is the last of its siblings.',
  noSiblingAbove: 'Nothing moved. No sibling above this entry can take it as a child.',
  topLevel: 'Nothing moved. This entry has no parent to leave.',
  rowsOutOfTreeOrder: 'Nothing moved. The rows do not follow the tree, so a tree move shows nowhere.',
  ownDescendant: ROW_DROP_REFUSAL_TEXT.ownDescendant,
  capability: ROW_DROP_REFUSAL_TEXT.capability,
  parentLocked: ROW_DROP_REFUSAL_TEXT.parentLocked,
});

/** One step's verdict. `place` — the step lands; `moves` lists the write, the same shape a row drop
 *  writes. `refused` — nothing changes, and `reason` says why. */
export type EntryStepVerdict =
  | { readonly kind: 'place'; readonly place: DropPlace; readonly moves: readonly PlacedEntry[] }
  | { readonly kind: 'refused'; readonly reason: EntryStepRefusal };

/** What `resolveEntryStep` reads. `canPlace` and `verticalDropOffered` are the same members a row
 *  drop reads (`RowDropInput`). */
export interface EntryStepInput {
  readonly entry: Entry;
  readonly step: EntryStep;
  readonly rows: RowsForDrop;
  readonly canPlace: RowDropInput['canPlace'];
  readonly verticalDropOffered: boolean;
}

/** The Tree place a step aims at. `index` counts among the target parent's children, moved Entry
 *  included, the same way `DropPlace.index` does. */
interface StepTarget {
  readonly parent: Entry | undefined;
  readonly index: number;
}

/**
 * Where a keyboard step puts the Entry, or why it does not.
 *
 * Call: `resolveEntryStep({ entry, step: 'indent', rows, canPlace, verticalDropOffered })`.
 */
export function resolveEntryStep(input: EntryStepInput): EntryStepVerdict {
  const { entry, step, rows } = input;
  const target = stepTarget(entry, step, rows);
  if ('refused' in target) return { kind: 'refused', reason: target.refused };
  if (!input.verticalDropOffered && !appendsToSegmentsRow(step, target, rows)) {
    return { kind: 'refused', reason: 'rowsOutOfTreeOrder' };
  }

  const parentId = target.parent?.id;
  const refusal = placementRefusal([entry], parentId, rows, input.canPlace);
  if (refusal !== undefined) return { kind: 'refused', reason: refusal };

  const place: DropPlace = {
    parentId,
    index: target.index,
    depth: target.parent === undefined ? 0 : target.parent.depth + 1,
    // A step paints no row and no Insertion line.
    lineY: undefined,
    rowId: undefined,
    side: 'end',
  };
  return { kind: 'place', place, moves: placedEntriesFor([entry], place, rows) };
}

function stepTarget(
  entry: Entry,
  step: EntryStep,
  rows: RowsForDrop,
): StepTarget | { refused: EntryStepRefusal } {
  const parent = entry.parent();
  const siblings = siblingsOf(entry, rows);
  const rank = siblings.findIndex((sibling) => sibling.id === entry.id);
  switch (step) {
    case 'up':
      return rank <= 0 ? { refused: 'firstSibling' } : { parent, index: rank - 1 };
    case 'down':
      // The drop index counts the Entry itself, so one sibling further is two past its own rank.
      return rank >= siblings.length - 1 ? { refused: 'lastSibling' } : { parent, index: rank + 2 };
    case 'indent': {
      const above = siblings[rank - 1];
      return above === undefined
        ? { refused: 'noSiblingAbove' }
        : { parent: above, index: above.children().length };
    }
    case 'outdent': {
      if (parent === undefined) return { refused: 'topLevel' };
      const parentRank = siblingsOf(parent, rows).findIndex((sibling) => sibling.id === parent.id);
      return { parent: parent.parent(), index: parentRank + 1 };
    }
  }
}

function siblingsOf(entry: Entry, rows: RowsForDrop): readonly Entry[] {
  return entry.parent()?.children() ?? rows.rootEntries();
}

/** True for an `indent` under a `childrenAsSegments` row. A row drop also lands "into" such a row
 *  when the rows do not mirror the tree, because appending a child reads no sibling order. */
function appendsToSegmentsRow(step: EntryStep, target: StepTarget, rows: RowsForDrop): boolean {
  if (step !== 'indent' || target.parent === undefined) return false;
  const parentId: EntryId = target.parent.id;
  return rows.rows.find((row) => row.entryIds[0] === parentId)?.childrenAsSegments === true;
}
