// time/ owns TimeScale — instants ⇄ pixels, pure and standalone (plans/01 §5.1, D9). Gantt instances
// BIND to one; two sharing one scale are x-synced by construction. Arithmetic on Instant is only legal
// here (I10) — everything outside time/ must go through xForInstant/instantForX/widthForDuration.

import type { Duration, Instant, PixelSpan, TimeSpan, TimeUnit } from '../model/index.js';
import { stepBy, startOf } from './zone.js';
import { instant } from './instant.js';

/** What a caller states about a stepping cadence — the shared shape `ViewPresetHeader` and
 * `TimeScale.ticks` both key off (S1.7 §3.3). */
export interface TickStep {
  readonly unit: TimeUnit;
  readonly increment: number;
}

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
  tickUnit: TimeUnit;
  tickIncrement: number;
  headers: readonly ViewPresetHeader[];
  /** The density this preset intends: one tick occupies this many px when nothing else decides. */
  preferredTickWidthPx: number;
  /** The density floor: below this, this preset's labels stop being legible. Defaults to
   *  `preferredTickWidthPx` when omitted, which makes a custom preset never compress. */
  minTickWidthPx?: number;
  snap?: { unit: TimeUnit; increment: number } | 'tick' | 'none';
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
  /** Px extent of the whole range at this zoom — what `ScrollModel` binds as its content width. */
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
    let cursor = startOf(timeZone, instantForX(span.x), step.unit);
    let count = 0;
    while (cursor < spanEnd && count < MAX_TICKS) {
      const next = stepBy(timeZone, cursor, step.unit, step.increment);
      out.push({ instant: cursor, x: xForInstant(cursor), width: xForInstant(next) - xForInstant(cursor) });
      cursor = next;
      count++;
    }
    return out;
  }

  const contentWidth = Math.max(0, xForInstant(range.end) - xForInstant(range.start));

  return { range, timeZone, pxPerMs, xForInstant, instantForX, widthForDuration, ticks, contentWidth };
}

function tickMsForPreset(zone: string, preset: ViewPreset, at: Instant): number {
  const tickMs = stepBy(zone, at, preset.tickUnit, preset.tickIncrement) - at;
  if (tickMs <= 0) {
    throw new RangeError(
      `TimeScale: preset "${preset.id}" does not advance (${preset.tickIncrement}${preset.tickUnit})`,
    );
  }
  return tickMs;
}

/** The zoom a preset implies on its own: one tick occupies its `preferredTickWidthPx`. This is what a
 * scale resolves to when there is no measured viewport to fit into (detached container, `display:none`,
 * pre-paint) — the preset already states an intended density, so an unmeasured container is not a special
 * case needing an invented minimum width. Calendar stepping resolves through `zone`, so a day tick is
 * 23 or 25 hours across a DST transition, not always 24. */
export function pxPerMsForPreset(zone: string, preset: ViewPreset, at: Instant): number {
  return preset.preferredTickWidthPx / tickMsForPreset(zone, preset, at);
}

/** The density floor this preset implies: one tick occupies at least `minTickWidthPx`. Falls back to
 *  `preferredTickWidthPx`, so a custom preset that states nothing never compresses (D-S1.12-2). */
export function minPxPerMsForPreset(zone: string, preset: ViewPreset, at: Instant): number {
  const floorPx = preset.minTickWidthPx ?? preset.preferredTickWidthPx;
  return floorPx / tickMsForPreset(zone, preset, at);
}
