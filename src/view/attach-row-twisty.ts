// view/ — grid-pane click on a row twisty toggles collapse (S4.6). Lives here, not in
// interaction/: collapse is viewport state, not a data gesture.

import { rowIdFromTwistyClick } from '../render/dom/row-twisty.js';

export interface RowTwistyAttachment {
  detach(): void;
}

export interface RowTwistyContext {
  toggleCollapse(id: string): void;
}

/** `pane` is the grid pane — the same element `PaneLayout` exposes as `panes.grid`. */
export function attachRowTwisty(pane: HTMLElement, ctx: RowTwistyContext): RowTwistyAttachment {
  function onClick(event: Event): void {
    const id = rowIdFromTwistyClick(event.target, pane);
    if (id !== undefined) ctx.toggleCollapse(id);
  }

  pane.addEventListener('click', onClick);

  return {
    detach(): void {
      pane.removeEventListener('click', onClick);
    },
  };
}
