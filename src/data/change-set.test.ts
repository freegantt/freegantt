import { describe, expect, it } from 'vitest';
import { diffEdit, fieldsEqual, foldChangeSet } from './change-set.js';
import { changeSetId, entryId } from '../model/index.js';
import type { Entry, EntryId, Instant } from '../model/index.js';
import type { StoredEdit } from './edit-extension.js';

function span(start: number, end: number): { start: Instant; end: Instant } {
  return { start: start as Instant, end: end as Instant };
}

function entry(id: string): Entry {
  return { id: entryId(id), name: id, start: 0 as Entry['start'], end: 1 as Entry['end'], kind: 'span' };
}

describe('fieldsEqual', () => {
  it('compares primitives by reference', () => {
    expect(fieldsEqual('name', 'Roofing', 'Roofing')).toBe(true);
    expect(fieldsEqual('name', 'Roofing', 'Framing')).toBe(false);
  });

  it('compares start/end as exact Instant equality', () => {
    expect(fieldsEqual('start', 0, 0)).toBe(true);
    expect(fieldsEqual('start', 0, 1)).toBe(false);
  });

  it('compares meta by reference only, never deep', () => {
    const shared = { note: 'x' };
    expect(fieldsEqual('meta', shared, shared)).toBe(true);
    expect(fieldsEqual('meta', { note: 'x' }, { note: 'x' })).toBe(false);
  });

  it('compares segments element-wise on start/end', () => {
    const a = [span(0, 1)];
    const b = [span(0, 1)];
    const c = [span(0, 2)];
    expect(fieldsEqual('segments', a, b)).toBe(true);
    expect(fieldsEqual('segments', a, c)).toBe(false);
    expect(fieldsEqual('segments', undefined, undefined)).toBe(true);
    expect(fieldsEqual('segments', a, undefined)).toBe(false);
  });

  it('falls back to reference equality for a key outside the core table (S5 field)', () => {
    expect(fieldsEqual('customField', 1, 1)).toBe(true);
    expect(fieldsEqual('customField', 1, 2)).toBe(false);
  });
});

describe('diffEdit', () => {
  function entries(...list: Entry[]): ReadonlyMap<EntryId, Entry> {
    return new Map(list.map((item) => [item.id, item]));
  }

  it('produces a FieldUpdated row per changed field', () => {
    const t1 = entry('t1');
    const edit: StoredEdit = { name: 'Framing', progress: 0.5 };
    const rows = diffEdit(entries(t1), t1.id, edit);
    expect(rows).toEqual([
      { store: 'entries', id: t1.id, field: 'name', from: 't1', to: 'Framing' },
      { store: 'entries', id: t1.id, field: 'progress', from: undefined, to: 0.5 },
    ]);
  });

  it('drops a field set back to its current value', () => {
    const t1 = entry('t1');
    const rows = diffEdit(entries(t1), t1.id, { name: 't1' });
    expect(rows).toEqual([]);
  });

  it('returns no rows for an id absent from entries', () => {
    const t1 = entry('t1');
    const rows = diffEdit(entries(t1), entryId('missing'), { name: 'x' });
    expect(rows).toEqual([]);
  });
});

describe('foldChangeSet', () => {
  it('returns undefined for an empty net effect', () => {
    expect(foldChangeSet(changeSetId(1), 'user', [], [], [])).toBeUndefined();
  });

  it('keeps an add with no matching remove', () => {
    const t1 = entry('t1');
    const result = foldChangeSet(changeSetId(1), 'user', [{ store: 'entries', entity: t1 }], [], []);
    expect(result?.added).toEqual([{ store: 'entries', entity: t1 }]);
  });

  it('cancels an add followed by a remove of the same id, and records neither', () => {
    const t1 = entry('t1');
    const result = foldChangeSet(
      changeSetId(1),
      'user',
      [{ store: 'entries', entity: t1 }],
      [{ store: 'entries', entity: t1 }],
      [],
    );
    expect(result).toBeUndefined();
  });

  it('drops field updates belonging to a cancelled id, but keeps updates for other ids', () => {
    const t1 = entry('t1');
    const t2 = entry('t2');
    const result = foldChangeSet(
      changeSetId(1),
      'user',
      [{ store: 'entries', entity: t1 }],
      [{ store: 'entries', entity: t1 }],
      [
        { store: 'entries', id: t1.id, field: 'name', from: 'a', to: 'b' },
        { store: 'entries', id: t2.id, field: 'name', from: 'a', to: 'b' },
      ],
    );
    expect(result?.added).toEqual([]);
    expect(result?.removed).toEqual([]);
    expect(result?.updated).toEqual([{ store: 'entries', id: t2.id, field: 'name', from: 'a', to: 'b' }]);
  });
});
