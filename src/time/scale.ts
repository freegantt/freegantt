// time/ owns TimeScale — instants ⇄ pixels, pure and standalone (plans/01 §5.1, D9). Gantt instances
// BIND to one; two sharing one scale are x-synced by construction. Arithmetic on Instant is only legal
// here (I10) — everything outside time/ must go through xForInstant/instantForX/widthForDuration.

import type { Duration, Instant, TimeSpan, TimeUnit } from '../model/index.js';
import { addDays, addMonths, addYears, toPlain } from './zone.js';
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
  /** Project's IANA timeZone (D6, #37 — one name for this concept, matching plans/02's ProjectOptions). */
  readonly timeZone: string;
  xForInstant(i: Instant): number;
  instantForX(x: number): Instant;
  widthForDuration(d: Duration, at: Instant): number;
  ticks(preset: ViewPreset): readonly Tick[];
}

export interface TimeScaleOptions {
  /** Project's IANA timeZone — calendar-unit stepping (day/week) resolves through it (D6). */
  timeZone: string;
  range: TimeSpan;
  pxPerMs: number;
}

type Stepper = (zone: string, i: Instant, increment: number) => Instant;

/** One source of truth for which units this scale can step by: a unit is supported exactly when it
 * has an entry here. `stepBy` dispatches through it; `ticks()`/`pxPerMsForPreset` check membership —
 * so the two can never disagree (was #32). */
const STEPPERS: Record<TimeUnit, Stepper> = {
  ms: (_zone, i, increment) => addMs(i, increment),
  m: (_zone, i, increment) => addMs(i, increment * MS.MINUTE),
  h: (_zone, i, increment) => addMs(i, increment * MS.HOUR),
  d: (zone, i, increment) => addDays(zone, i, increment),
  w: (zone, i, increment) => addDays(zone, i, increment * 7),
  M: (zone, i, increment) => addMonths(zone, i, increment),
  y: (zone, i, increment) => addYears(zone, i, increment),
};

const SUPPORTED_UNITS = new Set<TimeUnit>(Object.keys(STEPPERS) as TimeUnit[]);

function stepBy(zone: string, i: Instant, unit: TimeUnit, increment: number): Instant {
  const step = STEPPERS[unit];
  if (!step) {
    throw new RangeError(
      `TimeScale: unsupported unit "${unit}" — only ${[...SUPPORTED_UNITS].join(', ')} step today`,
    );
  }
  return step(zone, i, increment);
}

/** Guards ticks() against a misconfigured preset (e.g. zero increment) walking forever. */
const MAX_TICKS = 100_000;

export function createTimeScale(options: TimeScaleOptions): TimeScale {
  const { timeZone, range, pxPerMs } = options;

  function xForInstant(i: Instant): number {
    return (i - range.start) * pxPerMs;
  }

  function instantForX(x: number): Instant {
    return instant(range.start + x / pxPerMs);
  }

  function widthForDuration(d: Duration, at: Instant): number {
    const end = stepBy(timeZone, at, d.unit, d.value);
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
      cursor = stepBy(timeZone, cursor, preset.tickUnit, preset.tickIncrement);
      count++;
    }
    return out;
  }

  return { range, timeZone, xForInstant, instantForX, widthForDuration, ticks };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

const plainDateFormat: HeaderFormat = (i, zone) => {
  const c = toPlain(zone, i);
  return `${c.year}-${pad2(c.month)}-${pad2(c.day)}`;
};

const hourFormat: HeaderFormat = (i, zone) => {
  const c = toPlain(zone, i);
  return `${pad2(c.hour)}:00`;
};

const monthFormat: HeaderFormat = (i, zone) => {
  const c = toPlain(zone, i);
  return `${c.year}-${pad2(c.month)}`;
};

const yearFormat: HeaderFormat = (i, zone) => String(toPlain(zone, i).year);

/** Deep-freezes a preset (and its `headers` array) so a shipped preset is a value, not a shared
 * mutable singleton — one consumer's zoom cannot retune every Gantt on the page (I2). */
function freezePreset(preset: ViewPreset): ViewPreset {
  Object.freeze(preset.headers);
  for (const header of preset.headers) Object.freeze(header);
  return Object.freeze(preset);
}

/** Shipped presets, hour → year (plans/03 S1 scope). Every one is a plain config object — a new zoom
 * level is never a library edit (CONTEXT.md, ViewPreset). */
export const hourPreset: ViewPreset = freezePreset({
  id: 'hour',
  tickUnit: 'h',
  tickIncrement: 1,
  headers: [{ unit: 'h', increment: 1, format: hourFormat }],
  tickWidthPx: 40,
});

export const dayPreset: ViewPreset = freezePreset({
  id: 'day',
  tickUnit: 'd',
  tickIncrement: 1,
  headers: [{ unit: 'd', increment: 1, format: plainDateFormat }],
  tickWidthPx: 24,
});

export const weekPreset: ViewPreset = freezePreset({
  id: 'week',
  tickUnit: 'w',
  tickIncrement: 1,
  headers: [{ unit: 'w', increment: 1, format: plainDateFormat }],
  tickWidthPx: 60,
});

export const monthPreset: ViewPreset = freezePreset({
  id: 'month',
  tickUnit: 'M',
  tickIncrement: 1,
  headers: [{ unit: 'M', increment: 1, format: monthFormat }],
  tickWidthPx: 80,
});

export const yearPreset: ViewPreset = freezePreset({
  id: 'year',
  tickUnit: 'y',
  tickIncrement: 1,
  headers: [{ unit: 'y', increment: 1, format: yearFormat }],
  tickWidthPx: 60,
});

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
