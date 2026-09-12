// layout/ is headless geometry — no DOM, no drawing calls (plans/01 §4). DOM-free by construction.

import type {
  RowId,
  ItemId,
  EntryId,
  Entry,
  Instant,
  Rect,
  TimeUnit,
  FieldContext,
  SegmentId,
} from '../model/index.js';
import { segmentIndexOfItem } from '../model/index.js';
import type { Tick, TimeScale, ViewPreset } from '../time/index.js';
import { dropRepeatedGranularity, formatDate, formatEndInclusive, resolveDateFormat } from '../time/index.js';
import { resolveDateLines } from './date-line.js';
import type { DateLine, DateLineDecoration } from './date-line.js';
import { FrameMemory, NO_SEGMENT_IDS } from './frame-memory.js';
import type { RowMemory } from './frame-memory.js';
import type { FrameColumn, ResolvedColumn, FieldCompare } from './column.js';
import type { PlannedRow, RowSource } from './rows/row-source.js';
import { DEFAULT_ROW_SOURCE, isPlannedHeaderRow, nestsRows } from './rows/row-source.js';
import { resolveRows } from './rows/resolve-rows.js';
import type { FixedBarBox, Item, VariantItems } from './items/item.js';
import { DEFAULT_LANE_GAP_PX, yForLane } from './lanes/pack-lanes.js';
import type { FrameRow } from './frame-row.js';
export type { FrameRow };
import type { RangeBand, RowStripe } from './decoration.js';
export type { RangeBand, RowStripe } from './decoration.js';
import { DecorationRunner } from './decorations.js';
import type { RegisteredDecorationProvider } from './decorations.js';
export type { RegisteredDecorationProvider } from './decorations.js';

/** Shipped Tick box floor (CONTEXT.md) — `--fg-tick-box-floor` fallback and CSS padding calc. */
export const DEFAULT_TICK_BOX_FLOOR_PX = 9;

/** Shipped bar min width (CONTEXT.md) — `--fg-bar-min-width` fallback, in px. Every bar's painted
 *  span floors here at minimum, even one a caller (or a drag) has driven to zero width: a bar
 *  narrower than this is both invisible and too thin to grab back by its resize handle, which sits
 *  on an 8px hit box straddling each edge (`.fg-bar-handle`, `view/styles.ts`) — 12px leaves the two
 *  handles a 4px gap instead of overlapping. ADR 0013 removed a second, larger floor this once maxed
 *  against for a diamond. ADR 0022's `diamond()` takes its own fixed-box path instead (`Item.box`),
 *  so this floor still has nothing to `max` against. */
export const DEFAULT_MIN_BAR_WIDTH_PX = 12;

/** Shipped bar height (CONTEXT.md) — `--fg-bar-height` fallback, in px. A bar paints shorter than its
 *  own row on purpose (the row also carries the grid pane's label and cells, at their own line
 *  height) and sits centred in the row's vertical middle — `barHeightPx` is its own number, not a
 *  fraction of `rowHeight`, so a denser preset (`{ rowHeight: 30, barHeightPx: 14 }`) can shrink both
 *  independently. */
export const DEFAULT_BAR_HEIGHT_PX = 18;

/** What `barSpan` did to a bar's painted `[x, x + width)` extent (F12) — `'exact'` for the entry's
 *  own span, `'minimum'` for one `barSpan` widened to reach `minBarWidthPx`, `'fixed'` for an Item
 *  that carries its own `box` (ADR 0022). Named once so `barSpan`'s return type and `FrameBar.span`
 *  read one type instead of repeating the union. */
export type BarSpanKind = 'exact' | 'minimum' | 'fixed';

