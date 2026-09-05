// data/ — the public mutation API (S2.3 §2): dataset.entries.add/update/remove, exercised through
// DatasetState the way a consumer would reach them (`dataset.entries.add(...)`), not through the
// TxToken-gated staging methods `transaction.test.ts` uses directly.

import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import { fieldRowsOf } from './change-set.js';
import { identityExtender } from './edit-extension.js';
import {
  DuplicateEntryIdError,
  EntryNotFoundError,
  InvalidInstantError,
  ParentCycleError,
  UnknownFieldError,
  entryId,
} from '../model/index.js';
import type { ChangeSet, EntryInput } from '../model/index.js';
import { toEndInstant, toInstant } from '../time/index.js';

interface Seed extends Partial<Omit<EntryInput, 'id'>> {
  id: string;
}

function dataset(entries: Seed[] = [], options: { rollUpKinds?: readonly string[] } = {}): DatasetState {
  return new DatasetState({
    entries: entries.map((e) => ({ start: 0, end: 1, ...e, name: e.name ?? e.id })),
    timeZone: 'UTC',
    ...options,
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
});

describe('entries.update', () => {
  it('records one updated row per changed field, with from and to; a no-op update commits nothing', () => {
    const state = dataset([{ id: 't1', name: 'Framing' }]);
    const seen = changeSets(state);

    const updated = state.entries.update('t1', { name: 'Framing — north wing', kind: 'milestone' });

    expect(updated.name).toBe('Framing — north wing');
    expect(updated.kind).toBe('milestone');
    expect(seen).toHaveLength(1);
    expect(seen[0]?.updated).toEqual(
      expect.arrayContaining([
        { store: 'entries', id: entryId('t1'), field: 'name', from: 'Framing', to: 'Framing — north wing' },
        { store: 'entries', id: entryId('t1'), field: 'kind', from: 'span', to: 'milestone' },
      ]),
    );

    state.entries.update('t1', { name: 'Framing — north wing' });
    expect(seen).toHaveLength(1); // the no-op update commits nothing, so no second changeset
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
    expect(state.entries.get('t1')?.meta).toBeUndefined();
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

    expect(state.entries.get('a')?.parentId).toBeUndefined();
    expect(state.entries.get('b')?.parentId).toBe(entryId('a'));
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

describe('roll-up kinds (§1.5)', () => {
  it('a roll-up kind with no dates gets a zero-length span at the reference date', () => {
    const state = dataset();
    const group = state.entries.add({ id: 'p1', name: 'Sitework', kind: 'group' });

    expect(group.start).toBe(state.referenceDate);
    expect(group.end).toBe(state.referenceDate);
  });

  it('a non-deriving kind with no dates throws InvalidInstantError', () => {
    const state = dataset();
    expect(() => state.entries.add({ id: 't1', name: 'Roofing', kind: 'span' })).toThrow(InvalidInstantError);
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
      { id: 'p1', kind: 'group' },
      { id: 'c1', parentId: 'p1', start: '2026-01-01', end: '2026-01-10' },
    ]);
    const before = state.entries.get('p1')!;
    const seen = changeSets(state);

    state.entries.update('c1', { start: '2026-02-01', end: '2026-02-15' });

    expect(seen).toHaveLength(1);
    const parentRows = fieldRowsOf(seen[0]!).filter((row) => row.id === entryId('p1'));
    expect(parentRows.map((row) => row.field).sort()).toEqual(['end', 'start']);
    const after = state.entries.get('p1')!;
    expect(after.start).not.toBe(before.start);
    expect(after.end).not.toBe(before.end);

    // "one undo restores both": reverting via the changeset's own `from` values, in one transaction,
    // brings the parent back to its pre-move span — there is no history module yet to call directly.
    state.transaction(() => {
      for (const row of parentRows) {
        state.entries.update('p1', { [row.field]: row.from });
      }
    });
    expect(state.entries.get('p1')?.start).toBe(before.start);
    expect(state.entries.get('p1')?.end).toBe(before.end);
  });

  it('a two-level tree rolls up in one pass', () => {
    const state = dataset([
      { id: 'root', kind: 'group' },
      { id: 'mid', parentId: 'root', kind: 'group' },
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

  it('a group with children declared in the same construction array has a real span from the start', () => {
    const state = dataset([
      { id: 'p1', kind: 'group' },
      { id: 'c1', parentId: 'p1', start: '2026-01-01', end: '2026-01-10' },
    ]);

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-01-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-01-10', 'inclusive'));
  });

  it('a group whose span the same transaction proposed keeps the proposed value', () => {
    const state = dataset([
      { id: 'p1', kind: 'group', start: '2026-01-01', end: '2026-01-05' },
      { id: 'c1', parentId: 'p1', start: '2026-06-01', end: '2026-06-05' },
    ]);

    state.transaction(() => {
      state.entries.update('p1', { start: '2026-09-01', end: '2026-09-02' });
      state.entries.update('c1', { start: '2026-12-01', end: '2026-12-02' });
    });

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-09-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-09-02', 'inclusive'));
  });

  it('a childless group keeps its reference-date span', () => {
    const state = dataset();
    const group = state.entries.add({ id: 'p1', name: 'Sitework', kind: 'group' });
    expect(group.start).toBe(state.referenceDate);
    expect(group.end).toBe(state.referenceDate);
  });

  it('with rollUpKinds: [], nothing rolls up at all', () => {
    const state = dataset(
      [
        { id: 'p1', kind: 'group', start: '2026-01-01', end: '2026-01-05' },
        { id: 'c1', parentId: 'p1', start: '2026-06-01', end: '2026-06-05' },
      ],
      { rollUpKinds: [] },
    );

    state.entries.update('c1', { start: '2026-09-01', end: '2026-09-05' });

    const p1 = state.entries.get('p1')!;
    expect(p1.start).toBe(toInstant('UTC', '2026-01-01'));
    expect(p1.end).toBe(toEndInstant('UTC', '2026-01-05', 'inclusive'));
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
        { id: 'p1', name: 'p1', kind: 'group', start: 0, end: 1 },
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
