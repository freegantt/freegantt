// time/ — human-readable date display (plans/01 §5, S1.10, S1.12). `formatEndInclusive` is the one
// place half-open `end` becomes an inclusive display value — no `end - 1` anywhere else in the
// codebase. Formatting goes through `Intl.DateTimeFormat` directly, in the dataset zone and a
// caller-chosen locale (D-S1.12-11); `weekOfYear` (zone.ts) is the one thing Intl has no field for.

import type { Instant } from '../model/index.js';
import { toPlain, weekOfYear } from './zone.js';
import { addMs } from './instant.js';
import type { DateFormat, HeaderFormat, ViewPresetHeader } from './scale.js';

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Formats a millisecond epoch (an `Instant`'s underlying value) in `zone` for `Intl.DateTimeFormat` —
 * the formatter takes a `Date`, so this is the one legal `new Date()`-adjacent conversion here (I10
 * scopes the ban to arithmetic and `Date.now()`, not to handing an already-resolved instant to Intl). */
function toJsDate(i: Instant): Date {
  return new Date(i);
}

/** `Intl.DateTimeFormat` instances are immutable once built, so caching one per `(options, zone,
 * locale)` shares no mutable state across Gantt instances (I2) — it only avoids rebuilding an
 * equivalent, stateless formatter. Keyed by the `options` object's own identity (frozen preset
 * headers and a caller's own literal are both stable references), nested under a zone/locale string
 * so two Gantts sharing one preset but different locales never collide. Module-level `WeakMap` is the
 * sanctioned shape for this (ADR 0007 — see `layout/viewport/time-scale-model.ts`'s `internals`). */
const formatterCache = new WeakMap<Intl.DateTimeFormatOptions, Map<string, Intl.DateTimeFormat>>();

function intlFormatter(
  zone: string,
  locale: Intl.LocalesArgument,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  let byZoneLocale = formatterCache.get(options);
  if (!byZoneLocale) {
    byZoneLocale = new Map<string, Intl.DateTimeFormat>();
    formatterCache.set(options, byZoneLocale);
  }
  const localeKey =
    typeof locale === 'string' || locale == null ? String(locale ?? '') : JSON.stringify(locale);
  const key = `${zone} ${localeKey}`;
  let formatter = byZoneLocale.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: zone });
    byZoneLocale.set(key, formatter);
  }
  return formatter;
}

/** An `Intl.DateTimeFormat` per (locale, zone, options), memoized — constructing one per tick per
 *  frame is the allocation this cache exists to prevent. A `HeaderFormat` callback passes straight
 *  through, curried over `zone`/`locale`, so both `DateFormat` shapes resolve to the same call shape. */
export function resolveDateFormat(
  format: DateFormat,
  zone: string,
  locale: Intl.LocalesArgument | undefined,
): (i: Instant) => string {
  if (typeof format === 'function') return (i) => format(i, zone, locale);
  const formatter = intlFormatter(zone, locale, format);
  return (i) => formatter.format(toJsDate(i));
}

/** Plain display formatting for an instant needing no conversion — a start is already inclusive. */
export function formatDate(zone: string, i: Instant, locale?: Intl.LocalesArgument): string {
  return intlFormatter(zone, locale, DEFAULT_DATE_FORMAT).format(toJsDate(i));
}

/** The one place half-open `end` becomes an inclusive display value: the last millisecond the span
 * actually covers, read back through the dataset zone. No `end - 1` anywhere else in the codebase
 * (plans/01 §5, promised since S0). */
export function formatEndInclusive(zone: string, end: Instant, locale?: Intl.LocalesArgument): string {
  return formatDate(zone, addMs(end, -1), locale);
}

/** `W37`. The escape-hatch callback shipped as a named value, because Intl has no week field
 *  (D-S1.12-13). Exported from `api/` — unlike the individual preset constants — because a custom-
 *  preset author cannot produce a week number any other way. */
export const formatWeekNumber: HeaderFormat = (i, zone) => `W${weekOfYear(zone, i)}`;

/** `9:00`, never `09:00`. The escape-hatch callback for the hour header band: `Intl.DateTimeFormat`
 *  has an `hour` field, but en-US's own CLDR data zero-pads its 24-hour ("h23") numeric pattern —
 *  `{ hour: 'numeric', hour12: false }` still renders "09:00" in that locale, so no combination of
 *  `Intl.DateTimeFormatOptions` gets an unpadded 24-hour clock everywhere (header readability
 *  follow-up to S1.12). Same manual-string-building precedent as `formatWeekNumber` above. */
export const formatHour: HeaderFormat = (i, zone) => {
  const { hour, minute } = toPlain(zone, i);
  return `${hour}:${String(minute).padStart(2, '0')}`;
};

/** Per-`headers`-array memo of `dedupeHeaderFormats`'s result (below) — the stripped
 *  `Intl.DateTimeFormatOptions` objects need one stable identity across frames, or `intlFormatter`'s
 *  own `options`-keyed cache would rebuild an `Intl.DateTimeFormat` every frame instead of once. */
const dedupedHeaderFormats = new WeakMap<readonly ViewPresetHeader[], readonly DateFormat[]>();

/** A header whose `format` states `year` or `month` shows it to the reader once, at the coarsest
 *  band that states it — a day band under a month band reads "21", not "Sep 21, 2026" (S1.12
 *  follow-up, header readability). `headers` is coarsest first (`ViewPreset.headers`' own order), so
 *  this walks it once, tracking which of `year`/`month` an earlier band already spelled out, and
 *  strips that field from every later band's `format` — unless that band set `repeatCoarserUnits`.
 *  A callback `format` (e.g. `formatWeekNumber`) passes through untouched: only
 *  `Intl.DateTimeFormatOptions` fields are ever inspected. Memoized by `headers`' own identity
 *  (a shipped preset's frozen array, or a caller's stable custom one) — see `dedupedHeaderFormats`. */
export function dedupeHeaderFormats(headers: readonly ViewPresetHeader[]): readonly DateFormat[] {
  const cached = dedupedHeaderFormats.get(headers);
  if (cached) return cached;

  const shownByEarlierBand = new Set<'year' | 'month'>();
  const formats = headers.map((header): DateFormat => {
    if (typeof header.format === 'function') return header.format;

    const strip = !header.repeatCoarserUnits
      ? { year: shownByEarlierBand.has('year'), month: shownByEarlierBand.has('month') }
      : { year: false, month: false };

    if (header.format.year !== undefined) shownByEarlierBand.add('year');
    if (header.format.month !== undefined) shownByEarlierBand.add('month');
    if (!strip.year && !strip.month) return header.format;

    const effective = { ...header.format };
    if (strip.year) delete effective.year;
    if (strip.month) delete effective.month;
    return effective;
  });

  dedupedHeaderFormats.set(headers, formats);
  return formats;
}
