import { describe, expect, it } from 'vitest';
import { entryId } from '../../model/index.js';
import type { ChangeSet, Field, StoredEntry, Instant, ProposedEdit } from '../../model/index.js';
import {
  createComputeContext,
  createFieldAccess,
  createRollUpContext,
  editProposesField,
  emptyProposedEdit,
  mergeProposedEdits,
  entryAfterEdit,
  proposedKeysOf,
  readField,
  readingChildrenFrom,
  withProposedKeys,
  writeField,
  writeOntoEntry,
} from './field-access.js';
import { FieldRegistry } from './field-registry.js';
import { DatasetState } from '../dataset-state.js';
import { fieldRowsOf } from '../change-set.js';

const span = (props?: Record<string, unknown>): StoredEntry => {
  return {
    id: entryId('t1'),
    siblingIndex: 0,
    name: 't1',
    start: 0 as Instant,
    end: 1 as Instant,
    props: props ?? {},
  };
};

/** A `ProposedEdit` fixture: fills the required brand/`props`/`proposedKeys` a raw patch no longer
 *  carries, inferring `proposedKeys` from the patch's own keys when the caller does not state one. */
function edit(patch: Record<string, unknown> = {}): ProposedEdit {
  const { props, proposedKeys, ...envelope } = patch as {
    props?: Record<string, unknown>;
    proposedKeys?: Set<string>;
  } & Record<string, unknown>;
  return withProposedKeys(
    { __brand: 'ProposedEdit', props: props ?? {}, proposedKeys: new Set(), ...envelope },
    proposedKeys ?? new Set(Object.keys(envelope)),
  );
}

describe('readField / writeField (D-S4-2)', () => {
  const registry = new FieldRegistry({
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
  });
  const fieldCtx = createFieldAccess({ fields: registry, timeZone: 'UTC' });
  const cost = registry.get('cost')!;
  const start = registry.get('start')!;
  const duration = registry.get('duration')!;

  it('reads and writes an entry source', () => {
    const entry = span();
    expect(readField(entry, start, fieldCtx)).toBe(0);
    const edited = entryAfterEdit(entry, writeField(emptyProposedEdit(), start, 10));
    expect(edited.start).toBe(10);
  });

  it('creates props on the first declared write and merges later writes', () => {
    const entry = span();
    expect(readField(entry, cost, fieldCtx)).toBeUndefined();
    const first = writeField(emptyProposedEdit(), cost, 500);
    expect(first.props).toEqual({ cost: 500 });
    const second = writeField(first, cost, 600);
    expect(second.props).toEqual({ cost: 600 });
    const merged = writeField(emptyProposedEdit(), cost, 500);
    expect(merged.props).toEqual({ cost: 500 });
  });

  it('does not replace props when writing a declared key — the passenger key survives (ADR 0011)', () => {
    const entry = span({ team: 'A', cost: 400 });
    const written = entryAfterEdit(entry, writeField(emptyProposedEdit(), cost, 500));
    expect(written.props).toEqual({ team: 'A', cost: 500 });
  });

  it('clears the declared key from props, leaving props an object, never undefined (ADR 0011)', () => {
    const entry = span({ cost: 500 });
    const written = entryAfterEdit(entry, writeField(emptyProposedEdit(), cost, undefined));
    expect('cost' in written.props).toBe(false);
    expect(written.props).toEqual({});
    expect('cost' in writeOntoEntry(entry, cost, undefined).props).toBe(false);
  });

  it('reads a compute Field through the guarded durationOf', () => {
    const entry = span();
    expect(readField(entry, duration, fieldCtx)).toEqual({ value: 1, unit: 'millisecond' });
  });

  it('durationOf reads undefined for a dateless Entry, never NaN (ADR 0012)', () => {
    const dateless: StoredEntry = { id: entryId('t2'), siblingIndex: 0, name: 't2', props: {} };
    expect(readField(dateless, duration, fieldCtx)).toBeUndefined();
  });

  it('writeOntoEntry writes cost onto parent', () => {
    const parent = span();
    const next = writeOntoEntry(parent, cost, 300);
    expect(next.props).toEqual({ cost: 300 });
    expect(readField(next, cost, fieldCtx)).toBe(300);
  });

  it('mergeProposedEdits keeps proposed keys through a spread', () => {
    const authored = withProposedKeys(writeField(emptyProposedEdit(), cost, 3), ['cost']);
    const spread = { ...authored };
    expect(spread.proposedKeys.has('cost')).toBe(true);
    const merged = mergeProposedEdits(edit({ name: 'x' }), authored);
    expect(editProposesField(merged, cost)).toBe(true);
  });

  // #197: the two sides may each name different Fields. The merged edit must show every write, or
  // `diffEdit` emits no row for one side and that write is lost.
  it('mergeProposedEdits keeps both sides’ proposed keys', () => {
    const authored = withProposedKeys(writeField(emptyProposedEdit(), cost, 3), ['cost']);
    const raw = edit({ name: 'Moved' });

    const rawFirst = mergeProposedEdits(raw, authored);
    expect([...proposedKeysOf(rawFirst)].sort()).toEqual(['cost', 'name']);

    const authoredFirst = mergeProposedEdits(authored, raw);
    expect([...proposedKeysOf(authoredFirst)].sort()).toEqual(['cost', 'name']);
  });

  it('mergeProposedEdits keeps every key of both edits, whichever named itself', () => {
    const merged = mergeProposedEdits(edit({ name: 'a' }), edit({ end: 9 }));
    expect([...proposedKeysOf(merged)].sort()).toEqual(['end', 'name']);
    expect(merged.name).toBe('a');
    expect(merged.end).toBe(9);
  });

  it('proposedKeysOf reads the keys an edit states it writes', () => {
    expect(proposedKeysOf(edit({ name: 'a' })).size).toBe(1);
    expect(proposedKeysOf(withProposedKeys(edit(), [])).size).toBe(0);
  });
});

