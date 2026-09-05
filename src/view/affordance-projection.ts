// view/ — pure affordance resolution (S3.2/S3.4, D-S3-6). `GanttShell#refreshAffordances` calls this
// to decide which item ids get hover/move/resize paint before it writes `InteractionState` and calls
// `applyState` — no DOM, no shell, no `InteractionState` knowledge here, only the resolution rule.

import { entryIdOfItem } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';
import type { Interactions } from './capability.js';

export interface AffordanceInputs {
  hoveredItemId: ItemId | undefined;
  selection: readonly EntryId[];
  /** The bar the pointer picked from each selected Entry (#185). The sole-selection handle fallback
   *  waits until this names the selected Entry. */
  pickedItemIdByEntryId: ReadonlyMap<EntryId, ItemId>;
  /** Every Item one entry draws in the current frame (`FrameLayout.itemIdsForEntry`). The fallback
   *  asks it instead of building an Item id out of an entry id. */
  itemIdsForEntry: (id: EntryId) => readonly ItemId[];
  canGesture: (capability: keyof Interactions, id: EntryId) => boolean;
}

export interface AffordanceIds {
  hoveredItemId?: ItemId;
  movableItemId?: ItemId;
  /** The Entry the handle pair brackets (#200) — the pair sits on that Entry's envelope, so the two
   *  handles can land on two different bars. Which bars those are is the backend's own reading of
   *  the frame it synced, the same way the Selection paints (#185). */
  resizableEntryId?: EntryId;
}

/** D-S3-6: the hovered bar decides when there is one — even a hover that resolves to "no handles"
 *  wins over the selection fallback. Only when nothing is hovered does the single selected entry, if
 *  there is exactly one, get a turn. */
export function projectAffordances(inputs: AffordanceInputs): AffordanceIds {
  const { hoveredItemId, selection, pickedItemIdByEntryId, itemIdsForEntry, canGesture } = inputs;
  const hoveredEntryId = hoveredItemId !== undefined ? entryIdOfItem(hoveredItemId) : undefined;

  const out: AffordanceIds = {};
  if (hoveredItemId !== undefined) out.hoveredItemId = hoveredItemId;

  if (hoveredItemId !== undefined && hoveredEntryId !== undefined && canGesture('move', hoveredEntryId)) {
    out.movableItemId = hoveredItemId;
  }

  const resizableEntryId = resolveResizableEntryId({
    hoveredItemId,
    hoveredEntryId,
    selection,
    pickedItemIdByEntryId,
    itemIdsForEntry,
    canGesture,
  });
  if (resizableEntryId !== undefined) out.resizableEntryId = resizableEntryId;
  return out;
}

/** Which Entry does the handle pair bracket? The hovered bar's Entry when a bar is hovered. With
 *  nothing hovered, the single selected Entry — but only once the pointer has picked one of its bars
 *  (#185), or when it draws exactly one bar. A segmented Entry selected from the grid pane has had
 *  no bar picked, so it gets no handles until the pointer visits one. */
function resolveResizableEntryId(inputs: {
  hoveredItemId: ItemId | undefined;
  hoveredEntryId: EntryId | undefined;
  selection: readonly EntryId[];
  pickedItemIdByEntryId: ReadonlyMap<EntryId, ItemId>;
  itemIdsForEntry: (id: EntryId) => readonly ItemId[];
  canGesture: (capability: keyof Interactions, id: EntryId) => boolean;
}): EntryId | undefined {
  const { hoveredItemId, hoveredEntryId, selection, pickedItemIdByEntryId, itemIdsForEntry, canGesture } =
    inputs;
  if (hoveredItemId !== undefined) {
    return hoveredEntryId !== undefined && canGesture('resize', hoveredEntryId) ? hoveredEntryId : undefined;
  }
  if (selection.length !== 1) return undefined;
  const soleId = selection[0]!;
  if (!canGesture('resize', soleId)) return undefined;
  if (pickedItemIdByEntryId.has(soleId)) return soleId;
  return itemIdsForEntry(soleId).length === 1 ? soleId : undefined;
}
