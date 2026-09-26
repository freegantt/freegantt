// render/dom — decoration paint. Pixel geometry for a rangeBand and row lookup for a
// rowStripe both already happened in layout/ and render/dom/index.ts's own row layer respectively —
// this file only turns `RangeBand`/`RowStripe` into DOM nodes, keyed by array position (no `id`,
// same precedent as Header bands and Date lines).

import type { FrameRow, RangeBand, RowStripe } from '../../layout/index.js';
import { KeyedLayer } from './sync-keyed.js';

type DecorationGeom =
  | { paint: 'band'; x: number; width: number; height: number; className: string }
  | { paint: 'stripe'; top: number; height: number; className: string };

export interface DecorationsAttachment {
  /** Call once per frame with both layers' resolved output, the current row set (a rowStripe's own
   *  top/height lookup) and the pane's own vertical extent (a rangeBand's height, same rule Date
   *  lines use). */
  sync(
    underBars: readonly (RangeBand | RowStripe)[],
    overBars: readonly (RangeBand | RowStripe)[],
    rows: readonly FrameRow[],
    contentHeight: number,
    paneHeight: number,
  ): void;
  destroy(): void;
}

function classListFor(className: string, base: string): string {
  return className ? `${base} ${className}` : base;
}

function createHiddenDiv(): HTMLElement {
  const node = document.createElement('div');
  node.setAttribute('aria-hidden', 'true');
  return node;
}

function toGeom(
  item: RangeBand | RowStripe,
  rowById: ReadonlyMap<string, FrameRow>,
  height: number,
): DecorationGeom {
  if (item.kind === 'rowStripe') {
    const row = rowById.get(item.rowId);
    return { paint: 'stripe', top: row?.top ?? 0, height: row?.height ?? 0, className: item.class ?? '' };
  }
  return { paint: 'band', x: item.x, width: item.width, height, className: item.class ?? '' };
}

function patch(node: HTMLElement, geom: DecorationGeom): void {
  if (geom.paint === 'stripe') {
    node.className = classListFor(geom.className, 'fg-row-stripe');
    node.style.transform = `translateY(${geom.top}px)`;
    node.style.height = `${geom.height}px`;
    return;
  }
  node.className = classListFor(geom.className, 'fg-range-band');
  node.style.transform = `translateX(${geom.x}px)`;
  node.style.width = `${geom.width}px`;
  node.style.height = `${geom.height}px`;
}

function syncOneLayer(
  layer: HTMLElement,
  keyed: KeyedLayer<RangeBand | RowStripe, number, DecorationGeom>,
  items: readonly (RangeBand | RowStripe)[],
  rowById: ReadonlyMap<string, FrameRow>,
  height: number,
): void {
  keyed.sync(layer, items, {
    key: (_item, i) => i,
    create: createHiddenDiv,
    toGeom: (item) => toGeom(item, rowById, height),
    patch,
  });
}

/** Mounts one layer below `barLayer` (`underBars`) and one above it (`overBars`) — DOM order alone
 *  gives the paint order here, unlike `.fg-overlay`, which owns an explicit stacking position above
 *  both panes (styles.ts, #437) precisely because DOM order alone cannot reach it. Neither
 *  wrapper carries `aria-hidden` itself (only the decoration nodes inside do, via `createHiddenDiv`)
 *  — a plain container, like `.fg-bars` beside it, needs none; `e2e/harness.spec.ts`'s own D1 test
 *  finds the content sizer by "the first `aria-hidden` child of the timeline pane", which an
 *  aria-hidden wrapper mounted ahead of it would otherwise shadow. */
export function attachDecorations(timelineHost: HTMLElement, barLayer: HTMLElement): DecorationsAttachment {
  const underLayer = document.createElement('div');
  underLayer.className = 'fg-decorations-under';
  timelineHost.insertBefore(underLayer, barLayer);

  const overLayer = document.createElement('div');
  overLayer.className = 'fg-decorations-over';
  timelineHost.insertBefore(overLayer, barLayer.nextSibling);

  const under = new KeyedLayer<RangeBand | RowStripe, number, DecorationGeom>();
  const over = new KeyedLayer<RangeBand | RowStripe, number, DecorationGeom>();

  return {
    sync(underBars, overBars, rows, contentHeight, paneHeight) {
      const height = Math.max(contentHeight, paneHeight);
      const rowById = new Map(rows.map((row) => [row.id, row]));
      syncOneLayer(underLayer, under, underBars, rowById, height);
      syncOneLayer(overLayer, over, overBars, rowById, height);
    },
    destroy() {
      underLayer.remove();
      overLayer.remove();
      under.clear();
      over.clear();
    },
  };
}