/** An entry's horizontal extent in content pixels, at the bound `TimeScale` (S1.9). The one formula
 * both `computeFrame` and `GanttShell.reveal` need — extracted so the two can never drift apart
 * (they briefly did: `reveal` had its own copy missing the zero-duration/inverted-entry clamp).
 *
 * A zero-length span (`start === end` — ADR 0012) still floors at `minBarWidthPx`, centred on its
 * own instant, the same as any other painted span too narrow to grab — unless a `diamond()` Variant
 * (ADR 0022) claims the row and gives it a fixed box instead.
 *
 * An Item that carries `box` (ADR 0022) skips the span-and-floor path entirely: its width is the
 * box's own `widthPx`, positioned by its own `anchor`. `'center'` reads the box's edges off the
 * same midpoint the floor above centres on, so the two rules never disagree — they answer the same
 * question only when `start === end`. This is not "centred on the Item's start": a fixed-width box
 * on a real span would land in two different places depending on which sentence a reader followed,
 * so both rules read the span's midpoint. */
export function barSpan(
  // `Pick<Item, ...>`, not `Entry` — every caller hands this an `Item` (`produceItemsForRow` never
  // produces one for a non-spanning Entry, ADR 0012), whose `start`/`end` stay required.
  entry: Pick<Item, 'start' | 'end' | 'box'>,
  scale: TimeScale,
  minBarWidthPx: number = DEFAULT_MIN_BAR_WIDTH_PX,
): { x: number; width: number; span: BarSpanKind } {
  const x = scale.xForInstant(entry.start);
  const end = scale.xForInstant(entry.end);
  if (entry.box !== undefined) {
    // A fixed box skips the floor on purpose (ADR 0022 — `diamond()`'s own width is the design, not
    // a value to widen), but a negative or zero width is never a paint, so this still clamps at 0 —
    // the same guard the plain path takes below (`Math.max(0, end - x)`), just without the floor.
    const width = Math.max(0, entry.box.widthPx);
    return { x: fixedBoxX(x, end, entry.box), width, span: 'fixed' };
  }
  const width = Math.max(0, end - x);
  // Centred on the span's own midpoint, so a floored bar keeps the instant it points at. A zero-width
  // span has its start for a midpoint; a 5px bar the floor widens to 12px keeps its own centre
  // instead of sliding left onto its start.
  if (width < minBarWidthPx) {
    return { x: x - (minBarWidthPx - width) / 2, width: minBarWidthPx, span: 'minimum' };
  }
  return { x, width, span: 'exact' };
}

/** Where a fixed-width box's left edge sits, given the pixel positions of the entry's own `start`
 *  and `end` (`x`, `end`). `'center'` reads the same midpoint the floor above centres a minimum-width
 *  bar on, so a diamond on a real span lands where the floor would have put one, not at its start. */
function fixedBoxX(x: number, end: number, box: FixedBarBox): number {
  switch (box.anchor) {
    case 'start':
      return x;
    case 'end':
      return end - box.widthPx;
    case 'center':
      return (x + end) / 2 - box.widthPx / 2;
  }
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
  /** The variant this bar draws as (ADR 0018) — the `data-variant` `render/` stamps. */
  variant: string;
  /** The one Segment this bar **draws** (#212, ADR 0010), carried straight through from the Item
   *  that produced it. Absent for a bar that draws the Entry's whole span (a parent, or a plugin's
   *  own variant) — that bar draws no single Segment. */
  segmentId?: SegmentId;
  /** Every Segment this bar **stands for** (#212, #230, ADR 0010) — the Segments that select it and
   *  paint it. A bar that drew one Segment stands for that Segment alone, so this holds it and
   *  `segmentId` names it. A bar that drew its Entry's whole span stands for every Segment of that
   *  Entry, because any of them selects it, so this holds them all and `segmentId` is absent.
   *
   *  The frame states the fact, and a reader never derives it from an Entry of its own: the set and
   *  the Items it describes come from one cached record of one Entry snapshot, so they cannot fall
   *  out of step. `FrameLayout.segmentIdsForItem` answers the same fact for a lookup by id. */
  segmentIds: readonly SegmentId[];
  /** The entry's name — what a backend renders as the bar's label (#26). */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  lane: number;
  flags: BarFlags;
  /** What `barSpan` did to this bar's painted `[x, x + width)` extent: `'exact'` for the entry's own
   *  span, `'minimum'` for one `barSpan` widened to reach `minBarWidthPx`, `'fixed'` for an Item that
   *  carries its own `box` (ADR 0022). One value, because a bar is never both floored and fixed —
   *  `data-span` is one attribute slot, so the type mirrors the DOM it feeds.
   *
   *  States a fact about the paint, not a judgement on the variant (plans/01 §2.5 bans a variant
   *  check here); a consumer tells a floored or fixed bar apart by pairing this with `variant`.
   *  `render/` stamps it as `data-span="minimum"` or `data-span="fixed"` (`02` §4). */
  span: BarSpanKind;
  /** What a screen reader announces: `${entry.name}, ${formatDate(zone, start)} – ${formatEndInclusive(zone, span)}`.
   * Library-derived text, not consumer render output — same precedent as `label` (plans/01 §4: "no user
   * render output in the frame"). Composed here because it needs the dataset zone and inclusive-end
   * formatting, both `time/`-only (S1.10, D-S1.10-5). */
  a11yLabel: string;
}

