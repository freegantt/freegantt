// time/ owns the shipped view presets and the one way in to them (plans/01 §5.1, S1.9 D-S1.9-3).
// scale.ts keeps the engine and the shape of a preset; this file is the data — a new zoom level is
// never a library edit (CONTEXT.md, ViewPreset), just a new entry here. Every shipped band's `format`
// is an `Intl.DateTimeFormatOptions` object (S1.12, D-S1.12-11) except `formatWeekNumber`, the one
// escape-hatch callback Intl has no field for.

import { UnknownPresetError } from '../model/index.js';
import { formatWeekNumber } from './format.js';
import type { ViewPreset } from './scale.js';

const HOUR_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const DAY_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
const MONTH_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ year: 'numeric', month: 'short' });
const YEAR_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({ year: 'numeric' });

/** Deep-freezes a preset (and its `headers` array) so a shipped preset is a value, not a shared
 * mutable singleton — one consumer's zoom cannot retune every Gantt on the page (I2). */
function freezePreset(preset: ViewPreset): ViewPreset {
  Object.freeze(preset.headers);
  for (const header of preset.headers) Object.freeze(header);
  return Object.freeze(preset);
}

/** Shipped single-band presets, hour → year (plans/03 S1 scope). Every one is a plain config
 * object — a new zoom level is never a library edit. */
export const hourPreset: ViewPreset = freezePreset({
  id: 'hour',
  tickUnit: 'hour',
  tickIncrement: 1,
  headers: [{ unit: 'hour', increment: 1, format: HOUR_FORMAT }],
  preferredTickWidthPx: 40,
  minTickWidthPx: 24,
});

export const dayPreset: ViewPreset = freezePreset({
  id: 'day',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [{ unit: 'day', increment: 1, format: DAY_FORMAT }],
  preferredTickWidthPx: 24,
  // S1.12, D-S1.12-3: below 32px a day tick's label is not legible; the shipped sample fixture
  // (72 days in a ~900px pane) resolves to ~12px/day pre-floor and scrolls at 32px/day after.
  minTickWidthPx: 32,
});

export const weekPreset: ViewPreset = freezePreset({
  id: 'week',
  tickUnit: 'week',
  tickIncrement: 1,
  headers: [{ unit: 'week', increment: 1, format: DAY_FORMAT }],
  preferredTickWidthPx: 60,
  minTickWidthPx: 40,
});

export const monthPreset: ViewPreset = freezePreset({
  id: 'month',
  tickUnit: 'month',
  tickIncrement: 1,
  headers: [{ unit: 'month', increment: 1, format: MONTH_FORMAT }],
  preferredTickWidthPx: 80,
  minTickWidthPx: 50,
});

export const yearPreset: ViewPreset = freezePreset({
  id: 'year',
  tickUnit: 'year',
  tickIncrement: 1,
  headers: [{ unit: 'year', increment: 1, format: YEAR_FORMAT }],
  preferredTickWidthPx: 60,
  minTickWidthPx: 40,
});

/** Shipped two-band presets (S1.9, D-S1.9-3/4). `tickUnit` is never coarser than the last (finest)
 * header: the header bands are what a human reads, `tickUnit` is what the grid gridlines and a
 * future snap-to-tick gesture actually step by, and it must resolve at least as finely as the
 * finest thing labelled, or a label would claim a boundary no gridline draws. */
export const dayAndWeekPreset: ViewPreset = freezePreset({
  id: 'dayAndWeek',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [
    { unit: 'week', increment: 1, format: DAY_FORMAT },
    { unit: 'day', increment: 1, format: DAY_FORMAT },
  ],
  preferredTickWidthPx: 24,
  minTickWidthPx: 32,
});

export const weekAndMonthPreset: ViewPreset = freezePreset({
  id: 'weekAndMonth',
  tickUnit: 'week',
  tickIncrement: 1,
  headers: [
    { unit: 'month', increment: 1, format: MONTH_FORMAT },
    { unit: 'week', increment: 1, format: DAY_FORMAT },
  ],
  preferredTickWidthPx: 60,
  minTickWidthPx: 40,
});

export const monthAndYearPreset: ViewPreset = freezePreset({
  id: 'monthAndYear',
  tickUnit: 'month',
  tickIncrement: 1,
  headers: [
    { unit: 'year', increment: 1, format: YEAR_FORMAT },
    { unit: 'month', increment: 1, format: MONTH_FORMAT },
  ],
  preferredTickWidthPx: 80,
  minTickWidthPx: 50,
});

/** Three-band presets (S1.12, D-S1.12-3 §3.2). */
export const hourDayWeekPreset: ViewPreset = freezePreset({
  id: 'hourDayWeek',
  tickUnit: 'hour',
  tickIncrement: 1,
  headers: [
    { unit: 'week', increment: 1, format: DAY_FORMAT },
    { unit: 'day', increment: 1, format: DAY_FORMAT },
    { unit: 'hour', increment: 1, format: HOUR_FORMAT },
  ],
  preferredTickWidthPx: 40,
  minTickWidthPx: 24,
});

export const dayWeekMonthPreset: ViewPreset = freezePreset({
  id: 'dayWeekMonth',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [
    { unit: 'month', increment: 1, format: MONTH_FORMAT },
    { unit: 'week', increment: 1, format: formatWeekNumber },
    { unit: 'day', increment: 1, format: DAY_FORMAT },
  ],
  preferredTickWidthPx: 32,
  minTickWidthPx: 20,
});

export const weekMonthYearPreset: ViewPreset = freezePreset({
  id: 'weekMonthYear',
  tickUnit: 'week',
  tickIncrement: 1,
  headers: [
    { unit: 'year', increment: 1, format: YEAR_FORMAT },
    { unit: 'month', increment: 1, format: MONTH_FORMAT },
    { unit: 'week', increment: 1, format: formatWeekNumber },
  ],
  preferredTickWidthPx: 64,
  minTickWidthPx: 40,
});

export type ShippedPresetId =
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'dayAndWeek'
  | 'weekAndMonth'
  | 'monthAndYear'
  | 'hourDayWeek'
  | 'dayWeekMonth'
  | 'weekMonthYear';

export const presets: Readonly<Record<ShippedPresetId, ViewPreset>> = Object.freeze({
  hour: hourPreset,
  day: dayPreset,
  week: weekPreset,
  month: monthPreset,
  year: yearPreset,
  dayAndWeek: dayAndWeekPreset,
  weekAndMonth: weekAndMonthPreset,
  monthAndYear: monthAndYearPreset,
  hourDayWeek: hourDayWeekPreset,
  dayWeekMonth: dayWeekMonthPreset,
  weekMonthYear: weekMonthYearPreset,
});

/** The `ViewPresets` `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). */
export const ZOOM_PRESETS: readonly ViewPreset[] = Object.freeze([
  hourPreset,
  hourDayWeekPreset,
  dayPreset,
  dayAndWeekPreset,
  dayWeekMonthPreset,
  weekAndMonthPreset,
  weekMonthYearPreset,
  monthAndYearPreset,
  yearPreset,
]);

/** A caller states either a shipped id (autocompletes) or a full custom object — never a bare
 * string with no closed set behind it (fix-issue1-apis.md Design #11). */
export type PresetRef = ShippedPresetId | ViewPreset;

/** Throws `UnknownPresetError` for an id outside `presets`. A `ViewPreset` object passes through
 * unchanged — a custom preset is never a library edit. */
export function resolvePreset(ref: PresetRef): ViewPreset {
  if (typeof ref !== 'string') return ref;
  const preset = presets[ref];
  if (!preset) throw new UnknownPresetError(ref);
  return preset;
}
