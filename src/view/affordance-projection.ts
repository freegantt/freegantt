// view/ — pure affordance resolution (S3.2/S3.4, D-S3-6). `GanttShell#refreshAffordances` calls this
// to decide which item ids get hover/move/resize paint before it writes `InteractionState` and calls
// `applyState` — no DOM, no shell, no `InteractionState` knowledge here, only the resolution rule.

import { entryIdOfItem } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';
import type { Interactions } from './capability.js';

export interface AffordanceInputs {
  hoveredItemId: ItemId | undefined;
  /** The one Entry the Selection names, when it names exactly one (#212, ADR 0010, review finding 7).
   *  `undefined` when the Selection is empty or spans more than one Entry — either way the
   *  sole-selection fallback below has nothing to fall back to. The handle pair brackets an Entry
   *  (#200), so this narrows to an Entry, not a Segment count. */
  soleSelectedEntryId: EntryId | undefined;
  /** How many of the Selection's Segments belong to `soleSelectedEntryId`. Meaningless when that is
   *  `undefined`. Exactly one means the user named one bar, and that is when the sole-selection
   *  fallback shows its handles (#212). */
  selectedSegmentCountOfSoleEntry: number;
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
  const { hoveredItemId, soleSelectedEntryId, selectedSegmentCountOfSoleEntry, itemIdsForEntry, canGesture } =
    inputs;
  const hoveredEntryId = hoveredItemId !== undefined ? entryIdOfItem(hoveredItemId) : undefined;

  const out: AffordanceIds = {};
  if (hoveredItemId !== undefined) out.hoveredItemId = hoveredItemId;

  if (hoveredItemId !== undefined && hoveredEntryId !== undefined && canGesture('move', hoveredEntryId)) {
    out.movableItemId = hoveredItemId;
  }

  const resizableEntryId = resolveResizableEntryId({
    hoveredItemId,
    hoveredEntryId,
    soleSelectedEntryId,
    selectedSegmentCountOfSoleEntry,
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
  soleSelectedEntryId: EntryId | undefined;
  selectedSegmentCountOfSoleEntry: number;
  itemIdsForEntry: (id: EntryId) => readonly ItemId[];
  canGesture: (capability: keyof Interactions, id: EntryId) => boolean;
}): EntryId | undefined {
  const {
    hoveredItemId,
    hoveredEntryId,
    soleSelectedEntryId,
    selectedSegmentCountOfSoleEntry,
    itemIdsForEntry,
    canGesture,
  } = inputs;
  if (hoveredItemId !== undefined) {
    return hoveredEntryId !== undefined && canGesture('resize', hoveredEntryId) ? hoveredEntryId : undefined;
  }
  if (soleSelectedEntryId === undefined) return undefined;
  if (!canGesture('resize', soleSelectedEntryId)) return undefined;
  if (selectedSegmentCountOfSoleEntry === 1) return soleSelectedEntryId;
  return itemIdsForEntry(soleSelectedEntryId).length === 1 ? soleSelectedEntryId : undefined;
}
