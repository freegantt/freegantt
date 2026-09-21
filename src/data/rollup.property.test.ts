import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { SHIPPED_AGGREGATORS } from './fields/aggregators.js';
import { createRollUpContext } from './fields/field-access.js';
import type { EntryInput } from '../model/index.js';
import { MS, diffMs } from '../time/index.js';

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
  const stored = state.entries.storedValues;
  for (const parent of state.entries.all) {
    const children = (parent.children() ?? []).map((child) => stored.get(child.id)!);
    if (children.length === 0) continue;
    const storedParent = stored.get(parent.id)!;
    const ctx = createRollUpContext(state.fieldAccess, storedParent, children, 'cost');
    expect(parent.read('cost')).toBe(aggregator?.(storedParent, ctx));
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

// #466 case 3, over random trees. The one mistake `leaves` invites is answering the envelope instead
// of the work: a `leaves` that returned the row itself, or that stopped one level short, would total
// something that still looks plausible on any single fixture. So this asserts against a leaf sum this
// file computes on its own.
//
// Every leaf is laid end to end with a gap after it, so no two leaves overlap. That is deliberate and
// load-bearing: work stays inside the span only while the leaves are disjoint. Two leaves on the same
// days work two days between them and span one, so `work <= span` is a fact about a disjoint plan,
// never a fact about `leaves` — and a property test that claimed it over overlapping leaves would be
// asserting something false.
describe('leaves(root) totals the work, never the span (#466 case 3)', () => {
  const dayISO = (day: number): string => `2026-01-${String(day).padStart(2, '0')}T00:00:00Z`;

  const leafArb = fc.record({
    /** 0 puts the leaf under the root, 1 under `mid`, 2 under `deep` — so a run reaches three levels. */
    under: fc.integer({ min: 0, max: 2 }),
    lengthDays: fc.integer({ min: 1, max: 3 }),
    /** Empty days after this leaf, which is what the row above works through and does not count. */
    gapDays: fc.integer({ min: 0, max: 2 }),
  });

  it('every row’s work equals the sum of its own leaves’ durations, and the gaps go uncounted', () => {
    fc.assert(
      fc.property(fc.array(leafArb, { minLength: 2, maxLength: 4 }), (leaves) => {
        const branchOf = ['root', 'mid', 'deep'] as const;
        let day = 1;
        const placed = leaves.map((leaf, i) => {
          const startDay = day;
          day += leaf.lengthDays + leaf.gapDays;
          return { ...leaf, id: `l${i}`, startDay, parentId: branchOf[leaf.under]! };
        });
        const entries: EntryInput[] = [
          { id: 'root', name: 'root' },
          { id: 'mid', name: 'mid', parentId: 'root' },
          { id: 'deep', name: 'deep', parentId: 'mid' },
          ...placed.map((leaf) => ({
            id: leaf.id,
            name: leaf.id,
            parentId: leaf.parentId,
            start: dayISO(leaf.startDay),
            end: dayISO(leaf.startDay + leaf.lengthDays),
          })),
        ];
        const state = new DatasetState({
          entries,
          timeZone: 'UTC',
          fields: [
            {
              key: 'work',
              compute: (entry, ctx) =>
                ctx
                  .leaves(entry)
                  .reduce(
                    (total, leaf) =>
                      leaf.start === undefined || leaf.end === undefined
                        ? total
                        : total + diffMs(leaf.end, leaf.start),
                    0,
                  ),
            },
          ],
        });

        // The leaf sum this file computes, from the seed alone. `deep` counts as a leaf of zero
        // duration when nothing hangs under it, and `workUnder` answers 0 for it without a special
        // case — a subtree of one dateless leaf works nothing.
        const inSubtreeOf = (id: string, ancestorId: string): boolean => {
          const above: Record<string, string | undefined> = { root: undefined, mid: 'root', deep: 'mid' };
          let at: string | undefined = id;
          while (at !== undefined) {
            if (at === ancestorId) return true;
            at = above[at] ?? placed.find((leaf) => leaf.id === at)?.parentId;
          }
          return false;
        };
        const workUnder = (ancestorId: string): number =>
          placed
            .filter((leaf) => inSubtreeOf(leaf.id, ancestorId))
            .reduce((total, leaf) => total + leaf.lengthDays * MS.DAY, 0);

        for (const id of ['root', 'mid', 'deep']) {
          const row = state.entries.get(id)!;
          expect(row.read('work')).toBe(workUnder(id));
          if (row.start === undefined || row.end === undefined) continue;
          // The leaves are disjoint, so a row never works longer than it spans. The difference is
          // the empty days between its leaves, which is what `leaves` leaves out.
          expect(row.read('work')).toBeLessThanOrEqual(diffMs(row.end, row.start));
        }

        // The root spans everything and works only the leaves, so the difference is exactly the gaps
        // between them — the number the whole case exists to keep out of the total.
        const root = state.entries.get('root')!;
        const lastGap = placed[placed.length - 1]!.gapDays;
        const gapsInside = placed.reduce((total, leaf) => total + leaf.gapDays, 0) - lastGap;
        expect(diffMs(root.end!, root.start!) - (root.read('work') as number)).toBe(gapsInside * MS.DAY);
      }),
      { numRuns: 60 },
    );
  });
});
