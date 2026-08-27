// Zone-aware date arithmetic (plans/01 §5, D6). Built on temporal-polyfill's tree-shaken /fns API (see
// plans/04 §1.1) for the actual plain<->instant conversion: its explicit 'compatible' disambiguation gives a
// documented answer for DST fold (ambiguous, e.g. 1:30 AM on the fall-back day — resolves to the earlier
// offset) and gap (nonexistent, e.g. 2:30 AM on the spring-forward day — shifts forward by the gap size)
// plain times, which the previous Intl.DateTimeFormat + fixed-point implementation left undefined.
//
// "Plain" = a wall-clock reading with no zone attached, so it names no single instant until a zone resolves
// it. The word is Temporal's own (PlainDate, PlainDateTime), which is what this module will become when
// native Temporal ships. See CONTEXT.md.

import type { Instant, TimeUnit } from '../model/index.js';
import { UnsupportedUnitError } from '../model/index.js';
import { instant, addMs, MS } from './instant.js';
import * as InstantFns from 'temporal-polyfill/fns/Instant';
import * as PlainDateFns from 'temporal-polyfill/fns/PlainDate';
import * as ZonedDateTimeFns from 'temporal-polyfill/fns/ZonedDateTime';

export interface PlainParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

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
  };
}

/** The instant whose wall-clock reading in `zone` equals `plain` (DST fold/gap resolved via 'compatible'). */
export function fromPlain(zone: string, plain: PlainParts): Instant {
  const zdt = ZonedDateTimeFns.fromFields({ ...plain, timeZone: zone }, { disambiguation: 'compatible' });
  return fromZoned(zdt);
}

export function startOfDay(zone: string, i: Instant): Instant {
  return fromZoned(ZonedDateTimeFns.startOfDay(toZoned(zone, i)));
}

export function addDays(zone: string, i: Instant, days: number): Instant {
  return fromZoned(ZonedDateTimeFns.addDays(toZoned(zone, i), days));
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
const UNITS: Record<TimeUnit, UnitOps> = {
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
};

export const SUPPORTED_TIME_UNITS = new Set<TimeUnit>(Object.keys(UNITS) as TimeUnit[]);

function unsupportedUnit(unit: TimeUnit): UnsupportedUnitError {
  return new UnsupportedUnitError(
    `time: unsupported unit "${unit}" — only ${[...SUPPORTED_TIME_UNITS].join(', ')} step today`,
  );
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
