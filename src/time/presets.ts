// time/ owns the shipped view presets and the one way in to them (plans/01 §5.1, S1.9 D-S1.9-3).
// scale.ts keeps the engine and the shape of a preset; this file is the data — a new zoom level is
// never a library edit (CONTEXT.md, ViewPreset), just a new entry here. Every shipped band's `format`
// is an `Intl.DateTimeFormatOptions` object (S1.12, D-S1.12-11) except `formatWeekNumber` and
// `formatHour`, the escape-hatch callbacks Intl has no reliable field for.

import { InvalidPresetError, UnknownPresetError } from '../model/index.js';
import { formatHour, formatWeekNumber } from './format.js';
import { isCoarserStep } from './zone.js';
import type { ViewPreset } from './scale.js';

/** `minTickWidthPx` is the density floor below which a preset's labels stop being legible;
 * `preferredTickWidthPx` is the zoom the preset resolves to with nothing else deciding (D-S1.12-2,
 * `pxPerMsForPreset`/`minPxPerMsForPreset`). A floor above the preset's own preferred density is
 * unreachable at that density and can only be an authoring mistake — caught here for both shipped
 * presets (`freezePreset`, at module load) and custom ones (`resolvePreset`, at first use), so a
 * future preset edit can't silently reintroduce the header-readability follow-up's finding 5 (a
 * min/preferred mismatch shipped as `dayAndWeekPreset: { preferredTickWidthPx: 24, minTickWidthPx:
 * 32 }` until this check caught it). */
function validatePresetTickWidths(preset: ViewPreset, operation: string): void {
  if (preset.minTickWidthPx !== undefined && preset.minTickWidthPx > preset.preferredTickWidthPx) {
    throw new InvalidPresetError(
      preset.id,
      `sets minTickWidthPx to ${preset.minTickWidthPx}, above its own preferredTickWidthPx of ` +
        `${preset.preferredTickWidthPx}. Lower minTickWidthPx to ${preset.preferredTickWidthPx} or ` +
        'less, so the preset can reach its own preferred zoom.',
      operation,
    );
  }
}

/** `tickUnit`/`tickIncrement` drive the grid lines and a future snap-to-tick gesture; the finest
 * (last) header band is what a human reads. A tick step coarser than that band draws a grid the
 * header disagrees with — a `day × 10` grid under a `week × 1` header spans more time per line than
 * the header it labels, whatever the two units are. Checked at the same two sites as the width rule,
 * for the same reason (header readability follow-up, finding 5): a shipped preset already broke a
 * trust like this once. `isCoarserStep` (T1/#481) compares the two steps by real span, not by unit
 * alone — comparing units alone let a `48-hour` tick pass under a `1-day` header, and refused a
 * `week × 1` tick under a `day × 14` header, both wrong. Empty `headers` has no band to compare
 * against, so it passes (`frame.ts` already handles a bandless preset). */
function validatePresetTickStep(preset: ViewPreset, operation: string): void {
  const finestHeader = preset.headers[preset.headers.length - 1];
  if (!finestHeader) return;
  if (isCoarserStep({ unit: preset.tickUnit, increment: preset.tickIncrement }, finestHeader)) {
    throw new InvalidPresetError(
      preset.id,
      `sets tickUnit/tickIncrement to ${preset.tickIncrement} × "${preset.tickUnit}", coarser than its ` +
        `finest header's ${finestHeader.increment} × "${finestHeader.unit}". Lower tickUnit/tickIncrement so ` +
        'the grid never draws coarser than the header it labels.',
      operation,
    );
  }
}

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
  // A shipped preset's own id, checked at module load against the library's own data — never a
  // consumer door, so this operation name is diagnostic only, for the report a shipped preset
  // failing its own rule would need.
  validatePresetTickWidths(preset, 'time/presets (shipped preset)');
  validatePresetTickStep(preset, 'time/presets (shipped preset)');
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
  headers: [{ unit: 'hour', increment: 1, format: formatHour }],
  preferredTickWidthPx: 56,
  // Below 48px "23:00" clips or overlaps its neighbour (measured at a 12px tick label — header
  // readability follow-up to S1.12).
  minTickWidthPx: 48,
});

export const dayPreset: ViewPreset = freezePreset({
  id: 'day',
  tickUnit: 'day',
  tickIncrement: 1,
  headers: [{ unit: 'day', increment: 1, format: DAY_FORMAT }],
  preferredTickWidthPx: 112,
  // S1.12, D-S1.12-3, revised (header readability follow-up): a lone day band's label is the full
  // "Sep 21, 2026" — nothing coarser above it to drop granularity against — and that clips below
  // 96px at a 12px tick label. Multi-band presets below don't need this much:
  // `dropRepeatedGranularity` leaves their day band showing only the day number once a coarser band
  // already states the month/year.
  minTickWidthPx: 96,
});

export const weekPreset: ViewPreset = freezePreset({
  id: 'week',
  tickUnit: 'week',
  tickIncrement: 1,
  headers: [{ unit: 'week', increment: 1, format: DAY_FORMAT }],
  preferredTickWidthPx: 120,
  // Same full-date label as `dayPreset`, same floor (header readability follow-up).
  minTickWidthPx: 96,
});

export const monthPreset: ViewPreset = freezePreset({
  id: 'month',
  tickUnit: 'month',
  tickIncrement: 1,
  headers: [{ unit: 'month', increment: 1, format: MONTH_FORMAT }],
  preferredTickWidthPx: 80,
  // "Sep 2026" clips below 72px at a 12px tick label (header readability follow-up).
  minTickWidthPx: 72,
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
  // preferredTickWidthPx must stay >= minTickWidthPx (validatePresetTickWidths) — this was 24 (below
  // its own 32px floor) until the header readability follow-up caught it.
  preferredTickWidthPx: 32,
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
    { unit: 'hour', increment: 1, format: formatHour },
  ],
  preferredTickWidthPx: 56,
  // Floors the hour band exactly like `hourPreset` — the week/day bands above it drop repeated
  // granularity (year/month) and stay legible at far less width (header readability follow-up).
  minTickWidthPx: 48,
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
  // The day band drops its repeated granularity to a bare day number under the month band above it —
  // "21" needs far less room than a full date (header readability follow-up).
  minTickWidthPx: 28,
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

/** Throws `UnknownPresetError` for an id outside `presets`, or `InvalidPresetError` for a custom
 * `ViewPreset` object that breaks a rule between its own fields. A `ViewPreset` object otherwise
 * passes through unchanged — a custom preset is never a library edit.
 *
 * `operation` is the door the caller reached this through (`gantt.preset`, `gantt.zoomPresets`, a
 * shared `TimeScaleModel`'s own `preset`) — every caller must state its own, so `InvalidPresetError`
 * always names the surface the consumer actually wrote (C3/#482 review). */
export function resolvePreset(ref: PresetRef, operation: string): ViewPreset {
  if (typeof ref !== 'string') {
    validatePresetTickWidths(ref, operation);
    validatePresetTickStep(ref, operation);
    return ref;
  }
  const preset = presets[ref];
  if (!preset) throw new UnknownPresetError(ref, Object.keys(presets));
  return preset;
}
