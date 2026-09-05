// layout/ is headless geometry — no DOM, no drawing calls (plans/01 §4). DOM-free by construction.

import type {
  RowId,
  ItemId,
  EntryId,
  EntryKind,
  Entry,
  Instant,
  Rect,
  TimeUnit,
  FieldContext,
} from '../model/index.js';
import { segmentIndexOfItem } from '../model/index.js';
import type { TimeScale, ViewPreset } from '../time/index.js';
import { dedupeHeaderFormats, formatDate, formatEndInclusive, resolveDateFormat } from '../time/index.js';
import { resolveDateLines } from './date-line.js';
import type { DateLine, DateLineSpec } from './date-line.js';
import { FrameMemory } from './frame-memory.js';
import type { FrameColumn, ResolvedColumn, FieldCompare } from './column.js';
import type { PlannedRow, RowSource } from './rows/row-source.js';
import { isPlannedHeaderRow } from './rows/row-source.js';
import { resolveRows } from './rows/resolve-rows.js';
import type { Item } from './items/produce-items.js';
import type { ItemProducerRegistry } from './items/produce-items.js';
import { DEFAULT_LANE_GAP_PX, yForLane } from './lanes/pack-lanes.js';
import type { PackedRow } from './lanes/pack-lanes.js';
import type { FrameRow } from './frame-row.js';
export type { FrameRow };
import type { RangeBand, RowStripe } from './decoration.js';
export type { RangeBand, RowStripe } from './decoration.js';
import { DecorationRunner } from './decorations.js';
import type { RegisteredDecorationProvider } from './decorations.js';
export type { RegisteredDecorationProvider } from './decorations.js';

/** Shipped Tick box floor (CONTEXT.md) — `--fg-tick-box-floor` fallback and CSS padding calc. */
export const DEFAULT_TICK_BOX_FLOOR_PX = 9;

/** Shipped diamond size (CONTEXT.md) — `--fg-diamond-size` fallback: the unrotated square's side, in
 *  px. `barSpan`'s milestone floor is this rotated 45° (`diamondSizePx * √2`), so the painted diamond
 *  and its outline always fit inside the bar box (bug hunt: a 0-width milestone bar left the diamond
 *  and its selection outline hanging off the left edge). */
export const DEFAULT_DIAMOND_SIZE_PX = 10;

/** An entry's horizontal extent in content pixels, at the bound `TimeScale` (S1.9). The one formula
 * both `computeFrame` and `GanttShell.reveal` need — extracted so the two can never drift apart
 * (they briefly did: `reveal` had its own copy missing the zero-duration/inverted-entry clamp).
 *
 * A milestone Item/Entry is authored zero-width (`start === end`) — that stays true; nothing here
 * invents a duration. Painting a zero-width box still leaves the diamond glyph and its selection
 * outline with nowhere to sit, so a milestone's *painted* span is floored to the diamond's
 * axis-aligned bounding box (`diamondSizePx * √2`) and centred on the instant. Every other kind keeps
 * its true `[x, x + width)` span. */
/** Kind → painted-span floor, as a multiplier of `diamondSizePx` (a min-width lookup, not
 *  `if (kind === 'milestone')` — plans/01 §2.5). Only `milestone` floors its span today; every other
 *  kind falls through to its true `[x, x + width)` extent. */
const KIND_SPAN_FLOOR_MULTIPLIER: Readonly<Partial<Record<EntryKind, number>>> = Object.freeze({
  milestone: Math.SQRT2,
});

