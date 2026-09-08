// view/ — a Row layer click on a row twisty toggles collapse (S4.6). Lives here, not in
// interaction/: collapse is viewport state, not a data gesture.

import { rowIdFromTwistyClick } from '../render/dom/row-twisty.js';

export interface RowTwistyAttachment {
  detach(): void;
}

export interface RowTwistyContext {
  toggleCollapse(id: string): void;
}

/** `rowLayer` is the element `PaneLayout` exposes as `panes.rows` — the rows themselves, so one
 *  listener here covers every twisty without a second one per row. */
export function attachRowTwisty(rowLayer: HTMLElement, ctx: RowTwistyContext): RowTwistyAttachment {
  function onClick(event: Event): void {
    const id = rowIdFromTwistyClick(event.target, rowLayer);
    if (id !== undefined) ctx.toggleCollapse(id);
  }

  rowLayer.addEventListener('click', onClick);

  return {
    detach(): void {
      rowLayer.removeEventListener('click', onClick);
    },
  };
}
