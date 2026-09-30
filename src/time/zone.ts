// Zone-aware date arithmetic (plans/01 §5, D6). Built on temporal-polyfill's tree-shaken /fns API (see
// plans/04 §1.1) for the actual plain<->instant conversion: its explicit 'compatible' disambiguation gives a
// documented answer for DST fold (ambiguous, e.g. 1:30 AM on the fall-back day — resolves to the earlier
// offset) and gap (nonexistent, e.g. 2:30 AM on the spring-forward day — shifts forward by the gap size)
// plain times, which the previous Intl.DateTimeFormat + fixed-point implementation left undefined.
//
// "Plain" = a wall-clock reading with no zone attached, so it names no single instant until a zone resolves
// it. The word is Temporal's own (PlainDate, PlainDateTime), which is what this module will become when
// native Temporal ships. See CONTEXT.md.

import type { Instant, PlainParts, TimeSpan, TimeUnit } from '../model/index.js';
import { InvalidSnapIncrementError, UnsupportedUnitError } from '../model/index.js';
import { instant, addMs, diffMs, MS } from './instant.js';
import * as InstantFns from 'temporal-polyfill/fns/Instant';
import * as ZonedDateTimeFns from 'temporal-polyfill/fns/ZonedDateTime';

/** Resolves the environment's own IANA zone (#129) — the one place `Intl` is read for this purpose
 *  (I10). A browser always reports one; a bare-Node/test environment that reports nothing falls
 *  back to `'UTC'` rather than throwing, so `new Dataset({ entries })` never requires an explicit
 *  `timeZone` just to run under Vitest. Called once, at `Dataset` construction — the resolved
 *  string is what gets stored, never a `'local'` token. */
