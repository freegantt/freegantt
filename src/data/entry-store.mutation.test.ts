// data/ — the public mutation API (S2.3 §2): dataset.entries.add/update/remove, exercised through
// DatasetState the way a consumer would reach them (`dataset.entries.add(...)`), not through the
// TxToken-gated staging methods `transaction.test.ts` uses directly.

import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { fieldRowsOf, invertChangeSet } from './change-set.js';
import { identityExtender } from './edit-extension.js';
import {
  ComputedFieldCannotBeWrittenError,
  DerivedFieldNotWritableError,
  DuplicateEntryIdError,
  EntryNotFoundError,
  FieldNotEditableError,
  ParentCycleError,
  UnknownFieldError,
  entryId,
} from '../model/index.js';
import type { ChangeSet, EntryInput } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

interface Seed extends Partial<Omit<EntryInput, 'id'>> {
  id: string;
}

function dataset(entries: Seed[] = []): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
    timeZone: 'UTC',
  });
}

function changeSets(state: DatasetState): ChangeSet[] {
  const seen: ChangeSet[] = [];
  state.on('change', ({ changeSet }) => {
    seen.push(changeSet);
  });
  return seen;
}

describe('entries.add', () => {
  it('returns the stored entry, and a second add with the same id throws while the store keeps one', () => {
    const state = dataset();
    const stored = state.entries.add({ id: 't9', name: 'Roofing', start: '2026-10-01', end: '2026-10-15' });

    expect(stored.id).toBe(entryId('t9'));
    expect(stored.name).toBe('Roofing');
    expect(state.entries.size).toBe(1);

    expect(() => state.entries.add({ id: 't9', name: 'Roofing again', start: 0, end: 1 })).toThrow(
      DuplicateEntryIdError,
    );
    expect(state.entries.size).toBe(1);
    expect(state.entries.get('t9')?.name).toBe('Roofing');
  });

  it('the changeset carries one added row', () => {
    const state = dataset();
    const seen = changeSets(state);

    state.entries.add({ id: 't9', name: 'Roofing', start: 0, end: 1 });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.added).toHaveLength(1);
    expect(seen[0]?.added[0]?.entity.id).toBe(entryId('t9'));
  });

  it('add({}) stores no dates (ADR 0012 Gate)', () => {
    const state = dataset();
    const entry = state.entries.add({ id: 't9', name: 'Roofing' });

    expect(entry.start).toBeUndefined();
    expect(entry.end).toBeUndefined();
  });

  it('add({ start }) stores one date and draws no bar (ADR 0012 Gate)', () => {
    const state = dataset();
    const entry = state.entries.add({ id: 't9', name: 'Roofing', start: 0 });

    expect(entry.start).toBe(toInstant('UTC', 0));
    expect(entry.end).toBeUndefined();
  });
});

describe('entries.update', () => {
  it('records one updated row per changed field, with from and to; a no-op update commits nothing', () => {
    const state = dataset([{ id: 't1', name: 'Framing' }]);
    const seen = changeSets(state);

    const updated = state.entries.update('t1', { name: 'Framing — north wing', end: 5 });

    expect(updated.name).toBe('Framing — north wing');
    expect(updated.end).toBe(5);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.updated).toEqual(
      expect.arrayContaining([
        { store: 'entries', id: entryId('t1'), field: 'name', from: 'Framing', to: 'Framing — north wing' },
        { store: 'entries', id: entryId('t1'), field: 'end', from: 1, to: 5 },
      ]),
    );

    state.entries.update('t1', { name: 'Framing — north wing' });
    expect(seen).toHaveLength(1); // the no-op update commits nothing, so no second changeset
  });

  it('update(id, { start: undefined, end: undefined }) clears both dates (ADR 0012 Gate)', () => {
    const state = dataset([{ id: 't1', name: 'Framing', start: '2026-01-01', end: '2026-01-05' }]);

    const cleared = state.entries.update('t1', { start: undefined, end: undefined });

    expect(cleared.start).toBeUndefined();
    expect(cleared.end).toBeUndefined();
  });

  it("loose dates on update resolve through the dataset zone the way construction's do", () => {
    const fromConstruction = dataset([{ id: 't1', start: '2026-09-08', end: '2026-09-09' }]);
    const fromUpdate = dataset([{ id: 't1' }]);

    const updated = fromUpdate.entries.update('t1', { start: '2026-09-08', end: '2026-09-09' });
    const constructed = fromConstruction.entries.get('t1')!;

    expect(updated.start).toBe(constructed.start);
    expect(updated.end).toBe(constructed.end);
    expect(updated.start).toBe(toInstant('UTC', '2026-09-08'));
    expect(updated.end).toBe(toEndInstant('UTC', '2026-09-09', 'inclusive'));
  });

  it('an unknown id throws EntryNotFoundError', () => {
    const state = dataset();
    expect(() => state.entries.update('missing', { name: 'x' })).toThrow(EntryNotFoundError);
  });

  it('an edit naming a key that is not a field throws UnknownFieldError', () => {
    const state = dataset([{ id: 't1' }]);
    expect(() => state.entries.update('t1', { notAField: true })).toThrow(UnknownFieldError);
    expect(state.entries.get('t1')?.name).toBe('t1');
  });

  it('[S4-A2] an unregistered key throws and stages nothing', () => {
    const state = dataset([{ id: 't1' }]);
    const seen = changeSets(state);
    expect(() => state.entries.update('t1', { cost: 500 })).toThrow(UnknownFieldError);
    expect(seen).toHaveLength(0);
    expect(state.entries.get('t1')?.toInput().props).toEqual({});
  });
});

