import { describe, expect, it } from 'vitest';
import { entryId, rowId } from '../../model/index.js';
import type { Field, FieldKey } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDoubles } from '../entry-double.js';
import type { EntryRulePorts } from '../entry-rule.js';
import { resolveEntriesSource } from './entries-source.js';
import { resolveRows } from './resolve-rows.js';

/** A Dataset that declares these keys and nothing else — the same double `variants.test.ts` uses,
 *  since `childrenAsSegments` reads a Field match through the same `layout/entry-rule.ts`. */
function declaring(...fields: readonly Field[]): EntryRulePorts {
  const byKey = new Map<FieldKey, Field>(fields.map((field) => [field.key, field]));
  return { fieldFor: (key) => byKey.get(key), reportUnknownKey: () => {} };
}

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

describe('childrenAsSegments (#421 C1)', () => {
  it('true claims every parent: children take no row of their own, in flat mode', () => {
    const rows = resolveEntriesSource(entryDoubles([row('p'), row('c1', 'p'), row('c2', 'p'), row('q')]), {
      source: 'entries',
      childrenAsSegments: true,
    });
    expect(rows.map((r) => r.id)).toEqual([rowId('p'), rowId('q')]);
    const parentRow = rows.find((r) => r.id === rowId('p'));
    expect(parentRow?.entryIds).toEqual([entryId('p'), entryId('c1'), entryId('c2')]);
    expect(parentRow?.claimed).toBe(true);
    expect(parentRow?.expandable).toBe(false);
  });

  it('true on a three-level tree gives rows to the roots alone', () => {
    const rows = resolveEntriesSource(entryDoubles([row('p'), row('c1', 'p'), row('g', 'c1'), row('q')]), {
      source: 'entries',
      tree: true,
      childrenAsSegments: true,
    });
    expect(rows.map((r) => r.id)).toEqual([rowId('p'), rowId('q')]);
    expect(rows.find((r) => r.id === rowId('p'))?.entryIds).toEqual([entryId('p'), entryId('c1')]);
  });

  it('a field match claims only the parents the rule answers yes for; an unclaimed parent keeps its own row and its children keep theirs', () => {
    const rows = resolveEntriesSource(
      entryDoubles([row('p1', undefined, 'a'), row('c1', 'p1'), row('p2', undefined, 'b'), row('c2', 'p2')]),
      { source: 'entries', childrenAsSegments: { team: 'a' } },
      declaring({ key: 'team' }),
    );
    expect(rows.map((r) => r.id)).toEqual([rowId('p1'), rowId('p2'), rowId('c2')]);
    expect(rows.find((r) => r.id === rowId('p1'))?.claimed).toBe(true);
    expect(rows.find((r) => r.id === rowId('p2'))?.claimed).toBeUndefined();
  });

  it('a predicate rule runs with no Field registry wired in', () => {
    const rows = resolveEntriesSource(entryDoubles([row('p'), row('c1', 'p')]), {
      source: 'entries',
      childrenAsSegments: (entry) => entry.id === entryId('p'),
    });
    expect(rows.map((r) => r.id)).toEqual([rowId('p')]);
    expect(rows[0]?.claimed).toBe(true);
  });

  it('a claimed flat source stays a grid: a claimed parent is never expandable', () => {
    const rows = resolveEntriesSource(entryDoubles([row('p'), row('c1', 'p')]), {
      source: 'entries',
      childrenAsSegments: true,
    });
    expect(rows[0]?.expandable).toBe(false);
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
