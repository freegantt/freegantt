// view/ — the DOM skeleton splitting one host into a grid pane, a splitter, and a timeline pane
// (plans/01 §8.3, S1.8 D-S1.8-1/D-S1.8-7). Structure and one number only: no geometry, no scale, no
// data, no frame, no events — who is allowed to change gridWidth is decided one layer up
// (GanttShell, D-S1.8-3).
//
// The timeline pane is the only scroller (D-D, D-S1.8-1). The grid pane has none: its row layer is
// what `RenderSurfaces.grid` mounts into, and follows the timeline pane's scroll by one transform
// per frame instead of a second real scrollbar (render/dom/index.ts).

import { readPixelProperty } from '../render/dom/pixel-property.js';
import type { Size } from '../model/index.js';

const GRID_PANE_WIDTH_PROPERTY = '--fg-grid-pane-width';
/** Zero is authored, not nonsense: a host that wants no grid pane sets `--fg-grid-pane-width: 0`. */
const GRID_PANE_WIDTH_POLICY = { fallback: 160, accepts: 'zeroOrMore' } as const;
/** D-S1.8-11: the grid pane's rows must start at the same y as the timeline pane's rows, which sit
 *  below the header bands — so the grid pane carries a spacer of its own, sized the same way. */
const HEADER_HEIGHT_PROPERTY = '--fg-header-height';
const HEADER_HEIGHT_POLICY = { fallback: 20, accepts: 'zeroOrMore' } as const;
const SPLITTER_WIDTH_PROPERTY = '--fg-splitter-width';
const SPLITTER_WIDTH_POLICY = { fallback: 4, accepts: 'positive' } as const;

export interface PaneLayoutOptions {
  host: HTMLElement;
  /** Initial grid pane width in px. Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Default 0. The splitter clamps to it; nothing else may. */
  minGridWidth?: number;
}

export interface Panes {
  /** The grid pane's row layer. Row labels and, from S6, columns. No scrollbar — it follows the
   *  scroll owner by transform (D-S1.8-1). */
  readonly grid: HTMLElement;
  /** The single native scroller: header bands, bars, links, decorations. */
  readonly timeline: HTMLElement;
  readonly splitter: HTMLElement;
}

export class PaneLayout {
  readonly panes: Panes;
  #host: HTMLElement;
  #gridPane: HTMLElement;
  #gridWidth: number;
  #minGridWidth: number;

  constructor(options: PaneLayoutOptions) {
    this.#host = options.host;
    this.#host.replaceChildren();
    // D-S1.8-1: the host itself is never the scroller — no overflow, no scroll of its own.
    this.#host.style.display = 'flex';
    this.#host.style.overflow = 'hidden';
    this.#minGridWidth = options.minGridWidth ?? 0;

    const headerHeight = readPixelProperty(this.#host, HEADER_HEIGHT_PROPERTY, HEADER_HEIGHT_POLICY);
    const splitterWidth = readPixelProperty(this.#host, SPLITTER_WIDTH_PROPERTY, SPLITTER_WIDTH_POLICY);
    const initialGridWidth =
      options.gridWidth ?? readPixelProperty(this.#host, GRID_PANE_WIDTH_PROPERTY, GRID_PANE_WIDTH_POLICY);
    this.#gridWidth = Math.max(this.#minGridWidth, initialGridWidth);

    this.#gridPane = document.createElement('div');
    this.#gridPane.className = 'fg-grid-pane';
    this.#gridPane.style.display = 'flex';
    this.#gridPane.style.flexDirection = 'column';
    this.#gridPane.style.flexShrink = '0';
    this.#gridPane.style.overflow = 'hidden';
    this.#gridPane.style.width = `${this.#gridWidth}px`;

    const spacer = document.createElement('div');
    spacer.className = 'fg-grid-spacer';
    spacer.style.flexShrink = '0';
    spacer.style.height = `${headerHeight}px`;

    const rowClip = document.createElement('div');
    rowClip.className = 'fg-rows-clip';
    rowClip.style.position = 'relative';
    rowClip.style.flex = '1 1 auto';
    rowClip.style.overflow = 'hidden';

    // render/dom's sync() moves this element by `translateY(-visible.y)` every frame (D-S1.8-1).
    // It must NOT also be the overflow:hidden clip boundary: transforming an element moves its own
    // box along with it, so a clip on the transformed element itself would carry the clip window
    // off-screen with the content instead of keeping it fixed over the pane. `rowClip` (above,
    // never transformed) owns the clip; `rowLayer` (below) owns the transform.
    const rowLayer = document.createElement('div');
    rowLayer.className = 'fg-rows';
    rowLayer.style.position = 'relative';
    rowLayer.style.height = '100%';

    rowClip.append(rowLayer);
    this.#gridPane.append(spacer, rowClip);

    const splitter = document.createElement('div');
    splitter.className = 'fg-splitter';
    splitter.style.flexShrink = '0';
    splitter.style.width = `${splitterWidth}px`;
    splitter.style.cursor = 'col-resize';

    const timelinePane = document.createElement('div');
    timelinePane.className = 'fg-timeline-pane';
    timelinePane.style.position = 'relative';
    timelinePane.style.flex = '1 1 auto';
    timelinePane.style.minWidth = '0';
    // The single native scroller (D-D, D-S1.8-1).
    timelinePane.style.overflow = 'auto';

    this.#host.append(this.#gridPane, splitter, timelinePane);

    this.panes = { grid: rowLayer, splitter, timeline: timelinePane };
  }

  get gridWidth(): number {
    return this.#gridWidth;
  }

  set gridWidth(px: number) {
    const clamped = Math.max(this.#minGridWidth, px);
    if (clamped === this.#gridWidth) return;
    this.#gridWidth = clamped;
    this.#gridPane.style.width = `${clamped}px`;
  }

  /** The timeline pane's client box — the one measurement everything downstream is sized from. */
  measureTimelinePane(): Size {
    return { width: this.panes.timeline.clientWidth, height: this.panes.timeline.clientHeight };
  }

  destroy(): void {
    this.#host.replaceChildren();
  }
}