describe('entries.remove', () => {
  it('removes a parent and its whole subtree in one changeset, regardless of removal order', () => {
    const state = dataset([
      { id: 'root' },
      { id: 'a', parentId: 'root' },
      { id: 'b', parentId: 'a' },
      { id: 'c', parentId: 'root' },
      { id: 'other' },
    ]);
    const seen = changeSets(state);

    state.entries.remove('root');

    expect(seen).toHaveLength(1);
    const removedIds = seen[0]?.removed.map((row) => row.entity.id).sort();
    expect(removedIds).toEqual([entryId('a'), entryId('b'), entryId('c'), entryId('root')].sort());
    expect(state.entries.has('other')).toBe(true);
    expect(state.entries.size).toBe(1);
  });

  it('an unknown id throws EntryNotFoundError', () => {
    const state = dataset();
    expect(() => state.entries.remove('missing')).toThrow(EntryNotFoundError);
  });
});

describe('parentId cycle rejection', () => {
  it('a chain (a -> b -> a) and self-parenting (a -> a) both throw, and leave the store unchanged', () => {
    const state = dataset([{ id: 'a' }, { id: 'b', parentId: 'a' }]);

    expect(() => state.entries.update('a', { parentId: 'b' })).toThrow(ParentCycleError);
    expect(() => state.entries.update('a', { parentId: 'a' })).toThrow(ParentCycleError);

    expect(state.entries.get('a')?.parent()?.id).toBeUndefined();
    expect(state.entries.get('b')?.parent()?.id).toBe(entryId('a'));
  });

  it('a parentId naming an entry the store has no entry for throws EntryNotFoundError', () => {
    const state = dataset([{ id: 'a' }]);
    expect(() => state.entries.update('a', { parentId: 'ghost' })).toThrow(EntryNotFoundError);
  });
});

describe('auto-wrap (D-S2-8)', () => {
  it('three standalone mutators produce three changesets; the same three in one transaction produce one', () => {
    const state = dataset([{ id: 't1' }, { id: 't2' }]);
    const seenStandalone = changeSets(state);

    state.entries.add({ id: 't9', name: 't9', start: 0, end: 1 });
    state.entries.update('t1', { name: 'a' });
    state.entries.remove('t2');
    expect(seenStandalone).toHaveLength(3);

    const other = dataset([{ id: 't1' }, { id: 't2' }]);
    const seenBatched = changeSets(other);

    other.transaction(() => {
      other.entries.add({ id: 't9', name: 't9', start: 0, end: 1 });
      other.entries.update('t1', { name: 'a' });
      other.entries.remove('t2');
    });
    expect(seenBatched).toHaveLength(1);
  });
});

describe('roll-up (§1.5)', () => {
  // ADR 0013: rollup is structural now (any Entry with children rolls up), so a childless Entry
  // and a leaf Entry are the same case — one date, or none, is not an error either way.
  it('an Entry with no dates and no children is legal, and stays dateless (ADR 0012)', () => {
    const state = dataset();
    const entry = state.entries.add({ id: 't1', name: 'Roofing' });
    expect(entry.start).toBeUndefined();
    expect(entry.end).toBeUndefined();
  });
});

