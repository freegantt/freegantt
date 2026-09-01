import { describe, expect, it } from 'vitest';
import { entryId, rowId, UnknownFieldError } from '../../model/index.js';
import type { Entry, Instant } from '../../model/index.js';
import type { FieldCompare } from '../column.js';
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
    {
      key: 'duration',
      readStored: (row) => Number(row.end) - Number(row.start),
      compareStored: (a, b) => Number(a) - Number(b),
    },
  ];
}

describe('resolveRows (D2, S4.9)', () => {
  it('matchOnly plus collapse does not paint a twisty that hides nothing', () => {
    const entries = [entry('a'), entry('b', { parentId: 'a' }), entry('c', { parentId: 'b' })];
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
    const entries = [entry('short', { start: 0 }), entry('long', { start: 10 })];
    entries[1]!.end = instant(40);
    const rows = resolveRows({
      entries,
      rows: { source: 'entries', sort: { field: 'duration' } },
      fieldCompares: costCompares(),
    });
    expect(rows.map((row) => row.id)).toEqual([rowId('short'), rowId('long')]);
  });

  it("sort: { field: 'cost' } uses the cost comparer even when name is the only grid column", () => {
    const entries = [entry('high', { cost: 12_000 }), entry('low', { cost: 500 })];
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
        entries: [entry('a')],
        rows: { source: 'entries', sort: { field: 'nope' } },
        fieldCompares: costCompares(),
      }),
    ).toThrow(UnknownFieldError);
  });
});