export function resolveDefaultTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** The plain wall-clock shape is `model/` vocabulary, not zone machinery, so it is declared there
 *  and re-exported here — one name, one concept (#144). `extensions/` may import `model/` but not
 *  `time/`, which is why the declaration has to sit on that side. */
export type { PlainParts };

function toZoned(zone: string, i: Instant): ZonedDateTimeFns.Record {
  return InstantFns.toZonedDateTimeISO(InstantFns.fromEpochMilliseconds(i), zone);
}

function fromZoned(zdt: ZonedDateTimeFns.Record): Instant {
  return instant(ZonedDateTimeFns.toInstant(zdt).epochMilliseconds);
}

/** The plain (wall-clock) reading of `i` in `zone`. */
export function toPlain(zone: string, i: Instant): PlainParts {
  const zdt = toZoned(zone, i);
  return {
    year: zdt.year,
    month: zdt.month,
    day: zdt.day,
    hour: zdt.hour,
    minute: zdt.minute,
    second: zdt.second,
    dayOfWeek: ZonedDateTimeFns.dayOfWeek(zdt),
  };
}

/** ISO day of week of `i` in `zone`: 1 = Monday … 7 = Sunday. */
export function dayOfWeek(zone: string, i: Instant): number {
  return ZonedDateTimeFns.dayOfWeek(toZoned(zone, i));
}

/** The instant whose wall-clock reading in `zone` equals `plain` (DST fold/gap resolved via 'compatible'). */
export function fromPlain(zone: string, plain: PlainParts): Instant {
  const zdt = ZonedDateTimeFns.fromFields({ ...plain, timeZone: zone }, { disambiguation: 'compatible' });
  return fromZoned(zdt);
}

export function startOfDay(zone: string, i: Instant): Instant {
  return fromZoned(ZonedDateTimeFns.startOfDay(toZoned(zone, i)));
}

/** ISO week number (1-53) of `i` in `zone`. `Intl.DateTimeFormatOptions` has no week
 * field, so this is the one thing formatting still reaches the polyfill for directly. The polyfill
 * types this `| undefined` for calendars with no week numbering; `toZoned` always builds an ISO
 * calendar reading, which always has one. */
export function weekOfYear(zone: string, i: Instant): number {
  return ZonedDateTimeFns.weekOfYear(toZoned(zone, i))!;
}

export function addDays(zone: string, i: Instant, days: number): Instant {
  return fromZoned(ZonedDateTimeFns.addDays(toZoned(zone, i), days));
}

/** Each `unit` boundary in `[span.start, span.end)`, ascending, in `zone`. Floors to the first
 * boundary at or after `span.start`, then steps by `unit` until it reaches `span.end` — the walk
 * `eachDay` already did for `'day'`, generalised to every unit `stepBy`/`startOf` support (the #404
 * prerequisite: `every` above `'day'` needs this same walk, not a day-only one). */
export function eachUnit(zone: string, span: TimeSpan, unit: TimeUnit): readonly Instant[] {
  const boundaries: Instant[] = [];
  let cursor = startOf(zone, span.start, unit);
  if (cursor < span.start) cursor = stepBy(zone, cursor, unit, 1);
  while (cursor < span.end) {
    boundaries.push(cursor);
    cursor = stepBy(zone, cursor, unit, 1);
  }
  return boundaries;
}

/** Each day boundary in `[span.start, span.end)`, ascending, in `zone`. Delegates to
 * `eachUnit` with `'day'`, so the two walks can never disagree. */
export function eachDay(zone: string, span: TimeSpan): readonly Instant[] {
  return eachUnit(zone, span, 'day');
}

/** Calendar-month stepping (e.g. Jan 31 + 1 month clamps to Feb 28/29, per Temporal's default 'constrain'). */
export function addMonths(zone: string, i: Instant, months: number): Instant {
  return fromZoned(ZonedDateTimeFns.addMonths(toZoned(zone, i), months));
}

/** Calendar-year stepping (leap-day clamps the same way as addMonths). */
export function addYears(zone: string, i: Instant, years: number): Instant {
  return fromZoned(ZonedDateTimeFns.addYears(toZoned(zone, i), years));
}

/** Whole calendar days between two instants' day-starts (DST-correct: not `(b - a) / 86400000`). */
export function diffDays(zone: string, a: Instant, b: Instant): number {
  return ZonedDateTimeFns.diffDays(
    ZonedDateTimeFns.startOfDay(toZoned(zone, a)),
    ZonedDateTimeFns.startOfDay(toZoned(zone, b)),
  );
}

type Stepper = (zone: string, i: Instant, increment: number) => Instant;
type Floor = (zone: string, i: Instant) => Instant;

interface UnitOps {
  readonly step: Stepper;
  readonly floor: Floor;
}

/** One source of truth for which units time/ can step by and floor to: a unit is supported exactly
 * when it has an entry here (S1.7 §3.3, #32's "one list" fix carried forward from time/scale.ts).
 * `stepBy`/`startOf` both dispatch through it, so the two can never disagree on what's supported. */
const UNITS: Record<TimeUnit, UnitOps> = Object.freeze({
  millisecond: {
    step: (_zone, i, increment) => addMs(i, increment),
    floor: (_zone, i) => i,
  },
  minute: {
    step: (_zone, i, increment) => addMs(i, increment * MS.MINUTE),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfMinute(toZoned(zone, i))),
  },
  hour: {
    step: (_zone, i, increment) => addMs(i, increment * MS.HOUR),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfHour(toZoned(zone, i))),
  },
  day: {
    step: (zone, i, increment) => addDays(zone, i, increment),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfDay(toZoned(zone, i))),
  },
  week: {
    step: (zone, i, increment) => addDays(zone, i, increment * 7),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfWeek(toZoned(zone, i))),
  },
  month: {
    step: (zone, i, increment) => addMonths(zone, i, increment),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfMonth(toZoned(zone, i))),
  },
  year: {
    step: (zone, i, increment) => addYears(zone, i, increment),
    floor: (zone, i) => fromZoned(ZonedDateTimeFns.startOfYear(toZoned(zone, i))),
  },
});

export const SUPPORTED_TIME_UNITS = Object.freeze(new Set<TimeUnit>(Object.keys(UNITS) as TimeUnit[]));

/** Call: `isTimeUnit(value)` — true when `value` names a unit `time/` can step by. The public,
 *  narrowing form of `SUPPORTED_TIME_UNITS`, for a consumer validating a raw string (a `<select>`'s
 *  value, a saved preference) before it reaches `gantt.snap` or a `ViewPreset` (#201). */
export function isTimeUnit(value: string): value is TimeUnit {
  return SUPPORTED_TIME_UNITS.has(value as TimeUnit);
}

/** `UNITS`' own declaration order, coarsest last — pinned by a test (`zone.test.ts`) rather than
 *  trusted, since nothing about `Object.freeze` guarantees a reader keeps it sorted. `isCoarserThan`
 *  reads this (through `UNIT_RANK`) instead of re-deriving an order of its own, so the two can never
 *  disagree. */
const UNIT_ORDER: readonly TimeUnit[] = Object.freeze(Object.keys(UNITS) as TimeUnit[]);

