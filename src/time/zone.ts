// Zone-aware civil arithmetic (plans/01 §5, D6). Resolves offsets via Intl.DateTimeFormat.formatToParts —
// see plans/04 §1.1 for why this beats carrying a date/tz dependency.

import type { Instant } from '../model/index.js';
import { instant } from './instant.js';

export interface CivilParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    formatterCache.set(zone, f);
  }
  return f;
}

/** The civil (wall-clock) reading of `i` in `zone`. */
export function toCivil(zone: string, i: Instant): CivilParts {
  const parts = formatterFor(zone).formatToParts(new Date(i));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const hour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/** The instant whose wall-clock reading in `zone` equals `civil`. Fixed-point iteration resolves DST offsets. */
export function fromCivil(zone: string, civil: CivilParts): Instant {
  const targetAsUtc = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour,
    civil.minute,
    civil.second,
  );
  let guess = targetAsUtc;
  for (let i = 0; i < 3; i++) {
    const observed = toCivil(zone, instant(guess));
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    // offset = (actual UTC instant) - (its wall-clock reading, read as if UTC); reapplying it to the
    // fixed target keeps this converging on the answer instead of walking further from it each pass.
    const offset = guess - observedAsUtc;
    const nextGuess = targetAsUtc + offset;
    if (nextGuess === guess) break;
    guess = nextGuess;
  }
  return instant(guess);
}

export function startOfDay(zone: string, i: Instant): Instant {
  const civil = toCivil(zone, i);
  return fromCivil(zone, { ...civil, hour: 0, minute: 0, second: 0 });
}

export function addDays(zone: string, i: Instant, days: number): Instant {
  const civil = toCivil(zone, i);
  const shifted = new Date(
    Date.UTC(civil.year, civil.month - 1, civil.day + days, civil.hour, civil.minute, civil.second),
  );
  return fromCivil(zone, {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  });
}

/** Whole civil days between two instants' day-starts (DST-correct: not `(b - a) / 86400000`). */
export function diffDays(zone: string, a: Instant, b: Instant): number {
  const startA = startOfDay(zone, a);
  const startB = startOfDay(zone, b);
  let days = 0;
  let cursor = startA;
  const forward = startB >= startA;
  while (forward ? cursor < startB : cursor > startB) {
    cursor = addDays(zone, cursor, forward ? 1 : -1);
    days += forward ? 1 : -1;
  }
  return days;
}
