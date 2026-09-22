// time/ owns TimeScale — instants ⇄ pixels, pure and standalone (plans/01 §5.1, D9). Gantt instances
// BIND to one; two sharing one scale are x-synced by construction. Arithmetic on Instant is only legal
// here (I10) — everything outside time/ must go through xForInstant/instantForX/widthForDuration.

import type { Duration, Instant, PixelSpan, TimeSpan, TimeUnit } from '../model/index.js';
import { stepBy, tickFloor, nextTick } from './zone.js';
import { instant } from './instant.js';

/** What a caller states about a stepping cadence — the shared shape `ViewPresetHeader` and
 * `TimeScale.ticks` both key off (S1.7 §3.3). */
export interface TickStep {
  readonly unit: TimeUnit;
  readonly increment: number;
}

/** What a caller states that a drag snaps to (D-S3-12, D-S3-24): a named unit and increment, one
 *  tick of whatever preset is showing, or `'none'` for raw pixel placement. `ViewPreset.snap` states
 *  it for one preset; `Gantt.snap` states it for one Gantt, over whatever preset is showing. The
 *  gesture resolves it to a `SnapUnit` at commit time, when the preset's own tick is known. */
export type SnapSetting = TickStep | 'tick' | 'none';

export interface Tick {
  instant: Instant;
  x: number;
  /** To the next boundary at this step — what a band cell is drawn with (D-S1.7-4). */
  width: number;
}

/** Widened with `locale` (S1.12). Adding a parameter is source-compatible with existing callbacks. */
export type HeaderFormat = (i: Instant, zone: string, locale: Intl.LocalesArgument | undefined) => string;

/** What a header band states to turn an Instant into its label (S1.12, D-S1.12-11). Options are
 * resolved through `Intl.DateTimeFormat` in the Gantt's locale and the Dataset's zone; a callback is
 * the escape hatch for anything Intl has no field for (see `formatWeekNumber`). */
export type DateFormat = Intl.DateTimeFormatOptions | HeaderFormat;

export interface ViewPresetHeader extends TickStep {
  format: DateFormat;
  /** A coarser band earlier in `headers` (bands are coarsest first) that already spells out `year`
   *  or `month` makes this band drop that field from its own `format` by default — the day band
   *  under a month band reads "21", not "Sep 21, 2026" (S1.12 follow-up, header readability). Set
   *  `true` to keep this band's `format` exactly as written. No effect on a callback `format`: only
   *  `Intl.DateTimeFormatOptions` fields are ever inspected or stripped. */
  repeatCoarserUnits?: boolean;
}

/** Data, not a switch statement — shipped presets are config objects; custom ones are too (plans/01 §5.1). */
export interface ViewPreset {
  id: string;
  /** The grid's step, with `tickIncrement`. Must be no coarser than the finest (last) header's own
   *  step — a coarser tick would draw a grid the header disagrees with. `resolvePreset` throws
   *  `InvalidPresetError` for a preset that breaks this rule. */
  tickUnit: TimeUnit;
  tickIncrement: number;
  headers: readonly ViewPresetHeader[];
  /** The density this preset intends: one tick occupies this many px when nothing else decides. */
  preferredTickWidthPx: number;
  /** The density floor: below this, this preset's labels stop being legible. Defaults to
   *  `preferredTickWidthPx` when omitted, which makes a custom preset never compress. */
  minTickWidthPx?: number;
  /** What a drag snaps to under this preset. Unset reads as `'tick'`. `Gantt.snap` overrides it for
   *  one Gantt (D-S3-24). */
  snap?: SnapSetting;
}

export interface TimeScale {
  readonly range: TimeSpan;
  /** Dataset's IANA timeZone (D6, #37 — one name for this concept, matching plans/02's DatasetOptions). */
  readonly timeZone: string;
  /** Density: content px per ms, constant across the whole range at this zoom. What `Viewport.zoomBy`
   *  reads before scaling it (S1.9, D-S1.9-5) — every other quantity `zoomTo`/`zoomBy` need already
   *  existed. It's a Cartesian scale — constant by construction, not a per-point read. */
  readonly pxPerMs: number;
  xForInstant(i: Instant): number;
  instantForX(x: number): Instant;
  widthForDuration(d: Duration, at: Instant): number;
  /** Ticks whose cell `[x, x + width)` intersects `span`, aligned to `step`'s boundary in the dataset
   *  zone — the cell covering `span.x` is emitted even when its own `x` is left of `span`. Whole-range
   *  callers pass `{ x: 0, width: contentWidth }` — and are greppable. */
  ticks(step: TickStep, span: PixelSpan): readonly Tick[];
  /** What time a pixel extent stands for. Clamps to `[0, contentWidth]` first (D-S1.8-1: there is no
   *  time outside the content), so a caller hands over whatever pixels it has and never repeats the
   *  bound itself. Half-open, like every other span. A zero-width extent answers a degenerate span,
   *  which is the honest reading: no pixels stand for no time. */
  spanForPixels(span: PixelSpan): TimeSpan;
  /** Px extent of the whole range at this zoom — what the x `ScrollAxis` binds as its content width. */
  readonly contentWidth: number;
}

export interface TimeScaleOptions {
  /** Dataset's IANA timeZone — calendar-unit stepping (day/week) resolves through it (D6). */
  timeZone: string;
  range: TimeSpan;
  pxPerMs: number;
}

/** Guards ticks() against a misconfigured step (e.g. zero increment) walking forever. */
const MAX_TICKS = 100_000;

