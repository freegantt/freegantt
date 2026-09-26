// time/ owns all zone-aware date arithmetic and is the only place Date/Date.now/magic time constants are allowed (I10).

import type { Instant, TimeSpan } from '../model/index.js';
import { invalidInstant } from './instant-fault.js';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

/** Matches an ISO 8601 string carrying an explicit offset or `Z` — never a zoneless plain time.
 *  A suffix test only, so a string can clear it and still name no date: `'laterZ'` ends in `Z`. */
const OFFSET_ISO = /(Z|[+-]\d{2}:?\d{2})$/;

/** Whether the string opens like an ISO calendar date. Enough to tell a real wall-clock reading that
 *  is merely missing its zone (`'2026-09-08T14:30'`) from a value that names no date at all
 *  (`'next tuesday'`) — only the first deserves the zoneless remedy. This is not `input.ts`'s
 *  grammar and must not grow into a copy of it: that grammar captures the parts to build a Plain
 *  from, and this asks one yes-or-no question. */
const OPENS_LIKE_A_DATE = /^\d{4}-\d{2}-\d{2}/;

/**
 * The Instant an absolute value names. `instant()` resolves no zone, so it takes only values that
 * already name a moment: a `Date`, epoch milliseconds, or a string carrying `Z` or a numeric offset.
 * A wall-clock reading with no zone is not one of them — read that through the dataset's zone
 * instead, which every Dataset write already does.
 *
 * Every refusal is an `InvalidInstantError` carrying the value the consumer wrote, in the same
 * vocabulary `toInstant` uses (`instant-fault.ts`). It used to be a bare `RangeError` that named a
 * zone problem for every input it did not like, including `null` — which is the one thing a missing
 * date is not (#431). It also used to answer `NaN` rather than refuse, for `new Date('nope')`,
 * for `Number.NaN`, and for any unparsable string ending in `Z`: a `NaN` Instant flows on and
 * surfaces much later as an unpainted bar, with nothing left pointing at the value that caused it.
 */
export function instant(value: Date | number | string): Instant {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) throw invalidInstant(value, 'unreadable', 'instant');
    return ms as Instant;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalidInstant(value, 'not-finite', 'instant');
    return value as Instant;
  }
  // The declared type rules the rest out, but a consumer feeding this from JSON or an untyped record
  // has no compiler left by the time it gets here (#431).
  if (value === null || value === undefined) throw invalidInstant(value, 'null-value', 'instant');
  if (typeof value !== 'string') throw invalidInstant(value, 'unreadable', 'instant');
  if (!OFFSET_ISO.test(value)) {
    throw invalidInstant(value, OPENS_LIKE_A_DATE.test(value) ? 'zoneless' : 'unreadable', 'instant');
  }
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) throw invalidInstant(value, 'unreadable', 'instant');
  return ms as Instant;
}

export function now(): Instant {
  return Date.now() as Instant;
}

export function toISO(i: Instant): string {
  return new Date(i).toISOString();
}

export function addMs(i: Instant, ms: number): Instant {
  return (i + ms) as Instant;
}

/** How far `a` sits after `b`, in milliseconds — negative when it sits before. `addMs`'s pair:
 *  `addMs(start, diffMs(proposed, current))` moves a second entry by the same amount as the first
 *  (`harness/plugins/lock-entries.ts`). One of the two places in the library allowed to do
 *  arithmetic on an `Instant` — everywhere else in `src/**` calls this instead (I10). */
export function diffMs(a: Instant, b: Instant): number {
  return a - b;
}

export const MS = {
  SECOND: MS_PER_SECOND,
  MINUTE: MS_PER_MINUTE,
  HOUR: MS_PER_HOUR,
  DAY: MS_PER_DAY,
} as const;

/**
 * The part `a` and `b` share, or `undefined` when they do not touch. Half-open, like every stored
 * `TimeSpan` (plans/01 §5): two spans that only touch at a boundary — `a.end === b.start` — share no
 * instant, so that case answers `undefined` too, not a zero-length span.
 *
 * The library clips a `TimeSpan` to a window this way in three places already (`layout/frame.ts`'s
 * box clip, `time-shading-covers.ts`'s day clip, `time/scale.ts`'s tick clip); this is that one rule,
 * public. Without it a consumer totalling a Field over `gantt.visibleSpan` has to write
 * `Math.max`/`Math.min` on two `Instant`s and cast the bare `number` back — the hand arithmetic I10
 * exists to stop (#472).
 */
export function overlap(a: TimeSpan, b: TimeSpan): TimeSpan | undefined {
  const start = Math.max(a.start, b.start) as Instant;
  const end = Math.min(a.end, b.end) as Instant;
  return start < end ? { start, end } : undefined;
}
