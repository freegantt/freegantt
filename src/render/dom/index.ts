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
  RowId,
} from '../../layout/index.js';
import type { RenderBackend, RenderSurfaces, InteractionState, HitResult } from '../backend.js';
import { syncKeyed } from './sync-keyed.js';

type TickGeom = Pick<FrameHeaderTick, 'x' | 'width' | 'label'>;
type RowGeom = Pick<FrameRow, 'top' | 'height' | 'label' | 'index'> & { rowCount: number };
type BarGeom = Pick<FrameBar, 'kind' | 'label' | 'x' | 'y' | 'width' | 'height' | 'flags' | 'a11yLabel'>;
/** Bands carry no per-frame geometry of their own yet (height/stacking is S1.9/S1.10) — an always-
 * equal geom means `syncKeyed` patches a band node once, at creation, and never again. */
type BandGeom = Record<string, never>;
const EMPTY_BAND_GEOM: BandGeom = {};

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

  const bandNodes = new Map<number, HTMLElement>();
  const bandGeom = new Map<number, BandGeom>();
  // One tick node/geom cache per band index — a nested keyed list is still a keyed list (plans/01
  // §8.1's reconciler scope: attr/class/style/text + keyed children, nothing more).
  const bandTickNodes = new Map<number, Map<number, HTMLElement>>();
  const bandTickGeom = new Map<number, Map<number, TickGeom>>();
  const rowNodes = new Map<RowId, HTMLElement>();
  const rowGeom = new Map<RowId, RowGeom>();
  const barNodes = new Map<ItemId, HTMLElement>();
  const barGeom = new Map<ItemId, BarGeom>();

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
    syncKeyed(headerLayer, bands, bandNodes, bandGeom, {
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
      const bandNode = bandNodes.get(i);
      if (!bandNode) return;
      let ticksForBand = bandTickNodes.get(i);
      let geomForBand = bandTickGeom.get(i);
      if (!ticksForBand || !geomForBand) {
        ticksForBand = new Map<number, HTMLElement>();
        geomForBand = new Map<number, TickGeom>();
        bandTickNodes.set(i, ticksForBand);
        bandTickGeom.set(i, geomForBand);
      }
      syncKeyed(bandNode, band.ticks, ticksForBand, geomForBand, tickSpec);
    });

    for (const i of bandTickNodes.keys()) {
      if (i >= bands.length) {
        bandTickNodes.delete(i);
        bandTickGeom.delete(i);
      }
    }
  }

  function syncRows(rows: readonly FrameRow[], rowCount: number): void {
    if (!gridLayer) return;
    syncKeyed(gridLayer, rows, rowNodes, rowGeom, {
      key: (row) => row.id,
      create: (row) => {
        const node = document.createElement('div');
        node.className = 'fg-row';
        node.setAttribute('role', 'listitem');
        node.dataset['testid'] = 'fg-row';
        node.dataset['rowId'] = row.id;
        const label = document.createElement('div');
        label.className = 'fg-row-label';
        node.append(label);
        return node;
      },
      toGeom: (row) => ({ top: row.top, height: row.height, label: row.label, index: row.index, rowCount }),
      patch: (node, geom) => {
        node.style.transform = `translateY(${geom.top}px)`;
        node.style.height = `${geom.height}px`;
        node.setAttribute('aria-posinset', String(geom.index + 1));
        node.setAttribute('aria-setsize', String(geom.rowCount));
        node.querySelector('.fg-row-label')!.textContent = geom.label;
      },
    });
  }

  function syncBars(bars: readonly FrameBar[]): void {
    if (!barLayer) return;
    syncKeyed(barLayer, bars, barNodes, barGeom, {
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
      contentSizer.style.width = '1px';
      contentSizer.style.height = '1px';
      timelineHost.append(headerLayer, barLayer, contentSizer);
    },
    sync(frame: GeometryFrame) {
      syncHeader(frame.header.bands);
      syncRows(frame.rows, frame.rowCount);
      syncBars(frame.bars);
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
    applyState(_state: InteractionState) {
      // Hot path lands in S4: class toggles + transforms only, zero allocation (plans/01 §3).
    },
    hitTest(x: number, y: number): HitResult | null {
      // "The bars array is the hit index; DOM backends get hit-testing from event delegation"
      // (plans/01 §4) — no materialized hit-region array (#31).
      if (!barLayer) return null;
      const el = document.elementFromPoint(x, y);
      const bar = el instanceof Element ? el.closest<HTMLElement>('.fg-bar') : null;
      if (!bar || !barLayer.contains(bar)) return null;
      const id = bar.dataset['itemId'];
      return id ? { itemId: id as ItemId } : null;
    },
    destroy() {
      gridLayer?.replaceChildren();
      timelineHost?.replaceChildren();
      bandNodes.clear();
      bandGeom.clear();
      bandTickNodes.clear();
      bandTickGeom.clear();
      rowNodes.clear();
      rowGeom.clear();
      barNodes.clear();
      barGeom.clear();
      gridLayer = undefined;
      timelineHost = undefined;
      headerLayer = undefined;
      barLayer = undefined;
      contentSizer = undefined;
    },
  };
}
