// layout/ is headless geometry — no DOM, no drawing calls (plans/01 §4). DOM-free by construction.

import type { RowId, BarId, EntryId, Entry, Instant, Rect, TimeUnit, FieldContext } from '../model/index.js';
import { partIndexOfBar } from '../model/index.js';
import type { Tick, TimeScale, ViewPreset } from '../time/index.js';
import { dropRepeatedGranularity, formatStartAndEnd, resolveDateFormat } from '../time/index.js';
import { resolveDateLines } from './date-line.js';
import type { DateLine, DateLineDecoration } from './date-line.js';
import { FrameMemory } from './frame-memory.js';
import type { FrameColumn, ResolvedColumn, FieldCompare } from './column.js';
import type { PlannedRow, RowSource } from './rows/row-source.js';
import { DEFAULT_ROW_SOURCE, isPlannedHeaderRow, nestsRows } from './rows/row-source.js';
import { resolveRows } from './rows/resolve-rows.js';
import type { EntryRulePorts } from './entry-rule.js';
import type { BarAnchor, Bar, VariantBars } from './bars/bar.js';
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
 *  against for a diamond. ADR 0022's `diamond()` takes its own fixed-box path instead (`Bar.box`),
 *  so this floor still has nothing to `max` against. */
export const DEFAULT_MIN_BAR_WIDTH_PX = 12;

/** Shipped bar height (CONTEXT.md) — `--fg-bar-height` fallback, in px. A bar paints shorter than its
 *  own row on purpose (the row also carries the grid pane's label and cells, at their own line
 *  height) and sits centred in the row's vertical middle — `barHeightPx` is its own number, not a
 *  fraction of `rowHeight`, so a denser preset (`{ rowHeight: 30, barHeightPx: 14 }`) can shrink both
 *  independently. */
export const DEFAULT_BAR_HEIGHT_PX = 18;

/** What `barSpan` did to a bar's painted `[x, x + width)` extent — `'exact'` for the entry's
 *  own span, painted whole; `'clipped'` for that same span cut at a content edge, so `x`/`width`
 *  are not the entry's own start/end (#436 branch review — a plugin that wants the entry's real
 *  dates reads the entry, not this geometry); `'minimum'` for one `barSpan` widened to reach
 *  `minBarWidthPx`, and possibly shifted or width-capped to stay inside the content; `'fixed'` for
 *  a Bar that carries its own `box` (ADR 0022), also possibly shifted or width-capped. Named once
 *  so `barSpan`'s return type and `FrameBar.span` read one type instead of repeating the union. */
export type BarSpanKind = 'exact' | 'clipped' | 'minimum' | 'fixed';

/** A Bar's horizontal extent in content pixels, at the bound `TimeScale` (S1.9). The one formula
 * both `computeFrame` and `GanttShell.reveal` need — extracted so the two can never drift apart.
 * Both callers hand it a real `Bar`, `box` included (#295): a boxed Bar — `diamond()`'s glyph is
 * the shipped case — has no span-and-floor width at all, so a caller that built its own literal
 * with `box` left off would silently paint that Bar's real width and reveal a different one.
 *
 * A zero-length span (`start === end` — ADR 0012) still floors at `minBarWidthPx`, centred on its
 * own instant, the same as any other painted span too narrow to grab — unless a `diamond()` Variant
 * (ADR 0022) matches the row and gives it a fixed box instead.
 *
 * A Bar that carries `box` (ADR 0022) skips the span-and-floor path entirely: its width is the
 * box's own `widthPx`, positioned by its own `anchor`. `'center'` reads the box's edges off the
 * same midpoint the floor above centres on, so the two rules never disagree — they answer the same
 * question only when `start === end`. This is not "centred on the Bar's start": a fixed-width box
 * on a real span would land in two different places depending on which sentence a reader followed,
 * so both rules read the span's midpoint.
 *
 * The content bound holds for a widened box the same as for the tick lines that already obey it: a box this
 * function widens or fixes never paints past `[0, scale.contentWidth]`. A bar whose own instant sits
 * at or past the content's edge is shifted inward instead of left centred past it — an entry at the
 * range end must still read as "at the end", not slide back to make room, so the shift only ever
 * closes the gap the centred box would have opened past the edge.
 *
 * A real duration span answers the content bound a different way, and must: it carries the entry's own real
 * `start`/`end`, not a floor this function invented, so shifting it would misstate where the entry
 * actually falls. A Dataset wider than its own `range` (the normal shape for a caller prefetching so
 * pan/zoom never re-fetches) can hand `placeFrame` an entry that starts, ends, or both, outside
 * `[0, contentWidth)` — the overscan buffer (`DEFAULT_OVERSCAN.horizontalPx`) pulls it into the
 * culled window without ever checking that bound, and an unclamped box painted there widens
 * the pane's own native `scrollWidth` past the content sizer, the same harm a header band's cell
 * already guards against with its own intersection clip (`bands` below). `barSpan` trims a real
 * duration box to its intersection with `[0, contentWidth)` for the same reason a band cell is
 * trimmed and not shifted: a real duration bar straddling the edge has a truthful in-range portion
 * to show, and trimming shows exactly that without lying about the part outside. A box with no
 * intersection at all — a `bar.start` past `contentWidth`, or a `bar.end` before `0` — trims to
 * `width: 0`; `placeFrame` drops it rather than paint an entry the caller's own `range` excludes.
 * A trim that actually moved `x` or `width` is reported as `'clipped'`, not `'exact'` — `'exact'`
 * promises the entry's own untouched start/end (#436 branch review). */
