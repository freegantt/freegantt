// data/ — entries.sync() (#517), the contract property: for any valid target list, sync(list) lands
// the same data load(list) would, undo hands the exact prior state back, and syncing the current
// state's own toInput() list is a no-op. Beside entry-batch-changes.test.ts's diff property and
// entry-store.load.property.test.ts's shuffle property, at the entries.sync() call site.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';
import type { FlatEntryInput } from '../model/index.js';

// Two mid-level parents, two children each, so a shrink can remove a whole parent and force its
// surviving children to move under the other parent or up to root — the "a removed parent's
// children move to another parent" case the property must cover.
const parents = ['m1', 'm2'] as const;
const childIds = ['c1', 'c2', 'c3', 'c4'] as const;
const newIds = ['n1', 'n2'] as const;
const originalParentOf: Readonly<Record<string, string>> = { c1: 'm1', c2: 'm1', c3: 'm2', c4: 'm2' };
interface Props {
  readonly cost?: number;
  readonly note?: string | undefined;
}

// m1 and c1 seed a real `note`, so the "keep" case below has an existing props value to carry
// forward — with every seed row starting at no `note`, "clear" and "keep" would read identically
// and the property would never exercise a cleared key.
const seedNoteOf: Readonly<Record<string, string>> = { m1: 'seed-m1', c1: 'seed-c1' };

const seedInputs: readonly FlatEntryInput<Props>[] = [
  { id: 'm1', name: 'm1', start: 0, end: 1, cost: 10, props: { note: seedNoteOf['m1'] } },
  { id: 'm2', name: 'm2', start: 0, end: 1, cost: 10 },
  { id: 'c1', name: 'c1', parentId: 'm1', start: 0, end: 1, cost: 10, props: { note: seedNoteOf['c1'] } },
  { id: 'c2', name: 'c2', parentId: 'm1', start: 0, end: 1, cost: 10 },
  { id: 'c3', name: 'c3', parentId: 'm2', start: 0, end: 1, cost: 10 },
  { id: 'c4', name: 'c4', parentId: 'm2', start: 0, end: 1, cost: 10 },
];

function seededDataset(): DatasetState {
  return new DatasetState({
    entries: seedInputs,
    timeZone: 'UTC',
    fields: [{ key: 'note' }, { key: 'cost', type: 'number', rollUp: 'sum' }],
  });
}

const noteEdit = fc.constantFrom<'keep' | 'set' | 'clear'>('keep', 'set', 'clear');

const targetArbitrary = fc.record({
  // Shuffled, not a plain subarray: a kept sibling's rank among its own parent's children is list
  // position (`entry-batch.ts`'s "list position always wins"), so shuffling the kept set is what
  // exercises a reorder — the "reorders" case the generator must cover.
  keptParents: fc.shuffledSubarray([...parents]),
  keptChildren: fc.shuffledSubarray([...childIds]),
  addedIds: fc.subarray([...newIds]),
  // A rename, a props set/clear and a reparent target, per surviving id — renames and note edits
  // read past a removed id (the dictionary simply goes unused for it), which is fine: only a kept
  // id's entry actually reaches `buildTarget`.
  renamed: fc.dictionary(fc.constantFrom(...parents, ...childIds), fc.boolean()),
  noteEdits: fc.dictionary(fc.constantFrom(...parents, ...childIds), noteEdit),
  reparentTo: fc.dictionary(fc.constantFrom(...childIds), fc.constantFrom('m1', 'm2', 'root')),
});

interface TargetParams {
  readonly keptParents: readonly string[];
  readonly keptChildren: readonly string[];
  readonly addedIds: readonly string[];
  readonly renamed: Readonly<Record<string, boolean>>;
  readonly noteEdits: Readonly<Record<string, 'keep' | 'set' | 'clear'>>;
  readonly reparentTo: Readonly<Record<string, string>>;
}

/** Builds a valid target list from generator picks: a kept parent's own `props`/name may change, a
 *  kept child reparents onto a kept parent (or up to root, when its requested parent is not kept, or
 *  was removed), and `addedIds` land as fresh roots. Listed added-then-child-then-parent, a genuine
 *  reorder against the seed's parent-then-child order — the "reorders" case the property covers
 *  without a separate shuffle arbitrary. */
