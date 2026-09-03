// view/ — the overlay (S5.3, D-S5-8). One layer of the Gantt, like a pane: it owns the one
// absolutely positioned element over the container, its stacking order and its lifetime. It knows
// nothing about tooltips, menus or Popup's own placement math — that stays in `extensions/popup.ts`,
// which builds the same thing a third party would, over this seam alone.

import { buildElement } from '../render/dom/element-description.js';
import type { ElementDescription } from '../layout/index.js';
import type { PaneLayout } from './pane-layout.js';
import { itemId } from '../model/index.js';
import type { EntryId } from '../model/index.js';

export interface OverlayHandle {
  /** Removes the presented content and frees nothing else — the overlay's own layer, bounds and resize
   *  subscription all outlive any one presentation. */
  detach(): void;
}

export interface Overlay {
  /** Mounts `content` in the overlay layer and returns a handle that removes it. */
  present(content: HTMLElement): OverlayHandle;
  /** Builds a live node from an `ElementDescription` (S5.3/S5.4, D-S5-10) — the one seam
   *  `extensions/` has to the reconciler (D-S5-5: it may not import `render/dom` itself). Never
   *  `innerHTML`d except the description's own explicit `html` opt-in (I13). */
  render(description: ElementDescription): HTMLElement;
  /** The container's own client rect — the outer clamp, so a popup never spills past the Gantt
   *  entirely. */
  readonly bounds: DOMRect;
  /**
   * The grid pane's and timeline pane's own client rects (issue #137 F8). The container spans both
   * panes, so `bounds` alone cannot flip a popup at a pane edge — placement flips and clamps against
   * the anchor's own pane rect; `bounds` remains the outer clamp for a popup whose anchor is not
   * inside either pane (a toolbar button, say).
   */
  readonly paneBounds: { grid: DOMRect; timeline: DOMRect };
  /** Notifies on every container resize the overlay observes (issue #137 F9) — an open `Popup` rereads
   *  `bounds`/`paneBounds` and repositions itself. Returns an unsubscribe function. */
  onResize(callback: () => void): () => void;
  /** S5.5 (API gap, `s5.5-tooltips-and-context-menu.md` §5): the rendered bar element for `id`'s
   *  primary segment (segment 0), scoped to this Gantt's own container (I2: never reaches past it) —
   *  `undefined` when that entry has no bar in the current frame (scrolled out of the virtualized
   *  viewport, or the entry has no bar at all). `contextMenu()`'s keyboard opener uses this to anchor
   *  at "the focused row" (D-S5-13) with no pointer event to read a target from. */
  elementForEntry(id: EntryId): HTMLElement | undefined;
}

/** Test seam, the same shape `attachPaneSize`'s own `ResizeObserverCtor` parameter already uses:
 *  happy-dom does no layout, so a dom test drives this with an injected fake that fires
 *  synchronously. */
export class DomOverlay implements Overlay {
  #container: HTMLElement;
  #layer: HTMLElement;
  #paneLayout: PaneLayout;
  #resizeListeners = new Set<() => void>();
  #observer: ResizeObserver | undefined;
  #ResizeObserverCtor: typeof ResizeObserver;

  constructor(
    container: HTMLElement,
    layer: HTMLElement,
    paneLayout: PaneLayout,
    ResizeObserverCtor: typeof ResizeObserver = ResizeObserver,
  ) {
    this.#container = container;
    this.#layer = layer;
    this.#paneLayout = paneLayout;
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

  get bounds(): DOMRect {
    return this.#paneLayout.bounds();
  }

  get paneBounds(): { grid: DOMRect; timeline: DOMRect } {
    return this.#paneLayout.paneBounds();
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

  elementForEntry(id: EntryId): HTMLElement | undefined {
    const want = itemId(id, 0);
    const bars = Array.from(this.#container.querySelectorAll<HTMLElement>('[data-item-id]'));
    return bars.find((bar) => bar.dataset['itemId'] === want);
  }

  /** `GanttShell.destroy()`'s own call — stops observing; the layer itself is torn down with the
   *  rest of the container by `PaneLayout.destroy()`. */
  destroy(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
    this.#resizeListeners.clear();
  }
}
