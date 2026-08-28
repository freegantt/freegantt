// layout/ is headless geometry — no DOM, no drawing calls (plans/01 §4). DOM-free by construction.

import type { RowId, ItemId, EntryId, EntryKind, Entry, Rect, TimeUnit } from '../model/index.js';
import { itemId, rowId } from '../model/index.js';
import type { TimeScale, ViewPreset } from '../time/index.js';
import { formatDate, formatEndInclusive } from '../time/index.js';
import { PrefixSumHeightIndex } from './row-height-index.js';
import type { RowHeightIndex } from './row-height-index.js';

/** An entry's horizontal extent in content pixels, at the bound `TimeScale` (S1.9). The one formula
 * both `computeFrame` and `GanttShell.reveal` need — extracted so the two can never drift apart
 * (they briefly did: `reveal` had its own copy missing the zero-duration/inverted-entry clamp). */
export function barSpan(entry: Pick<Entry, 'start' | 'end'>, scale: TimeScale): { x: number; width: number } {
  const x = scale.xForInstant(entry.start);
  const width = Math.max(0, scale.xForInstant(entry.end) - x);
  return { x, width };
}

export interface BarFlags {
  conflict?: boolean;
  cycle?: boolean;
}

export interface LinkFlags {
  inactive?: boolean;
  cycle?: boolean;
}

export interface FrameRow {
  id: RowId;
  index: number;
  top: number;
  height: number;
  laneCount: number;
  /** One library-formatted string per configured grid column, in column order (ADR 0005). Until S4
   * supplies the field registry, this is always one entry: `entry.name`. */
  cells: readonly string[];
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
  /** What a screen reader announces: `${entry.name}, ${formatDate(zone, start)} – ${formatEndInclusive(zone, end)}`.
   * Library-derived text, not consumer render output — same precedent as `label` (plans/01 §4: "no user
   * render output in the frame"). Composed here because it needs the dataset zone and inclusive-end
   * formatting, both `time/`-only (S1.10, D-S1.10-5). */
  a11yLabel: string;
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
  /** To the next boundary at this band's step — what a band cell is drawn with (D-S1.7-4). */
  width: number;
  label: string;
}

/** One row of the header, emitted per `preset.headers` entry, coarsest first (D-S1.7-6). */
export interface FrameHeaderBand {
  unit: TimeUnit;
  increment: number;
  ticks: readonly FrameHeaderTick[];
}

export interface FrameHeader {
  bands: readonly FrameHeaderBand[];
}

/** Live-reconfigurable culling buffer (plans/02 §1.1) — vertical in whole rows (culls through the
 * height index, and must keep doing so when S4 makes row heights vary); horizontal in px (no rows to
 * count). Default `{ verticalRows: 2, horizontalPx: 128 }`. */
export interface Overscan {
  verticalRows?: number;
  horizontalPx?: number;
}

/** One home for the default, imported by `Viewport` rather than restated there. */
export const DEFAULT_OVERSCAN: Required<Overscan> = Object.freeze({ verticalRows: 2, horizontalPx: 128 });

export interface GeometryFrame {
  revision: number;
  /** The culled region, in timeline-content coordinates (conventions §1, D-S1.7-3). Was `viewport`. */
  visible: Rect;
  header: FrameHeader;
  /** Only rows in the vertical window; `top` in absolute content coordinates. */
  rows: FrameRow[];
  /** Total row count across the whole dataset, never the window's — what `aria-setsize` needs so
   * virtualization doesn't announce "row 3" with no "of 30" (S1.10, D-S1.10-5/7). Same "always the
   * full extent" shape as `contentHeight`/`contentWidth` below. */
  rowCount: number;
  /** Always the full extent, never the window's. */
  contentHeight: number;
  /** Full horizontal extent of the bound `TimeScale`'s range, in px — what `ScrollModel` binds as
   * its content width (S1.5 README §3.2). Always the full extent, never the window's. */
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
  /** The culling window, in timeline-content coordinates — not fabricated, unlike the pre-#20
   * `{x:0,y:0,width:0}`. Was `viewport`. */
  visible: Rect;
  /** Default `{ verticalRows: 2, horizontalPx: 128 }`. Live — see `Viewport.overscan`. */
  overscan?: Overscan;
  rowHeight: number;
  revision: number;
}

