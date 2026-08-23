// time/ owns TimeScale — instants ⇄ pixels, pure and standalone (plans/01 §5.1, D9). Charts BIND to
// one; two charts sharing one scale are x-synced by construction. Arithmetic on Instant is only legal
// here (I10) — everything outside time/ must go through xForInstant/instantForX/widthForDuration.

import type { Duration, Instant, TimeSpan, TimeUnit } from '../model/index.js';
import { addDays, toPlain } from './zone.js';
import { addMs, instant, MS } from './instant.js';

export interface Tick {
  instant: Instant;
  x: number;
}

export type HeaderFormat = (i: Instant, zone: string) => string;

export interface ViewPresetHeader {
  unit: TimeUnit;
  increment: number;
  format: HeaderFormat;
}

/** Data, not a switch statement — shipped presets are config objects; custom ones are too (plans/01 §5.1). */
export interface ViewPreset {
  id: string;
  tickUnit: TimeUnit;
  tickIncrement: number;
  headers: readonly ViewPresetHeader[];
  tickWidthPx: number;
  snap?: { unit: TimeUnit; increment: number } | 'tick' | 'none';
}

export interface TimeScale {
  readonly range: TimeSpan;
  readonly zone: string;
  xForInstant(i: Instant): number;
  instantForX(x: number): Instant;
  widthForDuration(d: Duration, at: Instant): number;
  ticks(preset: ViewPreset): readonly Tick[];
}

export interface TimeScaleOptions {
  /** Project's IANA zone — calendar-unit stepping (day/week) resolves through it (D6). */
  zone: string;
  range: TimeSpan;
  pxPerMs: number;
}

/** Units this scale can step by today. Month/year presets land once time/ grows calendar month math. */
const SUPPORTED_UNITS = new Set<TimeUnit>(['ms', 'm', 'h', 'd', 'w']);

function stepBy(zone: string, i: Instant, unit: TimeUnit, increment: number): Instant {
  switch (unit) {
    case 'ms':
      return addMs(i, increment);
    case 'm':
      return addMs(i, increment * MS.MINUTE);
    case 'h':
      return addMs(i, increment * MS.HOUR);
    case 'd':
      return addDays(zone, i, increment);
    case 'w':
      return addDays(zone, i, increment * 7);
    default:
      throw new RangeError(
        `TimeScale: unsupported unit "${unit}" — only ${[...SUPPORTED_UNITS].join(', ')} step today`,
      );
  }
}

/** Guards ticks() against a misconfigured preset (e.g. zero increment) walking forever. */
const MAX_TICKS = 100_000;

export function createTimeScale(options: TimeScaleOptions): TimeScale {
  const { zone, range, pxPerMs } = options;

  function xForInstant(i: Instant): number {
    return (i - range.start) * pxPerMs;
  }

  function instantForX(x: number): Instant {
    return instant(range.start + x / pxPerMs);
  }

  function widthForDuration(d: Duration, at: Instant): number {
    const end = stepBy(zone, at, d.unit, d.value);
    return xForInstant(end) - xForInstant(at);
  }

  function ticks(preset: ViewPreset): readonly Tick[] {
    if (!SUPPORTED_UNITS.has(preset.tickUnit)) {
      throw new RangeError(
        `TimeScale.ticks: preset "${preset.id}" uses unsupported unit "${preset.tickUnit}"`,
      );
    }
    const out: Tick[] = [];
    let cursor = range.start;
    let count = 0;
    while (cursor < range.end && count < MAX_TICKS) {
      out.push({ instant: cursor, x: xForInstant(cursor) });
      cursor = stepBy(zone, cursor, preset.tickUnit, preset.tickIncrement);
      count++;
    }
    return out;
  }

  return { range, zone, xForInstant, instantForX, widthForDuration, ticks };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const plainDateFormat: HeaderFormat = (i, zone) => {
  const c = toPlain(zone, i);
  return `${c.year}-${pad2(c.month)}-${pad2(c.day)}`;
};

/** Shipped preset: one tick per calendar day. Hour->year presets land incrementally (plans/01 §5.1) —
 * presets are config objects, so growing the shipped set is additive, never a library edit. */
export const dayPreset: ViewPreset = {
  id: 'day',
  tickUnit: 'd',
  tickIncrement: 1,
  headers: [{ unit: 'd', increment: 1, format: plainDateFormat }],
  tickWidthPx: 24,
};

/** The zoom a preset implies on its own: one tick occupies its `tickWidthPx`. This is what a scale
 * resolves to when there is no measured viewport to fit into (detached host, `display:none`,
 * pre-paint) — the preset already states an intended density, so an unmeasured host is not a special
 * case needing an invented minimum width. Calendar stepping resolves through `zone`, so a day tick is
 * 23 or 25 hours across a DST transition, not always 24. */
export function pxPerMsForPreset(zone: string, preset: ViewPreset, at: Instant): number {
  const tickMs = stepBy(zone, at, preset.tickUnit, preset.tickIncrement) - at;
  if (tickMs <= 0) {
    throw new RangeError(
      `TimeScale: preset "${preset.id}" does not advance (${preset.tickIncrement}${preset.tickUnit})`,
    );
  }
  return preset.tickWidthPx / tickMs;
}
