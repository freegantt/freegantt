// time/ owns the shipped view presets and the one way in to them (plans/01 §5.1, S1.9 D-S1.9-3).
// scale.ts keeps the engine and the shape of a preset; this file is the data — a new zoom level is
// never a library edit (CONTEXT.md, ViewPreset), just a new entry here.

import { UnknownPresetError } from '../model/index.js';
import { toPlain } from './zone.js';
import type { HeaderFormat, ViewPreset } from './scale.js';

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

/** Shipped single-band presets, hour → year (plans/03 S1 scope). Every one is a plain config
 * object — a new zoom level is never a library edit. */
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

/** Shipped two-band presets (S1.9, D-S1.9-3/4). `tickUnit` is never coarser than the last (finest)
 * header: the header bands are what a human reads, `tickUnit` is what the grid gridlines and a
 * future snap-to-tick gesture actually step by, and it must resolve at least as finely as the
 * finest thing labelled, or a label would claim a boundary no gridline draws. */
export const dayAndWeekPreset: ViewPreset = freezePreset({
  id: 'dayAndWeek',
  tickUnit: 'd',
  tickIncrement: 1,
  headers: [
    { unit: 'w', increment: 1, format: plainDateFormat },
    { unit: 'd', increment: 1, format: plainDateFormat },
  ],
  tickWidthPx: 24,
});

export const weekAndMonthPreset: ViewPreset = freezePreset({
  id: 'weekAndMonth',
  tickUnit: 'w',
  tickIncrement: 1,
  headers: [
    { unit: 'M', increment: 1, format: monthFormat },
    { unit: 'w', increment: 1, format: plainDateFormat },
  ],
  tickWidthPx: 60,
});

export const monthAndYearPreset: ViewPreset = freezePreset({
  id: 'monthAndYear',
  tickUnit: 'M',
  tickIncrement: 1,
  headers: [
    { unit: 'y', increment: 1, format: yearFormat },
    { unit: 'M', increment: 1, format: monthFormat },
  ],
  tickWidthPx: 80,
});

export type ShippedPresetId =
  'hour' | 'day' | 'week' | 'month' | 'year' | 'dayAndWeek' | 'weekAndMonth' | 'monthAndYear';

export const presets: Readonly<Record<ShippedPresetId, ViewPreset>> = Object.freeze({
  hour: hourPreset,
  day: dayPreset,
  week: weekPreset,
  month: monthPreset,
  year: yearPreset,
  dayAndWeek: dayAndWeekPreset,
  weekAndMonth: weekAndMonthPreset,
  monthAndYear: monthAndYearPreset,
});

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
