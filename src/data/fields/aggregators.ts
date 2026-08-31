// data/ — shipped Aggregators, registered by name (D-S4-3). A name serializes; a function does not.
// Skip holes (`undefined`, non-numeric for sum/min/max, zero-duration children for the weighted
// mean) and never throw. Every child skipped → `undefined` (keep the stored value).

import type { Aggregator, Duration, Entry, RollUpContext } from '../../model/index.js';

function readNumber(ctx: RollUpContext, entry: Entry): number | undefined {
  const value = ctx.read<unknown>(entry, ctx.field);
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function durationMs(ctx: RollUpContext, entry: Entry): number | undefined {
  const duration = ctx.read<Duration>(entry, 'duration');
  if (duration === undefined) return undefined;
  if (typeof duration.value !== 'number' || !Number.isFinite(duration.value)) return undefined;
  if (duration.value === 0) return undefined;
  return duration.value;
}

const min: Aggregator<number> = (children, _parent, ctx) => {
  let found: number | undefined;
  for (const child of children) {
    const value = readNumber(ctx, child);
    if (value === undefined) continue;
    found = found === undefined ? value : Math.min(found, value);
  }
  return found;
};

const max: Aggregator<number> = (children, _parent, ctx) => {
  let found: number | undefined;
  for (const child of children) {
    const value = readNumber(ctx, child);
    if (value === undefined) continue;
    found = found === undefined ? value : Math.max(found, value);
  }
  return found;
};

const sum: Aggregator<number> = (children, _parent, ctx) => {
  let found: number | undefined;
  for (const child of children) {
    const value = readNumber(ctx, child);
    if (value === undefined) continue;
    found = (found ?? 0) + value;
  }
  return found;
};

const count: Aggregator<number> = (children, _parent, ctx) => {
  let n = 0;
  let any = false;
  for (const child of children) {
    if (ctx.read<unknown>(child, ctx.field) === undefined) continue;
    any = true;
    n += 1;
  }
  return any ? n : undefined;
};

const none: Aggregator = () => undefined;

const weightedMeanByDuration: Aggregator<number> = (children, _parent, ctx) => {
  let total = 0;
  let weight = 0;
  for (const child of children) {
    const value = readNumber(ctx, child);
    const duration = durationMs(ctx, child);
    if (value === undefined || duration === undefined) continue;
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