export function barSpan(
  // The whole `Bar`, not a `Pick` (#295) — a literal missing `box` would typecheck against a
  // `Pick` and silently drop a fixed box's width, which is exactly the bug this signature closes.
  bar: Bar,
  scale: TimeScale,
  minBarWidthPx: number = DEFAULT_MIN_BAR_WIDTH_PX,
): { x: number; width: number; span: BarSpanKind } {
  const x = scale.xForInstant(bar.start);
  const end = scale.xForInstant(bar.end);
  const rawWidth = Math.max(0, end - x);

  // Membership first, decided on the entry's own true extent — before any floor, fixed width, or
  // shift touches it. A widened or fixed box's *shift* (`clampBoxToContent` below) pulls its left
  // edge back onto the content unconditionally; run it on a box whose entry never belonged on
  // screen at all and it silently paints that record at a visible edge instead of leaving it off —
  // a misplaced date is worse than #436's overflow, because an overflow is at least visible. A
  // zero-length entry is a point, kept through its own closing instant (ADR 0012's "at the range
  // end" is `x === contentWidth`, still in). A real span is the usual half-open interval test; an
  // entry whose interval has no overlap with `[0, contentWidth)` at all never reaches the floor
  // below (`'minimum'`'s own membership question — the floor is `barSpan`'s invention, so the
  // entry's own extent decides it).
  const inContent = rawWidth === 0 ? x >= 0 && x <= scale.contentWidth : x < scale.contentWidth && end > 0;

  if (bar.box !== undefined) {
    // A fixed box skips the floor on purpose (ADR 0022 — `diamond()`'s own width is the design, not
    // a value to widen). Clamped once, here, so the returned `width` and `fixedBoxX`'s position both
    // read the same finite, non-negative value — a negative (#296) or non-finite (#297) `widthPx`
    // never reaches either. Also capped at `contentWidth` itself (#436 branch review): an
    // uncapped width still pins `x` to `0` and paints past the edge once the box is wider than the
    // content, the exact defect this whole function exists to close.
    const width = Math.min(clampBoxWidth(bar.box.widthPx), scale.contentWidth);
    const boxX = fixedBoxX(x, end, bar.box.anchor, width);
    // Membership needs both questions answered, ANDed (#436 branch review — an anchor-instant
    // test alone disagrees with the floored-bar path for the same entry, and a box-extent test
    // alone would keep a zero-length entry parked past `contentWidth`, the case #436 is about):
    // `inContent` asks the truthful question about the *record* (its own span, the same test every
    // other branch below reads); `boxOverlapsContent` asks whether the box `anchor` places actually
    // has any body inside `[0, contentWidth)` at all — a box anchored past the far edge (`'end'` on
    // a span ending 500px past it) can have a span that overlaps while its own drawn body does not.
    // A zero-width box (`widthPx` clamped from a negative or non-finite one, #296/#297) is a point,
    // not an interval, so it reads the same inclusive boundary the point-shaped `inContent` test
    // above already reads — a box sitting exactly on the content's own last instant stays in.
    const boxOverlapsContent =
      width === 0 ? boxX >= 0 && boxX <= scale.contentWidth : boxX < scale.contentWidth && boxX + width > 0;
    if (!inContent || !boxOverlapsContent) return { x: 0, width: 0, span: 'fixed' };
    return { x: clampBoxToContent(boxX, width, scale.contentWidth), width, span: 'fixed' };
  }
  // Centred on the span's own midpoint, so a floored bar keeps the instant it points at. A zero-width
  // span has its start for a midpoint; a 5px bar the floor widens to 12px keeps its own centre
  // instead of sliding left onto its start.
  if (rawWidth < minBarWidthPx) {
    if (!inContent) return { x: 0, width: 0, span: 'minimum' };
    // Capped at `contentWidth` itself (#436 branch review), same reasoning as the fixed box
    // above: an uncapped `minBarWidthPx` still pins `x` to `0` and paints past the edge in a pane
    // narrower than the floor.
    const width = Math.min(minBarWidthPx, scale.contentWidth);
    const centredX = x - (width - rawWidth) / 2;
    return {
      x: clampBoxToContent(centredX, width, scale.contentWidth),
      width,
      span: 'minimum',
    };
  }
  // No separate membership gate needed here: `clipToContent` already answers the same question for
  // a real interval — no overlap with `[0, contentWidth)` trims straight to `width: 0`. A trim that
  // actually cuts the span (its `x` or `width` moved) is reported as `'clipped'`, not `'exact'`
  // (#436 branch review): `'exact'` promises the entry's own real start/end, and a reader —
  // `render/dom/index.ts`'s stamp, or a plugin's `barRenderer` — must be able to tell the two apart.
  const clipped = clipToContent(x, rawWidth, scale.contentWidth);
  const wasClipped = clipped.x !== x || clipped.width !== rawWidth;
  return { ...clipped, span: wasClipped ? 'clipped' : 'exact' };
}

