// view/ — the DOM skeleton splitting one container into a grid pane, a splitter, and a timeline pane
// (plans/01 §8.3, S1.8 D-S1.8-1/D-S1.8-7). Structure and one number only: no geometry, no scale, no
// data, no frame, no events — who is allowed to change gridWidth is decided one layer up
// (GanttShell, D-S1.8-3).
//
// The timeline pane is the only *vertical* scroller (D-D, D-S1.8-1): the grid pane has none of its
// own — its Row layer is what `RenderSurfaces.grid` mounts into, and follows the timeline pane's
// vertical scroll by one transform per frame instead of a second real scrollbar (render/dom/index.ts).
// Horizontally the grid pane is its own, independent native scroller (D-S1.8-13, #126) — its content
// only widens past `gridWidth` when fixed-width columns overflow it, unsynced with the timeline's
// own (time-axis) horizontal scroll.

import { readPixelProperty } from '../render/dom/pixel-property.js';
import type { Size } from '../model/index.js';

const GRID_PANE_WIDTH_PROPERTY = '--fg-grid-pane-width';
/** Shipped default for `--fg-grid-pane-width` (docs/05-consumer-api.md) — `styles.ts` declares the
 *  same number on `:root` so a consumer can read it back (#383). */
export const DEFAULT_GRID_PANE_WIDTH_PX = 160;
/** Zero is authored, not nonsense: a container that wants no grid pane sets `--fg-grid-pane-width: 0`. */
const GRID_PANE_WIDTH_POLICY = { fallback: DEFAULT_GRID_PANE_WIDTH_PX, accepts: 'zeroOrMore' } as const;
const SPLITTER_WIDTH_PROPERTY = '--fg-splitter-width';
/** Shipped default for `--fg-splitter-width` (docs/05-consumer-api.md) — `styles.ts` declares the
 *  same number on `:root` so a consumer can read it back (#383). */
export const DEFAULT_SPLITTER_WIDTH_PX = 4;
const SPLITTER_WIDTH_POLICY = { fallback: DEFAULT_SPLITTER_WIDTH_PX, accepts: 'positive' } as const;
/** #127: wide enough for one narrow column, so a splitter drag cannot take the pane to nothing by
 *  accident. A consumer who wants the old no-floor behaviour passes `minGridWidth: 0`. */
const DEFAULT_MIN_GRID_WIDTH = 40;

/** The one class this layout writes that another layer reads back — `view/gantt-dom.ts` resolves a
 *  node over it to a `'splitter'` target, the same way `render/dom/dom-contract.ts` declares the
 *  classes that backend emits (review A3). */
export const SPLITTER_CLASS = 'fg-splitter';

export interface PaneLayoutOptions {
  container: HTMLElement;
  /** Initial grid pane width in px. Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Default 40. The splitter drag clamps to it; a direct `gridWidth` write never does. */
  minGridWidth?: number;
}

/** One of a Gantt's two panes, by name. The same two keys `paneBounds` answers with, so "which pane
 *  is this in?" and "where is that pane?" speak one vocabulary. Public through `GanttDom`. */
export type PaneName = 'grid' | 'timeline';

/** Which published authoring pattern the grid pane follows (S5.11, D-S5-25). A row source that nests
 *  rows is a `treegrid`; a flat one is a `grid`. The two patterns differ in one thing this layout
 *  cares about — only a `treegrid` row may carry `aria-level` and `aria-expanded`. */
export type GridPattern = 'grid' | 'treegrid';

export interface Panes {
  /** S5.11, D-S5-26: the grid pane itself (`.fg-grid-pane`) — `view/roving-focus.ts`'s fallback tab
   *  stop for the treegrid/grid as a whole, when the pane has no row or header cell to carry a
   *  roving tabindex of its own (an empty dataset, or every column hidden). Named to match
   *  `timeline` below, the pane `roving-focus.ts` treats the same way. */
  readonly grid: HTMLElement;
  /** The Row layer (`.fg-rows`): row labels and Grid cells. No *vertical* scrollbar — it follows
   *  the scroll owner by transform (D-S1.8-1). The grid pane around it is a real horizontal
   *  scroller when its content overflows (D-S1.8-13, #126). */
  readonly rows: HTMLElement;
  /** Column headers, overlaid on the grid spacer so they match the timeline header height. */
  readonly gridHeader: HTMLElement;
  /** The single native scroller: header bands, bars, links, decorations. */
  readonly timeline: HTMLElement;
  readonly splitter: HTMLElement;
  /** S5.3, D-S5-8: the overlay layer a `Popup` mounts into — one absolutely positioned element on
   *  top of both panes, wrapped by `view/mount-layer.ts`. Structure only; the `MountLayer` over it
   *  owns its content. */
  readonly overlay: HTMLElement;
}

