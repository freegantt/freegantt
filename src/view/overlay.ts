// view/ — the overlay (S5.3, D-S5-8). One layer of the Gantt, like a pane: it owns the one
// absolutely positioned element over the container, its stacking order and its lifetime. It knows
// nothing about tooltips, menus or Popup's own placement math — that stays in `extensions/popup.ts`,
// which builds the same thing a third party would, over this seam alone.
//
// Review N1: this is the mount layer, and nothing else. `contains`, `bounds`, `paneBounds` and
// `elementForEntry` moved to `view/gantt-dom.ts`. They answer for the whole container, and two of
// them return timeline nodes that never sit in the overlay. `overlay.elementForEntry(id)` read as a
// false sentence, which is the #7 failure. The word stays; the second concept left.

import { buildElement } from '../render/dom/element-description.js';
import type { ElementDescription } from '../layout/index.js';

export interface OverlayHandle {
  /** Removes the presented content and frees nothing else — the overlay's own layer and resize
   *  subscription both outlive any one presentation. */
  detach(): void;
}

export interface Overlay {
  /** Mounts `content` in the overlay layer and returns a handle that removes it. */
  present(content: HTMLElement): OverlayHandle;
  /** Builds a live node from an `ElementDescription` (S5.3/S5.4, D-S5-10) — the one seam
   *  `extensions/` has to the reconciler (D-S5-5: it may not import `render/dom` itself). Never
   *  `innerHTML`d except the description's own explicit `html` opt-in (I13). */
  render(description: ElementDescription): HTMLElement;
  /** Notifies on every container resize the overlay observes (issue #137 F9). An open `Popup`
   *  rereads `ctx.view.dom`'s `bounds`/`paneBounds` and repositions itself. Returns an unsubscribe
   *  function. */
  onResize(callback: () => void): () => void;
}

/** Test seam, the same shape `attachPaneSize`'s own `ResizeObserverCtor` parameter already uses:
 *  happy-dom does no layout, so a dom test drives this with an injected fake that fires
 *  synchronously. */
export class DomOverlay implements Overlay {
  #container: HTMLElement;
  #layer: HTMLElement;
  #resizeListeners = new Set<() => void>();
  #observer: ResizeObserver | undefined;
  #ResizeObserverCtor: typeof ResizeObserver;

  constructor(
    container: HTMLElement,
    layer: HTMLElement,
    ResizeObserverCtor: typeof ResizeObserver = ResizeObserver,
  ) {
    this.#container = container;
    this.#layer = layer;
    this.#ResizeObserverCtor = ResizeObserverCtor;
  }

  present(content: HTMLElement): OverlayHandle {
    this.#layer.append(content);
    return {
      detach: () => {
        content.remove();
      },
    };
  }

  render(description: ElementDescription): HTMLElement {
    return buildElement(description);
  }

  /** Observes lazily — only while at least one `Popup` is actually open. A Gantt that never opens
   *  one never runs a `ResizeObserver` at all, and this stays a no-op alongside the pane-size
   *  attachment's own observer in every existing test that counts `ResizeObserver` instances. */
  onResize(callback: () => void): () => void {
    if (this.#resizeListeners.size === 0) {
      this.#observer = new this.#ResizeObserverCtor(() => {
        for (const listener of this.#resizeListeners) listener();
      });
      this.#observer.observe(this.#container);
    }
    this.#resizeListeners.add(callback);
    return () => {
      this.#resizeListeners.delete(callback);
      if (this.#resizeListeners.size === 0) {
        this.#observer?.disconnect();
        this.#observer = undefined;
      }
    };
  }

  /** `GanttShell.destroy()`'s own call — stops observing; the layer itself is torn down with the
   *  rest of the container by `PaneLayout.destroy()`. */
  destroy(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#resizeListeners.clear();
  }
}