describe('read-your-own-writes validation (§1.3)', () => {
  it("add('t9') twice in one body throws on the second call", () => {
    const state = dataset();
    expect(() =>
      state.transaction(() => {
        state.entries.add({ id: 't9', name: 't9', start: 0, end: 1 });
        state.entries.add({ id: 't9', name: 't9-again', start: 0, end: 1 });
      }),
    ).toThrow(DuplicateEntryIdError);
    expect(state.entries.has('t9')).toBe(false);
  });

  it("remove('t9'); add('t9') in one body throws nothing and commits one net change", () => {
    const state = dataset([{ id: 't9', name: 'original' }]);
    const seen = changeSets(state);

    state.transaction(() => {
      state.entries.remove('t9');
      state.entries.add({ id: 't9', name: 'reborn', start: 0, end: 1 });
    });

    expect(state.entries.get('t9')?.name).toBe('reborn');
    expect(seen).toHaveLength(1);
  });
});

describe('rollup (§1.5)', () => {
  it('moving a child moves its parent, in one changeset — reverting both fields restores both', () => {
    const state = dataset([
      { id: 'p1' },
      { id: 'c1', parentId: 'p1', start: '2026-01-01', end: '2026-01-10' },
    ]);
    // One `Entry` per id, every read live (ADR 0017): a "before" reading is a value held, never a
    // row held.
    const startBefore = state.entries.get('p1')!.start;
    const endBefore = state.entries.get('p1')!.end;
    const seen = changeSets(state);

    state.entries.update('c1', { start: '2026-02-01', end: '2026-02-15' });

    expect(seen).toHaveLength(1);
    const parentRows = fieldRowsOf(seen[0]!).filter((row) => row.id === entryId('p1'));
    expect(parentRows.map((row) => row.field).sort()).toEqual(['end', 'start']);
    const after = state.entries.get('p1')!;
    expect(after.start).not.toBe(startBefore);
    expect(after.end).not.toBe(endBefore);

    // "one undo restores both": `entries.update()` now refuses a direct write to a rolled-up field
    // on a parent that still has children (`DerivedFieldNotWritableError`, this build's own decision
    // 6) — so undo goes through `replay(invertChangeSet(...))`, the same door
    // `api/dataset.test.ts`'s "a consumer History..." test uses, not a manual per-field `update()`.
    state.replay(invertChangeSet(seen[0]!));
    expect(state.entries.get('p1')?.start).toBe(startBefore);
    expect(state.entries.get('p1')?.end).toBe(endBefore);
  });

  it('a two-level tree rolls up in one pass', () => {
    const state = dataset([
      { id: 'root' },
      { id: 'mid', parentId: 'root' },
      { id: 'leaf', parentId: 'mid', start: '2026-03-01', end: '2026-03-05' },
    ]);

    state.entries.update('leaf', { start: '2026-04-01', end: '2026-04-10' });

    const mid = state.entries.get('mid')!;
    const root = state.entries.get('root')!;
    expect(mid.start).toBe(toInstant('UTC', '2026-04-01'));
    expect(mid.end).toBe(toEndInstant('UTC', '2026-04-10', 'inclusive'));
    expect(root.start).toBe(mid.start);
    expect(root.end).toBe(mid.end);
  });

  it('a parent with children declared in the same construction array has a real span from the start', () => {
    const state = dataset([
      { id: 'p1' },
      { id: 'c1', parentId: 'p1', start: '2026-01-01', end: '2026-01-10' },
    ]);

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-01-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-01-10', 'inclusive'));
  });

  it('an Entry written as a leaf keeps the proposed span when the same transaction gives it a child', () => {
    // Decision 5: the Rollup yields to a field the caller proposed in the same transaction. This
    // test used to seed `p1` with a child already in place and write `p1`'s span through the
    // consumer door. The ADR 0013 amendment (2026-09-11) refuses that write from every direction,
    // so the case moved to the structure that makes it honest: `x` is a **leaf** when the write is
    // proposed, so the write is legal, and it gains a child in the same transaction. The claim is
    // unchanged — the proposal wins over the cascade — and the write is one the door still allows.
    const state = dataset([{ id: 'x', start: '2026-01-01', end: '2026-01-05' }]);

    state.transaction(() => {
      state.entries.update('x', { start: '2026-09-01', end: '2026-09-02' });
      state.entries.add({ id: 'c1', name: 'c1', parentId: 'x', start: '2026-12-01', end: '2026-12-02' });
    });

    const x = state.entries.get('x')!;
    expect(x.start).toBe(toInstant('UTC', '2026-09-01'));
    expect(x.end).toBe(toEndInstant('UTC', '2026-09-02', 'inclusive'));
  });
});