// #466 step 1: `readingChildrenFrom` rebinds the tree, and `hasChildren` must follow it — a plain
// sibling default would answer off the access it is rebinding away from, and the pass's two
// structural questions would disagree on the same commit.
// #466's own tree, from *The three words*:
//
//   Depot
//   ├── Van 1
//   │   ├── Crate A
//   │   └── Crate B
//   └── Van 2
//
// A pass answers about the row it computes, and about any row it hands you — one tree, three words.
describe('the pass surface answers children/descendants/leaves/hasChildren about any row (#466)', () => {
  const row = (id: string, parentId?: string): StoredEntry => ({
    id: entryId(id),
    siblingIndex: 0,
    name: id,
    props: {},
    ...(parentId !== undefined ? { parentId: entryId(parentId) } : {}),
  });
  const depot = row('Depot');
  const van1 = row('Van 1', 'Depot');
  const van2 = row('Van 2', 'Depot');
  const crateA = row('Crate A', 'Van 1');
  const crateB = row('Crate B', 'Van 1');
  const names = (rows: readonly StoredEntry[]): string[] => rows.map((r) => r.name!);

  const byParent = new Map<string, StoredEntry[]>([
    [String(depot.id), [van1, van2]],
    [String(van1.id), [crateA, crateB]],
  ]);
  const registry = new FieldRegistry({ fields: [] });
  const access = createFieldAccess({
    fields: registry,
    timeZone: 'UTC',
    storedChildrenOf: (id) => byParent.get(String(id)) ?? [],
  });
  const ctx = createComputeContext(access, depot);

  it('children(row) answers one step down', () => {
    expect(names(ctx.children(depot))).toEqual(['Van 1', 'Van 2']);
    expect(names(ctx.children(van1))).toEqual(['Crate A', 'Crate B']);
    expect(ctx.children(van2)).toEqual([]);
  });

  it('descendants(row) answers all the way down, in the table’s order', () => {
    expect(names(ctx.descendants(depot))).toEqual(['Van 1', 'Van 2', 'Crate A', 'Crate B']);
    expect(names(ctx.descendants(van1))).toEqual(['Crate A', 'Crate B']);
    expect(ctx.descendants(van2)).toEqual([]);
  });

  it('leaves(row) answers the bottom rows only — Van 1 is a descendant and not a leaf', () => {
    expect(names(ctx.leaves(depot)).sort()).toEqual(['Crate A', 'Crate B', 'Van 2']);
    expect(names(ctx.leaves(van1)).sort()).toEqual(['Crate A', 'Crate B']);
  });

  it('the self-inclusion rule: leaves(Van 2) is [Van 2], descendants(Van 2) is []', () => {
    expect(names(ctx.leaves(van2))).toEqual(['Van 2']);
    expect(ctx.descendants(van2)).toEqual([]);
  });

  it('hasChildren(row) agrees with children(row).length > 0 on every row — the mirror, pinned', () => {
    for (const entry of [depot, van1, van2, crateA, crateB]) {
      expect(ctx.hasChildren(entry)).toBe(ctx.children(entry).length > 0);
    }
    expect(ctx.hasChildren(depot)).toBe(true);
    expect(ctx.hasChildren(van2)).toBe(false);
  });

  it('a source that loops terminates instead of walking forever', () => {
    const looping = new Map<string, StoredEntry[]>([
      [String(depot.id), [van1]],
      [String(van1.id), [depot]], // closes the loop back to the root
    ]);
    const loopingAccess = createFieldAccess({
      fields: registry,
      timeZone: 'UTC',
      storedChildrenOf: (id) => looping.get(String(id)) ?? [],
    });
    const loopingCtx = createComputeContext(loopingAccess, depot);
    expect(names(loopingCtx.descendants(depot))).toEqual(['Van 1']);
    expect(names(loopingCtx.leaves(depot))).toEqual([]);
  });
});