/** One straight part of an SVG-style path, used by link geometry (§4). */
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

export type FrameDecoration = DateLineDecoration | RangeBand | RowStripe;

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

/** One vertical line in the timeline pane, at every finest-band tick boundary. `major` marks a line
 *  that opens a coarser band's cell — the Monday that opens a week under `dayAndWeek`, the week that
 *  opens a month under `weekAndMonth` — so the pane's own grid states the same boundaries the header
 *  already draws, with no calendar knowledge of its own. `x` is unclamped, unlike a header tick's:
 *  the line paints wherever its instant falls, even off-screen inside the overscan buffer. */
export interface FrameTickLine {
  x: number;
  major: boolean;
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
  /** One line per finest-band tick boundary, in the culled window (D-S1.7-4's overscan, unchanged).
   *  Empty when the preset carries no headers. */
  tickLines: readonly FrameTickLine[];
  /** Only rows in the vertical window; `top` in absolute content coordinates. */
  rows: FrameRow[];
  /** Total row count across the whole dataset, never the window's — what `aria-setsize` needs so
   * virtualization doesn't announce "row 3" with no "of 30" (S1.10, D-S1.10-5/7). Same "always the
   * full extent" shape as `contentHeight`/`contentWidth` below. */
  rowCount: number;
  /** Whether the row source can put one row under another (`nestsRows`). A backend needs it to pick
   *  the grid's authoring pattern: only a `treegrid` row may carry `aria-level` and `aria-expanded`,
   *  so a flat source must emit neither (S5.11, D-S5-25). A fact about the row set, so it is stated
   *  once here rather than guessed per row from `depth`. */
  tree: boolean;
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
  dateLines?: readonly DateLine[];
  /** Tick box floor in px (CONTEXT.md). Default `DEFAULT_TICK_BOX_FLOOR_PX`. View reads
   *  `--fg-tick-box-floor` and passes it; layout never restates the stylesheet. */
  tickBoxFloorPx?: number;
  /** Minimum painted bar width in px (CONTEXT.md). Default `DEFAULT_MIN_BAR_WIDTH_PX`. Drives every
   *  bar's painted-span floor (`barSpan`). View reads `--fg-bar-min-width` and passes it; layout
   *  never restates the stylesheet. */
  minBarWidthPx?: number;
  /** Painted bar height in px (CONTEXT.md). Default `DEFAULT_BAR_HEIGHT_PX`. A bar centres in its own
   *  row/lane band at this height; `barSpan`'s width floors are unaffected (a horizontal question).
   *  View reads `--fg-bar-height` and passes it; layout never restates the stylesheet. */
  barHeightPx?: number;
  /** Visible Grid columns. Omitted or empty → no cells. The Gantt default `['name']` lives in view/. */
  columns?: readonly ResolvedColumn[];
  /** Which rows to draw. Omitted → `{ source: 'entries', tree: false }` (S1's flat list). */
  rows?: RowSource;
  /** Collapsed `RowId`s. Omitted → none. A stale id matches nothing (D-S4-22). */
  collapsed?: readonly string[];
  /** Per-Gantt variant registry (D-S4-24, ADR 0018). The shell passes one per Gantt (I2). */
  variants: VariantItems;
  /** Every declared Field's stored-value read and compare, bound at this Gantt's locale (D-S4-13). */
  fieldCompares?: readonly FieldCompare[];
  /** Gap between packed lanes in px. Omitted → `DEFAULT_LANE_GAP_PX`. View reads `--fg-lane-gap`. */
  laneGapPx?: number;
  /** Dataset commit generation. FrameMemory keys packed-row invalidation on this (A2). */
  datasetRevision: number;
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
    const painted: FrameColumn = { field: column.field, header: column.header, align: column.align };
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
  const span = `${formatDate(scale.timeZone, item.start, locale)} – ${formatEndInclusive(scale.timeZone, item, locale)}`;
  if (partCount <= 1) return `${item.label}, ${span}`;
  return `${item.label}, part ${segmentIndexOfItem(item.id) + 1} of ${partCount}, ${span}`;
}

