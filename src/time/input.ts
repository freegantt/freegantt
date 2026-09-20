// Reading consumer-written time values (plans/01 §5). This is the one place a loose `InstantInput` —
// what a consumer writes — becomes an `Instant` — what the library stores.
//
// It lives in time/ rather than at the api/ boundary for two reasons. Resolving a Plain time (a
// wall-clock reading with no zone, CONTEXT.md) needs the Dataset's zone and the DST fold/gap policy
// that only zone.ts has. And advancing a date-only `end` by one day is itself zone-aware arithmetic
// — "a day" is not always 86,400,000 ms — which CLAUDE.md confines to this layer (I10). api/ maps
// fields; it never does date math of its own.

import type { DateOnlyEndRule, Instant, InstantInput, PlainTimeInput } from '../model/index.js';
import { InvalidInstantError, InvalidPlainTimeError } from '../model/index.js';
import { addMs, instant } from './instant.js';
import { addDays, fromPlain, toPlain } from './zone.js';

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

// The name the consumer knows their own call by, for the message a bad value produces (#237, #239).
// `toInstant` is reached from `entries.add`, `entries.update`, an `EditExtender` cascade,
// `gantt.dateLines` and more. A prefix baked in here would tell all but one of those callers about a
// call they never made, which is the wrong-door fault #237 exists to close. So the name comes from
// the caller, exactly as `data/entry-reader.ts` threads its own `EditOrigin`.
//
// The parameter is optional, because a caller that names nothing gets a message with no prefix, and
// no prefix beats a wrong one. Every caller should still name itself; the ones in `src/api/gantt.ts`
// do not yet.

/** What to write instead. Two of the four faults below end with this sentence. */
const WRITE_A_DATE = 'Write an ISO date such as "2026-09-08", a count of epoch milliseconds, or a Date.';
/** Covers every value `InstantInput`'s type does not admit and that no other fault below already
 *  names — an unparsable string, a boolean, a plain object, an array. A string, a `Date` and a
 *  number reach their own fault first, so this is the untyped door's catch-all (#431). */
const UNREADABLE = `is not a date this library reads. ${WRITE_A_DATE}`;
const NO_SUCH_DATE = 'names a date the calendar does not have. Write a date the calendar has.';
const NOT_FINITE = `is not a finite count of epoch milliseconds. ${WRITE_A_DATE}`;
/** `null` names no instant, and it is not a zone problem — the zoneless-time fault in `instant()`
 *  does not apply and must not fire for it (#431). The remediation stays caller-agnostic, like
 *  `UNREADABLE`, `NO_SUCH_DATE` and `NOT_FINITE`: `toInstant` also reads `gantt.todayLine`,
 *  `gantt.dateLines`, `zoomToSpan` and `panToDate` (`src/api/gantt.ts`), and those callers hand a
 *  loose value straight in with no property or key to leave out. "Omit the key instead" is advice
 *  only an Entry's `start`/`end` can follow, so it belongs to the caller that knows it is one
 *  (`data/entry-reader.ts`), never to this shared reader. */
const NULL_VALUE =
  'names no instant. An absent date is a value left out, not a null one. Write a date, or leave it out.';

/** How the bad value reads back to the consumer who wrote it. `String` alone is not enough now that
 *  the door is untyped (#431): a plain object prints as "[object Object]" and an array prints as the
 *  empty string, so a JSON-sourced `start: {}` would name nothing at all and a `start: []` would
 *  leave a bare gap before the reason. A string is quoted, so an empty string and a stray space are
 *  both visible. Everything else prints as itself — `String(new Date(NaN))` is already the words
 *  "Invalid Date". A structure that cannot be serialized at all (a cycle, a BigInt) falls back to
 *  its own type name, because a thrown message is worse than a vague one. */
function wroteAsText(input: unknown): string {
  if (typeof input === 'string') return JSON.stringify(input);
  // A `Date` prints itself, never its JSON: `JSON.stringify(new Date(NaN))` is the word "null",
  // which would name the wrong fault outright — the one fault whose own message is `NULL_VALUE`.
  if (input === null || input instanceof Date || typeof input !== 'object') return String(input);
  try {
    return JSON.stringify(input) ?? Object.prototype.toString.call(input);
  } catch {
    return Object.prototype.toString.call(input);
  }
}

/** Builds the fault one bad value produces. The value is a member as well as a sentence: a bulk
 *  loader catches this and names the row it came from, instead of parsing our wording (#237).
 *  `wroteAsText` above owns how the value reads back. */
function invalid(input: unknown, reason: string, operation: string | undefined): InvalidInstantError {
  const wrote = wroteAsText(input);
  const where = operation === undefined ? '' : `${operation}: `;
  return new InvalidInstantError(`${where}${wrote} ${reason}`, input);
}

/**
 * The Instant a Plain string names in `zone`, or `undefined` if the string is not a Plain one.
 *
 * Rejects a date the calendar does not have (`'2026-02-31'`) by reading the result back: Temporal
 * constrains an out-of-range field rather than throwing, so a silent slide to Feb 28 is the failure
 * mode to catch. Only the date is compared — a Plain time inside a DST gap legitimately shifts its
 * hour, and that is a resolution, not an error.
 */
function fromPlainString(zone: string, value: string, operation: string | undefined): Instant | undefined {
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
    throw invalid(value, NO_SUCH_DATE, operation);
  }

  const readBack = toPlain(zone, resolved);
  if (readBack.year !== plain.year || readBack.month !== plain.month || readBack.day !== plain.day) {
    throw invalid(value, NO_SUCH_DATE, operation);
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
export function toInstant(zone: string, input: InstantInput, operation?: string): Instant {
  if (typeof input === 'string') {
    const plain = fromPlainString(zone, input, operation);
    if (plain !== undefined) return plain;
    try {
      return instant(input);
    } catch {
      throw invalid(input, UNREADABLE, operation);
    }
  }
  if (input === null) {
    throw invalid(input, NULL_VALUE, operation);
  }
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw invalid(input, UNREADABLE, operation);
    return instant(input);
  }
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw invalid(input, NOT_FINITE, operation);
    return instant(input);
  }
  // TypeScript's InstantInput rules out everything else, but a consumer feeding this from JSON or an
  // untyped record has no compiler left by the time it gets here — a boolean or a plain object lands
  // here at runtime (#431). It gets the same fault as an unparsable string: both are a value this
  // library cannot read as a date.
  throw invalid(input, UNREADABLE, operation);
}

/**
 * The Instant an `end` field's `input` names, read in `zone` under `rule`.
 *
 * Storage is half-open [start, end) (plans/01 §5), so `end` is the boundary after the span, not the
 * last moment in it. A consumer writing a bare date on `end` means the last day it wants included, so
 * under `'inclusive'` a date-only input advances one day. Everything else — an `Instant`, a `Date`,
 * a string with a time of day — is already a boundary and is read literally, under either rule.
 */
export function toEndInstant(
  zone: string,
  input: InstantInput,
  rule: DateOnlyEndRule,
  operation?: string,
): Instant {
  const boundary = toInstant(zone, input, operation);
  if (rule === 'exclusive' || !isDateOnly(input)) return boundary;
  return addDays(zone, boundary, 1);
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
