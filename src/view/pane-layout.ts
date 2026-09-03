// view/ — the DOM skeleton splitting one container into a grid pane, a splitter, and a timeline pane
// (plans/01 §8.3, S1.8 D-S1.8-1/D-S1.8-7). Structure and one number only: no geometry, no scale, no
// data, no frame, no events — who is allowed to change gridWidth is decided one layer up
// (GanttShell, D-S1.8-3).
//
// The timeline pane is the only *vertical* scroller (D-D, D-S1.8-1): the grid pane has none of its
// own — its row layer is what `RenderSurfaces.grid` mounts into, and follows the timeline pane's
// vertical scroll by one transform per frame instead of a second real scrollbar (render/dom/index.ts).
// Horizontally the grid pane is its own, independent native scroller (D-S1.8-13, #126) — its content
// only widens past `gridWidth` when fixed-width columns overflow it, unsynced with the timeline's
// own (time-axis) horizontal scroll.

import { readPixelProperty } from '../render/dom/pixel-property.js';
import type { Size } from '../model/index.js';

const GRID_PANE_WIDTH_PROPERTY = '--fg-grid-pane-width';
/** Zero is authored, not nonsense: a container that wants no grid pane sets `--fg-grid-pane-width: 0`. */
const GRID_PANE_WIDTH_POLICY = { fallback: 160, accepts: 'zeroOrMore' } as const;
const SPLITTER_WIDTH_PROPERTY = '--fg-splitter-width';
const SPLITTER_WIDTH_POLICY = { fallback: 4, accepts: 'positive' } as const;
/** #127: wide enough for one narrow column, so a splitter drag cannot take the pane to nothing by
 *  accident. A consumer who wants the old no-floor behaviour passes `minGridWidth: 0`. */
const DEFAULT_MIN_GRID_WIDTH = 40;

export interface PaneLayoutOptions {
  container: HTMLElement;
  /** Initial grid pane width in px. Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Default 40. The splitter drag clamps to it; a direct `gridWidth` write never does. */
  minGridWidth?: number;
}

export interface Panes {
  /** The grid pane's row layer. Row labels and Grid cells. No *vertical* scrollbar — it follows
   *  the scroll owner by transform (D-S1.8-1). The grid pane itself is a real horizontal
   *  scroller when its content overflows (D-S1.8-13, #126). */
  readonly grid: HTMLElement;
  /** Column headers, overlaid on the grid spacer so they match the timeline header height. */
  readonly gridHeader: HTMLElement;
  /** The single native scroller: header bands, bars, links, decorations. */
  readonly timeline: HTMLElement;
  readonly splitter: HTMLElement;
  /** S5.3, D-S5-8: the overlay layer a `Popup` mounts into — one absolutely positioned element on
   *  top of both panes, owned by `view/overlay.ts`. Structure only; `Overlay` owns its
   *  content and stacking. */
  readonly overlay: HTMLElement;
}

export class PaneLayout {
  readonly panes: Panes;
  #container: HTMLElement;
  #gridPane: HTMLElement;
  #spacer: HTMLElement;
  #gridWidth: number;
  #minGridWidth: number;
  #headerBandCount = 0;