const UNIT_RANK: Record<TimeUnit, number> = Object.freeze(
  Object.fromEntries(UNIT_ORDER.map((unit, index) => [unit, index])) as Record<TimeUnit, number>,
);

/** Call: `isCoarserThan(tickUnit, 'day')` — true when `unit` groups a wider calendar span than
 *  `than` (`isCoarserThan('week', 'day')` is `true`; `isCoarserThan('day', 'day')` is `false`).
 *  For a plugin author asking "is this tick too coarse to draw per-day decoration?" without
 *  building its own rank table over `TimeUnit` (#268).
 *
 *  This is **calendar-nesting order, not duration order**: a month is coarser than a week because
 *  every month's days group into it, not because a month spans more milliseconds than four weeks
 *  always would (it doesn't). That distinction is harmless for a granularity-floor question like the
 *  one above, and wrong the moment someone reaches for this to do arithmetic — `time/` exists to
 *  keep that kind of arithmetic out of the caller's hands (`plans/01` §5, I10), so reach for
 *  `stepBy`/`diffDays` there instead. */
export function isCoarserThan(unit: TimeUnit, than: TimeUnit): boolean {
  return UNIT_RANK[unit] > UNIT_RANK[than];
}

/** A step's real length, for `isCoarserStep` to compare. `time/` steps in two frames that never
 *  share a common tick: `millisecond`/`minute`/`hour`/`day`/`week` have a fixed millisecond length,
 *  `month`/`year` do not (a month is 28-31 days) and are compared in months instead. A unit outside
 *  both frames (there is none today, but `UNIT_RANK` covers every `TimeUnit`) reports no length, and
 *  `isCoarserStep` falls back to rank for it. */
const MS_PER_UNIT: Partial<Record<TimeUnit, number>> = Object.freeze({
  millisecond: 1,
  minute: MS.MINUTE,
  hour: MS.HOUR,
  day: MS.DAY,
  week: 7 * MS.DAY,
});
const MONTHS_PER_UNIT: Partial<Record<TimeUnit, number>> = Object.freeze({
  month: 1,
  year: 12,
});

interface StepLength {
  readonly frame: 'ms' | 'month';
  readonly value: number;
}

function stepLength(unit: TimeUnit, increment: number): StepLength | undefined {
  const ms = MS_PER_UNIT[unit];
  if (ms !== undefined) return { frame: 'ms', value: ms * increment };
  const months = MONTHS_PER_UNIT[unit];
  if (months !== undefined) return { frame: 'month', value: months * increment };
  return undefined;
}

/** Call: `isCoarserStep({ unit: 'day', increment: 10 }, { unit: 'week', increment: 1 })` — true when
 *  `a` spans more real time than `b`. For `presets.ts`'s `validatePresetTickStep`, which needs a
 *  duration answer and not `isCoarserThan`'s calendar-nesting one (#481): a `day × 10` tick is
 *  coarser than a `week × 1` header band even though `day` outranks nothing there, and a `week × 1`
 *  tick is not coarser than a `day × 7` band, because the two span the same week.
 *
 *  `a` and `b` compare as milliseconds when both units are `millisecond`…`week`, and as months when
 *  both are `month`/`year` — the one pair of frames a step can be measured in without a calendar to
 *  read from (a month has no fixed millisecond length). A pair split across the two frames has no
 *  shared length to compare, so `isCoarserThan`'s unit rank decides instead; no shipped preset needs
 *  that fallback today. Pure — no clock, no zone, so DST never enters into it. */
export function isCoarserStep(
  a: { readonly unit: TimeUnit; readonly increment: number },
  b: { readonly unit: TimeUnit; readonly increment: number },
): boolean {
  const lengthA = stepLength(a.unit, a.increment);
  const lengthB = stepLength(b.unit, b.increment);
  if (lengthA !== undefined && lengthB !== undefined && lengthA.frame === lengthB.frame) {
    return lengthA.value > lengthB.value;
  }
  return isCoarserThan(a.unit, b.unit);
}

function unsupportedUnit(unit: TimeUnit): UnsupportedUnitError {
  return new UnsupportedUnitError(unit, 'time');
}

export function stepBy(zone: string, i: Instant, unit: TimeUnit, increment: number): Instant {
  const ops = UNITS[unit];
  if (!ops) throw unsupportedUnit(unit);
  return ops.step(zone, i, increment);
}

