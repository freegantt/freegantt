// render/dom — default backend: absolutely-positioned rows/bars/header ticks, keyed reconciler
// (plans/01 §8.1). Scope is hard-bounded: attr/class/style/text + keyed child recycling only.

import type {
  FrameBar,
  FrameHeaderTick,
  FrameRow,
  GeometryFrame,
  ItemId,
  RowId,
} from '../../layout/index.js';
import type { RenderBackend, InteractionState, HitResult } from '../backend.js';
import { syncKeyed } from './sync-keyed.js';

type TickGeom = Pick<FrameHeaderTick, 'x' | 'label'>;
type RowGeom = Pick<FrameRow, 'top' | 'height' | 'label'>;
type BarGeom = Pick<FrameBar, 'kind' | 'label' | 'x' | 'y' | 'width' | 'height'>;

/** CSS custom property that owns the row-label gutter width (plans/02 §4, level 1 of the
 * customization ladder — same ladder rung as `--fg-row-height`). Read once at mount, not per-sync:
 * this backend is the single owner of where the gutter sits, so header ticks (`headerLayer`) and bars
 * (`barLayer`) are shifted by the same offset instead of a host stylesheet offsetting one but not the
 * other (#46). */
const ROW_LABEL_WIDTH_PROPERTY = '--fg-row-label-width';
const DEFAULT_ROW_LABEL_WIDTH = 160;

function readRowLabelWidth(host: HTMLElement): number {
  const raw = getComputedStyle(host).getPropertyValue(ROW_LABEL_WIDTH_PROPERTY).trim();
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ROW_LABEL_WIDTH;
}

export function createDomBackend(): RenderBackend<HTMLElement> {
  let host: HTMLElement | undefined;
  let headerLayer: HTMLElement | undefined;
  let rowLayer: HTMLElement | undefined;
  let barLayer: HTMLElement | undefined;
  let rowLabelWidth = 0;

  const tickNodes = new Map<number, HTMLElement>();
  const tickGeom = new Map<number, TickGeom>();
  const rowNodes = new Map<RowId, HTMLElement>();
  const rowGeom = new Map<RowId, RowGeom>();
  const barNodes = new Map<ItemId, HTMLElement>();
  const barGeom = new Map<ItemId, BarGeom>();

  function syncHeader(ticks: GeometryFrame['header']['ticks']): void {
    if (!headerLayer) return;
    syncKeyed(headerLayer, ticks, tickNodes, tickGeom, {
      key: (_tick, i) => i,
      create: () => {
        const node = document.createElement('div');
        node.className = 'fg-tick';
        node.style.position = 'absolute';
        return node;
      },
      toGeom: (tick) => ({ x: tick.x, label: tick.label }),
      patch: (node, geom) => {
        node.style.transform = `translateX(${geom.x}px)`;
        node.textContent = geom.label;
      },
    });
  }

  function syncRows(rows: readonly FrameRow[]): void {
    if (!rowLayer) return;
    syncKeyed(rowLayer, rows, rowNodes, rowGeom, {
      key: (row) => row.id,
      create: () => {
        const node = document.createElement('div');
        node.className = 'fg-row';
        node.style.position = 'absolute';
        return node;
      },
      toGeom: (row) => ({ top: row.top, height: row.height, label: row.label }),
      patch: (node, geom) => {
        node.style.transform = `translateY(${geom.top}px)`;
        node.style.height = `${geom.height}px`;
        node.style.width = `${rowLabelWidth}px`;
        node.textContent = geom.label;
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
        node.style.position = 'absolute';
        return node;
      },
      toGeom: (bar) => ({
        kind: bar.kind,
        label: bar.label,
        x: bar.x,
        y: bar.y,
        width: bar.width,
        height: bar.height,
      }),
      patch: (node, geom) => {
        node.dataset['kind'] = geom.kind;
        node.textContent = geom.label;
        node.style.transform = `translate(${geom.x}px, ${geom.y}px)`;
        node.style.width = `${geom.width}px`;
        node.style.height = `${geom.height}px`;
      },
    });
  }

  return {
    mount(el: HTMLElement) {
      host = el;
      host.replaceChildren();
      rowLabelWidth = readRowLabelWidth(el);
      headerLayer = document.createElement('div');
      headerLayer.className = 'fg-header';
      headerLayer.style.position = 'relative';
      headerLayer.style.marginLeft = `${rowLabelWidth}px`;
      rowLayer = document.createElement('div');
      rowLayer.className = 'fg-rows';
      rowLayer.style.position = 'relative';
      rowLayer.style.width = `${rowLabelWidth}px`;
      barLayer = document.createElement('div');
      barLayer.className = 'fg-bars';
      barLayer.style.position = 'relative';
      barLayer.style.left = `${rowLabelWidth}px`;
      host.append(headerLayer, rowLayer, barLayer);
    },
    sync(frame: GeometryFrame) {
      syncHeader(frame.header.ticks);
      syncRows(frame.rows);
      syncBars(frame.bars);
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
      host?.replaceChildren();
      tickNodes.clear();
      tickGeom.clear();
      rowNodes.clear();
      rowGeom.clear();
      barNodes.clear();
      barGeom.clear();
      host = undefined;
      headerLayer = undefined;
      rowLayer = undefined;
      barLayer = undefined;
      rowLabelWidth = 0;
    },
    get rowLabelWidth() {
      return rowLabelWidth;
    },
  };
}
