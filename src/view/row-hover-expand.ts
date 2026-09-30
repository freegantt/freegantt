// view/ — expands a collapsed parent row while a row drag holds the pointer over its "into" zone
// (#604). Without it, a drop cannot land between the children of a collapsed parent.
//
// The expand is view state, not data: it goes through the same door as `gantt.expand(id)`. It
// writes no Dataset change and adds no undo step. A cancelled drag leaves the parent expanded.

import type { RowId } from '../model/index.js';

/** How long the pointer must rest in the "into" zone of a collapsed parent before it expands, in ms. */
export const HOVER_EXPAND_DELAY_MS = 700;

/** What a row drag asks to expand a collapsed parent. */
export interface RowHoverExpand {
  /** Report the row the drop targets "into", or `undefined` when the drop targets no such row.
   *  Starts the delay on a collapsed parent. Restarts it when the row changes. Ignores the same row
   *  again, so pointer moves inside one target cost nothing. `onExpanded` runs after the expand.
   *  Pass one stable function per drag. */
  holdOver(intoRowId: RowId | undefined, onExpanded: () => void): void;
  /** Cancel the delay. Safe when nothing waits. The rows stay as they are. */
  stop(): void;
}

export interface RowHoverExpandPorts {
  /** Is this row a collapsed parent that has child rows to show? */
  isCollapsedParent(id: RowId): boolean;
  /** Expand this row through view state. */
  expand(id: RowId): void;
}

export function createRowHoverExpand(ports: RowHoverExpandPorts): RowHoverExpand {
  let heldRowId: RowId | undefined;
  let onExpanded: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Built once, so starting the delay creates no closure.
  const expandHeldRow = (): void => {
    timer = undefined;
    if (heldRowId === undefined) return;
    ports.expand(heldRowId);
    onExpanded?.();
  };

  function cancelDelay(): void {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  }

  return {
    holdOver(intoRowId, callback): void {
      if (intoRowId === heldRowId) return;
      cancelDelay();
      heldRowId = intoRowId;
      onExpanded = callback;
      if (intoRowId === undefined || !ports.isCollapsedParent(intoRowId)) return;
      timer = setTimeout(expandHeldRow, HOVER_EXPAND_DELAY_MS);
    },
    stop(): void {
      cancelDelay();
      heldRowId = undefined;
      onExpanded = undefined;
    },
  };
}