/** S0/S1 scope: flat row-per-entry, one bar per entry, fixed row height (plans/03 S0-S1).
 *
 * Pure and stateless: `heights` is the row-top index this pass reads from — and sizes the culling
 * window's start against, via `indexAtY` (#47) — never one this call builds up for the next.
 * `FrameLayout` is what keeps one index alive across a Gantt's renders and is the only production
 * caller that passes it; a caller with nothing to remember (every test here, one-shot geometry)
 * omits it and gets an index built and discarded within this call. */
export function computeFrame(
  input: LayoutInput,
  heights: RowHeightIndex = new PrefixSumHeightIndex(input.entries.length, () => input.rowHeight),
): GeometryFrame {
  const { entries, scale, preset, visible, rowHeight, revision } = input;
  const verticalRows = input.overscan?.verticalRows ?? DEFAULT_OVERSCAN.verticalRows;
  const horizontalPx = input.overscan?.horizontalPx ?? DEFAULT_OVERSCAN.horizontalPx;

  const rows: FrameRow[] = [];
  const bars: FrameBar[] = [];
  // A zero height disables vertical culling entirely (conventions §1, D-B) — not just an infinite
  // bottom with the top still taken from `visible.y`, which would silently drop rows above it.
  const cullVertically = visible.height > 0;
  const windowTop = cullVertically ? visible.y : 0;
  const windowBottom = cullVertically ? visible.y + visible.height : Infinity;

  // Horizontal culling: a zero width disables it — everything renders (matches the shipped
  // `viewport.height > 0 ? … : Infinity` rule for the vertical axis; conventions §1, D-B).
  const cullHorizontally = visible.width > 0;
  const hLeft = visible.x - horizontalPx;
  const hRight = visible.x + visible.width + horizontalPx;
  function intersectsHorizontally(x: number, width: number): boolean {
    return !cullHorizontally || (x <= hRight && x + width >= hLeft);
  }

  // Bound the scan with indexAtY instead of walking every entry from 0 (#47): start at the row that
  // actually contains windowTop, expanded by verticalRows in INDEX space (#20's index-space fix) so
  // the buffer stays correct once S4 makes row heights vary. Rows stay vertical-only (D-B): a row
  // whose bar is off-screen horizontally is still emitted — the grid pane needs its label.
  const baseStart = entries.length > 0 ? heights.indexAtY(windowTop) : 0;
  const startIndex = Math.max(0, baseStart - verticalRows);
  // Counts rows already emitted past windowBottom; stops once verticalRows of them have gone by, so
  // verticalRows: 0 reduces to the pre-overscan "stop at the first row past the bottom" rule exactly.
  let overflowCount = 0;
  for (let index = startIndex; index < entries.length; index++) {
    const entry = entries[index]!;
    const top = heights.topAt(index);
    if (top >= windowBottom) {
      if (overflowCount >= verticalRows) break;
      overflowCount++;
    }

    const id = rowId(`row:${entry.id}`);
    rows.push({ id, index, top, height: rowHeight, laneCount: 1, cells: [entry.name] });

    const { x, width } = barSpan(entry, scale);
    if (!intersectsHorizontally(x, width)) continue;
    bars.push({
      id: itemId(entry.id),
      entryId: entry.id,
      rowId: id,
      kind: entry.kind,
      label: entry.name,
      x,
      y: top,
      width,
      height: rowHeight,
      lane: 0,
      flags: {},
      a11yLabel: `${entry.name}, ${formatDate(scale.timeZone, entry.start)} – ${formatEndInclusive(scale.timeZone, entry.end)}`,
    });
  }

  const horizontalSpan = cullHorizontally
    ? { x: hLeft, width: hRight - hLeft }
    : { x: 0, width: scale.contentWidth };

  const bands: FrameHeaderBand[] = preset.headers.map((header) => ({
    unit: header.unit,
    increment: header.increment,
    ticks: scale.ticks({ unit: header.unit, increment: header.increment }, horizontalSpan).map((tick) => ({
      x: tick.x,
      width: tick.width,
      label: header.format(tick.instant, scale.timeZone),
    })),
  }));

  return {
    revision,
    visible,
    header: { bands },
    rows,
    rowCount: entries.length,
    contentHeight: heights.totalHeight,
    contentWidth: scale.contentWidth,
    bars,
    links: [],
    decorations: [],
  };
}
