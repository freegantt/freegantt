// time/ owns all zone-aware date arithmetic (I10) — a drag gesture's snap-to-grid math lands here,
// not in layout/gesture-draft.ts, so that file never touches an Instant except through these calls.

import type { Instant, TimeUnit } from '../model/index.js';
import { InvalidSnapIncrementError } from '../model/index.js';
import { diffMs } from './instant.js';
import { stepBy, tickFloor, nextTick } from './zone.js';

/** `stepsBetween` below walks one `increment`-sized step at a time until it passes a target. A `0`
 *  returns the same instant forever; a negative or fractional value never lands on the target
 *  either. `time/` is reachable from `layout/` without going through `Gantt.snap`'s own setter guard
 *  (a custom `ViewPreset`'s tick, for one), so this checks again rather than trusting the caller
 *  already did (#201). `snapInstant`/`nextTickBoundary` get the same check for free, inside
 *  `tickFloor`, the one walk they both now read. */
function assertAdvances(unit: TimeUnit, increment: number): void {
  if (!Number.isInteger(increment) || increment <= 0) {
    throw new InvalidSnapIncrementError(unit, increment);
  }
}

/** What a caller states about a stepping cadence — declared here, not in `scale.ts`, because
 *  `snapInstant`/`nextTickBoundary` need the same shape one level below `TimeScale.ticks`; `scale.ts`
 *  re-exports it (`ViewPresetHeader` and `TimeScale.ticks` both key off it too, S1.7 §3.3) so a
 *  `TickStep` import from either module names one type. */
export interface TickStep {
  readonly unit: TimeUnit;
  readonly increment: number;
}

/** A consumer's own snap rule (#489): decides exactly where `at` settles, in `zone`. The
 *  escape hatch for anything a plain `TickStep` cannot state — business hours only, a fixed list of
 *  milestones. Built from the same tools `time/` uses for its own tick walk: `nextTickBoundary` for
 *  "the next drawn line", `snapInstant` for "the nearest one". */
export type SnapRule = (zone: string, at: Instant) => Instant;

/** What a gesture snaps to: a named unit/increment, a custom `SnapRule`, or `'none'` for raw
 *  pixel-to-millisecond conversion with no rounding. `Gantt.snap`'s `'tick'` member is resolved to a
 *  concrete `TickStep` by the caller (the current preset's own `tickUnit`/`tickIncrement`) before
 *  this function ever sees it — `time/` names units and increments, never a preset. */
export type SnapUnit = TickStep | 'none' | SnapRule;

/** The nearest whole `snap` boundary to `at`, in `zone`. `'none'` returns `at` unchanged — a snap of
 *  milliseconds is not rounding at all. A function `snap` runs directly: the consumer's own rule
 *  decides. Otherwise this reads the boundary at or before `at` off `tickFloor` — the one tick walk
 *  the grid also reads (#489) — and the one strictly after it, and returns whichever of the two `at`
 *  is closer to. */
export function snapInstant(zone: string, at: Instant, snap: SnapUnit): Instant {
  if (snap === 'none') return at;
  if (typeof snap === 'function') return snap(zone, at);
  const { unit, increment } = snap;
  const lower = tickFloor(zone, at, unit, increment);
  const upper = nextTick(zone, lower, unit, increment);
  return diffMs(upper, at) < diffMs(at, lower) ? upper : lower;
}

/** The first whole `step` boundary strictly after `at`, in `zone` — one step past `tickFloor`'s own
 *  answer, the same walk `snapInstant` above reads (#489). Never returns `at`'s own floor, even when
 *  `at` already sits on a boundary — a caller that arms something for the boundary `at` already sits
 *  on would fire immediately and never advance. Takes the same `TickStep` shape `snapInstant` does —
 *  the two used to disagree, one keyed on an object and the other on two positional arguments, for
 *  no reason a caller could tell apart. */
export function nextTickBoundary(zone: string, at: Instant, step: TickStep): Instant {
  const { unit, increment } = step;
  return nextTick(zone, tickFloor(zone, at, unit, increment), unit, increment);
}

/** How many whole `increment`-sized `unit` steps separate `from` and `to` — the calendar delta a
 *  multi-entry drag re-applies to every grabbed entry's own `start`/`end`, instead
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
