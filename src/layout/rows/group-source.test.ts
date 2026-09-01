import { describe, expect, it } from 'vitest';
import { entryId, rowId } from '../../model/index.js';
import type { Entry, Instant } from '../../model/index.js';
import { resolveGroupSource } from './group-source.js';
import { resolveRows } from './resolve-rows.js';

function instant(n: number): Instant {
  return n as Instant;
}

function entry(id: string, team: string): Entry {
  return {
    id: entryId(id),
    name: id,
    start: instant(0),
    end: instant(1),
    kind: 'span',
    meta: { team },
  };
}

describe('resolveGroupSource', () => {
  it('emits one header per groupBy value in first-seen order, then an entry row per member', () => {
    const rows = resolveGroupSource([entry('a', 'red'), entry('b', 'blue'), entry('c', 'red')], {
      source: 'group',
      groupBy: (e) => String((e.meta as { team: string }).team),
    });
    expect(rows.map((r) => r.kind)).toEqual(['header', 'entry', 'entry', 'header', 'entry']);
    expect(rows[0]).toMatchObject({
      id: rowId('group:red'),
      kind: 'header',
      entryIds: [],
      headerLabel: 'red',
      expandable: true,
      expanded: false,
    });
    expect(rows[1]?.entryIds).toEqual([entryId('a')]);
    expect(rows[3]?.id).toBe(rowId('group:blue'));
  });
});

describe('resolveRows collapse (group)', () => {
  it('a collapsed header omits its entry rows', () => {
    const rows = resolveRows({
      entries: [entry('a', 'red'), entry('b', 'blue')],
      rows: { source: 'group', groupBy: (e) => String((e.meta as { team: string }).team) },
      collapsed: [rowId('group:red')],
    });
    expect(rows.map((r) => r.id)).toEqual([rowId('group:red'), rowId('group:blue'), rowId('b')]);
    expect(rows[0]?.expanded).toBe(false);
  });
});
