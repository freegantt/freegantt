// time/ owns all zone-aware date arithmetic (I10) — a drag gesture's snap-to-grid math lands here,
// not in layout/gesture-draft.ts, so that file never touches an Instant except through these calls
// (plans/s3-direct-manipulation/README.md D-S3-12).

import type { Instant, TimeUnit } from '../model/index.js';
import { InvalidSnapIncrementError } from '../model/index.js';
import { diffMs } from './instant.js';
import { startOf, stepBy } from './zone.js';

/** Both loops below walk one `increment`-sized step at a time until they pass a target. A `0`
 *  returns the same instant forever; a negative or fractional value never lands on the target
 *  either. `time/` is reachable from `layout/` without going through `Gantt.snap`'s own setter guard
 *  (a custom `ViewPreset`'s tick, for one), so this checks again rather than trusting the caller
 *  already did (#201). */
function assertAdvances(unit: TimeUnit, increment: number): void {
  if (!Number.isInteger(increment) || increment <= 0) {
    throw new InvalidSnapIncrementError(unit, increment);
  }
}

/** What a gesture snaps to: a named unit/increment, or `'none'` for raw pixel-to-millisecond
 *  conversion with no rounding. `ViewPreset.snap`'s `'tick'` member is resolved to a concrete
 *  `{ unit, increment }` by the caller (the preset's own `tickUnit`/`tickIncrement`) before this
 *  function ever sees it — `time/` names units and increments, never a preset. */
export type SnapUnit = { unit: TimeUnit; increment: number } | 'none';

/** The nearest whole `snap` boundary to `at`, in `zone`. `'none'` returns `at` unchanged — a snap of
 *  milliseconds is not rounding at all. Walks forward from `at`'s own unit floor in `increment`-sized
 *  steps (zone-aware, so a 2-day snap still lands on real calendar days across a DST transition) and
 *  returns whichever of the two flanking boundaries `at` is closer to. */
export function snapInstant(zone: string, at: Instant, snap: SnapUnit): Instant {
  if (snap === 'none') return at;
  const { unit, increment } = snap;
  assertAdvances(unit, increment);
  let lower = startOf(zone, at, unit);
  let upper = stepBy(zone, lower, unit, increment);
  while (diffMs(upper, at) <= 0) {
    lower = upper;
    upper = stepBy(zone, lower, unit, increment);
  }
  return diffMs(upper, at) < diffMs(at, lower) ? upper : lower;
}

/** The first whole `unit`/`increment` boundary strictly after `at`, in `zone` — what arms the today
 *  line's own repaint timer (#476, `view/gantt-shell.ts`'s `nextTickBoundaryDelayMs` wiring): the
 *  finest header band's step names the boundary the line goes stale at, and this walks forward from
 *  `at`'s own unit floor in `increment`-sized steps until it passes `at`, the same walk `snapInstant`
 *  above already takes. Unlike `snapInstant`, this never returns `at`'s own floor — a repaint armed
 *  for the boundary `at` already sits on would fire immediately and never advance. */
export function nextTickBoundary(zone: string, at: Instant, unit: TimeUnit, increment: number): Instant {
  assertAdvances(unit, increment);
  let boundary = startOf(zone, at, unit);
  while (diffMs(boundary, at) <= 0) {
    boundary = stepBy(zone, boundary, unit, increment);
  }
  return boundary;
}

/** How many whole `increment`-sized `unit` steps separate `from` and `to` — the calendar delta a
 *  multi-entry drag re-applies to every grabbed entry's own `start`/`end` (D-S3-3, D-S3-19), instead
 *  of a raw millisecond difference that would drift a wall-clock time across a DST transition.
 *  Zero when the two already match. `snap: 'none'`'s caller has no unit to count steps in — it takes
 *  the millisecond difference directly through `diffMs`/`addMs` instead of this function. */
export function stepsBetween(
  zone: string,
  unit: TimeUnit,
  increment: number,
  from: Instant,
  to: Instant,
): number {
  assertAdvances(unit, increment);
  const direction = diffMs(to, from) > 0 ? 1 : diffMs(to, from) < 0 ? -1 : 0;
  if (direction === 0) return 0;
  let steps = 0;
  let cursor = from;
  while (direction > 0 ? diffMs(cursor, to) < 0 : diffMs(cursor, to) > 0) {
    cursor = stepBy(zone, cursor, unit, increment * direction);
    steps += direction;
  }
  return steps;
}