export class PaneLayout {
  readonly panes: Panes;
  #container: HTMLElement;
  #gridPane: HTMLElement;
  #spacer: HTMLElement;
  #timelinePane: HTMLElement;
  #gridWidth: number;
  #minGridWidth: number;
  #headerBandCount = 0;
  #gridPattern: GridPattern = 'grid';

  constructor(options: PaneLayoutOptions) {
    this.#container = options.container;
    this.#container.replaceChildren();
    // D-S1.8-1: the container itself is never the scroller — no overflow, no scroll of its own. `fg-container`
    // is a 13th class beyond D-S1.10-1's shipped twelve — needed because the container's own display/
    // overflow are structural too, and nothing else identifies it for a stylesheet rule to target.
    this.#container.classList.add('fg-container');
    // S1.10, D-S1.10-4: the container names the whole Gantt (`accessibleName`, live). It is no
    // longer a tab stop — S5.11's roving focus gives each pane its own (D-S5-26), and one container
    // tab stop beside two pane tab stops would be a third stop that reaches nothing.
    this.#container.setAttribute('role', 'group');
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
    // S5.11, D-S5-25: the grid pane is the pane that carries the published pattern. `gridPattern`
    // (live, from the row source) picks which of the two it is.
    this.#gridPane.setAttribute('role', this.#gridPattern);
    // S5.11, D-S5-26: a fallback tab stop (axe scrollable-region-focusable) — `-1` here so a normal
    // Tab still lands on the roving row/cell `view/roving-focus.ts` manages; it lifts this to `0`
    // only when the pane has nothing else to focus.
    this.#gridPane.tabIndex = -1;

    // D-S1.12-9: renders one empty `.fg-band` per header band (`setHeaderBandCount`) instead of
    // being sized imperatively — both panes then resolve their header height from the same
    // `--fg-band-height` CSS expression and cannot drift.
    this.#spacer = document.createElement('div');
    this.#spacer.className = 'fg-grid-spacer';
    // S5.11, D-S5-25: the spacer holds the one header row, so it is the grid's header `rowgroup`.
    // Its `.fg-band` children are empty height mirrors of the timeline's bands and say nothing to a
    // screen reader — `setHeaderBandCount` hides each one from the tree.
    this.#spacer.setAttribute('role', 'rowgroup');

    const rowClip = document.createElement('div');
    rowClip.className = 'fg-rows-clip';

    const headerRow = document.createElement('div');
    headerRow.className = 'fg-grid-header';
    headerRow.setAttribute('role', 'row');
    this.#spacer.append(headerRow);

    // render/dom's sync() moves this element by `translateY(-visible.y)` every frame (D-S1.8-1).
    // It must NOT also be the overflow:hidden clip boundary: transforming an element moves its own
    // box along with it, so a clip on the transformed element itself would carry the clip window
    // off-screen with the content instead of keeping it fixed over the pane. `rowClip` (above,
    // never transformed) owns the clip; `rowLayer` (below) owns the transform.
    const rowLayer = document.createElement('div');
    rowLayer.className = 'fg-rows';
    // S5.11, D-S5-25: the body `rowgroup`. Only the windowed rows exist inside it, which is what
    // `aria-rowcount`/`aria-rowindex` (`setGridSize`, and `render/dom`'s per-row index) exist to say.
    rowLayer.setAttribute('role', 'rowgroup');

    rowClip.append(rowLayer);
    this.#gridPane.append(this.#spacer, rowClip);

    const splitter = document.createElement('div');
    splitter.className = SPLITTER_CLASS;
    splitter.style.width = `${splitterWidth}px`;
    // S5.11, D-S5-26: the splitter gains a keyboard path this step, so it becomes a real widget
    // rather than a pointer-only strip. `attachSplitter` (`view/splitter.ts`) owns the live
    // `aria-value*` trio and the keyboard handling; this layout only makes the node a tab stop —
    // one splitter, one stop, so no roving tabindex is needed here (unlike the two panes).
    splitter.setAttribute('role', 'separator');
    splitter.tabIndex = 0;

    const timelinePane = document.createElement('div');
    timelinePane.className = 'fg-timeline-pane';
    // S5.11, D-S5-25: a labelled region of focusable bars, explicitly not a second grid. `aria-owns`
    // across the two scrollers was considered and rejected — a virtualized row's node often does not
    // exist to be owned. `accessibleName` (live) names it.
    timelinePane.setAttribute('role', 'region');
    timelinePane.tabIndex = -1;
    this.#timelinePane = timelinePane;

    // S5.3, D-S5-8: sits above both panes in DOM order (and stacking, `view/styles.ts`'s
    // `.fg-overlay`) — the container's one absolutely positioned overlay layer, spanning it edge to
    // edge. Structure only: the `MountLayer` over it (constructed one layer up, in `GanttShell`)
    // owns everything that gets mounted into it.
    const overlay = document.createElement('div');
    overlay.className = 'fg-overlay';

    this.#container.append(this.#gridPane, splitter, timelinePane, overlay);

    this.panes = {
      grid: this.#gridPane,
      rows: rowLayer,
      gridHeader: headerRow,
      splitter,
      timeline: timelinePane,
      overlay,
    };
  }

