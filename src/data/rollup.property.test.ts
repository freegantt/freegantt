import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { readField } from './fields/field-access.js';
import { SHIPPED_AGGREGATORS } from './fields/aggregators.js';
import type { EntryInput } from '../model/index.js';

function moneyDataset(entries: readonly EntryInput[]): DatasetState {
  return new DatasetState({
    entries,
    timeZone: 'UTC',
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
  });
}

function assertParentsMatchCostSum(state: DatasetState): void {
  const field = state.fields.get('cost')!;
  for (const parent of state.entries.all) {
    if (!state.isRollUpKind(parent.kind)) continue;
    const children = state.entries.childrenOf(parent.id);
    if (children.length === 0) continue;
    const expected = SHIPPED_AGGREGATORS.sum?.(children, parent, {
      field: 'cost',
      read: (entry, key) => state.fieldContext.read(entry, key),
    });
    expect(readField(parent, field, state.fieldContext)).toBe(expected);
  }
}

const treeArb = fc.record({
  nest: fc.boolean(),
  costs: fc.array(fc.integer({ min: 0, max: 100 }), { minLength: 1, maxLength: 6 }),
  edits: fc.array(
    fc.record({
      index: fc.nat(),
      cost: fc.integer({ min: 0, max: 100 }),
    }),
    { maxLength: 5 },
  ),
});

describe('rollUpFields property (S4.2 §3)', () => {
  it('every rolling-up parent equals its Aggregator over its children after commit', () => {
    fc.assert(
      fc.property(treeArb, ({ nest, costs, edits }) => {
        const parentId = nest ? 'mid' : 'root';
        const entries: EntryInput[] = [
          { id: 'root', kind: 'group', name: 'root' },
          ...(nest ? [{ id: 'mid', parentId: 'root', kind: 'group' as const, name: 'mid' }] : []),
          ...costs.map((cost, i) => ({
            id: `l${i}`,
            parentId,
            name: `l${i}`,
            start: '2026-01-01',
            end: '2026-01-02',
            meta: { cost },
          })),
        ];
        const state = moneyDataset(entries);
        assertParentsMatchCostSum(state);

        for (const edit of edits) {
          const id = `l${edit.index % costs.length}`;
          state.entries.update(id, { cost: edit.cost });
        }
        assertParentsMatchCostSum(state);
      }),
      { numRuns: 40 },
    );
  });
});