describe('readingChildrenFrom rebinds hasChildren with the tree, never the access it replaces', () => {
  const registry = new FieldRegistry({ fields: [{ key: 'cost' }] });
  const store = createFieldAccess({
    fields: registry,
    timeZone: 'UTC',
    storedChildrenOf: (id) => (id === entryId('storeParent') ? [span()] : []),
  });

  it('the default hasChildren reads the new tree, not the store the access came from', () => {
    const passChildren = new Map<string, StoredEntry[]>([['passParent', [span()]]]);
    const rebound = readingChildrenFrom(store, (id) => passChildren.get(String(id)) ?? []);

    // The store says `storeParent` has a child and `passParent` has none; the rebound access must
    // answer the opposite, off the pass's own tree.
    expect(rebound.hasChildren(entryId('passParent'))).toBe(true);
    expect(rebound.hasChildren(entryId('storeParent'))).toBe(false);
  });

  it('a caller holding a cheaper answer may pass hasChildren directly, skipping the walk', () => {
    const rebound = readingChildrenFrom(
      store,
      () => [],
      (id) => id === entryId('promoted'),
    );
    expect(rebound.hasChildren(entryId('promoted'))).toBe(true);
    expect(rebound.hasChildren(entryId('other'))).toBe(false);
  });
});