export function barSpan(
  entry: Pick<Entry, 'start' | 'end' | 'kind'>,
  scale: TimeScale,
  diamondSizePx: number = DEFAULT_DIAMOND_SIZE_PX,
): { x: number; width: number } {
  const x = scale.xForInstant(entry.start);
  const width = Math.max(0, scale.xForInstant(entry.end) - x);
  const floorMultiplier = KIND_SPAN_FLOOR_MULTIPLIER[entry.kind];
  if (floorMultiplier !== undefined) {
    const floor = diamondSizePx * floorMultiplier;
    if (width < floor) return { x: x - floor / 2, width: floor };
  }
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

/** One segment of an SVG-style path, used by link geometry (§4). */
export type PathCommand =
  | { cmd: 'M'; x: number; y: number }
  | { cmd: 'L'; x: number; y: number }
  | { cmd: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number };

export interface FrameLink {
  /** Plain `string`, never a brand (#136, supersedes #16): `Dependency`/`DependencyId` belong to the
   *  `entryDependencies()` plugin, and `layout/` may import `time/` and `model/` only — a branded id
   *  here would make the frame's own type depend on a plugin. The emitter that fills `links` names
   *  the id; `layout/` only aggregates. */
  id: string;
  path: readonly PathCommand[];
  flags: LinkFlags;
}

export type FrameDecoration = DateLine | RangeBand | RowStripe;

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
  /** Registered decoration providers' output, painted below the bar layer (D-S5-15). */
  underBars: readonly (RangeBand | RowStripe)[];
  /** Registered decoration providers' output, painted above the bar layer (D-S5-15). */
  overBars: readonly (RangeBand | RowStripe)[];
  /** Paint description for Grid columns, in display order. Matches `rows[].cells` 1:1 (D-S4-13). */
  columns: readonly FrameColumn[];
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
  /** Feeds every header band's `resolveDateFormat` call and `a11yLabel` (S1.12, D-S1.12-12).
   * `undefined` = the runtime default. */
  locale?: Intl.LocalesArgument;
  /** `true`/`undefined` reads `now()`; `false` omits the today wrapper; an `Instant` pins it with
   *  no clock read (S1.12/S1.13, D-S1.12-14, D-S1.13-3). Default `true`. */
  todayLine?: boolean | Instant;
  /** Authored Date lines, resolved on the same path as the today wrapper (S1.13). */
  dateLines?: readonly DateLineSpec[];
  /** Tick box floor in px (CONTEXT.md). Default `DEFAULT_TICK_BOX_FLOOR_PX`. View reads
   *  `--fg-tick-box-floor` and passes it; layout never restates the stylesheet. */
  tickBoxFloorPx?: number;
  /** Diamond size in px (CONTEXT.md) — the unrotated square's side. Default `DEFAULT_DIAMOND_SIZE_PX`.
   *  Drives a milestone bar's painted-span floor (`barSpan`). View reads `--fg-diamond-size` and
   *  passes it; layout never restates the stylesheet. */
  diamondSizePx?: number;
  /** Visible Grid columns. Omitted or empty → no cells. The Gantt default `['name']` lives in view/. */
  columns?: readonly ResolvedColumn[];
  /** Which rows to draw. Omitted → `{ source: 'entries', tree: false }` (S1's flat list). */
  rows?: RowSource;
  /** Collapsed `RowId`s. Omitted → none. A stale id matches nothing (D-S4-22). */
  collapsed?: readonly string[];
  /** Per-Gantt Item producer registry (D-S4-24). The shell passes one per Gantt (I2). */
  itemProducerRegistry: ItemProducerRegistry;
  /** Every declared Field's stored-value read and compare, bound at this Gantt's locale (D-S4-13). */
  fieldCompares?: readonly FieldCompare[];
  /** Gap between packed lanes in px. Omitted → `DEFAULT_LANE_GAP_PX`. View reads `--fg-lane-gap`. */
  laneGapPx?: number;
  /** Dataset commit generation. FrameMemory keys packed-row invalidation on this (A2). */
  datasetRevision?: number;
  /** Bound Field reader for row-source `filter` / `groupBy` / `sort.compare` (A5). */
  fieldContext?: FieldContext;
  /** Registered decoration providers (S5.6, D-S5-15), `ctx.view.registerDecoration`'s own record.
   *  Omitted or empty → both `underBars`/`overBars` are `[]`. */
  decorationProviders?: readonly RegisteredDecorationProvider[];
}

function cellsForRow(
  row: PlannedRow,
  columns: readonly ResolvedColumn[] | undefined,
  entryById: ReadonlyMap<EntryId, Entry>,
): readonly string[] {
  if (columns === undefined) return [];
  if (isPlannedHeaderRow(row)) {
    return columns.map((_, i) => (i === 0 ? (row.headerLabel ?? '') : ''));
  }
  const entry = entryById.get(row.entryIds[0]!);
  if (entry === undefined) return columns.map(() => '');
  return columns.map((column) => column.format(entry));
}

function columnsForFrame(columns: readonly ResolvedColumn[] | undefined): readonly FrameColumn[] {
  if (columns === undefined) return [];
  return columns.map((column) => {
    const painted: FrameColumn = { key: column.key, header: column.header, align: column.align };
    if (column.width !== undefined) painted.width = column.width;
    if (column.flex !== undefined) painted.flex = column.flex;
    if (column.resizable !== undefined) painted.resizable = column.resizable;
    if (column.movable !== undefined) painted.movable = column.movable;
    return painted;
  });
}

function segmentCountByEntry(items: readonly Item[]): ReadonlyMap<EntryId, number> {
  const counts = new Map<EntryId, number>();
  for (const item of items) counts.set(item.entryId, (counts.get(item.entryId) ?? 0) + 1);
  return counts;
}

