// view/ — the grid's row layer as a mount seam (#158). The Grid pane owns no vertical scrollbar: its
// row layer follows the Timeline pane's native scroll by one `translateY` per frame (D-S1.8-1), and
// the pane itself is a real horizontal scroller (D-S1.8-13). Content mounted *into* that layer
// therefore travels with the rows on both axes, in the same frame, with no scroll listener of its own
// — which is the whole point of this seam and the difference from `Overlay`.
//
// Overlay stays the right home for content that must escape the pane (a tooltip, a menu — both
// dismiss on scroll rather than follow it). This is the home for content that must stay glued to a
// cell: an open cell editor. Position it against `bounds`, then leave it alone.
//
// The layer is `render/dom`'s own reconciled container, so this seam appends beside the rows, never
// inside one: `syncKeyed` prunes only the keys it created and orders its own nodes among themselves,
// so a foreign child settles after the rows and stays there. A child of a *row* or a *cell* would be
// a different matter — that is `render/dom`'s reconciled DOM, and writing into it breaks the patch
// assumptions its cell specs make.

import type { Disposer } from '../model/index.js';
import type { PaneLayout } from './pane-layout.js';

export interface RowLayer {
  /** Mounts `content` beside the rows and returns the `Disposer` that removes it again. `content`
   *  positions itself against `bounds`; the scroll that moves the rows moves it too. */
  present(content: HTMLElement): Disposer;
  /** The layer's own client rect — the frame `content`'s coordinates are relative to. Reads live, so
   *  a caller measuring after a reflow gets the current box. */
  readonly bounds: DOMRect;
}

export class DomRowLayer implements RowLayer {
  #layer: HTMLElement;
  #paneLayout: PaneLayout;

  constructor(layer: HTMLElement, paneLayout: PaneLayout) {
    this.#layer = layer;
    this.#paneLayout = paneLayout;
  }

  present(content: HTMLElement): Disposer {
    this.#layer.append(content);
    return () => content.remove();
  }

  /** Measured by `PaneLayout`, which owns every rect read in `view/` (I9's own exemption) — the same
   *  route `DomOverlay` takes to `bounds`/`paneBounds`. */
  get bounds(): DOMRect {
    return this.#paneLayout.rowLayerBounds();
  }
}
