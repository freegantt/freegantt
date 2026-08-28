import { describe, expect, it } from 'vitest';
import { EntryStore } from './entry-store.js';
import { entryId } from '../model/index.js';
import type { Entry } from '../model/index.js';
import { instant } from '../time/index.js';

const context = {
  timeZone: 'UTC',
  dateOnlyEnd: 'inclusive' as const,
  referenceDate: instant('2026-01-01T00:00:00Z'),
  derivedSpanKinds: new Set(['group']),
};

function entry(id: string, parentId?: string): Entry {
  const base: Entry = {
    id: entryId(id),
    name: id,
    start: 0 as Entry['start'],
    end: 1 as Entry['end'],
    kind: 'span',
  };
  if (parentId !== undefined) base.parentId = entryId(parentId);
  return base;
}

describe('EntryStore', () => {
  it('all returns the same array identity across reads (D-S2-3)', () => {
    const store = new EntryStore([entry('t1')], context);
    expect(store.all).toBe(store.all);
  });

  it('get/has/size read the seeded fixture', () => {
    const store = new EntryStore([entry('t1'), entry('t2')], context);
    expect(store.get(entryId('t1'))?.id).toBe(entryId('t1'));
    expect(store.get(entryId('missing'))).toBeUndefined();
    expect(store.has(entryId('t2'))).toBe(true);
    expect(store.has(entryId('missing'))).toBe(false);
    expect(store.size).toBe(2);
  });

  it('childrenOf returns children in insertion order', () => {
    const store = new EntryStore(
      [entry('root'), entry('a', 'root'), entry('b', 'root'), entry('c')],
      context,
    );
    expect(store.childrenOf(entryId('root')).map((e) => e.id)).toEqual([entryId('a'), entryId('b')]);
  });

  it('an entry with no children returns an empty array, not undefined', () => {
    const store = new EntryStore([entry('leaf')], context);
    expect(store.childrenOf(entryId('leaf'))).toEqual([]);
  });
});
