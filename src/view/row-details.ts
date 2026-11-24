// view/ — Row details: content a plugin presents under one Row (`ctx.view.presentRowDetail`). The
// layout reserves the height and `RowDetails` owns everything the layout cannot know: the wrapper
// node, the measurement of its height, and where it sits. A Gantt with no Row detail pays nothing:
// no wrapper, no observer, no map lookup in the height index.

import type { Disposer, RowId } from '../model/index.js';

export const ROW_DETAIL_CLASS = 'fg-row-detail';
export const ROW_DETAIL_ROW_ATTRIBUTE = 'data-row-id';

/** What `RowDetails` asks of the Gantt it lives in. Every member is a closure over live state. */
export interface RowDetailsPorts {
  /** The node the wrappers mount in: the full-width row layer. */
  readonly layer: HTMLElement;
  /** The Row an Entry id or a row id names. An id no Row owns names itself. */
  rowIdOf(id: string): RowId;
  /** Where the detail of this Row starts, in the coordinates of the content. `undefined` for a Row
   *  that is collapsed, filtered or unknown. */
  rowDetailTop(rowId: RowId): number | undefined;
  /** The border-box height of a wrapper, read from layout. Called only for a batch of new wrappers. */
  measure(wrapper: HTMLElement): number;
  /** The top and the height of the rows' visible window, in the coordinates of the content. */
  visibleWindow(): { readonly top: number; readonly height: number };
  /** Scrolls the content by `dy` and keeps the scroll inside its bounds. */
  panBy(dy: number): void;
  /** Scrolls the window so `height` px from `top` come into view. */
  revealRange(top: number, height: number): void;
  /** Paints a frame now, so the rows move in the frame that is about to paint. */
  paintNow(): void;
  /** Paints a frame in the next animation frame. */
  requestPaint(): void;
  /** Moves focus to this Row, or to the grid's tab stop when the Row has no place. */
  focusRow(rowId: RowId): void;
}

interface RowDetail {
  readonly rowId: RowId;
  readonly wrapper: HTMLElement;
  /** `undefined` while the Row has no place, so the wrapper is hidden. */
  top: number | undefined;
  placed: boolean;
  closed: boolean;
  readonly onFocusIn: () => void;
}

export class RowDetails {
  readonly #ports: RowDetailsPorts;
  readonly #details = new Map<RowId, RowDetail>();
  /** Wrappers whose height nobody has read yet. One batch read empties it. */
  readonly #unmeasured = new Set<RowDetail>();
  /** The one empty answer, so a Gantt with no detail hands the layout the same map every frame. */
  readonly #noHeights: ReadonlyMap<RowId, number> = new Map();
  /** Replaced, never changed in place: the height index compares it by identity. */
  #heights: ReadonlyMap<RowId, number> = this.#noHeights;
  /** Created with the first Row detail and not before. */
  #observer: ResizeObserver | undefined;
  #destroyed = false;

  /** `observerCtor` is the test seam, as in `ContainerResize`. */
  constructor(
    ports: RowDetailsPorts,
    private readonly observerCtor?: typeof ResizeObserver,
  ) {
    this.#ports = ports;
  }

  /** The last measured height of every Row detail, by Row. Empty when none is open. */
  get heights(): ReadonlyMap<RowId, number> {
    return this.#heights;
  }

  /** Call: `rowDetails.present('t3', panel)` — mounts the content under the Row, replacing the Row's
   *  earlier detail. The returned `Disposer` removes it, once. */
  present(id: string, content: HTMLElement): Disposer {
    const rowId = this.#ports.rowIdOf(id);
    this.#close(rowId);
    const detail = this.#mount(rowId, content);
    this.#details.set(rowId, detail);
    this.#unmeasured.add(detail);
    this.#place(detail);
    this.#observerOf().observe(detail.wrapper);
    this.#ports.requestPaint();
    return () => this.#closeIfCurrent(detail);
  }