/** Floors `i` to `unit`'s boundary in `zone` (S1.7 §3.3) — what `tickFloor` below anchors its own
 * walk against, and the boundary `increment: 1` always answers. */
export function startOf(zone: string, i: Instant, unit: TimeUnit): Instant {
  const ops = UNITS[unit];
  if (!ops) throw unsupportedUnit(unit);
  return ops.floor(zone, i);
}

/** The larger calendar unit anchoring `unit`'s own tick walk (d3 `every(n)`-style, #489): hours count
 * from the day they fall in, months from their year — one gridline never moves off a boundary it
 * already drew, whatever window is on screen. Not `UNIT_ORDER`'s own next entry: that would anchor
 * `week` on `month`, but a week's own floor is not generally a whole number of weeks from a month's
 * start (a month rarely starts on a week's own first day), so walking weeks from there would miss
 * `week`'s true floor even at `increment: 1`. Every entry here nests evenly instead — every minute
 * inside its hour, every hour inside its day, every day inside its week, every month inside its
 * year — which is what lets `tickFloor` count forward from the anchor and still land on the exact
 * boundary `startOf` would give directly. A unit with no entry (`week`, `year`) anchors to its own
 * floor, same as `increment: 1` always did — there is no larger unit to count it from safely. */
const ANCHOR_UNIT: Partial<Record<TimeUnit, TimeUnit>> = Object.freeze({
  millisecond: 'minute',
  minute: 'hour',
  hour: 'day',
  day: 'week',
  month: 'year',
});

function anchorUnit(unit: TimeUnit): TimeUnit {
  return ANCHOR_UNIT[unit] ?? unit;
}

/** How many whole `unit`s of nominal calendar span fit inside one occurrence of `unit`'s own
 *  `ANCHOR_UNIT` (60 minutes in an hour, 24 hours in a day, 7 days in a week, 12 months in a
 *  year). A unit with no `ANCHOR_UNIT` entry (`week`, `year`) has no size here either — it anchors
 *  to its own floor, so the "does the stride fit" question below never applies to it. */
const ANCHOR_CONTAINER_SIZE: Partial<Record<TimeUnit, number>> = Object.freeze({
  millisecond: MS.MINUTE,
  minute: 60,
  hour: 24,
  day: 7,
  month: 12,
});

/** True when `increment`-many `unit`s fit inside one anchor container, so counting them from the
 *  container's own start (#489's "hours count from the day they fall in") never has to spill a
 *  stride into the next container. A unit with no container size (`week`, `year`) always fits —
 *  it anchors to its own floor, one container per tick, so there is nothing to spill into. */
function stepFitsAnchorContainer(unit: TimeUnit, increment: number): boolean {
  const containerSize = ANCHOR_CONTAINER_SIZE[unit];
  return containerSize === undefined || increment < containerSize;
}

/** `unit`s elapsed from `from` to `to`, exact and fractional, for `tickFloor`'s arithmetic below.
 *  Each case matches the frame `stepBy`/`startOf` already count that unit in (fixed-length
 *  milliseconds for `millisecond`/`minute`/`hour`, the zone's own calendar for `day`/`week`, whole
 *  months for `month`/`year`) — this must never invent a length of its own (I10: `time/` is the one
 *  place that does calendar arithmetic). */
function unitsBetween(zone: string, unit: TimeUnit, from: Instant, to: Instant): number {
  switch (unit) {
    case 'millisecond':
      return diffMs(to, from);
    case 'minute':
      return diffMs(to, from) / MS.MINUTE;
    case 'hour':
      return diffMs(to, from) / MS.HOUR;
    case 'day':
      return diffDays(zone, from, to);
    case 'week':
      return diffDays(zone, from, to) / 7;
    case 'month':
      return monthIndex(zone, to) - monthIndex(zone, from);
    case 'year':
      return (monthIndex(zone, to) - monthIndex(zone, from)) / 12;
  }
}

/** `at`'s month, counted continuously from year 0 (`year * 12 + (month - 1)`), so two months'
 *  distance is one subtraction instead of a calendar walk. */
function monthIndex(zone: string, at: Instant): number {
  const plain = toPlain(zone, at);
  return plain.year * 12 + (plain.month - 1);
}

/** One fixed calendar point every zone can count `unit` from, so a stride that does not fit its
 *  anchor container (#489) still lands on the same ticks on every call, never derived from the
 *  caller's own `at` — that is what keeps the lines still on a pan. 1970-01-01T00:00 wall-clock in
 *  `zone`, floored to `unit`: any fixed point works, this one is simplest to state and to test. */
