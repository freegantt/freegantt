import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { SHIPPED_AGGREGATORS } from './fields/aggregators.js';
import { createRollUpContext } from './fields/field-access.js';
import type { EntryInput } from '../model/index.js';

const ROLLUP_AGGREGATORS = [
  'sum',
  'min',
  'max',
  'count',
  'weightedMeanByDuration',
  'none',
] as const satisfies readonly (keyof typeof SHIPPED_AGGREGATORS)[];

function metricDataset(
  entries: readonly EntryInput[],
  rollUp: (typeof ROLLUP_AGGREGATORS)[number],
): DatasetState {
  return new DatasetState({
    entries,
    timeZone: 'UTC',
    fieldTypes: { money: { rollUp } },
    fields: [{ key: 'cost', type: 'money' }],
  });
}

function assertParentsMatchAggregator(
  state: DatasetState,
  rollUp: (typeof ROLLUP_AGGREGATORS)[number],
): void {
  const aggregator = SHIPPED_AGGREGATORS[rollUp];
  for (const parent of state.entries.all) {
    const children = (state.entries.get(parent.id)?.children() ?? []);
    if (children.length === 0) continue;
    const expected = aggregator?.(children, parent, createRollUpContext(state.fieldContext, 'cost'));
    expect(state.fieldContext.read(parent, 'cost')).toBe(expected);
  }
}

const treeArb = fc.record({
  nest: fc.boolean(),
  costs: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 2, maxLength: 6 }),
  edits: fc.array(
    fc.record({
      index: fc.nat(),
      cost: fc.integer({ min: 0, max: 100 }),
    }),
    { maxLength: 5 },
  ),
  removes: fc.array(fc.nat(), { maxLength: 3 }),
});

describe('rollUpFields property (S4.2 §3)', () => {
  it.each(ROLLUP_AGGREGATORS)(
    'every rolling-up parent equals its %s Aggregator over its children after commit',
    (rollUp) => {
      fc.assert(
        fc.property(treeArb, ({ nest, costs, edits, removes }) => {
          const parentId = nest ? 'mid' : 'root';
          const entries: EntryInput[] = [
            { id: 'root', name: 'root' },
            ...(nest ? [{ id: 'mid', parentId: 'root', name: 'mid' }] : []),
            ...costs.map((cost, i) => ({
              id: `l${i}`,
              parentId,
              name: `l${i}`,
              start: '2026-01-01',
              end: `2026-01-${String(2 + (i % 4)).padStart(2, '0')}`,
              props: { cost },
            })),
          ];
          const state = metricDataset(entries, rollUp);
          assertParentsMatchAggregator(state, rollUp);

          for (const edit of edits) {
            const id = `l${edit.index % costs.length}`;
            if (state.entries.has(id)) state.entries.update(id, { cost: edit.cost });
          }
          assertParentsMatchAggregator(state, rollUp);

          for (const removeIndex of removes) {
            const id = `l${removeIndex % costs.length}`;
            if (state.entries.has(id)) state.entries.remove(id);
            assertParentsMatchAggregator(state, rollUp);
          }
        }),
        { numRuns: 40 },
      );
    },
  );
});
