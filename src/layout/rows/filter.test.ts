import { describe, expect, it } from 'vitest';
import { rowId } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDoubles } from '../entry-double.js';
import { applyFilter } from './filter.js';
import { resolveEntriesSource } from './entries-source.js';

function stored(
  id: string,
  opts?: { parentId?: string; team?: string; start?: number; cost?: number },
): EntryDoubleValues {
  return {
    id,
    start: opts?.start ?? 0,
    end: (opts?.start ?? 0) + 1,
    ...(opts?.parentId !== undefined ? { parentId: opts.parentId } : {}),
    props: {
      ...(opts?.team !== undefined ? { team: opts.team } : {}),
      ...(opts?.cost !== undefined ? { cost: opts.cost } : {}),
    },
  };
}

describe('applyFilter (S4.9)', () => {
  const entries = entryDoubles([
    stored('root'),
    stored('child', { parentId: 'root', team: 'A' }),
    stored('grand', { parentId: 'child', team: 'B' }),
    stored('other'),
  ]);

  it('[S4-A7] a deep match keeps its whole ancestor chain, each ancestor marked unmatched', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(built, entries, (row) => row.read('team') === 'B', 'keepAncestors');
    expect(filtered.map((row) => row.id)).toEqual([rowId('root'), rowId('child'), rowId('grand')]);
    expect(filtered.find((row) => row.id === rowId('grand'))?.matched).toBe(true);
    expect(filtered.find((row) => row.id === rowId('root'))?.matched).toBe(false);
    expect(filtered.find((row) => row.id === rowId('child'))?.matched).toBe(false);
  });

  it('[S4-A10] filterPolicy matchOnly returns the matches alone, with no ancestor rows', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(built, entries, (row) => row.read('team') === 'B', 'matchOnly');
    expect(filtered.map((row) => row.id)).toEqual([rowId('grand')]);
    expect(filtered[0]?.depth).toBe(0);
    expect(filtered[0]?.expandable).toBe(false);
  });

  it('a filter reads a declared key off the row, with no reader riding beside it (ADR 0017)', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(built, entries, (row) => row.read('team') === 'B', 'keepAncestors');
    expect(filtered.map((row) => row.id)).toEqual([rowId('root'), rowId('child'), rowId('grand')]);
  });

  it('a filter matching nothing yields no rows and no crash', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(built, entries, () => false, 'keepAncestors');
    expect(filtered).toEqual([]);
  });
});
