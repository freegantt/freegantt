import { describe, expect, it } from 'vitest';
import { DuplicateRowIdError, entryId, rowId, segmentId } from '../../model/index.js';
import type { Entry, Instant } from '../../model/index.js';
import { resolveCustomSource } from './custom-source.js';

function instant(n: number): Instant {
  return n as Instant;
}

const entries: readonly Entry[] = [
  {
    id: entryId('a'),
    name: 'a',
    start: instant(0),
    end: instant(1),
    segments: [{ id: segmentId('a-1'), start: instant(0), end: instant(1) }],
    props: {},
  },
];

describe('resolveCustomSource [S4-A11]', () => {
  it('turns a consumer CustomRow[] into planned rows', () => {
    const rows = resolveCustomSource(
      {
        source: 'custom',
        resolve: () => [
          { id: 'h', label: 'Phase' },
          { id: 'a', entryIds: ['a'] },
        ],
      },
      { entries },
    );
    expect(rows[0]).toMatchObject({
      id: rowId('h'),
      kind: 'header',
      entryIds: [],
      headerLabel: 'Phase',
    });
    expect(rows[1]).toMatchObject({
      id: rowId('a'),
      kind: 'entry',
      entryIds: [entryId('a')],
    });
  });

  it('empty entryIds is a header row', () => {
    const rows = resolveCustomSource(
      { source: 'custom', resolve: () => [{ id: 'empty', entryIds: [] }] },
      { entries },
    );
    expect(rows[0]).toMatchObject({ kind: 'header', entryIds: [] });
  });

  it('a duplicate id throws DuplicateRowIdError', () => {
    expect(() =>
      resolveCustomSource(
        {
          source: 'custom',
          resolve: () => [
            { id: 'x', entryIds: ['a'] },
            { id: 'x', label: 'again' },
          ],
        },
        { entries },
      ),
    ).toThrow(DuplicateRowIdError);
  });
});
