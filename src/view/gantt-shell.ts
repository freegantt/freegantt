// view/ — Gantt shell (plans/01 §8.2-8.3). The real grid/timeline/viewport split lands across S1.

import {
  computeFrame,
  PrefixSumHeightIndex,
  ScrollModel,
  TimeScaleModel,
  Viewport,
} from '../layout/index.js';
import type { RowHeightIndex, ViewportHandle } from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import { attachScroll } from './scroll-attachment.js';
import type { ScrollAttachment } from './scroll-attachment.js';
import { attachPaneSize } from './pane-size-attachment.js';
import type { PaneSizeAttachment } from './pane-size-attachment.js';
import type { RenderBackend } from '../render/backend.js';
import type { Dataset, Size } from '../model/index.js';

/** CSS custom property that owns row height (plans/02 §4, level 1 of the customization ladder) —
 * not a constructor option (#39). Read on construction and again whenever the pane-size attachment
 * fires (#49, #8): getComputedStyle is a synchronous style read that can force a style
 * recalculation, and `--fg-row-height` essentially never changes between renders in normal use, so a
 * resize is as good a signal as any to catch the rare case it does — never an unconditional read on
 * every render(). */
const ROW_HEIGHT_PROPERTY = '--fg-row-height';
const DEFAULT_ROW_HEIGHT = 32;

export interface GanttShellOptions {
  /** Element or CSS selector (plans/02 §2); a selector that matches nothing throws (#38). */
  host: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9) — pass the same instance to two Gantt instances to x-sync them.
   * Constructs a private default when omitted (plans/01 §8.2: "single-Gantt usage never sees the
   * concept"); the default resolves its zone, span and zoom from this shell's binding, so it needs
   * no arguments. */
  scale?: TimeScaleModel;
  /** Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
   * Constructs a private default when omitted; sharing one instance links both axes (S1.5 README
   * D-S1.5-3). */
  scroll?: ScrollModel;
}

function resolveHost(host: HTMLElement | string): HTMLElement {
  if (typeof host !== 'string') return host;
  const el = document.querySelector(host);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Gantt: no element matches host selector "${host}"`);
  }
  return el;
}

function readRowHeight(host: HTMLElement): number {
  const raw = getComputedStyle(host).getPropertyValue(ROW_HEIGHT_PROPERTY).trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROW_HEIGHT;
}

export class GanttShell {
  #host: HTMLElement;
  #backend: RenderBackend<HTMLElement>;
  #revision = 0;
  #viewport: Viewport;
  #viewportHandle: ViewportHandle;
  #scrollAttachment: ScrollAttachment;
  #destroyed = false;
  /** Cached across renders (#47) — `PrefixSumHeightIndex` exists precisely so "top of row i" is
   * O(log n) across repeated calls, which a fresh instance every `render()` would throw away. Rebuilt
   * only when entry count or row height changes; current row heights are uniform, so those two are
   * the whole invalidation surface (variable per-row heights, S5, will need finer-grained
   * `invalidateFrom` calls here instead of a full rebuild). */
  #heights: RowHeightIndex | undefined;
  #heightsEntryCount = -1;
  #heightsRowHeight = -1;
  #rowHeight: number = DEFAULT_ROW_HEIGHT;
  #paneSizeAttachment: PaneSizeAttachment;
  #options: GanttShellOptions;
  /** Set by the most recent `render()` — `frame.contentWidth`/`contentHeight` (S1.5 README §3.2,
   * D-S1.5-9). No gutter added (D-S1.7-3): the row-label gutter is the backend's own offset, and the
   * backend already sizes its own content sizer with it. */
  #contentSize = { width: 0, height: 0 };

  constructor(options: GanttShellOptions) {
    this.#options = options;
    this.#host = resolveHost(options.host);
    this.#viewport = new Viewport({
      ...(options.scale ? { scale: options.scale } : {}),
      ...(options.scroll ? { scroll: options.scroll } : {}),
    });

    // Mount before binding (#22): the render target exists by the time the binding's own onChange
    // — which IS this shell's first render — fires, so there is no construction-order exception to
    // document and no separate explicit render() call after bind().
    this.#backend = createDomBackend();
    this.#backend.mount(this.#host);

    // The host element is the timeline pane: today's backend positions rows, bars and header all
    // absolutely inside it, so it is the single native scroller (D-D, S1.5 README §6) — there is no
    // separate grid pane to keep in sync. Constructed before either bind (Viewport's fan-in, D-S1.7-1),
    // so this field is never undefined during a render.
    this.#scrollAttachment = attachScroll(this.#host, this.#viewport);

    // bind() fires its own onChange synchronously, once per sub-model (D-S1.5-4: bind always
    // notifies the newcomer) — before this call returns and #viewportHandle is assigned. Those
    // premature calls are dropped; the deliberate first render below runs once everything, including
    // the initial pane-size measurement, is wired.
    let ready = false;
    this.#viewportHandle = this.#viewport.bind(options.dataset, () => {
      if (ready) this.render();
    });
    // Synchronous first measurement: a real ResizeObserver's own first callback is queued, not
    // immediate, so the first paint cannot wait for it. attachPaneSize below takes over from here —
    // every measurement after this one, live, for as long as the shell lives (S1.7b, #8).
    this.#readMetrics({ width: this.#host.clientWidth, height: this.#host.clientHeight });
    this.#paneSizeAttachment = attachPaneSize(this.#host, (size) => this.#readMetrics(size));
    ready = true;
    this.render();
  }

  /** One measurement, pushed to everything it feeds (#8, #49): `--fg-row-height` and the pane size
   *  both change for the same reason — the host was just resized — so both are re-read on the same
   *  signal instead of `--fg-row-height` being read once and going stale. `size` is the host's own
   *  content-box box; the backend's row-label gutter (#46) is subtracted here so every consumer of
   *  `paneWidth` agrees on the width that is actually drawable. */
  #readMetrics(size: Size): void {
    this.#rowHeight = readRowHeight(this.#host);
    this.#viewportHandle.setPaneSize({
      width: Math.max(0, size.width - this.#backend.rowLabelWidth),
      height: size.height,
    });
  }

  #heightsFor(entryCount: number, rowHeight: number): RowHeightIndex {
    if (this.#heights && this.#heightsEntryCount === entryCount && this.#heightsRowHeight === rowHeight) {
      return this.#heights;
    }
    this.#heights = new PrefixSumHeightIndex(entryCount, () => rowHeight);
    this.#heightsEntryCount = entryCount;
    this.#heightsRowHeight = rowHeight;
    return this.#heights;
  }

  render(): void {
    const entries = this.#options.dataset.entries;
    const rowHeight = this.#rowHeight;
    const frame = computeFrame({
      entries,
      scale: this.#viewport.timeScale,
      preset: this.#viewport.preset,
      visible: this.#viewport.visible,
      overscan: this.#viewport.overscan,
      rowHeight,
      revision: this.#revision++,
      heights: this.#heightsFor(entries.length, rowHeight),
    });
    this.#backend.sync(frame);
    this.#contentSize = { width: frame.contentWidth, height: frame.contentHeight };
    this.#viewportHandle.setContentSize(this.#contentSize);
    this.#scrollAttachment.writePosition();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#scrollAttachment.detach();
    this.#paneSizeAttachment.detach();
    this.#viewportHandle.unbind();
    this.#backend.destroy();
    this.#host.replaceChildren();
    this.#destroyed = true;
  }
}
