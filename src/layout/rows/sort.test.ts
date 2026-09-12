import { describe, expect, it } from 'vitest';
import { rowId, UnknownFieldError } from '../../model/index.js';
import type { Duration, Entry } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDoubles } from '../entry-double.js';
import type { FieldCompare } from '../column.js';
import { resolveEntriesSource } from './entries-source.js';
import { applySort } from './sort.js';

function stored(
  id: string,
  opts?: { parentId?: string; start?: number; end?: number; cost?: number },
): EntryDoubleValues {
  return {
    id,
    start: opts?.start ?? 0,
    end: opts?.end ?? (opts?.start ?? 0) + 1,
    ...(opts?.parentId !== undefined ? { parentId: opts.parentId } : {}),
    ...(opts?.cost !== undefined ? { props: { cost: opts.cost } } : {}),
  };
}

function durationOf(row: Entry): Duration {
  return { value: Number(row.end) - Number(row.start), unit: 'millisecond' };
}

function costCompares(): readonly FieldCompare[] {
  const readMetaCost = (row: Entry) => row.read('cost');
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
    {
      key: 'duration',
      readStored: durationOf,
      compareStored: (a, b) => (a as Duration).value - (b as Duration).value,
    },
  ];
}

describe('applySort (S4.9)', () => {
  const compares = costCompares();

  it('reorders siblings and never lifts a child past its parent', () => {
    const entries = entryDoubles([
      stored('p'),
      stored('b', { parentId: 'p', start: 20 }),
      stored('a', { parentId: 'p', start: 10 }),
    ]);
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const sorted = applySort(built, entries, { field: 'start' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('p'), rowId('a'), rowId('b')]);
    expect(sorted.find((row) => row.id === rowId('a'))?.depth).toBe(1);
  });

  it('desc reverses sibling order', () => {
    const entries = entryDoubles([
      stored('a', { start: 1 }),
      stored('b', { start: 2 }),
      stored('c', { start: 3 }),
    ]);
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'start', direction: 'desc' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('c'), rowId('b'), rowId('a')]);
  });

  it('sorts money by the stored number, not the formatted string', () => {
    const entries = entryDoubles([stored('low', { cost: 500 }), stored('high', { cost: 12_000 })]);
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'cost' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('low'), rowId('high')]);
  });

  it('RowSort.compare beats FieldCompare.compareStored', () => {
    const entries = entryDoubles([stored('a', { cost: 1 }), stored('b', { cost: 2 })]);
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'cost', compare: () => -1 }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('b'), rowId('a')]);
  });

  it("sort: { field: 'cost' } uses the cost comparer even when name is the only grid column", () => {
    const entries = entryDoubles([stored('high', { cost: 12_000 }), stored('low', { cost: 500 })]);
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'cost' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('low'), rowId('high')]);
  });

  it('an unregistered sort field throws UnknownFieldError', () => {
    const entries = entryDoubles([stored('a')]);
    const built = resolveEntriesSource(entries, { source: 'entries' });
    expect(() => applySort(built, entries, { field: 'nope' }, compares)).toThrow(UnknownFieldError);
  });

  it('an unregistered sort field throws when fieldCompares is empty', () => {
    const entries = entryDoubles([stored('a')]);
    const built = resolveEntriesSource(entries, { source: 'entries' });
    expect(() => applySort(built, entries, { field: 'start' }, [])).toThrow(UnknownFieldError);
  });

  it('a computed Field sorts through duration values, not a stored column', () => {
    const entries = entryDoubles([
      stored('short', { start: 0, end: 10 }),
      stored('long', { start: 0, end: 40 }),
    ]);
    const built = resolveEntriesSource(entries, { source: 'entries' });
    const sorted = applySort(built, entries, { field: 'duration' }, compares);
    expect(sorted.map((row) => row.id)).toEqual([rowId('short'), rowId('long')]);
  });

  it('a row with neither date sorts last on asc and on desc, not direction * order (ADR 0012 Gate)', () => {
    const entries = entryDoubles([stored('a', { start: 1 }), { id: 'none' }, stored('b', { start: 2 })]);
    const built = resolveEntriesSource(entries, { source: 'entries' });

    const asc = applySort(built, entries, { field: 'start' }, compares);
    expect(asc.map((row) => row.id)).toEqual([rowId('a'), rowId('b'), rowId('none')]);

    const desc = applySort(built, entries, { field: 'start', direction: 'desc' }, compares);
    expect(desc.map((row) => row.id)).toEqual([rowId('b'), rowId('a'), rowId('none')]);
  });

  it('a Field-type compare on Duration.value is what FieldCompare.compareStored runs', () => {
    const duration = compares.find((compare) => compare.key === 'duration');
    expect(
      duration?.compareStored({ value: 1, unit: 'millisecond' }, { value: 2, unit: 'millisecond' }),
    ).toBe(-1);
  });
});
