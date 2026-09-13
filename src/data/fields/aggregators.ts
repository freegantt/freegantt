// data/ — shipped Aggregators, registered by name (D-S4-3). A name serializes; a function does not.
// Skip holes (`undefined`, non-numeric for sum/min/max, zero-duration children for the weighted
// mean) and never throw. Every child skipped → `undefined`, meaning "no opinion" (`model/field.ts`).
// On a roll-up parent that clears the stored value instead of keeping it — `rollup.ts` (#270),
// because nothing but the Rollup may have written that cell in the first place.

import type { Aggregator, RollUpContext } from '../../model/index.js';

/** The one place this rule is written: a value counts only when it is a finite number.
 *  `ctx.numericValues` applies the same rule to a whole child list (issue #124). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** A weight of `undefined` drops the child: a non-spanning Entry (ADR 0012) has no duration, and a
 *  zero-length one carries no weight. */
function weightOf(duration: { value: number } | undefined): number | undefined {
  if (duration === undefined || !isFiniteNumber(duration.value) || duration.value === 0) return undefined;
  return duration.value;
}

/** `min`, `max` and `sum` are one shape: fold this Field's numbers across the children, and keep the
 *  stored value (`undefined`) when every child is a hole. */
function foldNumbers(ctx: RollUpContext, fold: (found: number, value: number) => number): number | undefined {
  const values = ctx.numericValues();
  return values.length === 0 ? undefined : values.reduce(fold);
}

const min: Aggregator<number> = (_parent, ctx) => foldNumbers(ctx, (found, value) => Math.min(found, value));

const max: Aggregator<number> = (_parent, ctx) => foldNumbers(ctx, (found, value) => Math.max(found, value));

const sum: Aggregator<number> = (_parent, ctx) => foldNumbers(ctx, (found, value) => found + value);

const count: Aggregator<number> = (_parent, ctx) => {
  const n = ctx.values().filter((value) => value !== undefined).length;
  return n === 0 ? undefined : n;
};

const none: Aggregator = () => undefined;

const weightedMeanByDuration: Aggregator<number> = (_parent, ctx) => {
  const values = ctx.values();
  const durations = ctx.durations();
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
