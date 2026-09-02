import { describe, expect, it } from 'vitest';
import type { Entry, FieldKey, RollUpContext } from '../../model/index.js';
import { entryId } from '../../model/index.js';
import { SHIPPED_AGGREGATORS } from './aggregators.js';
import { createFieldContext, createRollUpContext } from './field-access.js';
import { FieldRegistry } from './field-registry.js';

function child(id: string, values: Record<string, unknown>, duration = 1): Entry {
  return {
    id: entryId(id),
    name: id,
    kind: 'span',
    start: 0 as Entry['start'],
    end: duration as Entry['end'],
    meta: values,
  };
}

/** The real context the Rollup builds, not a hand-rolled stand-in: a shipped Aggregator must read
 *  through the same `values`/`numericValues` a consumer's Aggregator gets (D-S4-8, one path). */
function ctx(field: FieldKey): RollUpContext {
  const registry = new FieldRegistry({
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: field, type: 'money' }],
  });
  return createRollUpContext(createFieldContext(registry, 'UTC'), field);
}

const parent: Entry = {
  id: entryId('p'),
  name: 'p',
  kind: 'group',
  start: 0 as Entry['start'],
  end: 0 as Entry['end'],
};

describe('shipped Aggregators (D-S4-3)', () => {
  it('sum / min / max skip holes and return undefined when every child is skipped', () => {
    const children = [child('a', { cost: 1 }), child('b', {}), child('c', { cost: 3 })];
    expect(SHIPPED_AGGREGATORS.sum?.(children, parent, ctx('cost'))).toBe(4);
    expect(SHIPPED_AGGREGATORS.min?.(children, parent, ctx('cost'))).toBe(1);
    expect(SHIPPED_AGGREGATORS.max?.(children, parent, ctx('cost'))).toBe(3);
    expect(SHIPPED_AGGREGATORS.sum?.([child('z', {})], parent, ctx('cost'))).toBeUndefined();
  });

  it("'none' always returns undefined", () => {
    expect(SHIPPED_AGGREGATORS.none?.([child('a', { cost: 1 })], parent, ctx('cost'))).toBeUndefined();
  });

  it('count skips holes', () => {
    const children = [child('a', { cost: 1 }), child('b', {}), child('c', { cost: 3 })];
    expect(SHIPPED_AGGREGATORS.count?.(children, parent, ctx('cost'))).toBe(2);
    expect(SHIPPED_AGGREGATORS.count?.([child('z', {})], parent, ctx('cost'))).toBeUndefined();
  });

  it('weightedMeanByDuration skips zero-duration children', () => {
    const children = [child('a', { cost: 10 }, 2), child('b', { cost: 100 }, 0), child('c', { cost: 20 }, 2)];
    expect(SHIPPED_AGGREGATORS.weightedMeanByDuration?.(children, parent, ctx('cost'))).toBe(15);
    expect(
      SHIPPED_AGGREGATORS.weightedMeanByDuration?.([child('z', { cost: 10 }, 0)], parent, ctx('cost')),
    ).toBeUndefined();
  });
});
