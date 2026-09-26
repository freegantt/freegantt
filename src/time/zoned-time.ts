// time/ — the zone-bound façade a plugin author reaches through `Dataset.time`. The zone
// is bound once, at construction; every method forwards straight to `zone.ts`. No method adds date
// arithmetic of its own — I10 stays true: all the math still lives in `zone.ts`.

import type { DateOnlyEndRule, Instant, InstantInput, TimeSpan, TimeUnit } from '../model/index.js';
import {
  addDays,
  dayOfWeek,
  diffDays,
  eachDay,
  eachUnit,
  fromPlain,
  startOf,
  startOfDay,
  stepBy,
  toPlain,
} from './zone.js';
import type { PlainParts } from './zone.js';
import { toEndInstant, toInstant } from './input.js';

/**
 * Zone-aware date math with the dataset's own zone already bound — no caller passes it, and no
 * caller can pass the wrong one. A plugin cannot import `time/` directly (the `exports`
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
  /** `at`, stepped by `increment` (default 1) whole `unit`s — e.g. `step(at, 'hour')` for the next
   *  hour boundary's worth of time, `step(at, 'hour', -1)` for the previous. */
  step(at: Instant, unit: TimeUnit, increment?: number): Instant;
  /** Each `unit` boundary in `[span.start, span.end)`, ascending — `eachDay`'s walk, generalised to
   *  every unit `time/` supports (#404). */
  each(span: TimeSpan, unit: TimeUnit): readonly Instant[];
  /** The Instant a consumer-written `input` names, read in this zone (#404) — `time/toInstant` on
   *  the one facade a plugin author already holds, so a builder never re-derives date reading. */
  toInstant(input: InstantInput): Instant;
  /** The Instant a consumer-written `end` input names, read in this zone under `rule` (default
   *  `'inclusive'`) — `time/toEndInstant` on the facade, for the same reason as `toInstant`. */
  toEndInstant(input: InstantInput, rule?: DateOnlyEndRule): Instant;
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
    step: (at, unit, increment = 1) => stepBy(zone, at, unit, increment),
    each: (span, unit) => eachUnit(zone, span, unit),
    toInstant: (input) => toInstant(zone, input, 'dataset.time.toInstant'),
    toEndInstant: (input, rule = 'inclusive') => toEndInstant(zone, input, rule, 'dataset.time.toEndInstant'),
  };
}
