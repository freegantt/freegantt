// render/dom — default backend: absolutely-positioned rows/bars/header ticks, keyed reconciler
// (plans/01 §8.1). Scope is hard-bounded: attr/class/style/text + keyed child recycling only.

import type {
  BarFlags,
  FrameBar,
  FrameHeaderBand,
  FrameHeaderTick,
  FrameRow,
  GeometryFrame,
  ItemId,
  ItemPreview,
  RowId,
} from '../../layout/index.js';
import type { RenderBackend, RenderSurfaces, InteractionState, HitResult } from '../backend.js';
import { attachDateLines } from './date-line.js';
import type { DateLineAttachment } from './date-line.js';
import { KeyedLayer, NestedKeyedLayers } from './sync-keyed.js';

type TickGeom = Pick<FrameHeaderTick, 'x' | 'width' | 'label'>;
type CellGeom = { text: string };
type RowGeom = {
  top: number;
  height: number;
  cells: readonly string[];
  index: number;
  rowCount: number;
};
type BarGeom = Pick<FrameBar, 'kind' | 'label' | 'x' | 'y' | 'width' | 'height' | 'flags' | 'a11yLabel'>;
/** What the shared handle pair (D-S3-8) needs to place itself over a committed bar — a narrower slice
 *  than `BarGeom`, which also carries paint fields the handles don't read. */
type HandleGeom = Pick<FrameBar, 'x' | 'y' | 'width' | 'height'>;
/** Bands carry no per-frame geometry of their own yet (height/stacking is S1.9/S1.10) — an always-
 * equal geom means `syncKeyed` patches a band node once, at creation, and never again. */
type BandGeom = Record<string, never>;
const EMPTY_BAND_GEOM: BandGeom = Object.freeze({});

/** `data-flag` is generated from `BarFlags`' own keys, not hand-mapped (S1.10, D-S1.10-2) — adding a
 * new `BarFlags` key needs no edit here (U7). */
function flagTokens(flags: BarFlags): string {
  return (Object.keys(flags) as (keyof BarFlags)[]).filter((k) => flags[k]).join(' ');
}

