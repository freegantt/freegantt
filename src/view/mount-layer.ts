// view/ — one answer to "where do I mount, and how do I stay put" (#168; S5.3, #158).
//
// A Gantt has two mount layers. The overlay escapes the pane box, and the row layer travels with the
// rows. That difference is load-bearing (#158). The pane's own scroll already moves the row layer.
// So content mounted beside the rows follows its cell in the same frame, with no scroll listener. A
// tooltip and a menu want the opposite — they escape the pane, and they dismiss on a scroll.
//
// The difference is the *instance*, never the interface. Before this file there were two interfaces,
// and only one of them had `onResize`. So the Cell editor mounted in the row layer and borrowed the
// resize signal from the overlay. A plugin author met three shapes for "un-mount this".
// Reposition-on-resize belongs to whatever you mounted into, so it lives here, on both.
//
// The layer's own element is the frame its content positions in, so `bounds` is that element's box.
// For the row layer that is the box the per-frame transform has already moved (#158). That is
// exactly the box a sibling of the rows must measure against.
//
// `PaneLayout` reads the rect, not this file. It builds both layer elements, and it is the one place
// I9's lint scope lets `src/view/` measure a box at all. `view/gantt-dom.ts` delegates its own
// `bounds`/`paneBounds` there for the same reason.
//
// Why a reader, and not an exemption? (#163 loose end (b), decided 2026-09-05.) A pane box is not a
// row height, so I9 exempts `pane-layout.ts` for measuring one. This file could have joined that
// list. It does not, on purpose. I9 is a per-file, syntactic ban. This file's whole subject is a
// layer that content mounts into, and the row layer is the rows' own container. It is therefore the
// `src/view/` file most likely to grow a row measurement by accident, which is the measurement I9
// exists to stop. An exemption here would take the guard off that file for good, to save one
// constructor parameter. `gantt-dom.ts` already delegates the same way, so keeping this reader keeps
// one story rather than starting a second.

import type { Disposer } from '../model/index.js';

/** A layer of this Gantt that a plugin mounts content into. Reached as `ctx.view.overlay` or
 *  `ctx.view.rowLayer`. */
export interface MountLayer {
  /** Mounts `content` in this layer. The `Disposer` takes it out again. */
  present(content: HTMLElement): Disposer;
  /** Notifies on every resize of the Gantt's container (issue #137). A reflow moves the anchor
   *  with no scroll at all — a column width change, say. The `Disposer` unsubscribes. */
  onResize(callback: () => void): Disposer;
  /** This layer's own client rect. `content` sits at the layer's origin, so a caller positions by
   *  the offset between its anchor's rect and this one. */
  readonly bounds: DOMRect;
}

/** The one `ResizeObserver` per Gantt (issue #137), shared by every layer over that container.
 *
 *  Test seam, the same shape `attachPaneSize`'s own `ResizeObserverCtor` parameter already uses.
 *  happy-dom does no layout, so a dom test drives this with an injected fake that fires
 *  synchronously. */
export class ContainerResize {
  readonly #container: HTMLElement;
  readonly #ResizeObserverCtor: typeof ResizeObserver;
  readonly #listeners = new Set<() => void>();
  #observer: ResizeObserver | undefined;

  constructor(container: HTMLElement, ResizeObserverCtor: typeof ResizeObserver = ResizeObserver) {
    this.#container = container;
    this.#ResizeObserverCtor = ResizeObserverCtor;
  }

  /** Observes lazily — only while at least one caller is listening. A Gantt whose plugins mount
   *  nothing never runs a `ResizeObserver` at all. So this stays a no-op beside the pane-size
   *  attachment's own observer, in every existing test that counts `ResizeObserver` instances. */
  onResize(callback: () => void): Disposer {
    if (this.#listeners.size === 0) {
      this.#observer = new this.#ResizeObserverCtor(() => {
        for (const listener of this.#listeners) listener();
      });
      this.#observer.observe(this.#container);
    }
    this.#listeners.add(callback);
    return () => {
      this.#listeners.delete(callback);
      if (this.#listeners.size === 0) this.#stopObserving();
    };
  }

  /** `GanttShell.destroy()`'s own call. The layer elements themselves are torn down with the rest of
   *  the container by `PaneLayout.destroy()`. */
  destroy(): void {
    this.#stopObserving();
    this.#listeners.clear();
  }

  #stopObserving(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
  }
}

/** One `MountLayer` over one element. `GanttShell` builds two: `panes.overlay` and `panes.rows`.
 *
 *  `readBounds` answers "who is allowed to measure a box", not "which box". It always reads the same
 *  element this layer holds — `() => paneLayout.overlayBounds()` beside `paneLayout.panes.overlay`.
 *  The reader keeps `PaneLayout` the one measuring point in `src/view/`, so I9 keeps guarding this
 *  file. The file header says why that is worth a parameter. */
export class DomMountLayer implements MountLayer {
  readonly #layer: HTMLElement;
  readonly #readBounds: () => DOMRect;
  readonly #resize: ContainerResize;

  constructor(layer: HTMLElement, readBounds: () => DOMRect, resize: ContainerResize) {
    this.#layer = layer;
    this.#readBounds = readBounds;
    this.#resize = resize;
  }

  /** The row layer is `render/dom`'s own reconciled container, so this appends beside the rows and
   *  never inside one. `syncKeyed` prunes only the keys it created, and orders its own nodes among
   *  themselves, so a foreign child settles after the rows and stays there. A child of a *row* or a
   *  *cell* would be a different matter. That is reconciled DOM, and writing into it breaks the patch
   *  assumptions its cell specs make. */
  present(content: HTMLElement): Disposer {
    this.#layer.append(content);
    return () => content.remove();
  }

  onResize(callback: () => void): Disposer {
    return this.#resize.onResize(callback);
  }

  get bounds(): DOMRect {
    return this.#readBounds();
  }
}
