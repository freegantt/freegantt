import { describe, expect, it } from 'vitest';
import { entryId, rowId, UnknownFieldError } from '../../model/index.js';
import type { Entry, Instant } from '../../model/index.js';
import type { FieldCompare } from '../column.js';
import { applyFilter } from './filter.js';
import { resolveEntriesSource } from './entries-source.js';
import { applySort } from './sort.js';
import { resolveRows } from './resolve-rows.js';

function instant(n: number): Instant {
  return n as Instant;
}

function entry(
  id: string,
  opts?: { parentId?: string; team?: string; start?: number; cost?: number },
): Entry {
  const row: Entry = {
    id: entryId(id),
    name: id,
    start: instant(opts?.start ?? 0),
    end: instant((opts?.start ?? 0) + 1),
    kind: 'span',
  };
  if (opts?.parentId !== undefined) row.parentId = entryId(opts.parentId);
  if (opts?.team !== undefined || opts?.cost !== undefined) {
    row.meta = {
      ...(opts.team !== undefined ? { team: opts.team } : {}),
      ...(opts.cost !== undefined ? { cost: opts.cost } : {}),
    };
  }
  return row;
}

function costCompares(): readonly FieldCompare[] {
  const readMetaCost = (row: Entry) => (row.meta as { cost?: number } | undefined)?.cost;
  return [
    {
      key: 'name',
      readStored: (row) => row.name,
      compareStored: (a, b) => String(a).localeCompare(String(b)),
    },
    {
      key: 'start',
      readStored: (row) => row.start,
      compareStored: (a, b) => Number(a) - Number(b),
    },
    {
      key: 'cost',
      readStored: readMetaCost,
      compareStored: (a, b) => {
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return 0;
      },
    },
  ];
}

describe('applyFilter (S4.9)', () => {
  const entries = [
    entry('root'),
    entry('child', { parentId: 'root', team: 'A' }),
    entry('grand', { parentId: 'child', team: 'B' }),
    entry('other'),
  ];

  it('[S4-A7] a deep match keeps its whole ancestor chain, each ancestor marked unmatched', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(
      built,
      entries,
      (row) => (row.meta as { team?: string } | undefined)?.team === 'B',
      'keepAncestors',
    );
    expect(filtered.map((row) => row.id)).toEqual([rowId('root'), rowId('child'), rowId('grand')]);
    expect(filtered.find((row) => row.id === rowId('grand'))?.matched).toBe(true);
    expect(filtered.find((row) => row.id === rowId('root'))?.matched).toBe(false);
    expect(filtered.find((row) => row.id === rowId('child'))?.matched).toBe(false);
  });

  it('[S4-A10] filterPolicy matchOnly returns the matches alone, with no ancestor rows', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(
      built,
      entries,
      (row) => (row.meta as { team?: string } | undefined)?.team === 'B',
      'matchOnly',
    );
    expect(filtered.map((row) => row.id)).toEqual([rowId('grand')]);
    expect(filtered[0]?.depth).toBe(0);
    expect(filtered[0]?.expandable).toBe(false);
  });

  it('a filter matching nothing yields no rows and no crash', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(built, entries, () => false, 'keepAncestors');
    expect(filtered).toEqual([]);
  });
});

describe('applySort (S4.9)', () => {
  const compares = costCompares();

  it('reorders siblings and never lifts a child past its parent', () => {
    const entries = [
      entry('p'),
      entry('b', { parentId: 'p', start: 20 }),
      entry('a', { parentId: 'p', start: 10 }),
    ];
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const sorted = applySort(built, entries, { field: 'start' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('p'), rowId('a'), rowId('b')]);
    expect(sorted.find((row) => row.id === rowId('a'))?.depth).toBe(1);
  });

  it('desc reverses sibling order', () => {
    const entries = [entry('a', { start: 1 }), entry('b', { start: 2 }), entry('c', { start: 3 })];
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'start', direction: 'desc' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('c'), rowId('b'), rowId('a')]);
  });

  it('sorts money by the stored number, not the formatted string', () => {
    const entries = [entry('low', { cost: 500 }), entry('high', { cost: 12_000 })];
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'cost' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('low'), rowId('high')]);
  });

  it('RowSort.compare beats FieldCompare.compareStored', () => {
    const entries = [entry('a', { cost: 1 }), entry('b', { cost: 2 })];
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'cost', compare: () => -1 }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('b'), rowId('a')]);
  });

  it('an unregistered sort field throws UnknownFieldError', () => {
    const entries = [entry('a')];
    const built = resolveEntriesSource(entries, { source: 'entries' });
    expect(() => applySort(built, entries, { field: 'nope' }, compares)).toThrow(UnknownFieldError);
  });
});

describe('resolveRows order (S4.9)', () => {
  it('filter, then sort, then collapse — a collapsed parent that survives the filter still hides descendants', () => {
    const entries = [
      entry('p', { team: 'A' }),
      entry('c1', { parentId: 'p', team: 'A', start: 20 }),
      entry('c2', { parentId: 'p', team: 'A', start: 10 }),
      entry('q'),
    ];
    const rows = resolveRows({
      entries,
      rows: {
        source: 'entries',
        tree: true,
        filter: (row) => (row.meta as { team?: string } | undefined)?.team === 'A',
        sort: { field: 'start' },
      },
      collapsed: [rowId('p')],
      fieldCompares: costCompares(),
    });
    expect(rows.map((row) => row.id)).toEqual([rowId('p')]);
    expect(rows[0]?.expanded).toBe(false);
  });
});