describe('createRollUpContext values/numericValues (issue #124)', () => {
  const registry = new FieldRegistry({
    fieldTypes: { money: { rollUp: 'sum' } },
    fields: [{ key: 'cost', type: 'money' }],
  });
  const access = createFieldAccess({ fields: registry, timeZone: 'UTC' });
  const cost = registry.get('cost')!;
  const parent = span();

  const children = [span({ cost: 1 }), span({ cost: 'not a number' }), span({ cost: 3 }), span()];

  it('values reads the rolling field off each child, in order, holes included', () => {
    const rollUpCtx = createRollUpContext(access, parent, children, cost.key);
    expect(rollUpCtx.values()).toEqual([1, 'not a number', 3, undefined]);
  });

  it('numericValues keeps only finite numbers, dropping holes and non-numeric values', () => {
    const rollUpCtx = createRollUpContext(access, parent, children, cost.key);
    expect(rollUpCtx.numericValues()).toEqual([1, 3]);
  });

  it('numericValues is empty, not thrown, when no child has a numeric value', () => {
    const empty = [span(), span({ cost: 'x' })];
    const rollUpCtx = createRollUpContext(access, parent, empty, cost.key);
    expect(rollUpCtx.numericValues()).toEqual([]);
  });

  it('hasChildren reads the pass\u2019s own list, never the access\u2019s cached index (#466)', () => {
    // An access whose cached `hasChildren` disagrees with the list the pass holds: the store answers
    // `true` from its own index, and the Rollup hands this parent no children at all.
    const disagreeing = readingChildrenFrom(
      access,
      () => [],
      () => true,
    );
    const rollUpCtx = createRollUpContext(disagreeing, parent, [], cost.key);
    expect(rollUpCtx.children(parent)).toEqual([]);
    expect(rollUpCtx.hasChildren(parent)).toBe(false);
  });

  it('routes through the same read path as the pass\u2019s own read (D-S4-8)', () => {
    const one = [children[0]!];
    const rollUpCtx = createRollUpContext(access, parent, one, cost.key);
    const childCtx = createRollUpContext(access, children[0]!, [], cost.key);
    expect(rollUpCtx.values()).toEqual([childCtx.read(cost.key)]);
  });
});

// ADR 0017, *What a hypothetical row reads with*: `readField` hands a `compute` Field a row the
// store does not hold, so every question it asks binds to the pass, not to a row it names.
describe('the ComputeContext a compute Field runs inside (ADR 0017, #214)', () => {
  it('reads a sibling Field through ctx.read, and this row’s duration through ctx.duration', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      dateOnlyEnd: 'exclusive',
      entries: [{ id: 't1', name: 'Design', start: 0, end: 5 }],
      fields: [
        { key: 'cost' },
        {
          key: 'summary',
          compute: (_entry, ctx) => `${String(ctx.read('name'))}/${String(ctx.duration()?.value)}`,
        },
      ],
    });

    expect(state.entries.get('t1')?.read('summary')).toBe('Design/5');
  });

  it('builds no ComputeContext for a stored-Field read, and one for a compute arm', () => {
    const registry = new FieldRegistry({
      fields: [{ key: 'cost' }, { key: 'label', compute: () => 'x' }],
    });
    const built = createFieldAccess({ fields: registry, timeZone: 'UTC' });
    let contextsBuilt = 0;
    // Building a context reads the ambient zone off the access, and nothing else does.
    const counting = {
      ...built,
      get timeZone(): string {
        contextsBuilt += 1;
        return 'UTC';
      },
    };
    const entry = span({ cost: 40 });

    expect(readField(entry, registry.get('cost')!, counting)).toBe(40);
    expect(contextsBuilt).toBe(0);

    expect(readField(entry, registry.get('label')!, counting)).toBe('x');
    expect(contextsBuilt).toBe(1);
  });

  it('walks its own children through ctx.children (#214)', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'Parent' },
        { id: 'a', name: 'A', parentId: 'p' },
        { id: 'b', name: 'B', parentId: 'p' },
      ],
      fields: [
        {
          key: 'childNames',
          compute: (entry, ctx) =>
            ctx
              .children(entry)
              .map((c) => c.name)
              .join(','),
        },
      ],
    });

    expect(state.entries.get('p')?.read('childNames')).toBe('A,B');
    expect(state.entries.get('a')?.read('childNames')).toBe('');
  });

  it('reads the hypothetical row inside an open transaction, before the commit lands', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'Parent' },
        { id: 'a', name: 'A', parentId: 'p' },
      ],
      fields: [
        {
          key: 'childNames',
          compute: (entry, ctx) =>
            ctx
              .children(entry)
              .map((c) => c.name)
              .join(','),
        },
      ],
    });

    // Primed first, so a memo keyed on the committed revision would answer 'A' here and hide the
    // hypothetical row entirely.
    expect(state.entries.get('p')?.read('childNames')).toBe('A');

    state.transaction(() => {
      state.entries.update('a', { name: 'Renamed' });
      expect(state.entries.get('p')?.read('childNames')).toBe('Renamed');
    });

    expect(state.entries.get('p')?.read('childNames')).toBe('Renamed');
  });
});