describe("a rolling-up parent's cell is refused, from every door (ADR 0013, #470)", () => {
  /** A Dataset with one rolling-up consumer Field, `cost`. No Field on this Dataset names a
   *  distribution policy — #470 retired that seam, so a rolling-up parent's cell has exactly one
   *  answer: refused. */
  function costDataset(): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p1', name: 'p1', start: 0, end: 1 },
        { id: 'c1', name: 'c1', parentId: 'p1', start: 0, end: 1, props: { cost: 10 } },
        { id: 'c2', name: 'c2', parentId: 'p1', start: 0, end: 1, props: { cost: 20 } },
      ],
      fields: [{ key: 'cost', rollUp: 'sum', editable: true }],
    });
  }

  it('is refused from update(), inside a transaction, and from a second update() in the same transaction', () => {
    // The point of the exercise (Q7): permission follows the thing written, never the call that
    // wrapped it. `dataset.transaction()` is public, so a bypass here is a bypass for everyone.
    const standalone = costDataset();
    expect(() => standalone.entries.update('p1', { cost: 500 })).toThrow(DerivedFieldNotWritableError);
    expect(standalone.entries.get('p1')?.read('cost')).toBe(30);

    const batched = costDataset();
    expect(() =>
      batched.transaction(() => {
        batched.entries.update('p1', { cost: 500 });
      }),
    ).toThrow(DerivedFieldNotWritableError);
    expect(batched.entries.get('p1')?.read('cost')).toBe(30);

    const batchedWithCompany = costDataset();
    expect(() =>
      batchedWithCompany.transaction(() => {
        batchedWithCompany.entries.update('c1', { cost: 11 });
        batchedWithCompany.entries.update('p1', { cost: 500 });
      }),
    ).toThrow(DerivedFieldNotWritableError);
    expect(batchedWithCompany.entries.get('c1')?.read('cost')).toBe(10);
    expect(batchedWithCompany.entries.get('p1')?.read('cost')).toBe(30);
  });

  it('a mixed patch is refused whole, before any write', () => {
    const state = costDataset();
    expect(() => state.entries.update('p1', { name: 'renamed', cost: 500 })).toThrow(
      DerivedFieldNotWritableError,
    );
    expect(state.entries.get('p1')?.name).toBe('p1');
  });

  it('a leaf writes its own rolling-up cell', () => {
    const state = costDataset();
    state.entries.update('c1', { cost: 99 });
    expect(state.entries.get('c1')?.read('cost')).toBe(99);
    expect(state.entries.get('p1')?.read('cost')).toBe(119);
  });
});

describe('validation leaves the store as the body found it', () => {
  it('a validation failure inside a transaction body commits nothing — no partial commit', () => {
    const state = dataset([{ id: 't1', name: 'original' }]);
    const seen = changeSets(state);

    expect(() =>
      state.transaction(() => {
        state.entries.update('t1', { name: 'changed' });
        state.entries.update('missing', { name: 'x' });
      }),
    ).toThrow(EntryNotFoundError);

    expect(state.entries.get('t1')?.name).toBe('original');
    expect(seen).toHaveLength(0);
  });
});

describe('removability (D-S2-23)', () => {
  it('with identityExtender injected explicitly, the fixture rolls up nothing and behaves identically', () => {
    const state = new DatasetState({
      entries: [
        { id: 'p1', name: 'p1', start: 0, end: 1 },
        { id: 'c1', name: 'c1', parentId: 'p1', start: 0, end: 1 },
      ],
      timeZone: 'UTC',
      editExtender: identityExtender, // explicit injection of what an unoccupied hook already defaults to
    });

    state.entries.update('c1', { start: '2026-05-01', end: '2026-05-10' });

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-05-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-05-10', 'inclusive'));
  });
});