function buildTarget(params: TargetParams): FlatEntryInput<Props>[] {
  const keptParentSet = new Set(params.keptParents);

  const inputFor = (id: string, parentId: string | undefined): FlatEntryInput<Props> => {
    const note = params.noteEdits[id] ?? 'keep';
    const seedNote = seedNoteOf[id];
    return {
      id,
      name: params.renamed[id] ? `${id}-renamed` : id,
      start: 0,
      end: 1,
      parentId,
      cost: 10,
      ...(note === 'set'
        ? { props: { note: `${id}-fresh` } }
        : note === 'clear'
          ? { props: { note: undefined } }
          : // "keep" carries a seeded note forward — omitting `props` here would itself clear it.
            seedNote !== undefined
            ? { props: { note: seedNote } }
            : {}),
    };
  };

  const list: FlatEntryInput<Props>[] = [];
  for (const id of params.addedIds) list.push(inputFor(id, undefined));
  for (const id of params.keptChildren) {
    const desired = params.reparentTo[id] ?? originalParentOf[id];
    const parentId =
      desired !== undefined && desired !== 'root' && keptParentSet.has(desired) ? desired : undefined;
    list.push(inputFor(id, parentId));
  }
  for (const id of params.keptParents) list.push(inputFor(id, undefined));
  return list;
}

function declaredNonComputeFields(state: DatasetState) {
  return state.fields.all.filter((field) => !('compute' in field));
}

/** Same ids in the same order, the same tree, and the same value for every declared, non-compute
 *  Field (`siblingIndex` included) — read the way a consumer reads, through `Entry.read`, which is
 *  `readField` underneath (`live-entry.ts`). What D4 means by "the data equals `load(list)`". */
function expectSameShape(a: DatasetState, b: DatasetState): void {
  expect(a.entries.all.map((entry) => entry.id)).toEqual(b.entries.all.map((entry) => entry.id));

  const fields = declaredNonComputeFields(a);
  for (const entry of a.entries.all) {
    const other = b.entries.get(entry.id)!;
    expect(other.parent()?.id).toEqual(entry.parent()?.id);
    for (const field of fields) {
      expect(a.fields.valuesEqual(String(field.key), entry.read(field.key), other.read(field.key))).toBe(
        true,
      );
    }
  }
}

describe('entries.sync, the contract properties (#517)', () => {
  it('leaves the same ids, Field values (siblingIndex included) and tree as load(list), from the same start', () => {
    fc.assert(
      fc.property(targetArbitrary, (params) => {
        const target = buildTarget(params);

        const synced = seededDataset();
        synced.entries.sync(target);

        const loaded = seededDataset();
        loaded.entries.load(target);

        expectSameShape(synced, loaded);
      }),
      { numRuns: 50 },
    );
  });

  it('a sync records no undo step and leaves canUndo and canRedo as they were', () => {
    fc.assert(
      fc.property(targetArbitrary, (params) => {
        const target = buildTarget(params);
        const state = seededDataset();
        const store = state.pluginStores.reserve<{ tag: string }>('demo.store');
        for (const seed of seedInputs) store.set(seed.id, { tag: `${seed.id}-row` });

        const canUndoBefore = state.canUndo;
        const canRedoBefore = state.canRedo;

        state.entries.sync(target);

        // A removed id's store row goes right away, checked here so a broken removal (the row
        // silently kept) cannot pass by never having moved at all.
        const keptAfterSync = new Set(state.entries.all.map((entry) => entry.id));
        for (const seed of seedInputs) {
          if (!keptAfterSync.has(entryId(seed.id))) expect(store.get(seed.id)).toBeUndefined();
        }

        expect(state.canUndo).toBe(canUndoBefore);
        expect(state.canRedo).toBe(canRedoBefore);
      }),
      { numRuns: 50 },
    );
  });

  it("sync of the current entries' own toInput() list commits nothing", () => {
    fc.assert(
      fc.property(targetArbitrary, (params) => {
        const target = buildTarget(params);
        const state = seededDataset();
        state.entries.sync(target);

        const allBefore = state.entries.all;
        let fired = false;
        state.on('beforeChange', () => {
          fired = true;
        });
        state.on('change', () => {
          fired = true;
        });

        state.entries.sync(state.entries.all.map((entry) => entry.toInput()));

        expect(fired).toBe(false);
        expect(state.entries.all).toBe(allBefore);
      }),
      { numRuns: 50 },
    );
  });
});
