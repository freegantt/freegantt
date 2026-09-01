import { describe, expect, it } from 'vitest';
import { entryId, rowId } from '../../model/index.js';
import type { Entry, Instant } from '../../model/index.js';
import { resolveEntriesSource } from './entries-source.js';
import { resolveRows, rowResolutionInput } from './resolve-rows.js';

function instant(n: number): Instant {
  return n as Instant;
}

function entry(id: string, parentId?: string, team?: string): Entry {
  const row: Entry = {
    id: entryId(id),
    name: id,
    start: instant(0),
    end: instant(1),
    kind: 'span',
  };
  if (parentId !== undefined) row.parentId = entryId(parentId);
  if (team !== undefined) row.meta = { team };
  return row;
}

describe('resolveEntriesSource', () => {
  it('flat matches S1: one row per entry, insertion order, depth 0, no twisty', () => {
    const rows = resolveEntriesSource([entry('a'), entry('b'), entry('c')], { source: 'entries' });
    expect(rows.map((r) => r.id)).toEqual([rowId('a'), rowId('b'), rowId('c')]);
    expect(rows.every((r) => r.depth === 0 && r.expandable === false)).toBe(true);
    expect(rows[0]?.entryIds).toEqual([entryId('a')]);
  });

  it('tree order is depth-first in insertion order, with correct depth', () => {
    const rows = resolveEntriesSource(
      [entry('p'), entry('c1', 'p'), entry('c2', 'p'), entry('g', 'c1'), entry('q')],
      { source: 'entries', tree: true },
    );
    expect(rows.map((r) => `${r.id}:${r.depth}`)).toEqual(['p:0', 'c1:1', 'g:2', 'c2:1', 'q:0']);
    expect(rows.find((r) => r.id === rowId('p'))?.expandable).toBe(true);
    expect(rows.find((r) => r.id === rowId('q'))?.expandable).toBe(false);
  });
});

describe('resolveRows collapse', () => {
  it('a collapsed parent omits descendants — they are absent, not hidden', () => {
    const rows = resolveRows(
      rowResolutionInput({
        entries: [entry('p'), entry('c1', 'p'), entry('g', 'c1'), entry('q')],
        rows: { source: 'entries', tree: true },
        collapsed: [rowId('p')],
      }),
    );
    expect(rows.map((r) => r.id)).toEqual([rowId('p'), rowId('q')]);
    expect(rows[0]?.expandable).toBe(true);
    expect(rows[0]?.expanded).toBe(false);
  });
});
