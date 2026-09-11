import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { entryId } from '../model/index.js';
import { addMs } from '../time/index.js';
import type { EditExtender } from './edit-extension.js';
import type { EntryInput } from '../model/index.js';

type SimpleOp =
  | { kind: 'add'; id: string; name: string; start: number; end: number }
  | { kind: 'update-name'; id: string; name: string }
  | { kind: 'update-start'; id: string; start: number }
  | { kind: 'update-end'; id: string; end: number }
  | { kind: 'remove'; id: string }
  // S3.3, [S3-A6]: a gesture commit writes {start, end} together in one `update()` call per row —
  // distinct from 'update-start'/'update-end' above, which each touch one field alone.
  | { kind: 'move'; id: string; deltaMs: number };

type Op = SimpleOp | { kind: 'transaction'; ops: SimpleOp[] };

const IDS = ['a', 'b', 'c', 'd', 'e', 'n1', 'n2', 'n3'] as const;
const NEW_IDS = ['n1', 'n2', 'n3'] as const;

const idArb = fc.constantFrom(...IDS);
const newIdArb = fc.constantFrom(...NEW_IDS);
const nameArb = fc.string({ maxLength: 24 });
const msArb = fc.integer({ min: 0, max: 8_000_000 });
const spanArb = msArb.chain((start) =>
  fc.integer({ min: start + 1, max: start + 2_000_000 }).map((end) => ({ start, end })),
);

const simpleOpArb: fc.Arbitrary<SimpleOp> = fc.oneof(
  spanArb.chain(({ start, end }) =>
    fc.record({
      kind: fc.constant('add' as const),
      id: newIdArb,
      name: nameArb,
      start: fc.constant(start),
      end: fc.constant(end),
    }),
  ),
  fc.record({ kind: fc.constant('update-name' as const), id: idArb, name: nameArb }),
  fc.record({ kind: fc.constant('update-start' as const), id: idArb, start: msArb }),
  fc.record({ kind: fc.constant('update-end' as const), id: idArb, end: msArb }),
  fc.record({ kind: fc.constant('remove' as const), id: idArb }),
  fc.record({
    kind: fc.constant('move' as const),
    id: idArb,
    deltaMs: fc.integer({ min: -2_000_000, max: 2_000_000 }),
  }),
);

const opArb: fc.Arbitrary<Op> = fc.oneof(
  simpleOpArb,
  fc
    .array(simpleOpArb, { minLength: 1, maxLength: 10 })
    .map((ops) => ({ kind: 'transaction' as const, ops })),
);

function applySimple(state: DatasetState, op: SimpleOp): void {
  try {
    switch (op.kind) {
      case 'add':
        state.entries.add({
          id: op.id,
          name: op.name,
          start: op.start,
          end: op.end,
        });
        return;
      case 'update-name':
        state.entries.update(op.id, { name: op.name });
        return;
      case 'update-start': {
        const current = state.entries.get(op.id);
        // Load-bearing non-null assertion (ADR 0012): every 'add' op above authors both dates,
        // so an entry this generator can still find always spans.
        if (current === undefined) return;
        if (op.start >= current.end!) return;
        state.entries.update(op.id, { start: op.start });
        return;
      }
      case 'update-end': {
        const current = state.entries.get(op.id);
        if (current === undefined) return;
        if (op.end <= current.start!) return;
        state.entries.update(op.id, { end: op.end });
        return;
      }
      case 'remove':
        state.entries.remove(op.id);
        return;
      case 'move': {
        const current = state.entries.get(op.id);
        if (current === undefined) return;
        state.entries.update(op.id, {
          start: addMs(current.start!, op.deltaMs),
          end: addMs(current.end!, op.deltaMs),
        });
        return;
      }
    }
  } catch {
    // Duplicate ids, missing ids, and invalid field combinations are not the property — skip them.
  }
}

function applyOp(state: DatasetState, op: Op): void {
  try {
    if (op.kind === 'transaction') {
      state.transaction(() => {
        for (const inner of op.ops) applySimple(state, inner);
      });
      return;
    }
    applySimple(state, op);
  } catch {
    // I4 and other commit-time refusals are not this property — skip the op.
  }
}

function undoAll(state: DatasetState): void {
  while (state.canUndo) state.undo();
}

/** A test-local equality snapshot — every stored Entry, in store order. Not a public shape; it exists
 *  only so this test can ask "did undo restore exactly what was there before?" (I7 does not change,
 *  only the way the comparison reads two states). */
function snapshotOf(state: DatasetState): string {
  return JSON.stringify(state.entries.all);
}

function assertUndoRestores(seed: readonly EntryInput[], ops: Op[], editExtender?: EditExtender): void {
  const state = new DatasetState({
    timeZone: 'UTC',
    entries: seed,
    ...(editExtender !== undefined ? { editExtender } : {}),
  });
  const before = snapshotOf(state);
  for (const op of ops) applyOp(state, op);
  undoAll(state);
  const after = snapshotOf(state);
  expect(after).toBe(before);
}

const seedSpans: readonly EntryInput[] = [
  { id: 'a', name: 'a', start: 0, end: 100 },
  { id: 'b', name: 'b', start: 100, end: 200 },
  { id: 'c', name: 'c', start: 200, end: 300 },
  { id: 'x', name: 'x', start: 0, end: 10 },
];

const seedGroups: readonly EntryInput[] = [
  { id: 'p', kind: 'group', name: 'p' },
  { id: 'a', parentId: 'p', name: 'a', start: 0, end: 100 },
  { id: 'b', parentId: 'p', name: 'b', start: 100, end: 200 },
];

const cascade: EditExtender = ({ proposed }) => {
  if (proposed.has(entryId('a'))) return new Map([[entryId('x'), { name: 'cascaded' }]]);
  return new Map();
};

describe('[S2-A1] undo-all restores every stored Entry byte-identical', () => {
  it('with the identity extender and no deriving kinds', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 50 }), (ops) => {
        assertUndoRestores(seedSpans, ops);
      }),
      { numRuns: 40 },
    );
  });

  it('with the Rollup and a fixture containing groups (D-S2-22)', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 50 }), (ops) => {
        assertUndoRestores(seedGroups, ops);
      }),
      { numRuns: 40 },
    );
  });

  it('[S3-A6] with an injected extender that cascades an unrelated entry (opArb includes gesture-shaped move ops)', () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 1, maxLength: 50 }), (ops) => {
        assertUndoRestores(seedSpans, ops, cascade);
      }),
      { numRuns: 40 },
    );
  });
});

describe('[S4-A9] autoGroup undo', () => {
  it('undo of a promoting transaction restores kind and the parent span together', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p1', name: 'p1', start: '2026-01-01', end: '2026-01-02' },
        { id: 'c1', name: 'c1', start: '2026-03-01', end: '2026-03-05' },
      ],
    });
    const before = snapshotOf(state);
    state.entries.update('c1', { parentId: 'p1' });
    expect(state.entries.get('p1')!.kind).toBe('group');
    undoAll(state);
    expect(snapshotOf(state)).toBe(before);
  });
});
