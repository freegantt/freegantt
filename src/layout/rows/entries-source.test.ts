import { describe, expect, it } from 'vitest';
import { entryId, rowId } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDoubles } from '../entry-double.js';
import { resolveEntriesSource } from './entries-source.js';
import { resolveRows } from './resolve-rows.js';

function row(id: string, parentId?: string, team?: string): EntryDoubleValues {
  return {
    id,
    start: 0,
    end: 1,
    ...(parentId !== undefined ? { parentId } : {}),
    ...(team !== undefined ? { props: { team } } : {}),
  };
}

describe('resolveEntriesSource', () => {
  it('flat matches S1: one row per entry, insertion order, depth 0, no twisty', () => {
    const rows = resolveEntriesSource(entryDoubles([row('a'), row('b'), row('c')]), {
      source: 'entries',
    });
    expect(rows.map((r) => r.id)).toEqual([rowId('a'), rowId('b'), rowId('c')]);
    expect(rows.every((r) => r.depth === 0 && r.expandable === false)).toBe(true);
    expect(rows[0]?.entryIds).toEqual([entryId('a')]);
  });

  it('tree order is depth-first in insertion order, with correct depth', () => {
    const rows = resolveEntriesSource(
      entryDoubles([row('p'), row('c1', 'p'), row('c2', 'p'), row('g', 'c1'), row('q')]),
      { source: 'entries', tree: true },
    );
    expect(rows.map((r) => `${r.id}:${r.depth}`)).toEqual(['p:0', 'c1:1', 'g:2', 'c2:1', 'q:0']);
    expect(rows.find((r) => r.id === rowId('p'))?.expandable).toBe(true);
    expect(rows.find((r) => r.id === rowId('q'))?.expandable).toBe(false);
  });
});

describe('resolveRows collapse', () => {
  it('a collapsed parent omits descendants — they are absent, not hidden', () => {
    const rows = resolveRows({
      entries: entryDoubles([row('p'), row('c1', 'p'), row('g', 'c1'), row('q')]),
      rows: { source: 'entries', tree: true },
      collapsed: [rowId('p')],
    });
    expect(rows.map((r) => r.id)).toEqual([rowId('p'), rowId('q')]);
    expect(rows[0]?.expandable).toBe(true);
    expect(rows[0]?.expanded).toBe(false);
  });
});
