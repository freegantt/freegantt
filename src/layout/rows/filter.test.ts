import { describe, expect, it } from 'vitest';
import { entryId, rowId, segmentId } from '../../model/index.js';
import type { CoreFieldValue, Entry, FieldContext, FieldKey, Instant } from '../../model/index.js';
import { applyFilter } from './filter.js';
import { resolveEntriesSource } from './entries-source.js';

function instant(n: number): Instant {
  return n as Instant;
}

function entry(
  id: string,
  opts?: { parentId?: string; team?: string; start?: number; cost?: number },
): Entry {
  const start = instant(opts?.start ?? 0);
  const end = instant((opts?.start ?? 0) + 1);
  const row: Entry = {
    id: entryId(id),
    name: id,
    start,
    end,
    segments: [{ id: segmentId(`${id}-1`), start, end }],
    props: {},
  };
  if (opts?.parentId !== undefined) row.parentId = entryId(opts.parentId);
  if (opts?.team !== undefined || opts?.cost !== undefined) {
    row.props = {
      ...(opts.team !== undefined ? { team: opts.team } : {}),
      ...(opts.cost !== undefined ? { cost: opts.cost } : {}),
    };
  }
  return row;
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
      (row) => (row.props as { team?: string } | undefined)?.team === 'B',
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
      (row) => (row.props as { team?: string } | undefined)?.team === 'B',
      'matchOnly',
    );
    expect(filtered.map((row) => row.id)).toEqual([rowId('grand')]);
    expect(filtered[0]?.depth).toBe(0);
    expect(filtered[0]?.expandable).toBe(false);
  });

  it('passes the Field reader so a filter can read a declared key', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const fields: FieldContext = {
      timeZone: 'UTC',
      read<K extends FieldKey>(row: Entry, key: K): CoreFieldValue<K> | undefined {
        if (key !== 'team') return undefined;
        return (row.props as { team?: string } | undefined)?.team as CoreFieldValue<K> | undefined;
      },
      durationOf: () => ({ value: 1, unit: 'millisecond' }),
    };
    const filtered = applyFilter(
      built,
      entries,
      (_row, reader) => reader?.read(_row, 'team') === 'B',
      'keepAncestors',
      fields,
    );
    expect(filtered.map((row) => row.id)).toEqual([rowId('root'), rowId('child'), rowId('grand')]);
  });

  it('a filter matching nothing yields no rows and no crash', () => {
    const built = resolveEntriesSource(entries, { source: 'entries', tree: true });
    const filtered = applyFilter(built, entries, () => false, 'keepAncestors');
    expect(filtered).toEqual([]);
  });
});
