import { describe, expect, it } from 'vitest';
import { readEntries, readEdit } from './entry-reader.js';
import type { EntryReadContext } from './entry-reader.js';
import { entryId, EmptySegmentsError, segmentId, SegmentsOutOfSyncError } from '../model/index.js';
import type { EntryInput } from '../model/index.js';
import { instant } from '../time/index.js';
import { FieldRegistry } from './fields/field-registry.js';

const registry = new FieldRegistry({ fields: [] });

const utc = (iso: string): number => Date.parse(iso);

// Each test gets its own counter, so no test can see another test's minted ids (I2).
function createContext(): EntryReadContext {
  let mintedCount = 0;
  return {
    timeZone: 'UTC',
    dateOnlyEnd: 'inclusive' as const,
    referenceDate: instant('2026-01-01T00:00:00Z'),
    rollUpKinds: new Set(['group']),
    mintSegmentId: () => segmentId(`minted-${++mintedCount}`),
  };
}

describe('readEntries', () => {
  it('brands a plain string id and reads a date-only end inclusively', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], createContext());
    expect(entry?.id).toBe(entryId('t1'));
    expect(entry?.start).toBe(utc('2026-09-01T00:00:00Z'));
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(entry?.end).toBe(utc('2026-09-09T00:00:00Z'));
  });

  it('leaves an optional field absent when the input never had it, but defaults kind to span', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], createContext());
    expect(Object.keys(entry ?? {}).sort()).toEqual(
      ['end', 'id', 'kind', 'name', 'segments', 'start'].sort(),
    );
    expect(entry?.kind).toBe('span');
  });

  it('fills one segment over the full span when the input names none', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], createContext());
    expect(entry?.segments).toHaveLength(1);
    expect(entry?.segments[0]?.id).toBe(segmentId('minted-1'));
  });

  it('carries parentId, kind, segments and meta through when present', () => {
    const input: EntryInput = {
      id: 'child',
      parentId: 'root',
      kind: 'milestone',
      name: 'Review',
      start: '2026-09-01',
      end: '2026-09-01',
      segments: [{ start: '2026-09-01', end: '2026-09-02' }],
      meta: { team: 'A' },
    };
    const [entry] = readEntries([input], createContext());
    expect(entry?.parentId).toBe(entryId('root'));
    expect(entry?.kind).toBe('milestone');
    expect(entry?.segments).toEqual([
      {
        id: segmentId('minted-1'),
        start: utc('2026-09-01T00:00:00Z'),
        end: utc('2026-09-03T00:00:00Z'),
      },
    ]);
    expect(entry?.meta).toEqual({ team: 'A' });
  });

  it('keeps an authored segment id unchanged through ingest', () => {
    const input: EntryInput = {
      id: 'seg',
      name: 'Seg',
      start: '2026-09-01',
      end: '2026-09-05',
      segments: [{ id: 'authored-seg', start: '2026-09-01', end: '2026-09-05' }],
    };
    const [entry] = readEntries([input], createContext());
    expect(entry?.segments[0]?.id).toBe(segmentId('authored-seg'));
  });
});

describe('readEdit (S4.10, D-S4-30)', () => {
  it('throws SegmentsOutOfSyncError when start/end are written without segments on a two-segment entry', () => {
    const context = createContext();
    const [segmented] = readEntries(
      [
        {
          id: 'seg',
          name: 'Seg',
          start: '2026-09-01',
          end: '2026-09-10',
          segments: [
            { start: '2026-09-01', end: '2026-09-05' },
            { start: '2026-09-06', end: '2026-09-10' },
          ],
        },
      ],
      context,
    );
    expect(() => readEdit({ start: '2026-09-02' }, context, segmented!, registry)).toThrow(
      SegmentsOutOfSyncError,
    );
  });

  it('moves the lone segment with the envelope on a one-segment entry', () => {
    const context = createContext();
    const [single] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    const edit = readEdit({ start: '2026-09-02' }, context, single!, registry);
    expect(edit.start).toBe(utc('2026-09-02T00:00:00Z'));
    expect(edit.segments).toHaveLength(1);
  });

  // #212 fix-plan review, finding S2: `update(id, { segments: [] })` used to reach `time/`'s
  // internal "no Segments" assertion as a bare `Error`, with no `code` and no `FreeGanttError`.
  it('throws a typed EmptySegmentsError, not a bare Error, when segments is written empty', () => {
    const context = createContext();
    const [single] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    let caught: unknown;
    try {
      readEdit({ segments: [] }, context, single!, registry);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EmptySegmentsError);
    expect((caught as EmptySegmentsError).code).toBe('empty-segments');
  });

  // #212 fix-plan review, finding S3: a `start`/`end` written alongside `segments` whose own
  // envelope disagreed used to lose silently — the caller's values vanished, with `proposed`
  // claiming the caller wrote what `envelopeOfSegments` derived instead.
  it('throws SegmentsOutOfSyncError when a written start/end disagrees with the written segments', () => {
    const context = createContext();
    const [entry] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    expect(() =>
      readEdit(
        {
          start: 100,
          end: 200,
          segments: [
            { start: 0, end: 10 },
            { start: 10, end: 20 },
          ],
        },
        context,
        entry!,
        registry,
      ),
    ).toThrow(SegmentsOutOfSyncError);
  });

  it('derives start/end from segments silently when the caller names neither', () => {
    const context = createContext();
    const [entry] = readEntries(
      [{ id: 'seg', name: 'Seg', start: '2026-09-01', end: '2026-09-05' }],
      context,
    );
    const edit = readEdit(
      {
        segments: [
          { start: 0, end: 10 },
          { start: 10, end: 20 },
        ],
      },
      context,
      entry!,
      registry,
    );
    expect(edit.start).toBe(0);
    expect(edit.end).toBe(20);
  });
});