  constructor(options: PaneLayoutOptions) {
    this.#container = options.container;
    this.#container.replaceChildren();
    // D-S1.8-1: the container itself is never the scroller — no overflow, no scroll of its own. `fg-container`
    // is a 13th class beyond D-S1.10-1's shipped twelve — needed because the container's own display/
    // overflow are structural too, and nothing else identifies it for a stylesheet rule to target.
    this.#container.classList.add('fg-container');
    // S1.10, D-S1.10-5: the container is the one honest tab stop this step defines (no roving tabindex
    // yet — that's S3's, once a keyboard controller exists to move it). `aria-label` is live
    // (GanttShell.a11yLabel) and set separately, not here.
    this.#container.setAttribute('role', 'group');
    this.#container.setAttribute('tabindex', '0');
    this.#minGridWidth = options.minGridWidth ?? DEFAULT_MIN_GRID_WIDTH;

    const splitterWidth = readPixelProperty(this.#container, SPLITTER_WIDTH_PROPERTY, SPLITTER_WIDTH_POLICY);
    // An authored width is authored: the floor bounds the splitter drag, never a written width
    // (#127). A container that asks for a narrow — or collapsed — grid pane gets one.
    this.#gridWidth =
      options.gridWidth ??
      readPixelProperty(this.#container, GRID_PANE_WIDTH_PROPERTY, GRID_PANE_WIDTH_POLICY);

    // D-S1.10-6: display/flexDirection/flexShrink/overflow/position/flex/minWidth/cursor are all
    // structural — the base stylesheet's class rules own them now (`view/styles.ts`). Only the live
    // numbers (width/height) stay inline, which is what `freegantt/no-inline-style-outside-geometry`
    // enforces.
    this.#gridPane = document.createElement('div');
    this.#gridPane.className = 'fg-grid-pane';
    this.#gridPane.style.width = `${this.#gridWidth}px`;

    // D-S1.12-9: renders one empty `.fg-band` per header band (`setHeaderBandCount`) instead of
    // being sized imperatively — both panes then resolve their header height from the same
    // `--fg-band-height` CSS expression and cannot drift.
    this.#spacer = document.createElement('div');
    this.#spacer.className = 'fg-grid-spacer';

    const rowClip = document.createElement('div');
    rowClip.className = 'fg-rows-clip';

    const headerRow = document.createElement('div');
    headerRow.className = 'fg-grid-header';
    this.#spacer.append(headerRow);

    // render/dom's sync() moves this element by `translateY(-visible.y)` every frame (D-S1.8-1).
    // It must NOT also be the overflow:hidden clip boundary: transforming an element moves its own
    // box along with it, so a clip on the transformed element itself would carry the clip window
    // off-screen with the content instead of keeping it fixed over the pane. `rowClip` (above,
    // never transformed) owns the clip; `rowLayer` (below) owns the transform.
    const rowLayer = document.createElement('div');
    rowLayer.className = 'fg-rows';

    rowClip.append(rowLayer);
    this.#gridPane.append(this.#spacer, rowClip);

    const splitter = document.createElement('div');
    splitter.className = 'fg-splitter';
    splitter.style.width = `${splitterWidth}px`;

    const timelinePane = document.createElement('div');
    timelinePane.className = 'fg-timeline-pane';

    // S5.3, D-S5-8: sits above both panes in DOM order (and stacking, `view/styles.ts`'s
    // `.fg-overlay`) — the container's one absolutely positioned overlay layer, spanning it edge to
    // edge. Structure only: `Overlay` (constructed one layer up, in `GanttShell`) owns everything
    // that gets mounted into it.
    const overlay = document.createElement('div');
    overlay.className = 'fg-overlay';

    this.#container.append(this.#gridPane, splitter, timelinePane, overlay);

    this.panes = { grid: rowLayer, gridHeader: headerRow, splitter, timeline: timelinePane, overlay };
  }

  get gridWidth(): number {
    return this.#gridWidth;
  }

  /** Writes the width as given — `minGridWidth` does not clamp here (#127). The floor bounds the
   *  splitter drag, which `GanttShell` applies before it previews or commits a proposal, so an
   *  explicit `gridWidth = 0` still collapses the pane on purpose. */
  set gridWidth(px: number) {
    if (px === this.#gridWidth) return;
    this.#gridWidth = px;
    this.#gridPane.style.width = `${px}px`;
  }

  get minGridWidth(): number {
    return this.#minGridWidth;
  }

  /** Live (#127). Storage only — `GanttShell` owns every use of the floor, so raising it above the
   *  current `gridWidth` goes through the same cancelable commit sequence a splitter drag runs. */
  set minGridWidth(px: number) {
    this.#minGridWidth = px;
  }

  /** #126: the grid pane's own content width in px (`layout/`'s `gridContentWidth`, computed from
   *  the resolved columns and this same `gridWidth`). Equal to `gridWidth` when nothing overflows —
   *  `.fg-grid-spacer`/`.fg-rows-clip` fall back to `100%` and the pane stays byte-identical to
   *  before. Wider only when fixed-width columns alone exceed `gridWidth`, which is what gives the
   *  pane a horizontal scrollbar reaching them (D-S1.8-1's horizontal half, revisited). */
  set contentWidth(px: number) {
    this.#gridPane.style.setProperty('--fg-grid-content-width', `${px}px`);
  }

  /** The timeline pane's client box — the one measurement everything downstream is sized from. */
  measureTimelinePane(): Size {
    return { width: this.panes.timeline.clientWidth, height: this.panes.timeline.clientHeight };
  }

  /** `Overlay.bounds` (S5.3, D-S5-8): the container's own client rect, the outer clamp a popup
   *  anchored outside both panes still clamps to. */
  containerBounds(): DOMRect {
    return this.#container.getBoundingClientRect();
  }

  /** `Overlay.paneBounds` (S5.3, D-S5-8, issue #137 F8): the grid pane's own client rect — not
   *  `panes.grid`, which is the row layer moved by transform every frame and would report a stale or
   *  scrolled-away box — alongside the timeline pane's. */
  paneRects(): { grid: DOMRect; timeline: DOMRect } {
    return {
      grid: this.#gridPane.getBoundingClientRect(),
      timeline: this.panes.timeline.getBoundingClientRect(),
    };
  }

  /** D-S1.12-9: the grid pane's spacer renders one empty `.fg-band` per header band, so both panes
   *  resolve their header height from the same `--fg-band-height` CSS expression and cannot drift.
   *  A no-op when the count is unchanged — the common case, every render. */
  setHeaderBandCount(count: number): void {
    if (count === this.#headerBandCount) return;
    this.#headerBandCount = count;
    this.#spacer.replaceChildren();
    for (let i = 0; i < count; i++) {
      const band = document.createElement('div');
      band.className = 'fg-band';
      this.#spacer.append(band);
    }
    this.#spacer.append(this.panes.gridHeader);
  }

  destroy(): void {
    this.#container.replaceChildren();
  }
}