/** Trims a box to its intersection with `[0, contentWidth)`, the same formula a header band's cell
 *  already applies to itself below — an `'exact'` box carries the entry's own real extent, so it is
 *  cut back to the truthful part inside the content, never shifted (that would misstate the entry's
 *  own start/end). A box with no intersection at all trims to `width: 0`; `placeFrame` reads that as
 *  "nothing to paint" and drops the bar, the same as a fully off-content header cell drops itself. */
function clipToContent(x: number, width: number, contentWidth: number): { x: number; width: number } {
  const clippedX = Math.max(x, 0);
  const clippedRight = Math.min(x + width, contentWidth);
  return { x: clippedX, width: Math.max(0, clippedRight - clippedX) };
}

/** Shifts a box's left edge inward so `[x, x + width)` stays inside `[0, contentWidth]`, the same
 *  edge a widened or fixed box (`barSpan`) must never paint past. Shifting, not
 *  re-centring, keeps a box that already fits untouched and moves one that doesn't the shortest
 *  distance back onto the content — an entry pinned to the range end still reads as at the end.
 *  `width` must already be capped at `contentWidth` by the caller (#436 branch review) — this
 *  function only ever moves `x`, so a `width` wider than `contentWidth` would still pin `x` to `0`
 *  and paint straight past the far edge, the fault this docblock used to claim could not happen. A
 *  width that is capped, on the other hand, can never push `maxX` negative, so the box never
 *  reports an `x` past `0` on the left either. */
function clampBoxToContent(x: number, width: number, contentWidth: number): number {
  const maxX = Math.max(0, contentWidth - width);
  return Math.min(Math.max(x, 0), maxX);
}

/** A fixed box's width, floored at 0 and never non-finite. The one place `widthPx` is read off a
 *  box (`barSpan`, `fixedBoxX` both take the result, never the raw field) — so a negative width
 *  (#296) and a non-finite one (#297, reachable through ordinary consumer arithmetic: a
 *  divide-by-zero, a missing `parseFloat`) clamp to the same value everywhere a fixed box is sized
 *  or positioned, instead of one guard catching the leak and the other missing it. */
function clampBoxWidth(px: number): number {
  return Number.isFinite(px) ? Math.max(0, px) : 0;
}

/** Where a fixed-width box's left edge sits, given the pixel positions of the entry's own `start`
 *  and `end` (`x`, `end`) and the box's already-clamped `width` (`clampBoxWidth`) — never the raw
 *  `widthPx`, so a clamped box never displaces (#296). `'center'` reads the same midpoint the floor
 *  above centres a minimum-width bar on, so a diamond on a real span lands where the floor would
 *  have put one, not at its start. */
function fixedBoxX(x: number, end: number, anchor: BarAnchor, width: number): number {
  switch (anchor) {
    case 'start':
      return x;
    case 'end':
      return end - width;
    case 'center':
      return (x + end) / 2 - width / 2;
  }
}

/** Every `BarFlags` key, the one runtime source of truth for `flagTokens` — a key lives
 *  here once, and `BarFlags` and the `docs/05` selector table both derive from, or are checked
 *  against, this list (#475). */
export const BAR_FLAG_KEYS = ['conflict', 'cycle'] as const;

export type BarFlags = Partial<Record<(typeof BAR_FLAG_KEYS)[number], boolean>>;

/** Every `LinkFlags` key — the link-side twin of `BAR_FLAG_KEYS` (#475). */
export const LINK_FLAG_KEYS = ['inactive', 'cycle'] as const;

export type LinkFlags = Partial<Record<(typeof LINK_FLAG_KEYS)[number], boolean>>;

