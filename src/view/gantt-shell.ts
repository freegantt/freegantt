// view/ — Gantt shell (plans/01 §8.2-8.3). The real grid/timeline/viewport split lands across S1.

import { computeFrame, PrefixSumHeightIndex, TimeScaleModel } from '../layout/index.js';
import type { RowHeightIndex, ScaleBindingHandle } from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import type { RenderBackend } from '../render/backend.js';
import type { Entry } from '../model/index.js';

/** Structurally compatible with api/Project, without importing api/ — view -> api is not an allowed
 * edge (api imports view, not the reverse; plans/01 §1). Lets GanttShell take a whole project instead
 * of api/gantt.ts unwrapping it into entries+timeZone and this file re-clumping them (#40). */
export interface ProjectLike {
  readonly entries: readonly Entry[];
  readonly timeZone: string;
}

/** CSS custom property that owns row height (plans/02 §4, level 1 of the customization ladder) —
 * not a constructor option (#39). Read once at construction, not per render() (#49): getComputedStyle
 * is a synchronous style read that can force a style recalculation, and `--fg-row-height` essentially
 * never changes between renders in normal use. Re-read gets an explicit invalidation path alongside
 * the resize-binding work in #8, rather than an unconditional read on every render() in the meantime. */
const ROW_HEIGHT_PROPERTY = '--fg-row-height';
const DEFAULT_ROW_HEIGHT = 32;

export interface GanttShellOptions {
  /** Element or CSS selector (plans/02 §2); a selector that matches nothing throws (#38). */
  host: HTMLElement | string;
  project: ProjectLike;
  /** Bound viewport object (D9) — pass the same instance to two Gantt instances to x-sync them.
   * Constructs a private default when omitted (plans/01 §8.2: "single-Gantt usage never sees the
   * concept"); the default resolves its zone, span and zoom from this shell's binding, so it needs
   * no arguments. */
  scale?: TimeScaleModel;
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
  #scale: TimeScaleModel;
  #scaleHandle: ScaleBindingHandle;
  #destroyed = false;
  /** Cached across renders (#47) — `PrefixSumHeightIndex` exists precisely so "top of row i" is
   * O(log n) across repeated calls, which a fresh instance every `render()` would throw away. Rebuilt
   * only when entry count or row height changes; current row heights are uniform, so those two are
   * the whole invalidation surface (variable per-row heights, S5, will need finer-grained
   * `invalidateFrom` calls here instead of a full rebuild). */
  #heights: RowHeightIndex | undefined;
  #heightsEntryCount = -1;
  #heightsRowHeight = -1;
  #rowHeight: number;
  #options: GanttShellOptions;

  constructor(options: GanttShellOptions) {
    this.#options = options;
    this.#host = resolveHost(options.host);
    this.#scale = options.scale ?? new TimeScaleModel();
    this.#rowHeight = readRowHeight(this.#host);

    // Mount before binding (#22): the render target exists by the time the binding's own onChange
    // — which IS this shell's first render — fires, so there is no construction-order exception to
    // document and no separate explicit render() call after bind().
    this.#backend = createDomBackend();
    this.#backend.mount(this.#host);

    this.#scaleHandle = this.#scale.bind(
      {
        timeZone: options.project.timeZone,
        entries: options.project.entries,
        viewportWidth: this.#drawableWidth(),
      },
      () => this.render(),
    );
  }

  /** Width available for the timeline itself — host width minus the backend's own row-label gutter
   * (#46). Everything that turns time into pixels (the bound `TimeScale`, `computeFrame`'s viewport)
   * must agree on this narrower width, or bars get fit against a span wider than what's actually
   * drawable and headers/bars, though both derived from `scale`, end up offset from one another by
   * whatever the backend reserves for row labels. */
  #drawableWidth(): number {
    return Math.max(0, this.#host.clientWidth - this.#backend.rowLabelWidth);
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
    const scale = this.#scale.scale;
    const entries = this.#options.project.entries;
    const rowHeight = this.#rowHeight;
    const frame = computeFrame({
      entries,
      scale,
      preset: this.#scale.preset,
      viewport: { x: 0, y: 0, width: this.#drawableWidth(), height: this.#host.clientHeight },
      rowHeight,
      revision: this.#revision++,
      heights: this.#heightsFor(entries.length, rowHeight),
    });
    this.#backend.sync(frame);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#scaleHandle.unbind();
    this.#backend.destroy();
    this.#host.replaceChildren();
    this.#destroyed = true;
  }
}
