// A date-only `end` write means "through that day" (plans/01 §5). Both questions an ingest or an
// editor asks about that day — where does the next day start, and where does the last covered day
// start — are calendar arithmetic, so they live here rather than being reworked at each call site.

import type { Instant } from '../model/index.js';
import { lastCoveredInstant } from './format.js';
import { addDays, startOfDay } from './zone.js';

/** The start of the local day after `day`, in `zone`. Walks a calendar day, not 86,400,000 ms, so a
 *  DST-shortened or -lengthened day still lands on the next day's own midnight. */
export function startOfNextDay(zone: string, day: Instant): Instant {
  return startOfDay(zone, addDays(zone, day, 1));
}

/** The start of the last local day a half-open span `[start, end)` covers, in `zone`. Reads
 *  `lastCoveredInstant` for the moment (the zero-length/`end - 1` rule lives there, once), then
 *  finds that moment's day in `zone`. */
export function startOfLastCoveredDay(
  zone: string,
  span: { readonly start?: Instant | undefined; readonly end: Instant },
): Instant {
  return startOfDay(zone, lastCoveredInstant(span));
}