function barA11yLabel(
  item: Item,
  partCount: number,
  scale: TimeScale,
  locale: Intl.LocalesArgument | undefined,
): string {
  const span = `${formatDate(scale.timeZone, item.start, locale)} – ${formatEndInclusive(scale.timeZone, item.end, locale)}`;
  if (partCount <= 1) return `${item.label}, ${span}`;
  return `${item.label}, part ${segmentIndexOfItem(item.id) + 1} of ${partCount}, ${span}`;
}

function packedItemsForRow(row: PlannedRow, memory: FrameMemory): PackedRow {
  return memory.packedRow(row.id);
}

/** Call: `resolveLayoutRows(input)`. One row plan from a `LayoutInput`. */
export function resolveLayoutRows(input: LayoutInput): readonly PlannedRow[] {
  return resolveRows({
    entries: input.entries,
    ...(input.rows !== undefined ? { rows: input.rows } : {}),
    ...(input.collapsed !== undefined ? { collapsed: input.collapsed } : {}),
    ...(input.fieldCompares !== undefined ? { fieldCompares: input.fieldCompares } : {}),
    ...(input.fieldContext !== undefined ? { fieldContext: input.fieldContext } : {}),
  });
}

function memoryFor(input: LayoutInput, plan: readonly PlannedRow[], memory?: FrameMemory): FrameMemory {
  const mem = memory ?? new FrameMemory();
  mem.sync({
    plan,
    rowHeight: input.rowHeight,
    laneGap: input.laneGapPx ?? DEFAULT_LANE_GAP_PX,
    entries: input.entries,
    registry: input.itemProducerRegistry,
    ...(input.datasetRevision !== undefined ? { datasetRevision: input.datasetRevision } : {}),
  });
  return mem;
}

/** Composition over resolve → produce → pack → place (D-S4-19). Culling still windows after resolve
 * (D-S4-20). Pure: `memory` is what this pass remembers — `FrameLayout` keeps one alive across
 * renders; a one-shot caller omits it and gets memory built and discarded here. `decorations` is the
 * matching per-Gantt memory for registered decoration providers (D-S5-15) — same one-shot-default rule. */
export function computeFrame(
  input: LayoutInput,
  memory?: FrameMemory,
  decorations?: DecorationRunner,
): GeometryFrame {
  const plan = resolveLayoutRows(input);
  return placeFrame(input, plan, memoryFor(input, plan, memory), decorations);
}

/** Call: `placeFrame(input, plan, memory, decorations)`. Geometry only — the caller already
 *  resolved rows. */
