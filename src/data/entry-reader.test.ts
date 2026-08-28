import { describe, expect, it } from 'vitest';
import { readEntries } from './entry-reader.js';
import { entryId } from '../model/index.js';
import type { EntryInput } from '../model/index.js';
import { instant } from '../time/index.js';

const utc = (iso: string): number => Date.parse(iso);

const context = {
  timeZone: 'UTC',
  dateOnlyEnd: 'inclusive' as const,
  referenceDate: instant('2026-01-01T00:00:00Z'),
  derivedSpanKinds: new Set(['group']),
};

describe('readEntries', () => {
  it('brands a plain string id and reads a date-only end inclusively', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], context);
    expect(entry?.id).toBe(entryId('t1'));
    expect(entry?.start).toBe(utc('2026-09-01T00:00:00Z'));
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(entry?.end).toBe(utc('2026-09-09T00:00:00Z'));
  });

  it('leaves an optional field absent when the input never had it, but defaults kind to span', () => {
    const input: EntryInput = { id: 't1', name: 'Design', start: '2026-09-01', end: '2026-09-08' };
    const [entry] = readEntries([input], context);
    expect(Object.keys(entry ?? {}).sort()).toEqual(['end', 'id', 'kind', 'name', 'start'].sort());
    expect(entry?.kind).toBe('span');
  });

  it('carries parentId, kind, progress, segments and meta through when present', () => {
    const input: EntryInput = {
      id: 'child',
      parentId: 'root',
      kind: 'milestone',
      name: 'Review',
      start: '2026-09-01',
      end: '2026-09-01',
      progress: 0.5,
      segments: [{ start: '2026-09-01', end: '2026-09-02' }],
      meta: { team: 'A' },
    };
    const [entry] = readEntries([input], context);
    expect(entry?.parentId).toBe(entryId('root'));
    expect(entry?.kind).toBe('milestone');
    expect(entry?.progress).toBe(0.5);
    expect(entry?.segments).toEqual([
      { start: utc('2026-09-01T00:00:00Z'), end: utc('2026-09-03T00:00:00Z') },
    ]);
    expect(entry?.meta).toEqual({ team: 'A' });
  });
});
