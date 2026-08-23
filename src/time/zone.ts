// Zone-aware civil arithmetic (plans/01 §5, D6). Built on temporal-polyfill's tree-shaken /fns API (see
// plans/04 §1.1) for the actual civil<->instant conversion: its explicit 'compatible' disambiguation gives a
// documented answer for DST fold (ambiguous, e.g. 1:30 AM on the fall-back day — resolves to the earlier
// offset) and gap (nonexistent, e.g. 2:30 AM on the spring-forward day — shifts forward by the gap size)
// civil times, which the previous Intl.DateTimeFormat + fixed-point implementation left undefined.

import type { Instant } from '../model/index.js';
import { instant } from './instant.js';
import * as InstantFns from 'temporal-polyfill/fns/Instant';
import * as PlainDateFns from 'temporal-polyfill/fns/PlainDate';
import * as ZonedDateTimeFns from 'temporal-polyfill/fns/ZonedDateTime';

export interface CivilParts {
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

function toInstant(zdt: ZonedDateTimeFns.Record): Instant {
  return instant(ZonedDateTimeFns.toInstant(zdt).epochMilliseconds);
}

/** The civil (wall-clock) reading of `i` in `zone`. */
export function toCivil(zone: string, i: Instant): CivilParts {
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

/** The instant whose wall-clock reading in `zone` equals `civil` (DST fold/gap resolved via 'compatible'). */
export function fromCivil(zone: string, civil: CivilParts): Instant {
  const zdt = ZonedDateTimeFns.fromFields({ ...civil, timeZone: zone }, { disambiguation: 'compatible' });
  return toInstant(zdt);
}

export function startOfDay(zone: string, i: Instant): Instant {
  return toInstant(ZonedDateTimeFns.startOfDay(toZoned(zone, i)));
}

export function addDays(zone: string, i: Instant, days: number): Instant {
  return toInstant(ZonedDateTimeFns.addDays(toZoned(zone, i), days));
}

/**
 * Whole civil days between two instants' day-starts (DST-correct: not `(b - a) / 86400000`).
 *
 * Goes through PlainDate rather than ZonedDateTime.diffDays: temporal-polyfill@1.0.4's zoned day-unit diff
 * throws ("prepareZonedEpochDiff is not a function") for every zone — a packaging bug in that build, not an
 * environment quirk (reproduces for UTC and DST-observing zones alike). PlainDate.diffDays is unaffected and
 * is exact here since both operands are already civil day-starts.
 */
export function diffDays(zone: string, a: Instant, b: Instant): number {
  const dateA = ZonedDateTimeFns.toPlainDate(ZonedDateTimeFns.startOfDay(toZoned(zone, a)));
  const dateB = ZonedDateTimeFns.toPlainDate(ZonedDateTimeFns.startOfDay(toZoned(zone, b)));
  return PlainDateFns.diffDays(dateA, dateB);
}
