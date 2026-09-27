import { describe, expect, it } from 'vitest';
import type {
  Duration,
  StoredEntry,
  FieldKey,
  FieldType,
  Instant,
  RollUpContext,
} from '../../model/index.js';
import { entryId } from '../../model/index.js';
import { SHIPPED_AGGREGATORS } from './aggregators.js';
import { createFieldAccess, createRollUpContext } from './field-access.js';
import { FieldRegistry } from './field-registry.js';

function child(id: string, values: Record<string, unknown>, duration = 1): StoredEntry {
  return {
    id: entryId(id),
    siblingIndex: 0,
    name: id,
    start: 0 as Instant,
    end: duration as Instant,
    props: values,
  };
}

function ms(value: number): Duration {
  return { value, unit: 'millisecond' };
}

/** The real context the Rollup builds, not a hand-rolled stand-in: a shipped Aggregator must read
 *  through the same `values`/`numericValues` a consumer's Aggregator gets (one path). The
 *  children ride on the context now, never beside the parent (ADR 0017). */
function ctx(
  field: FieldKey,
  children: readonly StoredEntry[],
  type: FieldType = { rollUp: 'sum' },
): RollUpContext {
  const registry = new FieldRegistry({
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: field, type: field === 'cost' ? 'money' : type }],
  });
  return createRollUpContext(
    createFieldAccess({ fields: registry, timeZone: 'UTC' }),
    parent,
    children,
    field,
  );
}

const parent: StoredEntry = {
  id: entryId('p'),
  siblingIndex: 0,
  name: 'p',
  start: 0 as Instant,
  end: 0 as Instant,
  props: {},
};

describe('shipped Aggregators (D-S4-3)', () => {
  it('sum / min / max skip holes and return undefined when every child is skipped', () => {
    const children = [child('a', { cost: 1 }), child('b', {}), child('c', { cost: 3 })];
    expect(SHIPPED_AGGREGATORS.sum?.(parent, ctx('cost', children))).toBe(4);
    expect(SHIPPED_AGGREGATORS.min?.(parent, ctx('cost', children))).toBe(1);
    expect(SHIPPED_AGGREGATORS.max?.(parent, ctx('cost', children))).toBe(3);
    expect(SHIPPED_AGGREGATORS.sum?.(parent, ctx('cost', [child('z', {})]))).toBeUndefined();
  });

  it("'none' always returns undefined", () => {
    expect(SHIPPED_AGGREGATORS.none?.(parent, ctx('cost', [child('a', { cost: 1 })]))).toBeUndefined();
  });

  it('count skips holes', () => {
    const children = [child('a', { cost: 1 }), child('b', {}), child('c', { cost: 3 })];
    expect(SHIPPED_AGGREGATORS.count?.(parent, ctx('cost', children))).toBe(2);
    expect(SHIPPED_AGGREGATORS.count?.(parent, ctx('cost', [child('z', {})]))).toBeUndefined();
  });

  it('weightedMeanByDuration skips zero-duration children', () => {
    const children = [child('a', { cost: 10 }, 2), child('b', { cost: 100 }, 0), child('c', { cost: 20 }, 2)];
    expect(SHIPPED_AGGREGATORS.weightedMeanByDuration?.(parent, ctx('cost', children))).toBe(15);
    expect(
      SHIPPED_AGGREGATORS.weightedMeanByDuration?.(parent, ctx('cost', [child('z', { cost: 10 }, 0)])),
    ).toBeUndefined();
  });

  it('sum adds Duration children and answers a Duration in milliseconds', () => {
    const children = [child('a', { effort: ms(1) }), child('b', {}), child('c', { effort: ms(3) })];
    const durationType: FieldType = { rollUp: 'sum' };
    expect(SHIPPED_AGGREGATORS.sum?.(parent, ctx('effort', children, durationType))).toEqual(ms(4));
  });

  it('min and max pick the shortest and the longest Duration child', () => {
    const children = [
      child('a', { effort: ms(2) }),
      child('b', { effort: ms(5) }),
      child('c', { effort: ms(1) }),
    ];
    const durationType: FieldType = { rollUp: 'sum' };
    expect(SHIPPED_AGGREGATORS.min?.(parent, ctx('effort', children, durationType))).toEqual(ms(1));
    expect(SHIPPED_AGGREGATORS.max?.(parent, ctx('effort', children, durationType))).toEqual(ms(5));
  });

  it('a Duration in another unit is a hole', () => {
    const children = [child('a', { effort: { value: 2, unit: 'day' } }), child('b', { effort: ms(3) })];
    const durationType: FieldType = { rollUp: 'sum' };
    expect(SHIPPED_AGGREGATORS.sum?.(parent, ctx('effort', children, durationType))).toEqual(ms(3));
  });

  it('a mixed number and Duration set is a data error: the fold keeps the number path and the Duration is a hole', () => {
    const durationType: FieldType = { rollUp: 'sum' };
    const numberThenDuration = [child('a', { effort: 2 }), child('b', { effort: ms(3) })];
    const durationThenNumber = [child('a', { effort: ms(3) }), child('b', { effort: 2 })];
    expect(SHIPPED_AGGREGATORS.sum?.(parent, ctx('effort', numberThenDuration, durationType))).toBe(2);
    expect(SHIPPED_AGGREGATORS.sum?.(parent, ctx('effort', durationThenNumber, durationType))).toBe(2);
  });
});
