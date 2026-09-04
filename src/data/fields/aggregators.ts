// data/ — shipped Aggregators, registered by name (D-S4-3). A name serializes; a function does not.
// Skip holes (`undefined`, non-numeric for sum/min/max, zero-duration children for the weighted
// mean) and never throw. Every child skipped → `undefined` (keep the stored value).

import type { Aggregator, Entry, RollUpContext } from '../../model/index.js';

/** The one place this rule is written: a value counts only when it is a finite number.
 *  `ctx.numericValues` applies the same rule to a whole child list (issue #124). */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function durationMs(ctx: RollUpContext, entry: Entry): number | undefined {
  const duration = ctx.durationOf(entry);
  if (!isFiniteNumber(duration.value) || duration.value === 0) return undefined;
  return duration.value;
}

/** `min`, `max` and `sum` are one shape: fold this Field's numbers across the children, and keep the
 *  stored value (`undefined`) when every child is a hole. */
function foldNumbers(
  ctx: RollUpContext,
  children: readonly Entry[],
  fold: (found: number, value: number) => number,
): number | undefined {
  const values = ctx.numericValues(children);
  return values.length === 0 ? undefined : values.reduce(fold);
}

const min: Aggregator<number> = (children, _parent, ctx) =>
  foldNumbers(ctx, children, (found, value) => Math.min(found, value));

const max: Aggregator<number> = (children, _parent, ctx) =>
  foldNumbers(ctx, children, (found, value) => Math.max(found, value));

const sum: Aggregator<number> = (children, _parent, ctx) =>
  foldNumbers(ctx, children, (found, value) => found + value);

const count: Aggregator<number> = (children, _parent, ctx) => {
  const n = ctx.values(children).filter((value) => value !== undefined).length;
  return n === 0 ? undefined : n;
};

const none: Aggregator = () => undefined;

const weightedMeanByDuration: Aggregator<number> = (children, _parent, ctx) => {
  let total = 0;
  let weight = 0;
  for (const child of children) {
    const value = ctx.read(child, ctx.field);
    const duration = durationMs(ctx, child);
    if (!isFiniteNumber(value) || duration === undefined) continue;
    total += value * duration;
    weight += duration;
  }
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
