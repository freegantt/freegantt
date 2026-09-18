import { describe, expect, it } from 'vitest';
import { EntryStore } from './entry-store.js';
import { entryId } from '../model/index.js';
import type { StoredEntry, Instant } from '../model/index.js';
import type { EntryReadContext } from './entry-reader.js';

function createContext(): EntryReadContext {
  return { timeZone: 'UTC', dateOnlyEnd: 'inclusive' as const };
}

function entry(id: string, parentId?: string): StoredEntry {
  const base: StoredEntry = {
    id: entryId(id),
    name: id,
    start: 0 as Instant,
    end: 1 as Instant,
    props: {},
  };
  if (parentId !== undefined) base.parentId = entryId(parentId);
  return base;
}

describe('EntryStore', () => {
  it('all returns the same array identity across reads (D-S2-3)', () => {
    const store = new EntryStore([entry('t1')], createContext());
    expect(store.all).toBe(store.all);
  });

  it('get/has/size read the seeded fixture', () => {
    const store = new EntryStore([entry('t1'), entry('t2')], createContext());
    expect(store.get(entryId('t1'))?.id).toBe(entryId('t1'));
    expect(store.get(entryId('missing'))).toBeUndefined();
    expect(store.has(entryId('t2'))).toBe(true);
    expect(store.has(entryId('missing'))).toBe(false);
    expect(store.size).toBe(2);
  });

  it('storedChildrenOf returns children in insertion order', () => {
    const store = new EntryStore(
      [entry('root'), entry('a', 'root'), entry('b', 'root'), entry('c')],
      createContext(),
    );
    expect(store.storedChildrenOf('root').map((e) => e.id)).toEqual([entryId('a'), entryId('b')]);
  });

  it('an entry with no children returns an empty array, not undefined', () => {
    const store = new EntryStore([entry('leaf')], createContext());
    expect(store.storedChildrenOf(entryId('leaf'))).toEqual([]);
  });
});