  /** Reads the height of every wrapper that has none yet, in one batch. Nothing to read costs nothing. */
  measurePending(): void {
    if (this.#unmeasured.size === 0) return;
    const pending = [...this.#unmeasured];
    this.#unmeasured.clear();
    const sizes = pending.map((detail) => ({ detail, height: this.#ports.measure(detail.wrapper) }));
    this.#store(sizes.filter(({ detail }) => detail.top !== undefined));
  }

  /** Moves each wrapper to its Row, and hides the wrapper of a Row that has no place. Run after the
   *  layout has the latest heights. */
  placeAll(): void {
    for (const detail of this.#details.values()) this.#place(detail);
  }

  destroy(): void {
    this.#destroyed = true;
    this.#observer?.disconnect();
    this.#observer = undefined;
    for (const detail of this.#details.values()) this.#release(detail);
    this.#details.clear();
    this.#unmeasured.clear();
    this.#heights = this.#noHeights;
  }

  #mount(rowId: RowId, content: HTMLElement): RowDetail {
    const wrapper = content.ownerDocument.createElement('div');
    wrapper.className = ROW_DETAIL_CLASS;
    wrapper.setAttribute(ROW_DETAIL_ROW_ATTRIBUTE, rowId);
    wrapper.append(content);
    const detail: RowDetail = {
      rowId,
      wrapper,
      top: undefined,
      placed: false,
      closed: false,
      onFocusIn: () => this.#revealWhenOffWindow(detail),
    };
    wrapper.addEventListener('focusin', detail.onFocusIn);
    this.#ports.layer.append(wrapper);
    return detail;
  }

  #observerOf(): ResizeObserver {
    this.#observer ??= new (this.observerCtor ?? ResizeObserver)((observed) => this.#onResize(observed));
    return this.#observer;
  }

  #onResize(observed: readonly ResizeObserverEntry[]): void {
    const sizes: { detail: RowDetail; height: number }[] = [];
    for (const entry of observed) {
      const detail = this.#detailOfWrapper(entry.target);
      if (detail === undefined || detail.top === undefined) continue;
      sizes.push({ detail, height: entry.borderBoxSize[0]?.blockSize ?? entry.contentRect.height });
    }
    this.#record(sizes);
  }

  #detailOfWrapper(target: Element): RowDetail | undefined {
    const rowId = target.getAttribute(ROW_DETAIL_ROW_ATTRIBUTE);
    const detail = rowId === null ? undefined : this.#details.get(rowId as RowId);
    return detail?.wrapper === target ? detail : undefined;
  }

  /** A size the observer reports differs from what the layout holds: store it, and paint a frame
   *  at once, so the rows below never show a gap. A detail that changed above the window pans the
   *  content by the same amount, so the rows in view stay where they are. */
  #record(sizes: readonly { detail: RowDetail; height: number }[]): void {
    const window = this.#ports.visibleWindow();
    let anchorShift = 0;
    for (const { detail, height } of sizes) {
      const before = this.#heights.get(detail.rowId) ?? 0;
      if (detail.top !== undefined && before !== height && detail.top + before <= window.top) {
        anchorShift += height - before;
      }
    }
    if (!this.#store(sizes)) return;
    this.#ports.paintNow();
    if (anchorShift === 0) return;
    this.#ports.panBy(anchorShift);
    this.#ports.paintNow();
  }

  /** Writes the sizes into a new height map. Answers whether any height changed. */
  #store(sizes: readonly { detail: RowDetail; height: number }[]): boolean {
    const next = new Map(this.#heights);
    for (const { detail, height } of sizes) {
      if (height > 0) next.set(detail.rowId, height);
      else next.delete(detail.rowId);
    }
    if (!heightsDiffer(this.#heights, next)) return false;
    this.#heights = next.size === 0 ? this.#noHeights : next;
    return true;
  }

  #place(detail: RowDetail): void {
    const top = this.#ports.rowDetailTop(detail.rowId);
    if (detail.placed && top === detail.top) return;
    detail.placed = true;
    detail.top = top;
    detail.wrapper.hidden = top === undefined;
    if (top !== undefined) detail.wrapper.style.transform = `translateY(${top}px)`;
  }

  #revealWhenOffWindow(detail: RowDetail): void {
    if (detail.top === undefined) return;
    const height = this.#heights.get(detail.rowId) ?? 0;
    const window = this.#ports.visibleWindow();
    const offWindow = detail.top + height <= window.top || detail.top >= window.top + window.height;
    if (offWindow) this.#ports.revealRange(detail.top, Math.min(height, window.height));
  }

  #closeIfCurrent(detail: RowDetail): void {
    if (detail.closed || this.#details.get(detail.rowId) !== detail) return;
    this.#close(detail.rowId);
    this.#ports.requestPaint();
  }

  /** Removes the Row's detail, if any. Focus inside it goes to the Row first, so it never falls to the page. */
  #close(rowId: RowId): void {
    const detail = this.#details.get(rowId);
    if (detail === undefined) return;
    this.#details.delete(rowId);
    this.#unmeasured.delete(detail);
    if (!this.#destroyed && this.#holdsFocus(detail.wrapper)) this.#ports.focusRow(rowId);
    this.#release(detail);
    if (this.#heights.has(rowId)) {
      const next = new Map(this.#heights);
      next.delete(rowId);
      this.#heights = next.size === 0 ? this.#noHeights : next;
    }
    if (this.#details.size === 0) this.#stopObserving();
  }

  #release(detail: RowDetail): void {
    detail.closed = true;
    this.#observer?.unobserve(detail.wrapper);
    detail.wrapper.removeEventListener('focusin', detail.onFocusIn);
    detail.wrapper.remove();
  }

  /** The last detail closed: the Gantt goes back to paying nothing. */
  #stopObserving(): void {
    this.#observer?.disconnect();
    this.#observer = undefined;
  }

  #holdsFocus(wrapper: HTMLElement): boolean {
    const root = wrapper.getRootNode() as Document | ShadowRoot;
    const active = root.activeElement;
    return active !== null && wrapper.contains(active);
  }
}

function heightsDiffer(a: ReadonlyMap<RowId, number>, b: ReadonlyMap<RowId, number>): boolean {
  if (a.size !== b.size) return true;
  for (const [id, height] of b) if (a.get(id) !== height) return true;
  return false;
}
