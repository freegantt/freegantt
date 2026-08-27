import { describe, expect, it } from 'vitest';
import { EntryStore } from './entry-store.js';
import { entryId } from '../model/index.js';
import type { Entry } from '../model/index.js';

function entry(id: string, parentId?: string): Entry {
  const base: Entry = { id: entryId(id), name: id, start: 0 as Entry['start'], end: 1 as Entry['end'] };
  if (parentId !== undefined) base.parentId = entryId(parentId);
  return base;
}

describe('EntryStore', () => {
  it('snapshot() returns the same array identity across reads (D-S2-3)', () => {
    const store = new EntryStore([entry('t1')]);
    expect(store.snapshot()).toBe(store.snapshot());
  });

  it('get/has/size read the seeded fixture', () => {
    const store = new EntryStore([entry('t1'), entry('t2')]);
    expect(store.get(entryId('t1'))?.id).toBe(entryId('t1'));
    expect(store.get(entryId('missing'))).toBeUndefined();
    expect(store.has(entryId('t2'))).toBe(true);
    expect(store.has(entryId('missing'))).toBe(false);
    expect(store.size).toBe(2);
  });

  it('childrenOf returns children in insertion order', () => {
    const store = new EntryStore([entry('root'), entry('a', 'root'), entry('b', 'root'), entry('c')]);
    expect(store.childrenOf(entryId('root')).map((e) => e.id)).toEqual([entryId('a'), entryId('b')]);
  });

  it('an entry with no children returns an empty array, not undefined', () => {
    const store = new EntryStore([entry('leaf')]);
    expect(store.childrenOf(entryId('leaf'))).toEqual([]);
  });
});