function fixedOrigin(zone: string, unit: TimeUnit): Instant {
  const epochLocal = fromPlain(zone, { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 });
  return startOf(zone, epochLocal, unit);
}

/** The tick immediately after `boundary`, which must already be a valid tick (a `tickFloor` or
 * `nextTick` answer, never an arbitrary instant) — exported so `TimeScale.ticks` can walk a whole
 * window one tick at a time, and `snap.ts` can find both boundaries flanking an instant, without
 * either re-deriving this rule (#489).
 *
 * A plain `stepBy` is right only when `increment` divides its anchor container evenly (15 into an
 * hour's 60 minutes, 6 into a day's 24 hours) — every shipped preset's own increment does, and this
 * is the case `stepFitsAnchorContainer` calls "fits". A `7`-minute step does not divide the hour:
 * strided blindly, 0, 7, … 56 would next give 63 (1:03), quietly crossing into the next hour's own
 * count mid-stride. "Hours count from the day they fall in" (#489) means each hour instead resets
 * the count at 0 — so once the raw stride crosses out of `boundary`'s own container, this resets to
 * that new container's own start (offset 0) instead of continuing the stride across the seam.
 *
 * A stride that does *not* fit its container (`{ day, 10 }`, `{ hour, 30 }`, `{ minute, 90 }`) gets
 * no such reset: resetting would shorten the stated increment down to the container's own span (10
 * days would collapse to the week it started in). This strides on regardless of the container it
 * crosses, so the caller always gets the `increment` it asked for. */
export function nextTick(zone: string, boundary: Instant, unit: TimeUnit, increment: number): Instant {
  if (!stepFitsAnchorContainer(unit, increment)) {
    return stepBy(zone, boundary, unit, increment);
  }
  const container = startOf(zone, boundary, anchorUnit(unit));
  const raw = stepBy(zone, boundary, unit, increment);
  const rawContainer = startOf(zone, raw, anchorUnit(unit));
  return rawContainer === container ? raw : rawContainer;
}

/** The tick boundary at or before `at`: `increment`-many whole `unit`s counted from a fixed start,
 * never from `at`'s own floor (#489). This is the one tick walk `TimeScale.ticks`, `snapInstant`
 * and `nextTickBoundary` all read, so a gridline and a drag snap never disagree.
 *
 * The count starts from the container `at` falls in (`stepFitsAnchorContainer`'s "fits" case) when
 * the stride is small enough to stay inside it — a 6-hour tick (`unit: 'hour', increment: 6`) always
 * lands on 00:00/06:00/12:00/18:00 in `zone`, whichever span is on screen. A stride that does not fit
 * (`{ day, 10 }`) counts instead from one fixed calendar origin (`fixedOrigin`), so the stated
 * increment is never shortened to its container's own span — see `nextTick`'s own doc.
 *
 * Both branches are arithmetic, not a walk: `unitsBetween` gives the exact (possibly fractional)
 * number of `unit`s from the start to `at`, `Math.floor` rounds that down to the last whole
 * `increment`-multiple, and one `stepBy` lands on it. A one-tick-at-a-time walk from the container
 * or origin start would cost up to 60,000 iterations for a millisecond-level tick (#489) — this
 * costs one `startOf`/`stepBy` pair regardless of `unit` or how far `at` sits from the origin.
 *
 * `increment: 1` answers `startOf(zone, at, unit)` directly. The arithmetic below counts real time,
 * so it would land 30 minutes early in a zone whose DST shift is 30 minutes (Lord Howe).
 *
 * On a DST-transition day, `unitsBetween`'s real-time count keeps a tick's spacing even but drops
 * it off a wall-clock multiple until the next day starts — a chosen trade-off, not a bug
 * (ADR 0030). */
export function tickFloor(zone: string, at: Instant, unit: TimeUnit, increment: number): Instant {
  if (!Number.isInteger(increment) || increment <= 0) {
    throw new InvalidSnapIncrementError(unit, increment);
  }
  if (increment === 1) return startOf(zone, at, unit);
  const start = stepFitsAnchorContainer(unit, increment)
    ? startOf(zone, at, anchorUnit(unit))
    : fixedOrigin(zone, unit);
  const steps = Math.floor(unitsBetween(zone, unit, start, at) / increment) * increment;
  return stepBy(zone, start, unit, steps);
}
