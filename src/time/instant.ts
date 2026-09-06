// time/ owns all zone-aware date arithmetic and is the only place Date/Date.now/magic time constants are allowed (I10).

import type { Instant, Segment, TimeSpan } from '../model/index.js';

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

/** The one function that answers "what span do these Segments draw" (#212, finding 4) — the earliest
 *  `start` and the latest `end` among them. `data/` calls it at ingest and on every `entries.update`
 *  that touches `segments`, and `layout/` calls it while dragging, so an Entry's own `start`/`end`
 *  can never disagree with its Segments no matter which write path set them. Lives here, not in
 *  `data/` or `layout/`, because neither of those layers may import the other (`01` §1) and `time/`
 *  is the one layer both already reach through. A plain numeric comparison, not date arithmetic —
 *  `time/` still owns adding to or diffing an `Instant` (I10); this only orders two of them. Never
 *  called with an empty list: every stored Entry keeps at least one Segment. */
export function envelopeOfSegments(segments: readonly Segment[]): TimeSpan {
  const first = segments[0];
  if (!first) {
    throw new Error('envelopeOfSegments: called with no Segments — every stored Entry keeps at least one');
  }
  let start: Instant = first.start;
  let end: Instant = first.end;
  for (const segment of segments) {
    if (segment.start < start) start = segment.start;
    if (segment.end > end) end = segment.end;
  }
  return { start, end };
}
