import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { resolveRowDrop } from './row-drop.js';
import type { RowDropInput } from './row-drop.js';
import type { RowsForDrop } from '../layout/row-drop-target.js';
import { rowDropZoneAt } from '../layout/row-drop-zone.js';
import { PLANNED_ROW_KIND } from '../layout/rows/row-source.js';
import type { PlannedRow } from '../layout/rows/row-source.js';
import { entryDoubles } from '../layout/entry-double.js';
import type { EntryDoubleValues } from '../layout/entry-double.js';
import { DatasetState } from '../data/dataset-state.js';
import { rowId } from '../model/index.js';
import type { Entry } from '../model/index.js';

// A random small tree, and a random pointer y over it: does `resolveRowDrop` ever offer a `place`
// that lands an Entry inside its own subtree, does it answer the same zone twice the same way, and
// does the write it computes commit without leaving a sibling group ragged? Every case builds its
// own tree from the same six-id spec, once as `Entry` doubles for the resolver and once as a real
// `DatasetState` for the write.

const NODE_IDS = ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'] as const;
const ROW_HEIGHT = 32;

interface NodeSpec {
  readonly id: (typeof NODE_IDS)[number];
  readonly parentId: (typeof NODE_IDS)[number] | undefined;
}

/** Node `i`'s parent is `undefined` or one of the nodes already placed — index `0..i-1` — so the
 *  tree this builds is always acyclic by construction, never a shape the generator has to reject. */
const treeArb: fc.Arbitrary<readonly NodeSpec[]> = fc.tuple(
  ...NODE_IDS.map((id, i) =>
    i === 0
      ? fc.constant<NodeSpec>({ id, parentId: undefined })
      : fc.option(fc.integer({ min: 0, max: i - 1 }), { nil: undefined }).map((parentIndex): NodeSpec => ({
          id,
          parentId: parentIndex === undefined ? undefined : NODE_IDS[parentIndex],
        })),
  ),
);

/** Every node's rank among its siblings, read off its position in `specs` — the same list-order
 *  rule `siblingIndexesInListOrder` states, and the rule both the `Entry` doubles below and the real
 *  `DatasetState` fixture agree on, so the two trees start out with the same ranks. */
function withSiblingIndexes(specs: readonly NodeSpec[]): readonly EntryDoubleValues[] {
  const nextRank = new Map<string | undefined, number>();
  return specs.map((spec) => {
    const rank = nextRank.get(spec.parentId) ?? 0;
    nextRank.set(spec.parentId, rank + 1);
    return {
      id: spec.id,
      ...(spec.parentId !== undefined ? { parentId: spec.parentId } : {}),
      props: { siblingIndex: rank },
    };
  });
}

/** One flattened row per Entry, depth-first, every row expanded — the same shape a real row source
 *  produces for a row source that fully mirrors the tree. */
function rowsFor(entries: readonly Entry[]): { rows: readonly PlannedRow[]; roots: readonly Entry[] } {
  const byParent = new Map<string, Entry[]>();
  const roots: Entry[] = [];
  for (const entry of entries) {
    const parent = entry.parent();
    if (parent === undefined) {
      roots.push(entry);
      continue;
    }
    const siblings = byParent.get(String(parent.id)) ?? [];
    siblings.push(entry);
    byParent.set(String(parent.id), siblings);
  }
  const rows: PlannedRow[] = [];
  let index = 0;
  const walk = (list: readonly Entry[], depth: number): void => {
    for (const entry of list) {
      rows.push({
        id: rowId(entry.id),
        kind: PLANNED_ROW_KIND.entry,
        index: index++,
        depth,
        entryIds: [entry.id],
        expandable: entry.hasChildren,
        expanded: true,
      });
      walk(byParent.get(String(entry.id)) ?? [], depth + 1);
    }
  };
  walk(roots, 0);
  return { rows, roots };
}

function rowsForDropOf(entries: readonly Entry[]): RowsForDrop {
  const { rows, roots } = rowsFor(entries);
  const byId = new Map(entries.map((entry) => [String(entry.id), entry]));
  return {
    rows,
    rowTop: (index) => index * ROW_HEIGHT,
    rowHeightAt: () => ROW_HEIGHT,
    entryOf: (id) => byId.get(String(id)),
    rootEntries: () => roots,
  };
}

function heightsFor(rowCount: number) {
  return {
    indexAtY: (y: number) => Math.min(rowCount - 1, Math.max(0, Math.floor(y / ROW_HEIGHT))),
    topAt: (index: number) => index * ROW_HEIGHT,
    heightAt: () => ROW_HEIGHT,
    totalHeight: rowCount * ROW_HEIGHT,
  };
}

const ALWAYS_CAN_PLACE = (): boolean => true;

function resolveAt(
  entries: readonly Entry[],
  rowsForDrop: RowsForDrop,
  sourceRowIndex: number,
  y: number,
): ReturnType<typeof resolveRowDrop> {
  const zone = rowDropZoneAt(
    {
      y,
      sourceRowIndex,
      heights: heightsFor(rowsForDrop.rows.length),
      rowCount: rowsForDrop.rows.length,
      takesWholeRowInto: () => false,
    },
    { kind: 'sourceRow' },
  );
  const input: RowDropInput = {
    zone,
    movedTopMost: [entries[sourceRowIndex]!],
    rows: rowsForDrop,
    canPlace: ALWAYS_CAN_PLACE,
    verticalDropOffered: true,
  };
  return resolveRowDrop(input);
}

describe('resolveRowDrop property', () => {
  it('never places an Entry inside its own subtree, answers the same zone the same way twice, and commits clean', () => {
    fc.assert(
      fc.property(
        treeArb,
        fc.integer({ min: 0, max: NODE_IDS.length - 1 }),
        fc.integer({ min: -ROW_HEIGHT, max: ROW_HEIGHT * (NODE_IDS.length + 1) }),
        (specs, sourceRowIndex, y) => {
          const entries = entryDoubles(withSiblingIndexes(specs));
          const rowsForDrop = rowsForDropOf(entries);
          const grabbed = entries[sourceRowIndex]!;

          const first = resolveAt(entries, rowsForDrop, sourceRowIndex, y);
          const second = resolveAt(entries, rowsForDrop, sourceRowIndex, y);
          expect(second).toEqual(first);

          if (first.kind !== 'place') return;

          const subtreeIds = new Set([grabbed.id, ...grabbed.descendants().map((entry) => entry.id)]);
          expect(first.place.parentId === undefined || !subtreeIds.has(first.place.parentId)).toBe(true);

          const state = new DatasetState({
            timeZone: 'UTC',
            entries: specs.map((spec) => ({
              id: spec.id,
              name: spec.id,
              start: 0,
              end: 1,
              parentId: spec.parentId,
            })),
          });
          expect(() => {
            state.transaction(() => {
              for (const move of first.moves) {
                state.entries.update(move.id, { parentId: move.parentId, siblingIndex: move.at });
              }
            });
          }).not.toThrow();

          const ranksByGroup = new Map<string, number[]>();
          for (const entry of state.entries.all) {
            const groupKey = String(entry.parent()?.id ?? 'root');
            const ranks = ranksByGroup.get(groupKey) ?? [];
            ranks.push(entry.read('siblingIndex') as number);
            ranksByGroup.set(groupKey, ranks);
          }
          for (const ranks of ranksByGroup.values()) {
            expect([...ranks].sort((a, b) => a - b)).toEqual(ranks.map((_unused, index) => index));
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
