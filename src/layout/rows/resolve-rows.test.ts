import { describe, expect, it } from 'vitest';
import { rowId, UnknownFieldError } from '../../model/index.js';
import type { Entry } from '../../model/index.js';
import type { EntryDoubleValues } from '../entry-double.js';
import { entryDoubles } from '../entry-double.js';
import type { FieldCompare } from '../column.js';
import type { RowSource } from './row-source.js';
import { resolveRows } from './resolve-rows.js';

function stored(
  id: string,
  opts?: { parentId?: string; team?: string; start?: number; end?: number; cost?: number },
): EntryDoubleValues {
  return {
    id,
    start: opts?.start ?? 0,
    end: opts?.end ?? (opts?.start ?? 0) + 1,
    ...(opts?.parentId !== undefined ? { parentId: opts.parentId } : {}),
    props: {
      ...(opts?.team !== undefined ? { team: opts.team } : {}),
      ...(opts?.cost !== undefined ? { cost: opts.cost } : {}),
    },
  };
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
      readStored: (row) => Number(row.end) - Number(row.start),
      compareStored: (a, b) => Number(a) - Number(b),
    },
  ];
}

const treeEntries = entryDoubles([
  stored('p', { team: 'A', start: 0 }),
  stored('c1', { parentId: 'p', team: 'A', start: 20 }),
  stored('c2', { parentId: 'p', team: 'A', start: 10 }),
  stored('q', { team: 'B', start: 5 }),
]);

const teamA = (row: Entry) => row.read('team') === 'A';

describe('resolveRows (D2, S4.9)', () => {
  it('matchOnly plus collapse does not paint a twisty that hides nothing', () => {
    const entries = entryDoubles([
      stored('a'),
      stored('b', { parentId: 'a' }),
      stored('c', { parentId: 'b' }),
    ]);
    const rows = resolveRows({
      entries,
      rows: { source: 'entries', tree: true, filter: () => true, filterPolicy: 'matchOnly' },
      collapsed: [rowId('a')],
    });
    expect(rows.map((row) => `${row.id}:${row.depth}:${row.expandable}:${row.expanded}`)).toEqual([
      'a:0:false:false',
      'b:0:false:false',
      'c:0:false:false',
    ]);
  });

  it('a computed Field sorts even when it is not a stored key', () => {
    const entries = entryDoubles([stored('short', { start: 0 }), stored('long', { start: 10, end: 40 })]);
    const rows = resolveRows({
      entries,
      rows: { source: 'entries', sort: { field: 'duration' } },
      fieldCompares: costCompares(),
    });
    expect(rows.map((row) => row.id)).toEqual([rowId('short'), rowId('long')]);
  });

  it("sort: { field: 'cost' } uses the cost comparer even when name is the only grid column", () => {
    const entries = entryDoubles([stored('high', { cost: 12_000 }), stored('low', { cost: 500 })]);
    const rows = resolveRows({
      entries,
      rows: { source: 'entries', sort: { field: 'cost' } },
      fieldCompares: costCompares(),
    });
    expect(rows.map((row) => row.id)).toEqual([rowId('low'), rowId('high')]);
  });

  it('an unregistered sort field throws UnknownFieldError', () => {
    expect(() =>
      resolveRows({
        entries: entryDoubles([stored('a')]),
        rows: { source: 'entries', sort: { field: 'nope' } },
        fieldCompares: costCompares(),
      }),
    ).toThrow(UnknownFieldError);
  });

  it('filter, then sort, then collapse — a collapsed parent that survives the filter still hides descendants', () => {
    const rows = resolveRows({
      entries: treeEntries,
      rows: {
        source: 'entries',
        tree: true,
        filter: teamA,
        sort: { field: 'start' },
      },
      collapsed: [rowId('p')],
      fieldCompares: costCompares(),
    });
    expect(rows.map((row) => row.id)).toEqual([rowId('p')]);
    expect(rows[0]?.expanded).toBe(false);
  });
});

describe('resolveRows source × policy × sort × collapsed', () => {
  const cases: {
    name: string;
    rows: RowSource;
    collapsed?: readonly string[];
    ids: readonly string[];
  }[] = [
    {
      name: 'entries tree keepAncestors sort collapsed',
      rows: { source: 'entries', tree: true, filter: teamA, sort: { field: 'start' } },
      collapsed: [rowId('p')],
      ids: ['p'],
    },
    {
      name: 'entries tree keepAncestors sort expanded',
      rows: { source: 'entries', tree: true, filter: teamA, sort: { field: 'start' } },
      ids: ['p', 'c2', 'c1'],
    },
    {
      name: 'entries tree matchOnly sort',
      rows: {
        source: 'entries',
        tree: true,
        filter: teamA,
        filterPolicy: 'matchOnly',
        sort: { field: 'start' },
      },
      ids: ['p', 'c2', 'c1'],
    },
    {
      name: 'entries flat sort',
      rows: { source: 'entries', tree: false, sort: { field: 'start' } },
      ids: ['p', 'q', 'c2', 'c1'],
    },
    {
      name: 'group sort collapsed',
      rows: {
        source: 'group',
        groupBy: (row) => String(row.read('team')),
        sort: { field: 'start' },
      },
      collapsed: [rowId('group:A')],
      ids: ['group:A', 'group:B', 'q'],
    },
    {
      name: 'group sort expanded',
      rows: {
        source: 'group',
        groupBy: (row) => String(row.read('team')),
        sort: { field: 'start' },
      },
      ids: ['group:A', 'p', 'c2', 'c1', 'group:B', 'q'],
    },
    {
      name: 'custom ignores filter sort collapsed',
      rows: {
        source: 'custom',
        resolve: () => [{ id: 'only', entryIds: ['q'] }],
      },
      collapsed: [rowId('only')],
      ids: ['only'],
    },
  ];

  it.each(cases)('$name', ({ rows, collapsed, ids }) => {
    const planned = resolveRows({
      entries: treeEntries,
      rows,
      ...(collapsed !== undefined ? { collapsed } : {}),
      fieldCompares: costCompares(),
    });
    expect(planned.map((row) => String(row.id))).toEqual(ids);
  });
});
