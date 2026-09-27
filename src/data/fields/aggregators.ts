// data/ — shipped Aggregators, registered by name. A name serializes; a function does not.
// Skip holes (`undefined`, neither a number nor a millisecond Duration for sum/min/max,
// zero-duration children for the weighted mean) and never throw. Every child skipped →
// `undefined`, meaning "no opinion" (`model/field.ts`). On a roll-up parent that clears the stored
// value instead of keeping it — `rollup.ts` (#270), because nothing but the Rollup may have
// written that cell in the first place.

import type { Aggregator, Duration, RollUpContext } from '../../model/index.js';

/** The one place this rule is written: a value counts only when it is a finite number.
 *  `ctx.numericValues` applies the same rule to a whole child list (issue #124). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A weight of `undefined` drops the child: a non-spanning Entry (ADR 0012) has no duration, and a
 *  zero-length one carries no weight. */
function weightOf(duration: Duration | undefined): number | undefined {
  if (duration === undefined || !isFiniteNumber(duration.value) || duration.value === 0) return undefined;
  return duration.value;
}

/** A value counts as a Duration for `sum`/`min`/`max` only in `'millisecond'` — the unit every
 *  computed Duration ships in. A Duration in another unit is a hole, the same as a non-numeric
 *  value: this fold never converts units on a consumer's behalf. */
function isMillisecondDuration(value: unknown): value is Duration {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Duration).unit === 'millisecond' &&
    isFiniteNumber((value as Duration).value)
  );
}

/** `min`, `max` and `sum` are one shape: fold this Field's values across the children, and keep the
 *  stored value (`undefined`) when every child is a hole. A child counts as a number or as a
 *  millisecond Duration; when every counted child is a Duration, the answer is a Duration too. */
function foldNumbers(
  ctx: RollUpContext,
  fold: (found: number, value: number) => number,
): number | Duration | undefined {
  const durations = ctx.values().filter(isMillisecondDuration);
  if (durations.length > 0) {
    return { value: durations.map((duration) => duration.value).reduce(fold), unit: 'millisecond' };
  }
  const values = ctx.numericValues();
  return values.length === 0 ? undefined : values.reduce(fold);
}

const min: Aggregator<number | Duration> = (_parent, ctx) =>
  foldNumbers(ctx, (found, value) => Math.min(found, value));

const max: Aggregator<number | Duration> = (_parent, ctx) =>
  foldNumbers(ctx, (found, value) => Math.max(found, value));

const sum: Aggregator<number | Duration> = (_parent, ctx) =>
  foldNumbers(ctx, (found, value) => found + value);

const count: Aggregator<number> = (_parent, ctx) => {
  const n = ctx.values().filter((value) => value !== undefined).length;
  return n === 0 ? undefined : n;
};

const none: Aggregator = () => undefined;

const weightedMeanByDuration: Aggregator<number> = (_parent, ctx) => {
  const values = ctx.values();
  const durations = ctx.values('duration');
  let total = 0;
  let weight = 0;
  values.forEach((value, index) => {
    const duration = weightOf(durations[index]);
    if (!isFiniteNumber(value) || duration === undefined) return;
    total += value * duration;
    weight += duration;
  });
  return weight === 0 ? undefined : total / weight;
};

export const SHIPPED_AGGREGATORS = Object.freeze({
  min,
  max,
  sum,
  count,
  none,
  weightedMeanByDuration,
});
