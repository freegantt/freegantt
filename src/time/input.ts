// Reading consumer-written time values (plans/01 §5). This is the one place a loose `InstantInput` —
// what a consumer writes — becomes an `Instant` — what the library stores.
//
// It lives in time/ rather than at the api/ boundary for two reasons. Resolving a Plain time (a
// wall-clock reading with no zone, CONTEXT.md) needs the Dataset's zone and the DST fold/gap policy
// that only zone.ts has. And advancing a date-only `end` by one day is itself zone-aware arithmetic
// — "a day" is not always 86,400,000 ms — which CLAUDE.md confines to this layer (I10). api/ maps
// fields; it never does date math of its own.

import type { Instant, InstantInput, PlainTimeInput } from '../model/index.js';
import { InvalidPlainTimeError } from '../model/index.js';
import { addMs, instant } from './instant.js';
import { startOfNextDay } from './date-only-end.js';
import { invalidInstant as invalid } from './instant-fault.js';
import { fromPlain, toPlain } from './zone.js';

/** A calendar date with no time of day — `'2026-09-08'`. */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A wall-clock time of day with no date — `'17:00'` or `'17:00:00'`. */
const PLAIN_TIME = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** A Plain date-time: a date and a wall-clock time, carrying no `Z` and no numeric offset. Seconds
 * and a fractional second are both optional; the separator may be `T` or a space. */
const PLAIN_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/** Whether `input` names a calendar date and nothing finer. Only a string can: a `Date` and a
 * `number` always carry a time of day. */
function isDateOnly(input: InstantInput): boolean {
  return typeof input === 'string' && DATE_ONLY.test(input);
}

/**
 * The Instant a Plain string names in `zone`, or `undefined` if the string is not a Plain one.
 *
 * Rejects a date the calendar does not have (`'2026-02-31'`) by reading the result back: Temporal
 * constrains an out-of-range field rather than throwing, so a silent slide to Feb 28 is the failure
 * mode to catch. Only the date is compared — a Plain time inside a DST gap legitimately shifts its
 * hour, and that is a resolution, not an error.
 */
function fromPlainString(zone: string, value: string, operation: string): Instant | undefined {
  const parts = DATE_ONLY.exec(value) ?? PLAIN_DATE_TIME.exec(value);
  if (!parts) return undefined;

  const [, year, month, day, hour, minute, second, fraction] = parts;
  const plain = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour ?? 0),
    minute: Number(minute ?? 0),
    second: Number(second ?? 0),
  };

  // Temporal splits its own handling of an out-of-range field: most constrain (month 13 -> 12), a
  // few throw (day 0). Both mean the same thing to a consumer, so both leave here as InvalidInstantError
  // — the constrained ones caught by the read-back below, the throwing ones caught here.
  let resolved: Instant;
  try {
    resolved = fromPlain(zone, plain);
  } catch {
    throw invalid(value, 'no-such-date', operation);
  }

  const readBack = toPlain(zone, resolved);
  if (readBack.year !== plain.year || readBack.month !== plain.month || readBack.day !== plain.day) {
    throw invalid(value, 'no-such-date', operation);
  }

  // A fractional second is added to the resolved Instant rather than carried into the zone lookup:
  // PlainParts stops at whole seconds, and no zone offset has ever shifted by a sub-second amount,
  // so the two are equivalent here.
  if (fraction === undefined) return resolved;
  return addMs(resolved, Number(fraction.padEnd(3, '0')));
}

/**
 * The Instant `input` names, read in `zone`.
 *
 * A `number` is epoch milliseconds and an already-branded `Instant` passes through unchanged; a
 * `Date` is read for its epoch milliseconds. A string carrying an explicit `Z` or numeric offset is
 * absolute and ignores `zone`. Every other string is a Plain time and resolves through `zone`, with
 * a date-only string meaning that day's start.
 */
export function toInstant(zone: string, input: InstantInput, operation: string): Instant {
  if (typeof input === 'string') {
    const plain = fromPlainString(zone, input, operation);
    if (plain !== undefined) return plain;
    try {
      return instant(input);
    } catch {
      throw invalid(input, 'unreadable', operation);
    }
  }
  if (input === null) {
    throw invalid(input, 'null-value', operation);
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw invalid(input, 'unreadable', operation);
    return instant(input);
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input, 'not-finite', operation);
    return instant(input);
  }
  // TypeScript's InstantInput rules out everything else, but a consumer feeding this from JSON or an
  // untyped record has no compiler left by the time it gets here — a boolean or a plain object lands
  // here at runtime (#431). It gets the same fault as an unparsable string: both are a value this
  // library cannot read as a date.
  throw invalid(input, 'unreadable', operation);
}

/**
 * The Instant an `end` field's `input` names, read in `zone`.
 *
 * Storage is half-open [start, end) (plans/01 §5), so `end` is the boundary after the span, not the
 * last moment in it. A consumer writing a bare date on `end` always means the last day it wants
 * included, so a date-only input advances to the next day's start. Everything else — an `Instant`,
 * a `Date`, a string with a time of day — is already a boundary and is read literally.
 */
export function toEndInstant(zone: string, input: InstantInput, operation: string): Instant {
  const boundary = toInstant(zone, input, operation);
  if (!isDateOnly(input)) return boundary;
  return startOfNextDay(zone, boundary);
}

/**
 * The hour, minute and second a `PlainTimeInput` names — `'17:00'` or `'17:00:00'`.
 *
 * Unlike `toInstant`, this names no `Instant`: a `PlainTimeInput` carries no date, so the caller
 * supplies one (a day it is already walking) before the reading resolves through `fromPlain`. No
 * zone is involved here either, for the same reason — a bare time of day is zone-agnostic until a
 * date and a zone both join it.
 */
export function readPlainTime(
  input: PlainTimeInput,
  operation?: string,
): { hour: number; minute: number; second: number } {
  const parts = PLAIN_TIME.exec(input);
  if (!parts) throw new InvalidPlainTimeError(input, operation);
  const [, hourStr, minuteStr, secondStr] = parts;
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const second = Number(secondStr ?? 0);
  if (hour > 23 || minute > 59 || second > 59) throw new InvalidPlainTimeError(input, operation);
  return { hour, minute, second };
}