export interface FrameBar {
  id: BarId;
  entryId: EntryId;
  rowId: RowId;
  /** The variant this bar draws as (ADR 0018) — the `data-variant` `render/` stamps. */
  variant: string;
  /** What a backend renders as the bar's label (#26) — `LayoutInput.barLabelFor`'s own answer for
   *  this Bar's Entry, or the Bar's own `label` when no resolver is bound. `''` when the Entry has
   *  no name and no resolver names a Field with a value: no label paints, and a `barRenderer` sees
   *  no `ctx.label` either (#421 C5). */
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  flags: BarFlags;
  /** What `barSpan` did to this bar's painted `[x, x + width)` extent: `'exact'` for the entry's own
   *  span, painted whole; `'clipped'` for that same span cut at a content edge — `x`/`width` are
   *  not the entry's own start/end here, so a reader that wants the real dates reads the Entry, not
   *  this geometry (#436 branch review); `'minimum'` for one `barSpan` widened to reach
   *  `minBarWidthPx`, and `'fixed'` for a Bar that carries its own `box` (ADR 0022) — both of those
   *  two may also be shifted or width-capped to stay inside the content. One value,
   *  because a bar is never two of these at once — `data-span` is one attribute slot, so the type
   *  mirrors the DOM it feeds.
   *
   *  States a fact about the paint, not a judgement on the variant (plans/01 §2.5 bans a variant
   *  check here); a consumer tells a clipped, floored, or fixed bar apart by pairing this with
   *  `variant`. `render/` stamps it as `data-span="clipped"`, `"minimum"`, or `"fixed"` (`02` §4) —
   *  `'exact'` alone carries no attribute, since it is the paint a reader assumes by default. */
  span: BarSpanKind;
  /** What a screen reader announces: `${label}, ${formatStartAndEnd(bar, ctx)}`,
   * or the dates alone when `label` is `''` (#421 C5) — a nameless Entry still reads its dates, never
   * a leading ", ". Library-derived text, not consumer render output — same precedent as `label`
   * (plans/01 §4: "no user render output in the frame"). Composed here because it needs the dataset
   * zone and inclusive-end formatting, both `time/`-only. */
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
  /** To the next boundary at this band's step, clipped to `contentWidth` — the last
   *  cell in a band is shorter than its own step when the step's next boundary falls past the
   *  content edge, so this is not always a full step's width. */
  width: number;
  label: string;
}

/** One row of the header, emitted per `preset.headers` entry, coarsest first. */
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

/** Live-reconfigurable culling buffer (plans/02 "The culling buffer (`overscan`)") — vertical in whole rows (culls through the
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
  /** The culled region, in timeline-content coordinates (conventions §1). Was `viewport`. */
  visible: Rect;
  header: FrameHeader;
  /** One line per finest-band tick boundary, in the culled window (overscan unchanged).
   *  Empty when the preset carries no headers. */
  tickLines: readonly FrameTickLine[];
  /** Only rows in the vertical window; `top` in absolute content coordinates. */
  rows: FrameRow[];
  /** Total row count across the whole dataset, never the window's — what `aria-setsize` needs so
   * virtualization doesn't announce "row 3" with no "of 30". Same "always the
   * full extent" shape as `contentHeight`/`contentWidth` below. */
  rowCount: number;
  /** Whether the row source can put one row under another (`nestsRows`). A backend needs it to pick
   *  the grid's authoring pattern: only a `treegrid` row may carry `aria-level` and `aria-expanded`,
   *  so a flat source must emit neither. A fact about the row set, so it is stated
   *  once here rather than guessed per row from `depth`. */
  tree: boolean;
  /** Always the full extent, never the window's. */
  contentHeight: number;
  /** Full horizontal extent of the bound `TimeScale`'s range, in px — what the x `ScrollAxis` binds
   * as its content width (S1.5 README §3.2). Always the full extent, never the window's. */
  contentWidth: number;
  bars: FrameBar[];
  links: readonly FrameLink[];
  decorations: readonly FrameDecoration[];
  /** Registered decoration providers' output, painted below the bar layer. */
  underBars: readonly (RangeBand | RowStripe)[];
  /** Registered decoration providers' output, painted above the bar layer. */
  overBars: readonly (RangeBand | RowStripe)[];
  /** Paint description for Grid columns, in display order. Matches `rows[].cells` 1:1. */
  columns: readonly FrameColumn[];
}

