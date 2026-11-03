// scheduling/ — the one place a lag becomes a distance in time.
import type { Duration, Instant } from '../model/index.js';
import { MS, addMs } from '../time/index.js';

const DAYS_PER_WEEK = 7;

/**
 * The instant a lag lands on, counted from `anchor`. Answers `undefined` for a unit that has no fixed
 * length (`month`, `year`), because the engine holds no zone to measure it in.
 *
 * Days are 24-hour days. Every day count in the engine goes through here, so a working calendar
 * later changes this one function and nothing else.
 */
export function applyLag(anchor: Instant, lag: Duration): Instant | undefined {
  switch (lag.unit) {
    case 'millisecond':
      return addMs(anchor, lag.value);
    case 'minute':
      return addMs(anchor, lag.value * MS.MINUTE);
    case 'hour':
      return addMs(anchor, lag.value * MS.HOUR);
    case 'day':
      return addMs(anchor, lag.value * MS.DAY);
    case 'week':
      return addMs(anchor, lag.value * DAYS_PER_WEEK * MS.DAY);
    case 'month':
    case 'year':
      return undefined;
  }
}
