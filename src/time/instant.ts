// time/ owns all zone-aware date arithmetic and is the only place Date/Date.now/magic time constants are allowed (I10).

import type { Instant } from '../model/index.js';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = MS_PER_SECOND * 60;
const MS_PER_HOUR = MS_PER_MINUTE * 60;
const MS_PER_DAY = MS_PER_HOUR * 24;

/** Matches an ISO 8601 string carrying an explicit offset or `Z` — never a zoneless plain time. */
const OFFSET_ISO = /(Z|[+-]\d{2}:?\d{2})$/;

export function instant(value: Date | number | string): Instant {
  if (value instanceof Date) return value.getTime() as Instant;
  if (typeof value === 'number') return value as Instant;
  if (!OFFSET_ISO.test(value)) {
    throw new RangeError(
      `instant(): "${value}" is a zoneless plain time — it names no instant until a zone resolves it. ` +
        'Pass a string with an explicit offset or "Z", or use fromPlain(zone, parts).',
    );
  }
  return new Date(value).getTime() as Instant;
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