function packedItemsForRow(row: PlannedRow, memory: FrameMemory): RowMemory {
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
    registry: input.variants,
    datasetRevision: input.datasetRevision,
  });
  return mem;
}

/** Where every band coarser than the finest one opens a cell, in ascending x. Bands run coarsest
 *  first (D-S1.7-6), so the finest band is the last array and every other one is a coarser band. */
function coarserBandStartsOf(rawBandTicks: readonly (readonly Tick[])[]): readonly number[] {
  const starts = new Set<number>();
  for (const bandTicks of rawBandTicks.slice(0, -1)) {
    for (const tick of bandTicks) starts.add(tick.x);
  }
  return [...starts].sort((a, b) => a - b);
}

/** Call: `markMajorTickLines(finestBandTicks, coarserBandStartXs)`. One line per finest tick. The
 *  line is major when a coarser cell starts inside that tick's own cell `[x, x + width)` — the week
 *  holding the 1st carries the month's line, because a month rarely starts on a Monday. Both arrays
 *  ascend by x and come from the same `TimeScale`, so one walk pairs them and an exact boundary
 *  (a week that does start on the 1st) compares equal. */
function markMajorTickLines(
  finestBandTicks: readonly Tick[],
  coarserBandStartXs: readonly number[],
): FrameTickLine[] {
  let next = 0;
  return finestBandTicks.map((tick) => {
    while (next < coarserBandStartXs.length && coarserBandStartXs[next]! < tick.x) next += 1;
    const start = coarserBandStartXs[next];
    return { x: tick.x, major: start !== undefined && start < tick.x + tick.width };
  });
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
  const minBarWidthPx = input.minBarWidthPx ?? DEFAULT_MIN_BAR_WIDTH_PX;
  const barHeightPx = input.barHeightPx ?? DEFAULT_BAR_HEIGHT_PX;
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
      // A reference copy of the set `RowMemory` already resolved for this row (#230 R5) — no
      // allocation per frame (I5), and the same header rule `entryIds` uses just above.
      segmentIds: isPlannedHeaderRow(planned) ? NO_SEGMENT_IDS : packed.segmentIds,
    });

    for (const item of items) {
      const { x, width, span } = barSpan(item, scale, minBarWidthPx);
      if (!intersectsHorizontally(x, width)) continue;
      const lane = packing.laneByItem.get(item.id) ?? 0;
      const bar: FrameBar = {
        id: item.id,
        entryId: item.entryId,
        rowId: planned.id,
        variant: item.variant,
        label: item.label,
        x,
        // Centred in its own lane band: yForLane answers the band's own top, at rowHeight tall, and
        // half the leftover (rowHeight - barHeightPx) sits above the bar, half below.
        y: yForLane(top, lane, rowHeight, laneGap) + (rowHeight - barHeightPx) / 2,
        width,
        height: barHeightPx,
        lane,
        flags: {},
        span,
        a11yLabel: barA11yLabel(item, parts.get(item.entryId) ?? 1, scale, locale),
        // A reference copy of the set the memory already resolved beside this Item — no allocation
        // per frame (I5), and no second Entry source for a reader to disagree with (#230).
        segmentIds: packed.segmentIdsByItem.get(item.id) ?? NO_SEGMENT_IDS,
      };
      if (item.segmentId !== undefined) bar.segmentId = item.segmentId;
      bars.push(bar);
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

  const headerFormats = dropRepeatedGranularity(preset.headers);
  // Raw ticks per band, coarsest first (D-S1.7-6) — computed once and shared by `bands`' clamped
  // labels below and `tickLines`' unclamped lines: both read the same `scale.ticks` call per band,
  // so a preset's own boundaries never drift between the header and the pane under it.
  const rawBandTicks = preset.headers.map((header) =>
    scale.ticks({ unit: header.unit, increment: header.increment }, horizontalSpan),
  );
  const bands: FrameHeaderBand[] = preset.headers.map((header, i) => {
    const format = resolveDateFormat(headerFormats[i]!, scale.timeZone, locale);
    return {
      unit: header.unit,
      increment: header.increment,
      ticks: rawBandTicks[i]!.map((tick) => {
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

  // One line per finest-band tick — the last raw ticks array, bands run coarsest first (D-S1.7-6).
  // A line is `major` when the coarser band changes over its own cell: the finest cell that a
  // coarser cell starts inside opens that coarser cell's run. Under `dayAndWeek` the coarser (week)
  // start lands exactly on a day tick, so the Monday is major. Under `weekAndMonth` a month almost
  // never starts on a Monday, so the week that *contains* the 1st carries the month's line — an
  // equality test would find nothing there and leave the grid flat (#265). Under `monthAndYear` the
  // coarser band is the year and January always starts a month cell, so a range inside one calendar
  // year has no major line at all: at the coarsest shipped preset that is the honest answer, and
  // `frame.test.ts` pins it.
  const finestBandTicks = rawBandTicks[rawBandTicks.length - 1] ?? [];
  const coarserBandStartXs = coarserBandStartsOf(rawBandTicks);
  // Only lines inside the content. The overscan buffer pulls in ticks on both sides of the visible
  // window, and a line past `contentWidth` draws nothing a reader can scroll to — but it is a
  // painted node in the pane, so the browser widens the pane's own scrollable range to reach it and
  // the pane overscrolls past the content sizer (D-S1.8-1: the timeline's content is `contentWidth`
  // wide, full stop). `e2e/timeline-content-width.spec.ts` is what states that in a real engine.
  const tickLines: FrameTickLine[] = markMajorTickLines(
    finestBandTicks.filter((tick) => tick.x >= 0 && tick.x < scale.contentWidth),
    coarserBandStartXs,
  );

  const dateLineDecorations: FrameDecoration[] = resolveDateLines({
    scale,
    todayLine: input.todayLine ?? true,
    ...(input.dateLines ? { dateLines: input.dateLines } : {}),
  });

  // What one tick column on screen stands for: the finest band's own step, because that is the band
  // `tickLines` draws the pane's grid from and the one a reader counts columns on. A preset with no
  // header bands draws no columns at all, so it states its own `tickUnit` instead — never coarser
  // than a band's (`presets.test.ts`).
  const finestBand = bands[bands.length - 1];
  const decorationRunner = decorations ?? new DecorationRunner();
  const { underBars, overBars } = decorationRunner.run({
    providers: input.decorationProviders ?? [],
    span: {
      start: scale.instantForX(horizontalSpan.x),
      end: scale.instantForX(horizontalSpan.x + horizontalSpan.width),
    },
    rows,
    timeZone: scale.timeZone,
    tickUnit: finestBand?.unit ?? preset.tickUnit,
    tickIncrement: finestBand?.increment ?? preset.tickIncrement,
    xForInstant: (at) => scale.xForInstant(at),
  });

  return {
    revision,
    visible,
    header: { bands },
    tickLines,
    rows,
    rowCount: plan.length,
    tree: nestsRows(input.rows ?? DEFAULT_ROW_SOURCE),
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