export function createDomBackend(): RenderBackend<HTMLElement> {
  // The grid pane's row layer (RenderSurfaces.grid) — created by `view/pane-layout.ts`, not this
  // backend (S1.8, D-S1.8-2). No scrollbar of its own: it follows the timeline pane's scroll
  // position by one `translateY(-visible.y)` per frame (D-S1.8-1), written in `sync()` below.
  let gridLayer: HTMLElement | undefined;
  // The timeline pane's content layer (RenderSurfaces.timeline) — this backend's own header, bar
  // and sizer layers mount inside it, at x=0: no gutter to offset by, the grid pane owns that width.
  let timelineHost: HTMLElement | undefined;
  let headerLayer: HTMLElement | undefined;
  let barLayer: HTMLElement | undefined;
  let contentSizer: HTMLElement | undefined;
  let dateLines: DateLineAttachment | undefined;
  // D-S3-8: one shared handle pair, created once at mount() and moved/parked by applyState — never
  // one pair per bar.
  let startHandle: HTMLElement | undefined;
  let endHandle: HTMLElement | undefined;

  const bandLayer = new KeyedLayer<FrameHeaderBand, number, BandGeom>();
  // One tick layer per band index — a nested keyed list is still a keyed list (plans/01 §8.1's
  // reconciler scope: attr/class/style/text + keyed children, nothing more).
  const bandTickLayers = new NestedKeyedLayers<number, FrameHeaderTick, number, TickGeom>();
  const rowLayer = new KeyedLayer<FrameRow, RowId, RowGeom>();
  // One cell layer per row id, same nested pattern as bandTickLayers above.
  const rowCellLayers = new NestedKeyedLayers<RowId, string, number, CellGeom>();
  const barLayerCache = new KeyedLayer<FrameBar, ItemId, BarGeom>();

  // D-S3-6/D-S3-7: what the last applyState() call painted, so the next call touches only the bars
  // whose token set actually changed — O(changed items), not O(bars) (I5, [S3-A3]).
  let paintedHovered: ItemId | undefined;
  let paintedSelected: ReadonlySet<ItemId> = new Set();
  let paintedResizable: ItemId | undefined;
  let paintedMovable: ItemId | undefined;
  /** S3.3, D-S3-18: items this backend currently holds off their committed transform for a drag
   *  preview — so the next `applyState` knows which ones to park back when they drop out of the set. */
  let paintedPreview: ReadonlySet<ItemId> = new Set();
  // Committed geometry per mounted bar (D-S3-6): what the handle pair and the future preview offsets
  // (S3.3) both read. `syncBars` is the only writer.
  const barGeomByItemId = new Map<ItemId, HandleGeom>();

  /** Moves the shared handle pair onto `geom`, or parks both (D-S3-8) when it is undefined. `hidden`
   *  is a DOM property write, not `.style` — the base stylesheet owns `[hidden] { display: none }`. */
  function paintResizeHandles(geom: HandleGeom | undefined): void {
    if (!startHandle || !endHandle) return;
    if (!geom) {
      startHandle.hidden = true;
      endHandle.hidden = true;
      return;
    }
    startHandle.hidden = false;
    endHandle.hidden = false;
    startHandle.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
    startHandle.style.height = `${geom.height}px`;
    endHandle.style.transform = `translate(${geom.x + geom.width}px, ${geom.y}px)`;
    endHandle.style.height = `${geom.height}px`;
  }

  /** Applies the base committed transform (`syncBars`'s own geometry) to one bar — what a previewed
   *  bar returns to once the preview clears (S3.3, D-S3-18). */
  function restoreBarTransform(id: ItemId): void {
    const node = barLayerCache.node(id);
    const geom = barGeomByItemId.get(id);
    if (!node || !geom) return;
    node.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
    node.style.width = `${geom.width}px`;
  }

  /** Offsets one bar's transform/width by `preview`'s px delta, on top of its committed geometry —
   *  a hot-path write only (I5): no frame recompute, no node creation. */
  function applyBarPreview(id: ItemId, preview: ItemPreview): void {
    const node = barLayerCache.node(id);
    const geom = barGeomByItemId.get(id);
    if (!node || !geom) return;
    node.style.transform = `translate(${geom.x + preview.dx}px, ${geom.y}px)`;
    if (preview.dWidth !== 0) node.style.width = `${geom.width + preview.dWidth}px`;
  }

  function paintPreview(previews: readonly ItemPreview[] | undefined): void {
    const next = new Map<ItemId, ItemPreview>();
    for (const preview of previews ?? []) next.set(preview.itemId, preview);
    paintedPreview.forEach((id) => {
      if (!next.has(id)) restoreBarTransform(id);
    });
    next.forEach((preview, id) => applyBarPreview(id, preview));
    paintedPreview = new Set(next.keys());
  }

  function paintDataState(itemId: ItemId, hovered: ItemId | undefined, selected: ReadonlySet<ItemId>): void {
    const node = barLayerCache.node(itemId);
    if (!node) return;
    const tokens: string[] = [];
    if (hovered === itemId) tokens.push('hovered');
    if (selected.has(itemId)) tokens.push('selected');
    node.dataset['state'] = tokens.join(' ');
  }

  const tickSpec = {
    key: (_tick: FrameHeaderTick, i: number) => i,
    create: (): HTMLElement => {
      const node = document.createElement('div');
      node.className = 'fg-tick';
      return node;
    },
    toGeom: (tick: FrameHeaderTick): TickGeom => ({ x: tick.x, width: tick.width, label: tick.label }),
    patch: (node: HTMLElement, geom: TickGeom): void => {
      node.style.transform = `translateX(${geom.x}px)`;
      node.style.width = `${geom.width}px`;
      node.textContent = geom.label;
    },
  };

  // Bands keyed by index, coarsest first (D-S1.7-6); ticks keyed within a band. Today every shipped
  // preset has exactly one header, so this renders byte-identical output to the pre-S1.7 single list.
  function syncHeader(bands: readonly FrameHeaderBand[]): void {
    if (!headerLayer) return;
    bandLayer.sync(headerLayer, bands, {
      key: (_band, i) => i,
      create: () => {
        const node = document.createElement('div');
        node.className = 'fg-band';
        return node;
      },
      toGeom: () => EMPTY_BAND_GEOM,
      patch: () => {},
    });

    bands.forEach((band, i) => {
      const bandNode = bandLayer.node(i);
      if (!bandNode) return;
      bandTickLayers.layerFor(i).sync(bandNode, band.ticks, tickSpec);
    });

    bandTickLayers.prune(new Set(bands.map((_band, i) => i)));
  }

  const cellSpec = {
    key: (_cell: string, i: number) => i,
    create: (_cell: string, i: number): HTMLElement => {
      const node = document.createElement('div');
      // The first cell keeps the pre-#81 class so existing style tokens and selectors still apply
      // (issue #81: `.fg-row-label` stays as the class on the first cell).
      node.className = i === 0 ? 'fg-row-label' : 'fg-row-cell';
      return node;
    },
    toGeom: (cell: string): CellGeom => ({ text: cell }),
    patch: (node: HTMLElement, geom: CellGeom): void => {
      node.textContent = geom.text;
    },
  };

  function syncRows(rows: readonly FrameRow[], rowCount: number): void {
    if (!gridLayer) return;
    rowLayer.sync(gridLayer, rows, {
      key: (row) => row.id,
      create: (_row, key) => {
        const node = document.createElement('div');
        node.className = 'fg-row';
        node.setAttribute('role', 'listitem');
        node.dataset['testid'] = 'fg-row';
        node.dataset['rowId'] = key;
        return node;
      },
      toGeom: (row) => ({ top: row.top, height: row.height, cells: row.cells, index: row.index, rowCount }),
      patch: (node, geom) => {
        node.style.transform = `translateY(${geom.top}px)`;
        node.style.height = `${geom.height}px`;
        node.setAttribute('aria-posinset', String(geom.index + 1));
        node.setAttribute('aria-setsize', String(geom.rowCount));
      },
    });

    syncCellsForEachRow(rows);
  }

  /** Each row owns a nested keyed list of cells (one per configured column), the same "keyed list
   * inside a keyed list" pattern `syncHeader` uses for ticks inside bands. Split out from `syncRows`
   * because it needs its own per-row layer lookup and its own prune pass. */
  function syncCellsForEachRow(rows: readonly FrameRow[]): void {
    rows.forEach((row) => {
      const rowNode = rowLayer.node(row.id);
      if (!rowNode) return;
      rowCellLayers.layerFor(row.id).sync(rowNode, row.cells, cellSpec);
    });

    rowCellLayers.prune(new Set(rows.map((row) => row.id)));
  }

  function syncBars(bars: readonly FrameBar[]): void {
    if (!barLayer) return;
    barGeomByItemId.clear();
    for (const bar of bars) {
      barGeomByItemId.set(bar.id, { x: bar.x, y: bar.y, width: bar.width, height: bar.height });
    }
    barLayerCache.sync(barLayer, bars, {
      key: (bar) => bar.id,
      create: (bar) => {
        const node = document.createElement('div');
        node.className = 'fg-bar';
        node.dataset['itemId'] = bar.id;
        node.dataset['testid'] = 'fg-bar';
        node.setAttribute('role', 'img');
        return node;
      },
      toGeom: (bar) => ({
        kind: bar.kind,
        label: bar.label,
        x: bar.x,
        y: bar.y,
        width: bar.width,
        height: bar.height,
        flags: bar.flags,
        a11yLabel: bar.a11yLabel,
      }),
      patch: (node, geom) => {
        node.dataset['kind'] = geom.kind;
        node.dataset['flag'] = flagTokens(geom.flags);
        node.textContent = geom.label;
        node.setAttribute('aria-label', geom.a11yLabel);
        node.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
        node.style.width = `${geom.width}px`;
        node.style.height = `${geom.height}px`;
      },
    });
  }

  return {
    mount(surfaces: RenderSurfaces<HTMLElement>) {
      gridLayer = surfaces.grid;
      gridLayer.replaceChildren();
      timelineHost = surfaces.timeline;
      timelineHost.replaceChildren();

      headerLayer = document.createElement('div');
      headerLayer.className = 'fg-header';
      barLayer = document.createElement('div');
      barLayer.className = 'fg-bars';
      // Owns the native scrollable extent (S1.5 README D-S1.5-9): rows/bars are positioned absolutely,
      // so nothing else in this DOM makes `timelineHost` actually overflow — without this, ScrollModel's
      // `panTo` has nowhere real to write. Zero visual footprint; `sync()` moves it to the frame's
      // bottom-right corner every render.
      contentSizer = document.createElement('div');
      contentSizer.setAttribute('aria-hidden', 'true');
      contentSizer.className = 'fg-content-sizer';
      startHandle = document.createElement('div');
      startHandle.className = 'fg-bar-handle';
      startHandle.dataset['edge'] = 'start';
      startHandle.hidden = true;
      endHandle = document.createElement('div');
      endHandle.className = 'fg-bar-handle';
      endHandle.dataset['edge'] = 'end';
      endHandle.hidden = true;
      timelineHost.append(headerLayer, barLayer, contentSizer, startHandle, endHandle);
      dateLines = attachDateLines(timelineHost, headerLayer);
    },
    sync(frame: GeometryFrame) {
      if (headerLayer) {
        // A boundary tick's cell is one full calendar unit wide and can overshoot `contentWidth` on a
        // coarse preset over a short dataset. `.fg-header` clips (`overflow: hidden`) at its own box
        // edge, so the box must be exactly `contentWidth` wide — or the clip lands at the pane's width
        // instead and either hides in-range ticks or lets an oversized tick inflate native scrollWidth.
        headerLayer.style.width = `${frame.contentWidth}px`;
      }
      syncHeader(frame.header.bands);
      syncRows(frame.rows, frame.rowCount);
      syncBars(frame.bars);
      dateLines?.sync(frame.decorations, frame.contentHeight, frame.visible.height);
      if (gridLayer) {
        // The grid pane has no scrollbar of its own; its row layer follows the timeline pane's
        // native scroll by one transform per frame instead of a second real scroller (D-S1.8-1).
        // Both panes read `top` from the same `frame.rows` array, so pixel-identity (I9) is
        // structural rather than a property this line has to maintain by hand.
        gridLayer.style.transform = `translateY(${-frame.visible.y}px)`;
      }
      if (contentSizer) {
        // The sizer itself is 1x1px, so its far edge — not its origin — must land at the content
        // extent, or the browser's native scrollable range ends up 1px past what ScrollModel computed.
        // No gutter to add: the timeline pane's content is `contentWidth` wide, full stop (D-S1.8-1).
        const x = Math.max(0, frame.contentWidth - 1);
        const y = Math.max(0, frame.contentHeight - 1);
        contentSizer.style.transform = `translate(${x}px, ${y}px)`;
      }
    },
    applyState(state: InteractionState) {
      // D-S3-6/D-S3-7: diff against what was last painted, touch only the bars whose token set
      // changed. No frame recompute, no node creation — `barLayerCache` already holds every mounted
      // bar's node from the last sync().
      const nextSelected = new Set(state.selectedItemIds ?? []);
      const nextHovered = state.hoveredItemId;
      const changed = new Set<ItemId>();
      paintedSelected.forEach((id) => {
        if (!nextSelected.has(id)) changed.add(id);
      });
      nextSelected.forEach((id) => {
        if (!paintedSelected.has(id)) changed.add(id);
      });
      if (paintedHovered !== nextHovered) {
        if (paintedHovered !== undefined) changed.add(paintedHovered);
        if (nextHovered !== undefined) changed.add(nextHovered);
      }
      changed.forEach((id) => paintDataState(id, nextHovered, nextSelected));
      paintedSelected = nextSelected;
      paintedHovered = nextHovered;

      // D-S3-8: the shared handle pair follows `resizableItemId`, positioned off the committed
      // geometry `syncBars` already recorded — never a per-item computation of its own.
      const nextResizable = state.resizableItemId;
      if (nextResizable !== paintedResizable) {
        paintResizeHandles(nextResizable !== undefined ? barGeomByItemId.get(nextResizable) : undefined);
        paintedResizable = nextResizable;
      }

      // D-S3-6: `cursor: grab` follows `movableItemId` via a boolean attribute, not an inline style
      // (`no-inline-style-outside-geometry`) — the base stylesheet owns the actual `cursor` rule.
      const nextMovable = state.movableItemId;
      if (nextMovable !== paintedMovable) {
        if (paintedMovable !== undefined) barLayerCache.node(paintedMovable)?.removeAttribute('data-movable');
        if (nextMovable !== undefined) barLayerCache.node(nextMovable)?.setAttribute('data-movable', '');
        paintedMovable = nextMovable;
      }

      paintPreview(state.preview);
    },
    hitTest(x: number, y: number): HitResult | null {
      // "The bars array is the hit index; DOM backends get hit-testing from event delegation"
      // (plans/01 §4) — no materialized hit-region array (#31).
      if (!barLayer) return null;
      const el = document.elementFromPoint(x, y);
      // S3.4, D-S3-4: the shared handle pair sits above the bar layer in paint order, so a hit on a
      // handle is checked first — `paintedResizable` is the one entry the handle pair currently
      // belongs to (D-S3-8), a parked (hidden) handle is never returned by elementFromPoint.
      const handle = el instanceof Element ? el.closest<HTMLElement>('.fg-bar-handle') : null;
      if (handle && paintedResizable !== undefined) {
        const edge = handle.dataset['edge'];
        if (edge === 'start' || edge === 'end') return { itemId: paintedResizable, edge };
      }
      const bar = el instanceof Element ? el.closest<HTMLElement>('.fg-bar') : null;
      if (!bar || !barLayer.contains(bar)) return null;
      const id = bar.dataset['itemId'];
      return id ? { itemId: id as ItemId } : null;
    },
    destroy() {
      dateLines?.destroy();
      dateLines = undefined;
      gridLayer?.replaceChildren();
      timelineHost?.replaceChildren();
      bandLayer.clear();
      bandTickLayers.clear();
      rowLayer.clear();
      rowCellLayers.clear();
      barLayerCache.clear();
      barGeomByItemId.clear();
      paintedHovered = undefined;
      paintedSelected = new Set();
      paintedResizable = undefined;
      paintedMovable = undefined;
      paintedPreview = new Set();
      gridLayer = undefined;
      timelineHost = undefined;
      headerLayer = undefined;
      barLayer = undefined;
      contentSizer = undefined;
      startHandle = undefined;
      endHandle = undefined;
    },
  };
}
