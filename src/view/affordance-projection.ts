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
  canGesture: (capability: keyof Interactions, id: EntryId, edge?: 'start' | 'end') => boolean;
}

export interface AffordanceIds {
  hoveredItemId?: ItemId;
  movableItemId?: ItemId;
  /** The Entry the handle pair brackets (#200) — the pair sits on that Entry's envelope, so the two
   *  handles can land on two different bars. Which bars those are is the backend's own reading of
   *  the frame it synced, the same way the Selection paints (#185). */
  resizableEntryId?: EntryId;
  /** #142: which of `resizableEntryId`'s two handles may resize, independently — a Field's own
   *  `editable` can close `end` while leaving `start` open (or the reverse). Present exactly when
   *  `resizableEntryId` is; a backend hides a handle whose own edge answers `false` here even while
   *  the other one still paints. */
  resizableEdges?: { start: boolean; end: boolean };
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

  const resizable = resolveResizableEntry({
    hoveredItemId,
    hoveredEntryId,
    soleSelectedEntryId,
    selectedSegmentCountOfSoleEntry,
    itemIdsForEntry,
    canGesture,
  });
  if (resizable !== undefined) {
    out.resizableEntryId = resizable.entryId;
    out.resizableEdges = resizable.edges;
  }
  return out;
}

/** Both edges' own `resize` answer for `id` (#142) — `undefined` when neither may resize, which
 *  is the "no handles at all" case every caller below already treats as a miss. */
function resolveEdges(
  id: EntryId,
  canGesture: (capability: keyof Interactions, id: EntryId, edge?: 'start' | 'end') => boolean,
): { start: boolean; end: boolean } | undefined {
  const start = canGesture('resize', id, 'start');
  const end = canGesture('resize', id, 'end');
  return start || end ? { start, end } : undefined;
}

/** Which Entry does the handle pair bracket, and which of its two edges may resize (#142)? The
 *  hovered bar's Entry when a bar is hovered. With nothing hovered, the single selected Entry — but
 *  only once the Selection names one of its Segments (#212), or when it draws exactly one bar. A
 *  segmented Entry selected from the grid pane has every Segment in the Selection, so it gets no
 *  handles until the pointer visits one bar. */
function resolveResizableEntry(inputs: {
  hoveredItemId: ItemId | undefined;
  hoveredEntryId: EntryId | undefined;
  soleSelectedEntryId: EntryId | undefined;
  selectedSegmentCountOfSoleEntry: number;
  itemIdsForEntry: (id: EntryId) => readonly ItemId[];
  canGesture: (capability: keyof Interactions, id: EntryId, edge?: 'start' | 'end') => boolean;
}): { entryId: EntryId; edges: { start: boolean; end: boolean } } | undefined {
  const {
    hoveredItemId,
    hoveredEntryId,
    soleSelectedEntryId,
    selectedSegmentCountOfSoleEntry,
    itemIdsForEntry,
    canGesture,
  } = inputs;
  if (hoveredItemId !== undefined) {
    if (hoveredEntryId === undefined) return undefined;
    const edges = resolveEdges(hoveredEntryId, canGesture);
    return edges === undefined ? undefined : { entryId: hoveredEntryId, edges };
  }
  if (soleSelectedEntryId === undefined) return undefined;
  const edges = resolveEdges(soleSelectedEntryId, canGesture);
  if (edges === undefined) return undefined;
  if (selectedSegmentCountOfSoleEntry === 1) return { entryId: soleSelectedEntryId, edges };
  return itemIdsForEntry(soleSelectedEntryId).length === 1
    ? { entryId: soleSelectedEntryId, edges }
    : undefined;
}
