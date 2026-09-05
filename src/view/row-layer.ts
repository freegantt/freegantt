// view/ — the grid's row layer as a mount seam (#158). The Grid pane owns no vertical scrollbar.
// Its row layer follows the Timeline pane's native scroll by one `translateY` per frame (D-S1.8-1).
// The pane itself is a real horizontal scroller (D-S1.8-13). Content mounted *into* that layer
// therefore travels with the rows on both axes, in the same frame, with no scroll listener of its
// own. That is the whole point of this seam, and the difference from `Overlay`.
//
// Overlay stays the right home for content that must escape the pane. A tooltip and a menu dismiss
// on a scroll rather than follow it, and both may spill past a pane edge. This is the home for
// content glued to a cell — the Cell editor, and its refusal notice.
//
// Review N1's split holds here too: this is the mount layer and nothing else. The layer's own rect is
// geometry, so it answers from `ctx.view.dom` (`rowLayerBounds`), beside `bounds` and `paneBounds`.
//
// The layer is `render/dom`'s own reconciled container, so this seam appends beside the rows, never
// inside one. `syncKeyed` prunes only the keys it created, and orders its own nodes among themselves,
// so a foreign child settles after the rows and stays there. A child of a *row* or a *cell* would
// be a different matter. That is reconciled DOM, and writing into it breaks the patch assumptions
// its cell specs make.

import type { Disposer } from '../model/index.js';

export interface RowLayer {
  /** Mounts `content` beside the rows, and returns the `Disposer` that removes it again. `content`
   *  positions itself against `ctx.view.dom.rowLayerBounds`. The scroll that moves the rows moves it
   *  too, so nothing repositions it on a scroll. */
  present(content: HTMLElement): Disposer;
}

export class DomRowLayer implements RowLayer {
  readonly #layer: HTMLElement;

  constructor(layer: HTMLElement) {
    this.#layer = layer;
  }

  present(content: HTMLElement): Disposer {
    this.#layer.append(content);
    return () => content.remove();
  }
}
