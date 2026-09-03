// time/ — the zone-bound façade a plugin author reaches through `Dataset.time` (D-S5-16). The zone
// is bound once, at construction; every method forwards straight to `zone.ts`. No method adds date
// arithmetic of its own — I10 stays true: all the math still lives in `zone.ts`.

import type { Instant, TimeSpan, TimeUnit } from '../model/index.js';
import { addDays, dayOfWeek, diffDays, eachDay, fromPlain, startOf, startOfDay, toPlain } from './zone.js';
import type { PlainParts } from './zone.js';

/**
 * Zone-aware date math with the dataset's own zone already bound — no caller passes it, and no
 * caller can pass the wrong one (D-S5-16). A plugin cannot import `time/` directly (the `exports`
 * map seals it), so this is the one way a plugin author reaches zone-correct day arithmetic.
 *
 * Call: `dataset.time.eachDay(span).filter((day) => dataset.time.dayOfWeek(day) >= 6)`.
 */
export interface ZonedTime {
  readonly zone: string;
  startOfDay(at: Instant): Instant;
  startOf(at: Instant, unit: TimeUnit): Instant;
  addDays(at: Instant, days: number): Instant;
  diffDays(a: Instant, b: Instant): number;
  /** 1 = Monday … 7 = Sunday (ISO). */
  dayOfWeek(at: Instant): number;
  /** Each day boundary in `[span.start, span.end)`, ascending. */
  eachDay(span: TimeSpan): readonly Instant[];
  toPlain(at: Instant): PlainParts;
  fromPlain(plain: PlainParts): Instant;
}

/** Call: `createZonedTime(dataset.timeZone)`. Binds `zone` once; every method below forwards to the
 * matching `zone.ts` function with that same string. */
export function createZonedTime(zone: string): ZonedTime {
  return {
    zone,
    startOfDay: (at) => startOfDay(zone, at),
    startOf: (at, unit) => startOf(zone, at, unit),
    addDays: (at, days) => addDays(zone, at, days),
    diffDays: (a, b) => diffDays(zone, a, b),
    dayOfWeek: (at) => dayOfWeek(zone, at),
    eachDay: (span) => eachDay(zone, span),
    toPlain: (at) => toPlain(zone, at),
    fromPlain: (plain) => fromPlain(zone, plain),
  };
}