describe('the write door: what entries.update() refuses (ADR 0015)', () => {
  /** One Dataset holding all three `editable` states, plus the shipped `compute` Field. `start` is
   *  the lock, `owner` is the app-owned value a user never types, and `cost` declares nothing — so
   *  it answers the default, `'anywhere'`. */
  function doorDataset(): DatasetState {
    return new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'e1', name: 'e1', start: '2026-01-01', end: '2026-01-05', props: { cost: 10, owner: 'ana' } },
      ],
      fields: [{ key: 'start', editable: false }, { key: 'owner', editable: 'api' }, { key: 'cost' }],
    });
  }

  it("refuses a 'never' Field, and writes nothing", () => {
    const state = doorDataset();

    expect(() => state.entries.update('e1', { start: '2026-03-01' })).toThrow(FieldNotEditableError);
    expect(state.entries.get('e1')!.start).toBe(toInstant('UTC', '2026-01-01'));
  });

  it("un-dating a 'never' Field is a change too, so it throws as well", () => {
    const state = doorDataset();

    expect(() => state.entries.update('e1', { start: undefined })).toThrow(FieldNotEditableError);
    expect(state.entries.get('e1')!.start).toBe(toInstant('UTC', '2026-01-01'));
  });

  it("writes an 'api' Field — that state closes the grid cell, never this door", () => {
    const state = doorDataset();

    state.entries.update('e1', { owner: 'bo' });

    expect(state.entries.get('e1')?.read('owner')).toBe('bo');
  });

  it('writes a Field that declares no editable at all, because the default is anywhere', () => {
    const state = doorDataset();

    state.entries.update('e1', { cost: 42 });

    expect(state.entries.get('e1')?.read('cost')).toBe(42);
  });

  it('refuses a compute Field, and the message names this door', () => {
    const state = doorDataset();

    try {
      state.entries.update('e1', { duration: 1 });
      expect.unreachable('expected ComputedFieldCannotBeWrittenError');
    } catch (error) {
      expect(error).toBeInstanceOf(ComputedFieldCannotBeWrittenError);
      expect((error as ComputedFieldCannotBeWrittenError).message).toContain('entries.update');
    }
  });

  // A lock names what a *caller* may write, never what the library may.
  it('lets construction, entries.add() and History replay write a locked Field', () => {
    const state = doorDataset();
    expect(state.entries.get('e1')!.start).toBe(toInstant('UTC', '2026-01-01'));

    state.entries.add({ id: 'e2', name: 'e2', start: '2026-02-01', end: '2026-02-03' });
    expect(state.entries.get('e2')!.start).toBe(toInstant('UTC', '2026-02-01'));

    // The replay half: move a date while the Field is open, lock it, then undo. The undo replays a
    // `start` write onto a Field the consumer has since locked, and it must still land.
    const openThenLocked = dataset([{ id: 'x', start: '2026-01-01', end: '2026-01-05' }]);
    openThenLocked.entries.update('x', { start: '2026-01-03' });
    openThenLocked.fields.setEditable('start', 'never');

    openThenLocked.undo();

    expect(openThenLocked.entries.get('x')!.start).toBe(toInstant('UTC', '2026-01-01'));
  });
});

describe('a lock holds at every caller-facing door (ADR 0015)', () => {
  /** A bar is an ordinary child Entry now (ADR 0026): removing it is `entries.remove(childId)`,
   *  which removes that Entry outright rather than un-dating some owner it used to draw a Segment
   *  for. A locked `end` on the child itself still refuses the un-date that removing it would cause
   *  — `EntryStore#remove` names its own door, the same way `entries.update` names its (J37,
   *  BUILD-LOG's ADR 0015 rule: a lock holds at every caller-facing door, not just `update`). */
  it("refuses removing an Entry's own last date-bearing self when a locked 'end' would go un-dated", () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [{ id: 'e1', name: 'e1', start: '2026-01-01', end: '2026-01-05' }],
      fields: [{ key: 'end', editable: false }],
    });

    expect(() => state.entries.update('e1', { end: undefined })).toThrow(FieldNotEditableError);
    expect(state.entries.get('e1')!.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
  });

  it('removes a child Entry whose own dates are open, as it always did', () => {
    const state = new DatasetState({
      timeZone: 'UTC',
      entries: [
        { id: 'p1', name: 'p1' },
        { id: 'c1', parentId: 'p1', name: 'c1', start: '2026-01-01', end: '2026-01-02' },
        { id: 'c2', parentId: 'p1', name: 'c2', start: '2026-01-04', end: '2026-01-05' },
      ],
    });

    state.entries.remove('c1');

    expect(
      state.entries
        .get('p1')
        ?.children()
        .map((child) => child.id),
    ).toEqual([entryId('c2')]);
  });
});