export function createTimeScale(options: TimeScaleOptions): TimeScale {
  const { timeZone, range, pxPerMs } = options;

  function xForInstant(i: Instant): number {
    return (i - range.start) * pxPerMs;
  }

  function instantForX(x: number): Instant {
    // Pixels don't divide evenly into milliseconds, so this must round: an unrounded epoch ms is a
    // fraction of a millisecond, which Temporal's Instant (whole ms) rejects outright.
    return instant(Math.round(range.start + x / pxPerMs));
  }

  function widthForDuration(d: Duration, at: Instant): number {
    const end = stepBy(timeZone, at, d.unit, d.value);
    return xForInstant(end) - xForInstant(at);
  }

  function ticks(step: TickStep, span: PixelSpan): readonly Tick[] {
    if (span.width <= 0) return [];
    const spanEnd = instantForX(span.x + span.width);

    const out: Tick[] = [];
    // Anchored, not floored against the visible window's own edge (#489) — tickFloor counts
    // step.increment-many step.units from step.unit's own next-larger-calendar boundary, so this
    // first cell stays on the same instant across a pan. nextTick (not a plain stepBy) carries that
    // same anchor forward one cell at a time, resetting at each anchor-unit boundary rather than
    // striding across it — the whole row of cells the window draws stays on that one lattice.
    let cursor = tickFloor(timeZone, instantForX(span.x), step.unit, step.increment);
    let count = 0;
    while (cursor < spanEnd && count < MAX_TICKS) {
      const next = nextTick(timeZone, cursor, step.unit, step.increment);
      out.push({ instant: cursor, x: xForInstant(cursor), width: xForInstant(next) - xForInstant(cursor) });
      cursor = next;
      count++;
    }
    return out;
  }

  const contentWidth = Math.max(0, xForInstant(range.end) - xForInstant(range.start));

  function spanForPixels(span: PixelSpan): TimeSpan {
    const clampToContent = (x: number) => Math.min(Math.max(x, 0), contentWidth);
    const left = clampToContent(span.x);
    const right = clampToContent(span.x + span.width);
    return { start: instantForX(left), end: instantForX(right) };
  }

  return {
    range,
    timeZone,
    pxPerMs,
    xForInstant,
    instantForX,
    widthForDuration,
    ticks,
    spanForPixels,
    contentWidth,
  };
}

/** How long one step of `step` lasts, starting at `at` in `zone`. Calendar stepping, so a day is 23
 * or 25 hours across a DST transition and a month is 28 to 31 days — never a fixed constant.
 * `subject` names whoever stated the step, so a cadence that stands still says whose it was. */
function msForOneStep(zone: string, at: Instant, step: TickStep, subject: string): number {
  const ms = stepBy(zone, at, step.unit, step.increment) - at;
  if (ms <= 0) {
    throw new RangeError(`TimeScale: ${subject} does not advance (${step.increment}${step.unit})`);
  }
  return ms;
}

function tickMsForPreset(zone: string, preset: ViewPreset, at: Instant): number {
  const step = { unit: preset.tickUnit, increment: preset.tickIncrement };
  return msForOneStep(zone, at, step, `preset "${preset.id}"`);
}

/** The zoom a preset implies on its own: one tick occupies its `preferredTickWidthPx`. This is what a
 * scale resolves to when there is no measured viewport to fit into (detached container, `display:none`,
 * pre-paint) — the preset already states an intended density, so an unmeasured container is not a special
 * case needing an invented minimum width. Calendar stepping resolves through `zone`, so a day tick is
 * 23 or 25 hours across a DST transition, not always 24. */
export function pxPerMsForPreset(zone: string, preset: ViewPreset, at: Instant): number {
  return preset.preferredTickWidthPx / tickMsForPreset(zone, preset, at);
}

/** What a caller states when they want one unit of time to paint at a fixed width: "a day tile is 14
 * pixels wide". The `Gantt`/`TimeScaleModel` `fit` key takes this directly.
 *
 * It exists because the pixels-per-millisecond form of `fit` cannot be written by hand safely. An
 * author reaching for it computes `14 / 86_400_000`, which asserts that every day is 24 hours — false
 * in every zone that observes DST, and false for a month or a year in every zone at all. The zone and
 * the anchor instant that settle the real length are the library's (`plans/02`: core fills zone math),
 * so the author states the unit and the width, and `pxPerMsForUnitWidth` resolves it.
 *
 * A TimeScale carries one `pxPerMs` for its whole span, so the width lands exactly on the unit at
 * `range.start` and every other unit follows its own calendar length from there — a 23-hour day
 * paints narrower than its neighbours, which is what a reader of a DST week expects to see. This is
 * the anchor `fit: 'preset'` already resolves against. */
export interface TimeUnitWidth {
  readonly unit: TimeUnit;
  /** How many units share `widthPx`. Defaults to 1 — `{ unit: 'week', increment: 2, widthPx: 90 }`
   *  reads "a fortnight is 90 pixels". */
  readonly increment?: number;
  /** Pixels one `increment` of `unit` occupies. */
  readonly widthPx: number;
}

/** The density a `TimeUnitWidth` states, resolved in `zone` at `at`. The same calendar stepping
 * `pxPerMsForPreset` uses, for the same reason: the answer differs on a DST day. */
export function pxPerMsForUnitWidth(zone: string, width: TimeUnitWidth, at: Instant): number {
  const step = { unit: width.unit, increment: width.increment ?? 1 };
  return width.widthPx / msForOneStep(zone, at, step, `fit { unit: '${width.unit}' }`);
}

/** The density floor this preset implies: one tick occupies at least `minTickWidthPx`. Falls back to
 *  `preferredTickWidthPx`, so a custom preset that states nothing never compresses (D-S1.12-2). */
export function minPxPerMsForPreset(zone: string, preset: ViewPreset, at: Instant): number {
  const floorPx = preset.minTickWidthPx ?? preset.preferredTickWidthPx;
  return floorPx / tickMsForPreset(zone, preset, at);
}
