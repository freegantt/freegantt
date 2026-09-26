// view/ — pure affordance resolution (S3.2/S3.4). `GanttShell#refreshAffordances` calls this
// to decide which bar ids get hover/move/resize paint before it writes `InteractionState` and calls
// `applyState` — no DOM, no shell, no `InteractionState` knowledge here, only the resolution rule.

import { entryIdOfBar } from '../model/index.js';
import type { EntryId, BarId } from '../model/index.js';
import type { GestureCapability } from './capability.js';

export interface AffordanceInputs {
  hoveredBarId: BarId | undefined;
  /** The one Entry the Selection names, when it names exactly one (#212, ADR 0010, review finding 7).
   *  `undefined` when the Selection is empty or spans more than one Entry — either way the
   *  sole-selection fallback below has nothing to fall back to. The handle pair brackets an Entry
   *  (#200). */
  soleSelectedEntryId: EntryId | undefined;
  /** Every Bar one entry draws in the current frame (`FrameLayout.barIdsForEntry`). The fallback
   *  asks it instead of building a Bar id out of an entry id. */
  barIdsForEntry: (id: EntryId) => readonly BarId[];
  canGesture: (capability: GestureCapability, id: EntryId, edge?: 'start' | 'end') => boolean;
}

export interface AffordanceIds {
  hoveredBarId?: BarId;
  movableBarId?: BarId;
  /** The Entry the handle pair brackets (#200) — the pair sits on that Entry's envelope, so the two
   *  handles can land on two different bars. Which bars those are is the backend's own reading of
   *  the frame it synced, the same way the Selection paints (#185). */
  resizableEntryId?: EntryId;
  /** #142: which of `resizableEntryId`'s two handles may resize, independently — a Field's own
   *  one write answer can close `end` while leaving `start` open, or the reverse. Present exactly when
   *  `resizableEntryId` is; a backend hides a handle whose own edge answers `false` here even while
   *  the other one still paints. */
  resizableEdges?: { start: boolean; end: boolean };
}

/** The hovered bar decides when there is one — even a hover that resolves to "no handles"
 *  wins over the selection fallback. Only when nothing is hovered does the single selected entry, if
 *  there is exactly one, get a turn. */
export function projectAffordances(inputs: AffordanceInputs): AffordanceIds {
  const { hoveredBarId, soleSelectedEntryId, barIdsForEntry, canGesture } = inputs;
  const hoveredEntryId = hoveredBarId !== undefined ? entryIdOfBar(hoveredBarId) : undefined;

  const out: AffordanceIds = {};
  if (hoveredBarId !== undefined) out.hoveredBarId = hoveredBarId;

  if (hoveredBarId !== undefined && hoveredEntryId !== undefined && canGesture('move', hoveredEntryId)) {
    out.movableBarId = hoveredBarId;
  }

  const resizable = resolveResizableEntry({
    hoveredBarId,
    hoveredEntryId,
    soleSelectedEntryId,
    barIdsForEntry,
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
  canGesture: (capability: GestureCapability, id: EntryId, edge?: 'start' | 'end') => boolean,
): { start: boolean; end: boolean } | undefined {
  const start = canGesture('resize', id, 'start');
  const end = canGesture('resize', id, 'end');
  return start || end ? { start, end } : undefined;
}

/** Which Entry does the handle pair bracket, and which of its two edges may resize (#142)? The
 *  hovered bar's Entry when a bar is hovered. With nothing hovered, the single selected Entry — but
 *  only when it draws exactly one bar (#421 ADR 0026: a former Segment is its own Entry now, so a
 *  parent whose children draw several bars gets no handles from selecting the parent alone; the
 *  pointer must visit one bar). */
function resolveResizableEntry(inputs: {
  hoveredBarId: BarId | undefined;
  hoveredEntryId: EntryId | undefined;
  soleSelectedEntryId: EntryId | undefined;
  barIdsForEntry: (id: EntryId) => readonly BarId[];
  canGesture: (capability: GestureCapability, id: EntryId, edge?: 'start' | 'end') => boolean;
}): { entryId: EntryId; edges: { start: boolean; end: boolean } } | undefined {
  const { hoveredBarId, hoveredEntryId, soleSelectedEntryId, barIdsForEntry, canGesture } = inputs;
  if (hoveredBarId !== undefined) {
    if (hoveredEntryId === undefined) return undefined;
    const edges = resolveEdges(hoveredEntryId, canGesture);
    return edges === undefined ? undefined : { entryId: hoveredEntryId, edges };
  }
  if (soleSelectedEntryId === undefined) return undefined;
  if (barIdsForEntry(soleSelectedEntryId).length !== 1) return undefined;
  const edges = resolveEdges(soleSelectedEntryId, canGesture);
  return edges === undefined ? undefined : { entryId: soleSelectedEntryId, edges };
}