  /** Live (S1.10, D-S1.10-4): the one name a screen reader reads for this Gantt. The container
   *  carries it for the widget as a whole, and the timeline pane repeats it because a `region` with
   *  no name is not a region at all (D-S5-25). The grid pane needs none: its own rows and column
   *  headers say what it holds. */
  set accessibleName(label: string) {
    this.#container.setAttribute('aria-label', label);
    this.#timelinePane.setAttribute('aria-label', label);
  }

  /** Live (S5.11, D-S5-25): which published pattern the grid pane follows. A tree row source makes
   *  it a `treegrid`, and only then may a row carry `aria-level` and `aria-expanded`. */
  get gridPattern(): GridPattern {
    return this.#gridPattern;
  }

  set gridPattern(pattern: GridPattern) {
    if (pattern === this.#gridPattern) return;
    this.#gridPattern = pattern;
    this.#gridPane.setAttribute('role', pattern);
  }

  /** S5.11, D-S5-25: how many rows and columns the grid *has*, which is not how many it draws — only
   *  the windowed rows exist in the DOM (I3). Without this pair a screen reader reads "row 4 of 12"
   *  over a 5,000-row dataset. */
  setGridSize(rowCount: number, columnCount: number): void {
    this.#gridPane.setAttribute('aria-rowcount', String(rowCount));
    this.#gridPane.setAttribute('aria-colcount', String(columnCount));
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

  /** The header's own height, read from the grid pane's spacer — D-S1.12-9 makes that stack of
   *  `.fg-band` elements the same height as the timeline pane's own sticky header, so one read
   *  answers for both panes. The rows a viewer can actually see are the pane box minus this. */
  measureHeaderHeight(): number {
    return this.#spacer.offsetHeight;
  }

  /** `GanttDom.bounds` (S5.3, D-S5-8): the container's own client rect, the outer clamp a popup
   *  anchored outside both panes still clamps to. */
  bounds(): DOMRect {
    return this.#container.getBoundingClientRect();
  }

  /** `GanttDom.paneBounds` (S5.3, D-S5-8, issue #137 F8): the grid pane's own client rect,
   *  alongside the timeline pane's. The pane's box is the fixed one. A frame that anchors to it
   *  must not read the Row layer, which the per-frame transform has already moved. */
  paneBounds(): Record<PaneName, DOMRect> {
    return {
      grid: this.#gridPane.getBoundingClientRect(),
      timeline: this.panes.timeline.getBoundingClientRect(),
    };
  }

  /** `GanttDom.paneOf` (#177): which pane holds `node`, by element identity. `paneBounds` answers
   *  the same question by geometry, which is the right tool for placing a box and the wrong one for
   *  "whose scroll was that". A node outside both panes answers `undefined`. */
  paneOf(node: Node): PaneName | undefined {
    if (this.#gridPane.contains(node)) return 'grid';
    if (this.panes.timeline.contains(node)) return 'timeline';
    return undefined;
  }

  /** `ctx.view.rowLayer.bounds` (#158, #168): the Row layer's own client rect, transform and all.
   *  It is the box content mounted beside the rows positions itself in. A sibling of the rows rides
   *  that same transform, so it must measure against the moved box, not the pane's fixed one. */
  rowLayerBounds(): DOMRect {
    return this.panes.rows.getBoundingClientRect();
  }

  /** `ctx.view.overlay.bounds` (#168): the overlay layer's own client rect. A popup sits at that
   *  layer's origin, so this is the box its transform counts from. `bounds()` above stays the outer
   *  clamp for placement, which is a question about the whole Gantt. */
  overlayBounds(): DOMRect {
    return this.panes.overlay.getBoundingClientRect();
  }

  /** D-S1.12-9: the grid pane's spacer renders one empty `.fg-band` per header band, so both panes
   *  resolve their header height from the same `--fg-band-height` CSS expression and cannot drift.
   *  A no-op when the count is unchanged — the common case, every render. Returns whether the stack
   *  changed, because the header height changed with it and the rows' own viewport height is the
   *  pane box minus that (`GanttShell#applyPaneMeasurement`). */
  setHeaderBandCount(count: number): boolean {
    if (count === this.#headerBandCount) return false;
    this.#headerBandCount = count;
    this.#spacer.replaceChildren();
    for (let i = 0; i < count; i++) {
      const band = document.createElement('div');
      band.className = 'fg-band';
      // Height only — the timeline's own bands carry the tick labels. Hidden, so the header
      // `rowgroup` around it holds exactly one row (D-S5-25).
      band.setAttribute('aria-hidden', 'true');
      this.#spacer.append(band);
    }
    this.#spacer.append(this.panes.gridHeader);
    return true;
  }

  destroy(): void {
    this.#container.replaceChildren();
  }
}