export function placeFrame(
  input: LayoutInput,
  plan: readonly PlannedRow[],
  memory?: FrameMemory,
  decorations?: DecorationRunner,
): GeometryFrame {
  const { scale, preset, visible, rowHeight, revision, locale } = input;
  const entryById = new Map(input.entries.map((entry) => [entry.id, entry]));
  const laneGap = input.laneGapPx ?? DEFAULT_LANE_GAP_PX;
  const mem = memory ?? memoryFor(input, plan);
  const index = mem.heights;
  const tickBoxFloorPx = input.tickBoxFloorPx ?? DEFAULT_TICK_BOX_FLOOR_PX;
  const diamondSizePx = input.diamondSizePx ?? DEFAULT_DIAMOND_SIZE_PX;
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

  // Bound the scan with indexAtY instead of walking every row from 0 (#47): start at the row that
  // actually contains windowTop, expanded by verticalRows in INDEX space (#20's index-space fix) so
  // the buffer stays correct once pack mode makes row heights vary. Rows stay vertical-only (D-B): a
  // row whose bar is off-screen horizontally is still emitted — the grid pane needs its label.
  const baseStart = plan.length > 0 ? index.indexAtY(windowTop) : 0;
  const startIndex = Math.max(0, baseStart - verticalRows);
  // Counts rows already emitted past windowBottom; stops once verticalRows of them have gone by, so
  // verticalRows: 0 reduces to the pre-overscan "stop at the first row past the bottom" rule exactly.
  let overflowCount = 0;
  for (let rowIndex = startIndex; rowIndex < plan.length; rowIndex++) {
    const planned = plan[rowIndex]!;
    const top = index.topAt(rowIndex);
    if (top >= windowBottom) {
      if (overflowCount >= verticalRows) break;
      overflowCount++;
    }

    const packed = packedItemsForRow(planned, mem);
    const items = packed.items;
    const packing = packed.packing;
    const height = index.heightAt(rowIndex);
    const parts = segmentCountByEntry(items);
    rows.push({
      id: planned.id,
      kind: planned.kind,
      index: planned.index,
      top,
      height,
      laneCount: packing.laneCount,
      depth: planned.depth,
      expandable: planned.expandable,
      expanded: planned.expanded,
      ...(planned.matched !== undefined ? { matched: planned.matched } : {}),
      cells: cellsForRow(planned, input.columns, entryById),
      // A header row stands for no Entry (D-S4-23), so it owns none and never becomes selectable.
      entryIds: isPlannedHeaderRow(planned) ? [] : planned.entryIds,
    });

    for (const item of items) {
      const { x, width } = barSpan(item, scale, diamondSizePx);
      if (!intersectsHorizontally(x, width)) continue;
      const lane = packing.laneByItem.get(item.id) ?? 0;
      bars.push({
        id: item.id,
        entryId: item.entryId,
        rowId: planned.id,
        kind: item.kind,
        label: item.label,
        x,
        y: yForLane(top, lane, rowHeight, laneGap),
        width,
        height: rowHeight,
        lane,
        flags: {},
        a11yLabel: barA11yLabel(item, parts.get(item.entryId) ?? 1, scale, locale),
      });
    }
  }

  const horizontalSpan = cullHorizontally
    ? { x: hLeft, width: hRight - hLeft }
    : { x: 0, width: scale.contentWidth };

  // A coarse band's boundary (a year, say) is often well behind the visible pane — the calendar
  // year started before this dataset's own first entry, or the caller has scrolled past it — so
  // its true cell left edge sits off-screen. Left un-clamped, the label paints at that off-screen
  // x and never becomes visible even though most of the cell is on screen (header readability
  // follow-up: "year never renders at the top level" turned out to be exactly this). Clamping the
  // *label's* x to the visible pane's own left edge keeps it stuck to the front of its cell while
  // any part of that cell is in view — the cell's true `x`/`width` (and its `instant`) still drive
  // ticking and formatting; only where the label paints moves.
  const labelLeftClamp = cullHorizontally ? Math.max(visible.x, 0) : 0;

  // A Tick's CSS border-box cannot shrink below the Tick box floor (`tickBoxFloorPx`, Token
  // `--fg-tick-box-floor`). A straddling tick clamped to a thinner remainder would ask for e.g.
  // `width: 0.5px` and still paint at that floor — eating into the next cell. Below the floor the
  // sticky behaviour buys nothing, so the tick keeps its true (off-screen) x.

  const headerFormats = dedupeHeaderFormats(preset.headers);
  const bands: FrameHeaderBand[] = preset.headers.map((header, i) => {
    const format = resolveDateFormat(headerFormats[i]!, scale.timeZone, locale);
    return {
      unit: header.unit,
      increment: header.increment,
      ticks: scale.ticks({ unit: header.unit, increment: header.increment }, horizontalSpan).map((tick) => {
        // Only the one tick whose cell actually straddles the clamp line is "stuck" — a tick
        // that ends before it (fully behind the visible edge, kept around only by the overscan
        // buffer) must keep its own true x, or every such tick collapses onto the same clamped
        // column and their labels stack on top of each other (header readability follow-up).
        const remainder = tick.x + tick.width - labelLeftClamp;
        const straddlesClamp = tick.x < labelLeftClamp && remainder >= tickBoxFloorPx;
        const x = straddlesClamp ? labelLeftClamp : tick.x;
        return { x, width: Math.max(0, tick.width - (x - tick.x)), label: format(tick.instant) };
      }),
    };
  });

  const dateLineDecorations: FrameDecoration[] = resolveDateLines({
    scale,
    todayLine: input.todayLine ?? true,
    ...(input.dateLines ? { dateLines: input.dateLines } : {}),
  });

  const decorationRunner = decorations ?? new DecorationRunner();
  const { underBars, overBars } = decorationRunner.run({
    providers: input.decorationProviders ?? [],
    span: {
      start: scale.instantForX(horizontalSpan.x),
      end: scale.instantForX(horizontalSpan.x + horizontalSpan.width),
    },
    rows,
    timeZone: scale.timeZone,
    xForInstant: (at) => scale.xForInstant(at),
  });

  return {
    revision,
    visible,
    header: { bands },
    rows,
    rowCount: plan.length,
    contentHeight: index.totalHeight,
    contentWidth: scale.contentWidth,
    bars,
    links: [],
    decorations: dateLineDecorations,
    underBars,
    overBars,
    columns: columnsForFrame(input.columns),
  };
}
