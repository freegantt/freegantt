// view/ — pure affordance resolution (S3.2/S3.4, D-S3-6). `GanttShell#refreshAffordances` calls this
// to decide which item ids get hover/move/resize paint before it writes `InteractionState` and calls
// `applyState` — no DOM, no shell, no `InteractionState` knowledge here, only the resolution rule.

import { entryIdOfItem, itemId } from '../model/index.js';
import type { EntryId, ItemId } from '../model/index.js';
import type { Interactions } from './capability.js';

export interface AffordanceInputs {
  hoveredItemId: ItemId | undefined;
  selection: readonly EntryId[];
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
  const { hoveredItemId, selection, canGesture } = inputs;
  const hoveredEntryId = hoveredItemId !== undefined ? entryIdOfItem(hoveredItemId) : undefined;

  const out: AffordanceIds = {};
  if (hoveredItemId !== undefined) out.hoveredItemId = hoveredItemId;

  if (hoveredItemId !== undefined && hoveredEntryId !== undefined && canGesture('move', hoveredEntryId)) {
    out.movableItemId = hoveredItemId;
  }

  const resizableItemId = resolveResizableItemId({ hoveredItemId, hoveredEntryId, selection, canGesture });
  if (resizableItemId !== undefined) out.resizableItemId = resizableItemId;
  return out;
}

function resolveResizableItemId(inputs: {
  hoveredItemId: ItemId | undefined;
  hoveredEntryId: EntryId | undefined;
  selection: readonly EntryId[];
  canGesture: (capability: keyof Interactions, id: EntryId) => boolean;
}): ItemId | undefined {
  const { hoveredItemId, hoveredEntryId, selection, canGesture } = inputs;
  if (hoveredItemId !== undefined) {
    return hoveredEntryId !== undefined && canGesture('resize', hoveredEntryId) ? hoveredItemId : undefined;
  }
  if (selection.length !== 1) return undefined;
  const soleId = selection[0]!;
  return canGesture('resize', soleId) ? itemId(soleId) : undefined;
}
