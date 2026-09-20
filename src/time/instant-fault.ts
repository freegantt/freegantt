// What the library says when a consumer writes something that is not a date. Two readers produce
// these faults — `instant()` (the public helper, absolute values only) and `toInstant()` (the
// zone-aware reader every Entry write goes through) — and a consumer who meets both must not get two
// vocabularies for one mistake. `instant.ts` cannot import `input.ts`, which already imports it, so
// the shared words live here rather than in either reader (#431 F6).

import { InvalidInstantError } from '../model/index.js';

/** What to write instead. Two of the four reasons below end with this sentence. */
export const WRITE_A_DATE =
  'Write an ISO date such as "2026-09-08", a count of epoch milliseconds, or a Date.';

/** Covers every value the declared type does not admit and that no other reason below already names
 *  — an unparsable string, a boolean, a plain object, an array. A number, a `Date` and `null` reach
 *  their own reason first, so this is the untyped door's catch-all (#431). */
export const UNREADABLE = `is not a date this library reads. ${WRITE_A_DATE}`;

export const NO_SUCH_DATE = 'names a date the calendar does not have. Write a date the calendar has.';

export const NOT_FINITE = `is not a finite count of epoch milliseconds. ${WRITE_A_DATE}`;

/** `null` names no instant, and it is not a zone problem — the zoneless-time reason below does not
 *  apply and must not fire for it (#431). The remediation stays caller-agnostic, like `UNREADABLE`,
 *  `NO_SUCH_DATE` and `NOT_FINITE`: `toInstant` also reads `gantt.todayLine`, `gantt.dateLines`,
 *  `zoomToSpan` and `panToDate` (`src/api/gantt.ts`), and those callers hand a loose value straight
 *  in with no property or key to leave out. "Omit the key instead" is advice only an Entry's
 *  `start`/`end` can follow, so it belongs to the caller that knows it is one
 *  (`data/entry-reader.ts`), never to a shared reader. */
export const NULL_VALUE =
  'names no instant. An absent date is a value left out, not a null one. Write a date, or leave it out.';

/** A wall-clock reading with no zone attached, handed to a reader that resolves no zone. The one
 *  reason that names a remedy rather than a rewrite: the value is a real date, and the caller is
 *  missing the zone it needs. Only `instant()` produces it — `toInstant` has a zone and resolves
 *  such a string instead of refusing it. */
export const ZONELESS =
  'is a plain time and names no instant until a zone resolves it. Write an explicit offset or "Z", ' +
  'or read it in a zone — `fromPlain(zone, parts)`, or any Dataset write, which uses the ' +
  "dataset's zone.";

/** How the bad value reads back to the consumer who wrote it. `String` alone is not enough now that
 *  the door is untyped (#431): a plain object prints as "[object Object]" and an array prints as the
 *  empty string, so a JSON-sourced `start: {}` would name nothing at all and a `start: []` would
 *  leave a bare gap before the reason. A string is quoted, so an empty string and a stray space are
 *  both visible. Everything else prints as itself — `String(new Date(NaN))` is already the words
 *  "Invalid Date". A structure that cannot be serialized at all (a cycle, a BigInt) falls back to
 *  its own type name, because a thrown message is worse than a vague one. */
export function wroteAsText(input: unknown): string {
  if (typeof input === 'string') return JSON.stringify(input);
  // A `Date` prints itself, never its JSON: `JSON.stringify(new Date(NaN))` is the word "null",
  // which would name the wrong fault outright — the one fault whose own reason is `NULL_VALUE`.
  if (input === null || input instanceof Date || typeof input !== 'object') return String(input);
  try {
    return JSON.stringify(input) ?? Object.prototype.toString.call(input);
  } catch {
    return Object.prototype.toString.call(input);
  }
}

/** Builds the fault one bad value produces. The value is a member as well as a sentence: a bulk
 *  loader catches this and names the row it came from, instead of parsing our wording (#237).
 *  `operation` is the name the consumer knows their own call by — `toInstant` is reached from
 *  `entries.add`, an `EditExtender` cascade and more, so a prefix baked in would tell all but one
 *  caller about a call they never made. A caller that names nothing gets no prefix, and no prefix
 *  beats a wrong one. */
export function invalidInstant(input: unknown, reason: string, operation?: string): InvalidInstantError {
  const where = operation === undefined ? '' : `${operation}: `;
  return new InvalidInstantError(`${where}${wroteAsText(input)} ${reason}`, input);
}
