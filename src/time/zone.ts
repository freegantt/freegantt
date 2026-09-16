// Zone-aware date arithmetic (plans/01 §5, D6). Built on temporal-polyfill's tree-shaken /fns API (see
// plans/04 §1.1) for the actual plain<->instant conversion: its explicit 'compatible' disambiguation gives a
// documented answer for DST fold (ambiguous, e.g. 1:30 AM on the fall-back day — resolves to the earlier
// offset) and gap (nonexistent, e.g. 2:30 AM on the spring-forward day — shifts forward by the gap size)
// plain times, which the previous Intl.DateTimeFormat + fixed-point implementation left undefined.
//
// "Plain" = a wall-clock reading with no zone attached, so it names no single instant until a zone resolves
// it. The word is Temporal's own (PlainDate, PlainDateTime), which is what this module will become when
// native Temporal ships. See CONTEXT.md.

import type { Instant, PlainParts, TimeSpan, TimeUnit } from '../model/index.js';
import { UnsupportedUnitError } from '../model/index.js';
import { instant, addMs, MS } from './instant.js';
import * as InstantFns from 'temporal-polyfill/fns/Instant';
import * as PlainDateFns from 'temporal-polyfill/fns/PlainDate';
import * as ZonedDateTimeFns from 'temporal-polyfill/fns/ZonedDateTime';

/** Resolves the environment's own IANA zone (#129) — the one place `Intl` is read for this purpose
 *  (I10). A browser always reports one; a bare-Node/test environment that reports nothing falls
 *  back to `'UTC'` rather than throwing, so `new Dataset({ entries })` never requires an explicit
 *  `timeZone` just to run under Vitest. Called once, at `Dataset` construction — the resolved
 *  string is what gets stored, never a `'local'` token. */
export function resolveDefaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** The plain wall-clock shape is `model/` vocabulary, not zone machinery, so it is declared there
 *  and re-exported here — one name, one concept (#144). `extensions/` may import `model/` but not
 *  `time/` (D-S5-5), which is why the declaration has to sit on that side. */
export type { PlainParts };

function toZoned(zone: string, i: Instant): ZonedDateTimeFns.Record {
  return InstantFns.toZonedDateTimeISO(InstantFns.fromEpochMilliseconds(i), zone);
}

function fromZoned(zdt: ZonedDateTimeFns.Record): Instant {
  return instant(ZonedDateTimeFns.toInstant(zdt).epochMilliseconds);
}

/** The plain (wall-clock) reading of `i` in `zone`. */
export function toPlain(zone: string, i: Instant): PlainParts {
  const zdt = toZoned(zone, i);
  return {
    year: zdt.year,
    month: zdt.month,
    day: zdt.day,
    hour: zdt.hour,
    minute: zdt.minute,
    second: zdt.second,
    dayOfWeek: ZonedDateTimeFns.dayOfWeek(zdt),
  };
}

/** ISO day of week of `i` in `zone`: 1 = Monday … 7 = Sunday (D-S5-16). */
export function dayOfWeek(zone: string, i: Instant): number {
  return ZonedDateTimeFns.dayOfWeek(toZoned(zone, i));
}

/** The instant whose wall-clock reading in `zone` equals `plain` (DST fold/gap resolved via 'compatible'). */
export function fromPlain(zone: string, plain: PlainParts): Instant {
  const zdt = ZonedDateTimeFns.fromFields({ ...plain, timeZone: zone }, { disambiguation: 'compatible' });
  return fromZoned(zdt);
}

export function startOfDay(zone: string, i: Instant): Instant {
  return fromZoned(ZonedDateTimeFns.startOfDay(toZoned(zone, i)));
}

/** ISO week number (1-53) of `i` in `zone` (D-S1.12-13). `Intl.DateTimeFormatOptions` has no week
 * field, so this is the one thing formatting still reaches the polyfill for directly. The polyfill
 * types this `| undefined` for calendars with no week numbering; `toZoned` always builds an ISO
 * calendar reading, which always has one. */
export function weekOfYear(zone: string, i: Instant): number {
  return ZonedDateTimeFns.weekOfYear(toZoned(zone, i))!;
}

export function addDays(zone: string, i: Instant, days: number): Instant {
  return fromZoned(ZonedDateTimeFns.addDays(toZoned(zone, i), days));
}

/** Each `unit` boundary in `[span.start, span.end)`, ascending, in `zone`. Floors to the first
 * boundary at or after `span.start`, then steps by `unit` until it reaches `span.end` — the walk
 * `eachDay` already did for `'day'`, generalised to every unit `stepBy`/`startOf` support (the #404
 * prerequisite: `every` above `'day'` needs this same walk, not a day-only one). */
export function eachUnit(zone: string, span: TimeSpan, unit: TimeUnit): readonly Instant[] {
  const boundaries: Instant[] = [];
  let cursor = startOf(zone, span.start, unit);
  if (cursor < span.start) cursor = stepBy(zone, cursor, unit, 1);
  while (cursor < span.end) {
    boundaries.push(cursor);
    cursor = stepBy(zone, cursor, unit, 1);
  }
  return boundaries;
}

/** Each day boundary in `[span.start, span.end)`, ascending, in `zone` (D-S5-16). Delegates to
 * `eachUnit` with `'day'`, so the two walks can never disagree. */
export function eachDay(zone: string, span: TimeSpan): readonly Instant[] {
  return eachUnit(zone, span, 'day');
}

/** Calendar-month stepping (e.g. Jan 31 + 1 month clamps to Feb 28/29, per Temporal's default 'constrain'). */
export function addMonths(zone: string, i: Instant, months: number): Instant {
  return fromZoned(ZonedDateTimeFns.addMonths(toZoned(zone, i), months));
}

/** Calendar-year stepping (leap-day clamps the same way as addMonths). */
export function addYears(zone: string, i: Instant, years: number): Instant {
  return fromZoned(ZonedDateTimeFns.addYears(toZoned(zone, i), years));
}

/**
 * Whole calendar days between two instants' day-starts (DST-correct: not `(b - a) / 86400000`).
 *
 * Goes through PlainDate rather than ZonedDateTime.diffDays: temporal-polyfill@1.0.4's zoned day-unit diff
 * throws ("prepareZonedEpochDiff is not a function") for every zone — a packaging bug in that build, not an
 * environment quirk (reproduces for UTC and DST-observing zones alike). PlainDate.diffDays is unaffected and
 * is exact here since both operands are already calendar day-starts.
 */
export function diffDays(zone: string, a: Instant, b: Instant): number {
  const dateA = ZonedDateTimeFns.toPlainDate(ZonedDateTimeFns.startOfDay(toZoned(zone, a)));
  const dateB = ZonedDateTimeFns.toPlainDate(ZonedDateTimeFns.startOfDay(toZoned(zone, b)));
  return PlainDateFns.diffDays(dateA, dateB);
}

type Stepper = (zone: string, i: Instant, increment: number) => Instant;
type Floor = (zone: string, i: Instant) => Instant;

interface UnitOps {
  readonly step: Stepper;
  readonly floor: Floor;
}

/** One source of truth for which units time/ can step by and floor to: a unit is supported exactly
 * when it has an entry here (S1.7 §3.3, #32's "one list" fix carried forward from time/scale.ts).
 * `stepBy`/`startOf` both dispatch through it, so the two can never disagree on what's supported. */
const UNITS: Record<TimeUnit, UnitOps> = Object.freeze({
  millisecond: {
    step: (_zone, i, increment) => addMs(i, increment),
    floor: (_zone, i) => i,
  },
  minute: {
    step: (_zone, i, increment) => addMs(i, increment * MS.MINUTE),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfMinute(toZoned(zone, i))),
  },
  hour: {
    step: (_zone, i, increment) => addMs(i, increment * MS.HOUR),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfHour(toZoned(zone, i))),
  },
  day: {
    step: (zone, i, increment) => addDays(zone, i, increment),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfDay(toZoned(zone, i))),
  },
  week: {
    step: (zone, i, increment) => addDays(zone, i, increment * 7),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfWeek(toZoned(zone, i))),
  },
  month: {
    step: (zone, i, increment) => addMonths(zone, i, increment),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfMonth(toZoned(zone, i))),
  },
  year: {
    step: (zone, i, increment) => addYears(zone, i, increment),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfYear(toZoned(zone, i))),
  },
});

