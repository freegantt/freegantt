// layout/ is headless geometry — no DOM, no drawing calls (plans/01 §4). DOM-free by construction.

import type { RowId, ItemId, EntryId, EntryKind, Entry } from '../model/index.js';
import { itemId, rowId } from '../model/index.js';
import type { TimeScale, ViewPreset } from '../time/index.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';

export interface BarFlags {
  hasConflict?: boolean;
  inCycle?: boolean;
}

export interface LinkFlags {
  inactive?: boolean;
  inCycle?: boolean;
}

export interface FrameRow {
  id: RowId;
  index: number;
  top: number;
  height: number;
  laneCount: number;
  label: string;
}

export interface FrameBar {
  id: ItemId;
  entryId: EntryId;
  rowId: RowId;
  kind: EntryKind;
  /** The entry's name — what a backend renders as the bar's label (#26). */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lane: number;
  flags: BarFlags;
}

/** One segment of an SVG-style path, used by link geometry (§4, #16 settles `FrameLink.id`'s brand). */
export type PathCommand =
  | { cmd: 'M'; x: number; y: number }
  | { cmd: 'L'; x: number; y: number }
  | { cmd: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

export interface FrameLink {
  id: string;
  path: readonly PathCommand[];
  flags: LinkFlags;
}

export interface TodayLine {
  kind: 'todayLine';
  x: number;
}

export interface RangeBand {
  kind: 'rangeBand';
  x: number;
  width: number;
}

export interface RowStripe {
  kind: 'rowStripe';
  rowId: RowId;
}

export type FrameDecoration = TodayLine | RangeBand | RowStripe;

/** One header tick, positioned and labelled — the render seam's only route for header state (#19). */
export interface FrameHeaderTick {
  x: number;
  label: string;
}

export interface FrameHeader {
  ticks: readonly FrameHeaderTick[];
}

export interface GeometryFrame {
  revision: number;
  viewport: { x: number; y: number; width: number; height: number };
  header: FrameHeader;
  /** Only rows in the vertical window; `top` in absolute content coordinates. */
  rows: FrameRow[];
  contentHeight: number;
  /** Full horizontal extent of the bound `TimeScale`'s range, in px — what `ScrollModel` binds as
   * its content width (S1.5 README §3.2). */
  contentWidth: number;
  bars: FrameBar[];
  links: readonly FrameLink[];
  decorations: readonly FrameDecoration[];
}

export interface LayoutInput {
  entries: readonly Entry[];
  scale: TimeScale;
  /** Governs header ticks — the same preset the bound TimeScaleModel resolved (plans/01 §5.1). */
  preset: ViewPreset;
  /** The vertical window rows are culled against; `x`/`width` describe the horizontal viewport a
   * consumer measured (plans/01 §4) — not fabricated, unlike the pre-#20 `{x:0,y:0,width:0}`. */
  viewport: { x: number; y: number; width: number; height: number };
  rowHeight: number;
  revision: number;
  /** Row-top index to read from, and to size the culling window's start against `indexAtY` (#47).
   * Optional so pure/test callers can omit it and get the S0/S1 default (a fresh index built and
   * discarded within this call); a caller doing repeated `computeFrame` passes over the same
   * entries/rowHeight (`GanttShell.render()`) should build one `PrefixSumHeightIndex` once, reuse it
   * across calls, and call `invalidateFrom` itself when entries or rowHeight change — that's what
   * turns "top of row i" back into the O(log n)-across-renders lookup the index exists for, instead
   * of a fresh O(n) build-and-discard every render. */
  heights?: RowHeightIndex;
}

/** S0/S1 scope: flat row-per-entry, one bar per entry, fixed row height (plans/03 S0-S1). */
export function computeFrame(input: LayoutInput): GeometryFrame {
  const { entries, scale, preset, viewport, rowHeight, revision } = input;

  const heights = input.heights ?? new PrefixSumHeightIndex(entries.length, () => rowHeight);

  const rows: FrameRow[] = [];
  const bars: FrameBar[] = [];
  const windowTop = viewport.y;
  const windowBottom = viewport.height > 0 ? viewport.y + viewport.height : Infinity;

  // Bound the scan with indexAtY instead of walking every entry from 0 (#47): start at the row that
  // actually contains windowTop, then stop as soon as a row's top clears windowBottom rather than
  // testing every remaining entry's bounds inline.
  const startIndex = entries.length > 0 ? heights.indexAtY(windowTop) : 0;
  for (let index = startIndex; index < entries.length; index++) {
    const entry = entries[index]!;
    const top = heights.topAt(index);
    if (top >= windowBottom) break;
    if (top + rowHeight <= windowTop) continue;

    const id = rowId(`row:${entry.id}`);
    rows.push({ id, index, top, height: rowHeight, laneCount: 1, label: entry.name });

    const x = scale.xForInstant(entry.start);
    const width = Math.max(0, scale.xForInstant(entry.end) - x);
    bars.push({
      id: itemId(entry.id),
      entryId: entry.id,
      rowId: id,
      kind: entry.kind ?? 'span',
      label: entry.name,
      x,
      y: top,
      width,
      height: rowHeight,
      lane: 0,
      flags: {},
    });
  }

  const format = preset.headers[0]?.format;
  const ticks: FrameHeaderTick[] = scale.ticks(preset).map((tick) => ({
    x: tick.x,
    label: format ? format(tick.instant, scale.timeZone) : '',
  }));

  return {
    revision,
    viewport,
    header: { ticks },
    rows,
    contentHeight: heights.totalHeight,
    contentWidth: Math.max(0, scale.xForInstant(scale.range.end) - scale.xForInstant(scale.range.start)),
    bars,
    links: [],
    decorations: [],
  };
}
