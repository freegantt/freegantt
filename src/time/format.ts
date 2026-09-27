// time/ — human-readable date display (plans/01 §5, S1.10, S1.12). `lastCoveredInstant` is the one
// place half-open `end` becomes an inclusive moment — no `end - 1` anywhere else in the codebase.
// Formatting goes through `Intl.DateTimeFormat` directly, in the dataset zone and a caller-chosen
// locale; `weekOfYear` (zone.ts) is the one thing Intl has no field for.

import type { FormatContext, Instant } from '../model/index.js';
import { toPlain, weekOfYear } from './zone.js';
import { addMs } from './instant.js';
import type { DateFormat, ViewPresetHeader } from './scale.js';

const DEFAULT_DATE_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Date plus clock time. Grid start/end cells use this; `formatDate`'s default stays date-only. */
export const DATE_TIME_FORMAT: Intl.DateTimeFormatOptions = Object.freeze({
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
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
 * sanctioned shape for this (ADR 0007 — see `layout/viewport/time-scale-model.ts`'s `internals`).
 * I2-ok: keyed by the caller's own options object; two Gantts share nothing, only a stateless formatter. */
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
 *  frame is the allocation this cache exists to prevent. A callback `DateFormat` is a Formatter
 *  without the entry, so it passes straight through, curried over `ctx` — a Field's own Formatter
 *  (`formatDateTime`, a custom `dateFormatter(...)`) labels a header band the same way. */
export function resolveDateFormat(format: DateFormat, ctx: FormatContext): (i: Instant) => string {
  if (typeof format === 'function') return (i) => format(i, ctx);
  const formatter = intlFormatter(ctx.timeZone, ctx.locale, format);
  return (i) => formatter.format(toJsDate(i));
}

/** Builds a Formatter for one fixed set of `Intl.DateTimeFormatOptions` — a date, date only, with no
 *  option to tailor at the call. Build it once, outside a `formatValue`: the returned function is a
 *  stable reference, so the `Intl.DateTimeFormat` cache keyed on it (`intlFormatter`) hits every call.
 *  Copies and freezes `options` once, so a caller mutating the object afterward changes nothing.
 *  `''` for a missing value; never throws. */
export function dateFormatter(
  options: Intl.DateTimeFormatOptions,
): (value: unknown, ctx: FormatContext) => string {
  const frozen = Object.freeze({ ...options });
  return (value, ctx) => {
    if (value === undefined || value === null) return '';
    return intlFormatter(ctx.timeZone, ctx.locale, frozen).format(toJsDate(value as Instant));
  };
}

/** A Field `formatValue`: the stored instant, date only, in the dataset zone and the Gantt's locale.
 *  `''` for a missing value. To tailor the shown fields, build a Formatter with `dateFormatter`
 *  (`dateFormatter({ day: '2-digit', month: 'short' })`) instead of calling this with options. */
export const formatDate = Object.freeze(dateFormatter(DEFAULT_DATE_FORMAT));

/** The last moment a half-open span `[start, end)` actually covers — `end` itself is the boundary
 *  after the span, one millisecond past its last covered moment. Instant arithmetic only, so it
 *  takes no time zone: `end − 1 ms` is the same subtraction in every zone.
 *
 *  Takes the whole span, not `end` alone, because a zero-length span (`end === start`) has no
 *  millisecond before its own start to name — `end - 1` there reads as one moment earlier than
 *  `start` (#240). A zero-length span answers its own `end` unchanged instead. `start` may be
 *  absent (no paired start Field value yet); the zero-length check then never fires. */
export function lastCoveredInstant(span: {
  readonly start?: Instant | undefined;
  readonly end: Instant;
}): Instant {
  return span.end === span.start ? span.end : addMs(span.end, -1);
}

/** A Field `formatValue`: the stored moment, date and clock time. A blank cell for no value.
 *  Names the `date` type's default and pairs with `DATE_TIME_FORMAT`. */
export const formatDateTime = Object.freeze(dateFormatter(DATE_TIME_FORMAT));

/** A Field `formatValue`: the last day a span covers, date only. Reads `lastCoveredInstant(entry)`
 *  with `value` standing in for `end` — so `entry.end` never has to be `value` itself, letting a
 *  consumer put this formatter on `start` too, where `value === entry.start` shows the start's own
 *  day. No midnight check and no format sniffing: a timed end still steps back one millisecond and
 *  shows the day that lands on. A blank cell for no value. */
export function formatInclusiveDate(
  value: unknown,
  ctx: FormatContext,
  entry: { readonly start?: Instant | undefined },
): string {
  if (value === undefined || value === null) return '';
  const covered = lastCoveredInstant({ start: entry.start, end: value as Instant });
  return formatDate(covered, ctx);
}

/** An ISO week label — `W` followed by the week number. The escape-hatch callback shipped as a
 *  named value, because Intl has no week field. `''` for a missing value.
 *  Exported from `api/` — unlike the individual preset constants — because a custom-
 *  preset author cannot produce a week number any other way. */
export function formatWeekNumber(value: unknown, ctx: FormatContext): string {
  if (value === undefined || value === null) return '';
  return `W${weekOfYear(ctx.timeZone, value as Instant)}`;
}

/** `9:00`, never `09:00`. The escape-hatch callback for the hour header band: `Intl.DateTimeFormat`
 *  has an `hour` field, but en-US's own CLDR data zero-pads its 24-hour ("h23") numeric pattern —
 *  `{ hour: 'numeric', hour12: false }` still renders "09:00" in that locale, so no combination of
 *  `Intl.DateTimeFormatOptions` gets an unpadded 24-hour clock everywhere (header readability
 *  follow-up to S1.12). Same manual-string-building precedent as `formatWeekNumber` above. `''` for
 *  a missing value. */
export function formatHour(value: unknown, ctx: FormatContext): string {
  if (value === undefined || value === null) return '';
  const { hour, minute } = toPlain(ctx.timeZone, value as Instant);
  return `${hour}:${String(minute).padStart(2, '0')}`;
}

/** Per-`headers`-array memo of `dropRepeatedGranularity`'s result (below) — the stripped
 *  `Intl.DateTimeFormatOptions` objects need one stable identity across frames, or `intlFormatter`'s
 *  own `options`-keyed cache would rebuild an `Intl.DateTimeFormat` every frame instead of once.
 *  I2-ok: keyed by the caller's own headers array; two Gantts share nothing, only a derived memo. */
const repeatedGranularityDropped = new WeakMap<readonly ViewPresetHeader[], readonly DateFormat[]>();

/** A header whose `format` states `year` or `month` shows it to the reader once, at the coarsest
 *  band that states it — a day band under a month band reads "21", not "Sep 21, 2026" (S1.12
 *  follow-up, header readability). `headers` is coarsest first (`ViewPreset.headers`' own order), so
 *  this walks it once, tracking which of `year`/`month` an earlier band already spelled out, and
 *  strips that field from every later band's `format` — unless that band set `repeatCoarserUnits`.
 *  A callback `format` (e.g. `formatWeekNumber`) passes through untouched: only
 *  `Intl.DateTimeFormatOptions` fields are ever inspected. Memoized by `headers`' own identity
 *  (a shipped preset's frozen array, or a caller's stable custom one) — see
 *  `repeatedGranularityDropped`. */
export function dropRepeatedGranularity(headers: readonly ViewPresetHeader[]): readonly DateFormat[] {
  const cached = repeatedGranularityDropped.get(headers);
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

  repeatedGranularityDropped.set(headers, formats);
  return formats;
}