export interface LayoutInput {
  /** The whole Dataset, `dataset.entries.all`. Never pass part of it: the tree row source reads each
   *  Entry's own `depth` and `children()`, so an Entry whose parent is left out gets no row. */
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
  /** Feeds every header band's `resolveDateFormat` call and `a11yLabel`.
   * `undefined` = the runtime default. */
  locale?: Intl.LocalesArgument;
  /** `true`/`undefined` reads `now()`; `false` omits the today wrapper; an `Instant` pins it with
   *  no clock read. Default `true`. */
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
  /** Which rows to draw. Omitted → `{ source: 'entries', tree: true }` (nested by parent). */
  rows?: RowSource;
  /** Collapsed `RowId`s. Omitted → none. A stale id matches nothing. */
  collapsed?: readonly string[];
  /** Per-Gantt variant registry (ADR 0018). The shell passes one per Gantt (I2). */
  variants: VariantBars;
  /** Every declared Field's stored-value read and compare, bound at this Gantt's locale. */
  fieldCompares?: readonly FieldCompare[];
  /** Dataset commit generation. FrameMemory keys row-production invalidation on this (A2). */
  datasetRevision: number;
  /** Bound Field reader for row-source `filter` / `groupBy` / `sort.compare` (A5). */
  fieldContext?: FieldContext;
  /** Registered decoration providers, `ctx.view.registerDecoration`'s own record.
   *  Omitted or empty → both `underBars`/`overBars` are `[]`. */
  decorationProviders?: readonly RegisteredDecorationProvider[];
  /** What `childrenAsSegments` compiles through (`layout/entry-rule.ts`) — the Field registry read
   *  and the unknown-key sink. The shell builds one of these once, at construction (`#421 C1`), the
   *  same way it builds `variants`'s own `fieldFor`. Omitted → an entries source with a rule set
   *  matches nothing, same as `resolveRows`'s own default. */
  entryRulePorts?: EntryRulePorts;
  /** What one bar's label prints (#421 C5). `view/` builds this from the Gantt's own `barLabels`
   *  Field, merged with the row's own variant (`mergeBarLabels`) and read through `formatValue` —
   *  the same door a Grid cell reads through. Read fresh every `placeFrame` call, never
   *  cached on the Bar: a live `gantt.barLabels` reassignment repaints (`frame-settings.ts`'s own
   *  `INVALIDATION` table), and this is what makes that repaint show the new text. Omitted → falls
   *  back to the Bar's own `label` — `layout/`'s own tests, which build no `view/`, keep working
   *  with no resolver bound. */
  barLabelFor?: (entry: Entry) => string;
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

/** How many Bars one Entry drew on this row — what "part 2 of 3" counts. Only a plugin's own
 *  `BarProducer` ever answers more than one Bar for one Entry (`plans/01` §2.4, `barId`'s
 *  `partIndex`); every shipped producer draws one Bar per Entry (ADR 0026), so on a core-only
 *  Gantt every count here is 1 and no label says "part". A segmented row is no exception: its
 *  children are distinct Entries, so each one counts its own single Bar. */
function partCountByEntry(bars: readonly Bar[]): ReadonlyMap<EntryId, number> {
  const counts = new Map<EntryId, number>();
  for (const bar of bars) counts.set(bar.entryId, (counts.get(bar.entryId) ?? 0) + 1);
  return counts;
}

function barA11yLabel(
  label: string,
  bar: Bar,
  partCount: number,
  scale: TimeScale,
  locale: Intl.LocalesArgument | undefined,
): string {
  // Which dates does a screen reader hear? The date-only pair. `layout/` may not import `data/`, so
  // it cannot read the Fields' own formatters.
  const span = formatStartAndEnd(bar, { timeZone: scale.timeZone, locale });
  // #421 C5: a nameless Entry announces its dates alone, never a leading ", ".
  const prefix = label === '' ? '' : `${label}, `;
  if (partCount <= 1) return `${prefix}${span}`;
  return `${prefix}part ${partIndexOfBar(bar.id) + 1} of ${partCount}, ${span}`;
}

/** Call: `resolveLayoutRows(input)`. One row plan from a `LayoutInput`. */
export function resolveLayoutRows(input: LayoutInput): readonly PlannedRow[] {
  return resolveRows({
    entries: input.entries,
    ...(input.rows !== undefined ? { rows: input.rows } : {}),
    ...(input.collapsed !== undefined ? { collapsed: input.collapsed } : {}),
    ...(input.fieldCompares !== undefined ? { fieldCompares: input.fieldCompares } : {}),
    ...(input.fieldContext !== undefined ? { fieldContext: input.fieldContext } : {}),
    ...(input.entryRulePorts !== undefined ? { entryRulePorts: input.entryRulePorts } : {}),
  });
}

function memoryFor(input: LayoutInput, plan: readonly PlannedRow[], memory?: FrameMemory): FrameMemory {
  const mem = memory ?? new FrameMemory();
  mem.sync({
    plan,
    rowHeight: input.rowHeight,
    entries: input.entries,
    registry: input.variants,
    datasetRevision: input.datasetRevision,
  });
  return mem;
}

/** Where every band coarser than the finest one opens a cell, in ascending x. Bands run coarsest
 *  first, so the finest band is the last array and every other one is a coarser band. */
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

/** Composition over resolve → produce → place. Culling still windows after resolve.
 * Pure: `memory` is what this pass remembers — `FrameLayout` keeps one alive across
 * renders; a one-shot caller omits it and gets memory built and discarded here. `decorations` is the
 * matching per-Gantt memory for registered decoration providers — same one-shot-default rule. */
export function computeFrame(
  input: LayoutInput,
  memory?: FrameMemory,
  decorations?: DecorationRunner,
): GeometryFrame {
  const plan = resolveLayoutRows(input);
  return placeFrame(input, plan, memoryFor(input, plan, memory), decorations);
}

/** Pixel sizes this frame paints with, and the Overscan that widens the cull window. Overscan is
 *  not a size: it is the culling buffer, held apart from the three px fields. */
interface FramePaintSettings {
  readonly tickBoxFloorPx: number;
  readonly minBarWidthPx: number;
  readonly barHeightPx: number;
  readonly overscan: Required<Overscan>;
}

/** Call: `framePaintSettingsOf(input)`. Tick box floor, bar min width, bar height, and Overscan. */
function framePaintSettingsOf(input: LayoutInput): FramePaintSettings {
  return {
    tickBoxFloorPx: input.tickBoxFloorPx ?? DEFAULT_TICK_BOX_FLOOR_PX,
    minBarWidthPx: input.minBarWidthPx ?? DEFAULT_MIN_BAR_WIDTH_PX,
    barHeightPx: input.barHeightPx ?? DEFAULT_BAR_HEIGHT_PX,
    overscan: {
      verticalRows: input.overscan?.verticalRows ?? DEFAULT_OVERSCAN.verticalRows,
      horizontalPx: input.overscan?.horizontalPx ?? DEFAULT_OVERSCAN.horizontalPx,
    },
  };
}

/** Call: `horizontalCullWindow(visible, overscan.horizontalPx)`. The horizontal cull window in
 *  content pixels, or `undefined` when a zero width disables culling entirely. */
function horizontalCullWindow(
  visible: Rect,
  horizontalPx: number,
): { left: number; right: number } | undefined {
  if (visible.width <= 0) return undefined;
  return {
    left: visible.x - horizontalPx,
    right: visible.x + visible.width + horizontalPx,
  };
}

/** Call: `barLabelOf(producedBar, entry, input.barLabelFor)`. The Bar's own `label` wins when a
 *  producer set one — the most specific answer available, per-bar and authored. Absent, `barLabelFor`
 *  (the Gantt's own Field, resolved and formatted) fills it; absent that too (a `layout/` test with
 *  no `view/`), ''. */
function barLabelOf(
  producedBar: Bar,
  entry: Entry | undefined,
  barLabelFor: ((entry: Entry) => string) | undefined,
): string {
  return producedBar.label ?? (barLabelFor !== undefined && entry !== undefined ? barLabelFor(entry) : '');
}

/** Call: `placeVisibleRowsAndBars(input, plan, mem, paint, cull)`. Which rows and bars sit in the
 *  Visible region — a zero height or width disables that axis's cull entirely, not just an infinite
 *  far edge with the near edge still taken from `visible`. */
function placeVisibleRowsAndBars(
  input: LayoutInput,
  plan: readonly PlannedRow[],
  mem: FrameMemory,
  paint: FramePaintSettings,
  cull: { left: number; right: number } | undefined,
): { rows: FrameRow[]; bars: FrameBar[] } {
  const { scale, visible, rowHeight, locale } = input;
  // #414: `mem.sync` keeps one Map of every Entry, rebuilt only when the `entries` array changes
  // identity — a scroll frame reuses it instead of paying an O(entries) allocation every frame.
  const entryById = mem.entryById;
  const index = mem.heights;
  const rows: FrameRow[] = [];
  const bars: FrameBar[] = [];
  const cullVertically = visible.height > 0;
  const windowTop = cullVertically ? visible.y : 0;
  const windowBottom = cullVertically ? visible.y + visible.height : Infinity;
  function intersectsHorizontally(x: number, width: number): boolean {
    return cull === undefined || (x <= cull.right && x + width >= cull.left);
  }

  // Bound the scan with indexAtY instead of walking every row from 0 (#47): start at the row that
  // actually contains windowTop, expanded by verticalRows in INDEX space (#20's index-space fix).
  // Rows stay vertical-only: a row whose bar is off-screen horizontally is still emitted — the grid
  // pane needs its label.
  const baseStart = plan.length > 0 ? index.indexAtY(windowTop) : 0;
  const startIndex = Math.max(0, baseStart - paint.overscan.verticalRows);
  // Counts rows already emitted past windowBottom; stops once verticalRows of them have gone by, so
  // verticalRows: 0 reduces to the pre-overscan "stop at the first row past the bottom" rule exactly.
  let overflowCount = 0;
  for (let rowIndex = startIndex; rowIndex < plan.length; rowIndex++) {
    const planned = plan[rowIndex]!;
    const top = index.topAt(rowIndex);
    if (top >= windowBottom) {
      if (overflowCount >= paint.overscan.verticalRows) break;
      overflowCount++;
    }

    const produced = mem.rowMemory(planned.id);
    const rowBars = produced.bars;
    const height = index.heightAt(rowIndex);
    const parts = partCountByEntry(rowBars);
    rows.push({
      id: planned.id,
      kind: planned.kind,
      index: planned.index,
      top,
      height,
      depth: planned.depth,
      expandable: planned.expandable,
      expanded: planned.expanded,
      ...(planned.matched !== undefined ? { matched: planned.matched } : {}),
      gridCells: cellsForRow(planned, input.columns, entryById),
      // A header row stands for no Entry, so it owns none and never becomes selectable.
      entryIds: isPlannedHeaderRow(planned) ? [] : planned.entryIds,
    });

    for (const producedBar of rowBars) {
      const { x, width, span } = barSpan(producedBar, scale, paint.minBarWidthPx);
      if (!intersectsHorizontally(x, width)) continue;
      // An 'exact' box already trimmed to `[0, contentWidth)` (barSpan) reports `width: 0` when the
      // entry's own span has no intersection with the content at all — an entry outside the
      // caller's own `range`, pulled into the culled window only by the overscan buffer. Nothing to
      // paint, so it never becomes a FrameBar (#436).
      if (width <= 0) continue;
      const entry = entryById.get(producedBar.entryId);
      const label = barLabelOf(producedBar, entry, input.barLabelFor);
      const bar: FrameBar = {
        id: producedBar.id,
        entryId: producedBar.entryId,
        rowId: planned.id,
        variant: producedBar.variant,
        label,
        x,
        // Every row is one lane (singleLane): the bar centres in the row's own band.
        y: top + (rowHeight - paint.barHeightPx) / 2,
        width,
        height: paint.barHeightPx,
        flags: {},
        span,
        a11yLabel: barA11yLabel(label, producedBar, parts.get(producedBar.entryId) ?? 1, scale, locale),
      };
      bars.push(bar);
    }
  }
  return { rows, bars };
}

/** Call: `horizontalQuerySpan(cull, scale.contentWidth)`. How wide is the tick query, including
 *  Overscan, clipped to the content? The overscan buffer widens the cull window past both ends of
 *  the dataset's own range, but a band tick or a tick line only ever has a home inside
 *  `[0, contentWidth)` (the timeline's content is `contentWidth` wide, full stop). Clamping the
 *  query span here, not just the ticks it returns, stops `scale.ticks` from walking cursors the
 *  content never needed — `ticks()` still emits the one cell straddling each bound, so a partial
 *  leading or trailing cell still reaches `bands` for its own box-intersection clip. A missing cull
 *  disables horizontal culling — everything renders. */
function horizontalQuerySpan(
  cull: { left: number; right: number } | undefined,
  contentWidth: number,
): { x: number; width: number } {
  if (cull === undefined) return { x: 0, width: contentWidth };
  return {
    x: Math.max(cull.left, 0),
    width: Math.max(0, Math.min(cull.right, contentWidth) - Math.max(cull.left, 0)),
  };
}

/** Call: `headerLabelLeftClamp(visible, cull)`. Where do header labels stick when a coarse cell
 *  straddles the visible left edge? A coarse band's boundary (a year, say) is often well behind the
 *  visible pane — the calendar year started before this dataset's own first entry, or the caller
 *  has scrolled past it — so its true cell left edge sits off-screen. Left un-clamped, the label
 *  paints at that off-screen x and never becomes visible even though most of the cell is on screen.
 *  Clamping the *label's* x to the visible pane's own left edge keeps it stuck to the front of its
 *  cell while any part of that cell is in view — the cell's true `x`/`width` (and its `instant`)
 *  still drive ticking and formatting; only where the label paints moves. The clamp does not use
 *  Overscan, only whether a cull exists. */
function headerLabelLeftClamp(visible: Rect, cull: { left: number; right: number } | undefined): number {
  return cull !== undefined ? Math.max(visible.x, 0) : 0;
}

/** One line per finest-band tick inside the content. A line past `contentWidth` draws nothing a
 *  reader can scroll to — but it is a painted node in the pane, so the browser widens the pane's
 *  own scrollable range to reach it. The overscan buffer pulls in ticks on both sides of the visible
 *  window; this keeps only the lines that have a home. */
function contentTickLinesOf(
  rawBandTicks: readonly (readonly Tick[])[],
  contentWidth: number,
): FrameTickLine[] {
  const finestBandTicks = rawBandTicks[rawBandTicks.length - 1] ?? [];
  return markMajorTickLines(
    finestBandTicks.filter((tick) => tick.x >= 0 && tick.x < contentWidth),
    coarserBandStartsOf(rawBandTicks),
  );
}

/** What Date line decorations does this frame draw? */
function dateLineDecorationsOf(input: LayoutInput, scale: TimeScale): FrameDecoration[] {
  return resolveDateLines({
    scale,
    todayLine: input.todayLine ?? true,
    ...(input.dateLines ? { dateLines: input.dateLines } : {}),
  });
}

/** Call: `placeFrame(input, plan, memory, decorations)`. Geometry only — the caller already
 *  resolved rows. */
export function placeFrame(
  input: LayoutInput,
  plan: readonly PlannedRow[],
  memory?: FrameMemory,
  decorations?: DecorationRunner,
): GeometryFrame {
  const { scale, preset, visible, revision, locale } = input;
  const mem = memory ?? memoryFor(input, plan);
  const paint = framePaintSettingsOf(input);
  const cull = horizontalCullWindow(visible, paint.overscan.horizontalPx);
  const { rows, bars } = placeVisibleRowsAndBars(input, plan, mem, paint, cull);
  const horizontalSpan = horizontalQuerySpan(cull, scale.contentWidth);
  const labelLeftClamp = headerLabelLeftClamp(visible, cull);

  // A Tick's CSS border-box cannot shrink below the Tick box floor (`tickBoxFloorPx`, Token
  // `--fg-tick-box-floor`). A straddling tick clamped to a thinner remainder would ask for e.g.
  // `width: 0.5px` and still paint at that floor — eating into the next cell. Below the floor the
  // sticky behaviour buys nothing, so the tick keeps its true (off-screen) x.

  const headerFormats = dropRepeatedGranularity(preset.headers);
  // Raw ticks per band, coarsest first — computed once and shared by `bands`' clamped
  // labels below and `tickLines`' unclamped lines: both read the same `scale.ticks` call per band,
  // so a preset's own boundaries never drift between the header and the pane under it.
  const rawBandTicks = preset.headers.map((header) =>
    scale.ticks({ unit: header.unit, increment: header.increment }, horizontalSpan),
  );
  const bands: FrameHeaderBand[] = preset.headers.map((header, i) => {
    const format = resolveDateFormat(headerFormats[i]!, { timeZone: scale.timeZone, locale });
    return {
      unit: header.unit,
      increment: header.increment,
      ticks: rawBandTicks[i]!.map((tick) => {
        // Only the one tick whose cell actually straddles the clamp line is "stuck" — a tick
        // that ends before it (fully behind the visible edge, kept around only by the overscan
        // buffer) must keep its own true x, or every such tick collapses onto the same clamped
        // column and their labels stack on top of each other (header readability follow-up).
        const remainder = tick.x + tick.width - labelLeftClamp;
        const straddlesClamp = tick.x < labelLeftClamp && remainder >= paint.tickBoxFloorPx;
        const x = straddlesClamp ? labelLeftClamp : tick.x;
        const width = Math.max(0, tick.width - (x - tick.x));
        // A band cell is a box, not a point (unlike `tickLines` below), so it needs an
        // intersection with `[0, contentWidth)`, not the point test that would drop a leading
        // or trailing cell a reader can plainly see most of. Left un-clamped, a cell that
        // straddles either content bound paints past it, and that painted node is what widens
        // the pane's own native `scrollWidth` past the content sizer — the same harm
        // `tickLines` already guards against for a tick *line*. It is the one `clipToContent`
        // an 'exact' bar box already takes, not a second copy of the rule. Trimming here runs after
        // the straddle clamp above, so the two compose: that clamp can only move `x` rightward
        // to keep a label inside the visible pane, and this clip only pulls the box back inside
        // the content — neither can undo the other's work.
        return { ...clipToContent(x, width, scale.contentWidth), label: format(tick.instant) };
      }).filter((cell) => cell.width > 0),
    };
  });

  const finestBand = bands[bands.length - 1];
  const runner = decorations ?? new DecorationRunner();
  const { underBars, overBars } = runner.run({
    providers: input.decorationProviders ?? [],
    span: scale.spanForPixels(horizontalSpan),
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
    tickLines: contentTickLinesOf(rawBandTicks, scale.contentWidth),
    rows,
    rowCount: plan.length,
    tree: nestsRows(input.rows ?? DEFAULT_ROW_SOURCE),
    contentHeight: mem.heights.totalHeight,
    contentWidth: scale.contentWidth,
    bars,
    links: [],
    decorations: dateLineDecorationsOf(input, scale),
    underBars,
    overBars,
    columns: columnsForFrame(input.columns),
  };
}