export const SUPPORTED_TIME_UNITS = Object.freeze(new Set<TimeUnit>(Object.keys(UNITS) as TimeUnit[]));

/** Call: `isTimeUnit(value)` — true when `value` names a unit `time/` can step by. The public,
 *  narrowing form of `SUPPORTED_TIME_UNITS`, for a consumer validating a raw string (a `<select>`'s
 *  value, a saved preference) before it reaches `gantt.snap` or a `ViewPreset` (#201). */
export function isTimeUnit(value: string): value is TimeUnit {
  return SUPPORTED_TIME_UNITS.has(value as TimeUnit);
}

/** `UNITS`' own declaration order, coarsest last — pinned by a test (`zone.test.ts`) rather than
 *  trusted, since nothing about `Object.freeze` guarantees a reader keeps it sorted. `isCoarserThan`
 *  reads this instead of re-deriving an order of its own, so the two can never disagree. */
const UNIT_RANK: Record<TimeUnit, number> = Object.freeze(
  Object.fromEntries((Object.keys(UNITS) as TimeUnit[]).map((unit, index) => [unit, index])) as Record<
    TimeUnit,
    number
  >,
);

/** Call: `isCoarserThan(tickUnit, 'day')` — true when `unit` groups a wider calendar span than
 *  `than` (`isCoarserThan('week', 'day')` is `true`; `isCoarserThan('day', 'day')` is `false`).
 *  For a plugin author asking "is this tick too coarse to draw per-day decoration?" without
 *  building its own rank table over `TimeUnit` (#268).
 *
 *  This is **calendar-nesting order, not duration order**: a month is coarser than a week because
 *  every month's days group into it, not because a month spans more milliseconds than four weeks
 *  always would (it doesn't). That distinction is harmless for a granularity-floor question like the
 *  one above, and wrong the moment someone reaches for this to do arithmetic — `time/` exists to
 *  keep that kind of arithmetic out of the caller's hands (`plans/01` §5, I10), so reach for
 *  `stepBy`/`diffDays` there instead. */
export function isCoarserThan(unit: TimeUnit, than: TimeUnit): boolean {
  return UNIT_RANK[unit] > UNIT_RANK[than];
}

function unsupportedUnit(unit: TimeUnit): UnsupportedUnitError {
  return new UnsupportedUnitError(unit, 'time');
}

export function stepBy(zone: string, i: Instant, unit: TimeUnit, increment: number): Instant {
  const ops = UNITS[unit];
  if (!ops) throw unsupportedUnit(unit);
  return ops.step(zone, i, increment);
}

/** Floors `i` to `unit`'s boundary in `zone` (S1.7 §3.3) — the boundary `TimeScale.ticks` aligns
 * its cells to. */
export function startOf(zone: string, i: Instant, unit: TimeUnit): Instant {
  const ops = UNITS[unit];
  if (!ops) throw unsupportedUnit(unit);
  return ops.floor(zone, i);
}
