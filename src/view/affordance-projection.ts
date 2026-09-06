// view/ — pure affordance resolution (S3.2/S3.4, D-S3-6). `GanttShell#refreshAffordances` calls this
// to decide which item ids get hover/move/resize paint before it writes `InteractionState` and calls
// `applyState` — no DOM, no shell, no `InteractionState` knowledge here, only the resolution rule.

import { entryIdOfItem } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';
import type { Interactions } from './capability.js';

export interface AffordanceInputs {
  hoveredItemId: ItemId | undefined;
  /** The Entries the Selection's Segments belong to, deduped, in row order (#212, ADR 0010). The
   *  handle pair brackets an Entry (#200), so the fallback below counts Entries, not Segments. */
  selectedEntryIds: readonly EntryId[];
  /** How many Segments of one Entry the Selection holds (#212). Exactly one means the user named one
   *  bar, and that is when the sole-selection fallback shows its handles. */
  selectedSegmentCount: (id: EntryId) => number;
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
  const { hoveredItemId, selectedEntryIds, selectedSegmentCount, itemIdsForEntry, canGesture } = inputs;
  const hoveredEntryId = hoveredItemId !== undefined ? entryIdOfItem(hoveredItemId) : undefined;

  const out: AffordanceIds = {};
  if (hoveredItemId !== undefined) out.hoveredItemId = hoveredItemId;

  if (hoveredItemId !== undefined && hoveredEntryId !== undefined && canGesture('move', hoveredEntryId)) {
    out.movableItemId = hoveredItemId;
  }

  const resizableEntryId = resolveResizableEntryId({
    hoveredItemId,
    hoveredEntryId,
    selectedEntryIds,
    selectedSegmentCount,
    itemIdsForEntry,
    canGesture,
  });
  if (resizableEntryId !== undefined) out.resizableEntryId = resizableEntryId;
  return out;
}

/** Which Entry does the handle pair bracket? The hovered bar's Entry when a bar is hovered. With
 *  nothing hovered, the single selected Entry — but only once the Selection names one of its Segments
 *  (#212), or when it draws exactly one bar. A segmented Entry selected from the grid pane has every
 *  Segment in the Selection, so it gets no handles until the pointer visits one bar. */
function resolveResizableEntryId(inputs: {
  hoveredItemId: ItemId | undefined;
  hoveredEntryId: EntryId | undefined;
  selectedEntryIds: readonly EntryId[];
  selectedSegmentCount: (id: EntryId) => number;
  itemIdsForEntry: (id: EntryId) => readonly ItemId[];
  canGesture: (capability: keyof Interactions, id: EntryId) => boolean;
}): EntryId | undefined {
  const {
    hoveredItemId,
    hoveredEntryId,
    selectedEntryIds,
    selectedSegmentCount,
    itemIdsForEntry,
    canGesture,
  } = inputs;
  if (hoveredItemId !== undefined) {
    return hoveredEntryId !== undefined && canGesture('resize', hoveredEntryId) ? hoveredEntryId : undefined;
  }
  if (selectedEntryIds.length !== 1) return undefined;
  const soleId = selectedEntryIds[0]!;
  if (!canGesture('resize', soleId)) return undefined;
  if (selectedSegmentCount(soleId) === 1) return soleId;
  return itemIdsForEntry(soleId).length === 1 ? soleId : undefined;
}
