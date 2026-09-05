// view/ — pure affordance resolution (S3.2/S3.4, D-S3-6). `GanttShell#refreshAffordances` calls this
// to decide which item ids get hover/move/resize paint before it writes `InteractionState` and calls
// `applyState` — no DOM, no shell, no `InteractionState` knowledge here, only the resolution rule.

import { entryIdOfItem } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';
import type { Interactions } from './capability.js';

export interface AffordanceInputs {
  hoveredItemId: ItemId | undefined;
  selection: readonly EntryId[];
  /** The Item the pointer last picked (#185). The sole-selection handle fallback sits on it while it
   *  still belongs to the selected entry. */
  pickedItemId: ItemId | undefined;
  /** Every Item one entry draws in the current frame (`FrameLayout.itemIdsForEntry`). The fallback
   *  asks it instead of building an Item id out of an entry id. */
  itemIdsForEntry: (id: EntryId) => readonly ItemId[];
  canGesture: (capability: keyof Interactions, id: EntryId) => boolean;
}

export interface AffordanceIds {
  hoveredItemId?: ItemId;
  movableItemId?: ItemId;
  resizableItemId?: ItemId;
}

/** D-S3-6: the hovered bar decides when there is one — even a hover that resolves to "no handles"
 *  wins over the selection fallback. Only when nothing is hovered does the single selected entry, if
 *  there is exactly one, get a turn. */
export function projectAffordances(inputs: AffordanceInputs): AffordanceIds {
  const { hoveredItemId, selection, pickedItemId, itemIdsForEntry, canGesture } = inputs;
  const hoveredEntryId = hoveredItemId !== undefined ? entryIdOfItem(hoveredItemId) : undefined;

  const out: AffordanceIds = {};
  if (hoveredItemId !== undefined) out.hoveredItemId = hoveredItemId;

  if (hoveredItemId !== undefined && hoveredEntryId !== undefined && canGesture('move', hoveredEntryId)) {
    out.movableItemId = hoveredItemId;
  }

  const resizableItemId = resolveResizableItemId({
    hoveredItemId,
    hoveredEntryId,
    selection,
    pickedItemId,
    itemIdsForEntry,
    canGesture,
  });
  if (resizableItemId !== undefined) out.resizableItemId = resizableItemId;
  return out;
}

/** The handle pair sits on one bar, so the fallback needs one Item, not the selection's whole paint
 *  (#185). With nothing hovered and one entry selected it takes the picked Item when that entry
 *  drew it. Otherwise it takes the entry's own Item, and only when the entry draws exactly one — a
 *  segmented entry selected from the grid has no single bar to hold the handles, so it gets none. */
function resolveResizableItemId(inputs: {
  hoveredItemId: ItemId | undefined;
  hoveredEntryId: EntryId | undefined;
  selection: readonly EntryId[];
  pickedItemId: ItemId | undefined;
  itemIdsForEntry: (id: EntryId) => readonly ItemId[];
  canGesture: (capability: keyof Interactions, id: EntryId) => boolean;
}): ItemId | undefined {
  const { hoveredItemId, hoveredEntryId, selection, pickedItemId, itemIdsForEntry, canGesture } = inputs;
  if (hoveredItemId !== undefined) {
    return hoveredEntryId !== undefined && canGesture('resize', hoveredEntryId) ? hoveredItemId : undefined;
  }
  if (selection.length !== 1) return undefined;
  const soleId = selection[0]!;
  if (!canGesture('resize', soleId)) return undefined;
  const drawn = itemIdsForEntry(soleId);
  if (pickedItemId !== undefined && drawn.includes(pickedItemId)) return pickedItemId;
  return drawn.length === 1 ? drawn[0] : undefined;
}