// #331 ruling on ADR 0024: every reading door a caller can hold — `entry.read`, `ctx.read`,
// `toInput()`, the `ChangeSet` — answers the same value for a stored Field. A `compute` Field is not
// one of these doors: it never stores, so it never appears in `toInput()` or a `ChangeSet` row.
describe('a cross-door invariant: every door agrees on a stored Field (ADR 0024, #331)', () => {
  const probeCost: Field = { key: 'probeCost', compute: (_entry, ctx) => ctx.read('cost') };

  it('entry.read, ctx.read, toInput(), and the ChangeSet all answer the same stored value', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'Parent' },
        { id: 'a', name: 'A', parentId: 'p' },
      ],
      fields: [{ key: 'cost' }, probeCost],
    });
    state.entries.update('a', { cost: 500 });

    const seen: ChangeSet[] = [];
    state.on('change', ({ changeSet }) => {
      seen.push(changeSet);
    });
    state.entries.update('a', { cost: 700 });

    const entry = state.entries.get('a')!;
    // The stored value, on the by-key doors.
    expect(entry.read('cost')).toBe(700);
    expect(entry.read('probeCost')).toBe(700);
    expect((entry.toInput().props as Record<string, unknown>)['cost']).toBe(700);
    expect(fieldRowsOf(seen[0]!).find((row) => row.field === 'cost')?.to).toBe(700);

    // `parentId` is the same story (ADR 0024): every door answers the authored value, not the
    // checked tree — that is `hierarchyParentId`'s job, below.
    expect(entry.read('parentId')).toBe('p');
    expect(entry.toInput().parentId).toBe('p');
  });

  it('hierarchyParentId is not one of these doors: it never stores, so toInput() and the ChangeSet never carry it', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'Parent' },
        { id: 'a', name: 'A', parentId: 'p' },
      ],
    });

    const seen: ChangeSet[] = [];
    state.on('change', ({ changeSet }) => {
      seen.push(changeSet);
    });
    state.entries.update('a', { name: 'A renamed' });

    const entry = state.entries.get('a')!;
    expect(entry.read('hierarchyParentId')).toBe('p');
    expect('hierarchyParentId' in entry.toInput()).toBe(false);
    expect(fieldRowsOf(seen[0]!).some((row) => row.field === 'hierarchyParentId')).toBe(false);
  });

  it('siblingIndex is the one stored Field toInput() never names: construction and load place the row, so an input never authors its slot (ADR 0034)', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p', name: 'Parent' },
        { id: 'a', name: 'A', parentId: 'p' },
      ],
    });

    const seen: ChangeSet[] = [];
    state.on('change', ({ changeSet }) => {
      seen.push(changeSet);
    });
    state.entries.update('a', { name: 'A renamed' });

    const entry = state.entries.get('a')!;
    // The stored value, on the doors that name it.
    expect(entry.read('siblingIndex')).toBe(0);
    expect(state.entries.storedValues.get(entry.id)!.siblingIndex).toBe(0);
    expect('siblingIndex' in entry.toInput()).toBe(false);
    expect(fieldRowsOf(seen[0]!).some((row) => row.field === 'siblingIndex')).toBe(false);
  });
});
