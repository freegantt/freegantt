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

type BarGeom = Pick<FrameBar, 'kind' | 'label' | 'x' | 'y' | 'width' | 'height'>;
type RowGeom = Pick<FrameRow, 'top' | 'height' | 'label'>;

export function createDomBackend(): RenderBackend<HTMLElement> {
  let host: HTMLElement | undefined;
  let headerLayer: HTMLElement | undefined;
  let rowLayer: HTMLElement | undefined;
  let barLayer: HTMLElement | undefined;

  const rowNodes = new Map<RowId, HTMLElement>();
  const rowGeom = new Map<RowId, RowGeom>();
  const barNodes = new Map<ItemId, HTMLElement>();
  const barGeom = new Map<ItemId, BarGeom>();
  const tickNodes: HTMLElement[] = [];
  const tickGeom: FrameHeaderTick[] = [];

  function syncHeader(ticks: GeometryFrame['header']['ticks']): void {
    if (!headerLayer) return;
    ticks.forEach((tick, i) => {
      let node = tickNodes[i];
      if (!node) {
        node = document.createElement('div');
        node.className = 'fg-tick';
        node.style.position = 'absolute';
        headerLayer!.append(node);
        tickNodes[i] = node;
      }
      const prev = tickGeom[i];
      if (!prev || prev.x !== tick.x || prev.label !== tick.label) {
        node.style.transform = `translateX(${tick.x}px)`;
        node.textContent = tick.label;
        tickGeom[i] = tick;
      }
    });
    while (tickNodes.length > ticks.length) {
      tickNodes.pop()?.remove();
      tickGeom.pop();
    }
  }

  function syncRows(rows: readonly FrameRow[]): void {
    if (!rowLayer) return;
    const seen = new Set<RowId>();
    for (const row of rows) {
      seen.add(row.id);
      let node = rowNodes.get(row.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'fg-row';
        node.style.position = 'absolute';
        rowNodes.set(row.id, node);
        rowLayer.append(node);
      }
      const prev = rowGeom.get(row.id);
      if (!prev || prev.top !== row.top || prev.height !== row.height || prev.label !== row.label) {
        node.style.transform = `translateY(${row.top}px)`;
        node.style.height = `${row.height}px`;
        node.textContent = row.label;
        rowGeom.set(row.id, { top: row.top, height: row.height, label: row.label });
      }
    }
    for (const [id, node] of rowNodes) {
      if (!seen.has(id)) {
        node.remove();
        rowNodes.delete(id);
        rowGeom.delete(id);
      }
    }
  }

  function syncBars(bars: readonly FrameBar[]): void {
    if (!barLayer) return;
    const seen = new Set<ItemId>();
    for (const bar of bars) {
      seen.add(bar.id);
      let node = barNodes.get(bar.id);
      if (!node) {
        node = document.createElement('div');
        node.className = 'fg-bar';
        node.dataset['itemId'] = bar.id;
        node.style.position = 'absolute';
        barNodes.set(bar.id, node);
        barLayer.append(node);
      }
      const prev = barGeom.get(bar.id);
      if (
        !prev ||
        prev.kind !== bar.kind ||
        prev.label !== bar.label ||
        prev.x !== bar.x ||
        prev.y !== bar.y ||
        prev.width !== bar.width ||
        prev.height !== bar.height
      ) {
        node.dataset['kind'] = bar.kind;
        node.textContent = bar.label;
        node.style.transform = `translate(${bar.x}px, ${bar.y}px)`;
        node.style.width = `${bar.width}px`;
        node.style.height = `${bar.height}px`;
        barGeom.set(bar.id, {
          kind: bar.kind,
          label: bar.label,
          x: bar.x,
          y: bar.y,
          width: bar.width,
          height: bar.height,
        });
      }
    }
    for (const [id, node] of barNodes) {
      if (!seen.has(id)) {
        node.remove();
        barNodes.delete(id);
        barGeom.delete(id);
      }
    }
  }

  return {
    mount(el: HTMLElement) {
      host = el;
      host.replaceChildren();
      headerLayer = document.createElement('div');
      headerLayer.className = 'fg-header';
      headerLayer.style.position = 'relative';
      rowLayer = document.createElement('div');
      rowLayer.className = 'fg-rows';
      rowLayer.style.position = 'relative';
      barLayer = document.createElement('div');
      barLayer.className = 'fg-bars';
      barLayer.style.position = 'relative';
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
      rowNodes.clear();
      rowGeom.clear();
      barNodes.clear();
      barGeom.clear();
      tickNodes.length = 0;
      tickGeom.length = 0;
      host = undefined;
      headerLayer = undefined;
      rowLayer = undefined;
      barLayer = undefined;
    },
  };
}
