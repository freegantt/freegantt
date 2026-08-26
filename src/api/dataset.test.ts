import { describe, expect, it } from 'vitest';
import { Dataset } from './dataset.js';
import { entryId, instant } from './index.js';
import type { Entry, EntryInput } from './index.js';

const utc = (iso: string): number => Date.parse(iso);

/** The one entry every test below varies, so each case states only what it is about. */
const oneEntry = (overrides: Partial<EntryInput> = {}): EntryInput => ({
  id: 't1',
  name: 'Design',
  start: '2026-09-01',
  end: '2026-09-08',
  ...overrides,
});

const first = (dataset: Dataset): Entry => {
  const entry = dataset.entries[0];
  if (!entry) throw new Error('expected one entry');
  return entry;
};

describe('new Dataset()', () => {
  it('takes plain string ids and brands them', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ id: 'root' }), oneEntry({ id: 't1', parentId: 'root' })],
    });
    expect(first(dataset).id).toBe(entryId('root'));
    expect(dataset.entries[1]?.parentId).toBe(entryId('root'));
  });

  it("takes date strings and reads them in the dataset's zone", () => {
    const utcDataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    const chicago = new Dataset({ timeZone: 'America/Chicago', entries: [oneEntry()] });
    expect(first(utcDataset).start).toBe(utc('2026-09-01T00:00:00Z'));
    expect(first(chicago).start).toBe(utc('2026-09-01T05:00:00Z'));
  });

  // A `Date` input is exercised in time/input.test.ts instead: I10 bans `new Date()` outside time/,
  // and that is the layer that actually reads one.
  it('takes epoch milliseconds and an already-branded Instant unchanged', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        oneEntry({ id: 'a', start: 1_000_000, end: 2_000_000 }),
        oneEntry({ id: 'b', start: instant('2026-09-01T00:00:00Z'), end: 3_000_000 }),
      ],
    });
    expect(first(dataset).start).toBe(1_000_000);
    expect(first(dataset).end).toBe(2_000_000);
    expect(dataset.entries[1]?.start).toBe(utc('2026-09-01T00:00:00Z'));
  });

  it('reads a date-only end as inclusive by default', () => {
    const dataset = new Dataset({ timeZone: 'UTC', entries: [oneEntry()] });
    // 'through the 8th' — the half-open boundary is the start of the 9th.
    expect(first(dataset).end).toBe(utc('2026-09-09T00:00:00Z'));
    expect(dataset.dateOnlyEnd).toBe('inclusive');
  });

  it("reads a date-only end literally under dateOnlyEnd: 'exclusive'", () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      dateOnlyEnd: 'exclusive',
      entries: [oneEntry()],
    });
    expect(first(dataset).end).toBe(utc('2026-09-08T00:00:00Z'));
    expect(dataset.dateOnlyEnd).toBe('exclusive');
  });

  it('leaves an end that carries a time of day alone under either rule', () => {
    for (const dateOnlyEnd of ['inclusive', 'exclusive'] as const) {
      const dataset = new Dataset({
        timeZone: 'UTC',
        dateOnlyEnd,
        entries: [oneEntry({ end: '2026-09-08T00:00:00Z' })],
      });
      expect(first(dataset).end).toBe(utc('2026-09-08T00:00:00Z'));
    }
  });

  it('reads segment spans by the same rules as the entry span', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [
        oneEntry({
          segments: [
            { start: '2026-09-01', end: '2026-09-02' },
            { start: '2026-09-05', end: '2026-09-08' },
          ],
        }),
      ],
    });
    expect(first(dataset).segments).toEqual([
      { start: utc('2026-09-01T00:00:00Z'), end: utc('2026-09-03T00:00:00Z') },
      { start: utc('2026-09-05T00:00:00Z'), end: utc('2026-09-09T00:00:00Z') },
    ]);
  });

  it('carries optional fields through, and leaves absent ones absent', () => {
    const dataset = new Dataset({
      timeZone: 'UTC',
      entries: [oneEntry({ kind: 'milestone', progress: 0.5, meta: { team: 'A' } })],
    });
    const entry = first(dataset);
    expect(entry.kind).toBe('milestone');
    expect(entry.progress).toBe(0.5);
    expect(entry.meta).toEqual({ team: 'A' });
    // exactOptionalPropertyTypes: an absent key must not become a key holding undefined.
    expect(Object.keys(entry).sort()).toEqual(
      ['end', 'id', 'kind', 'meta', 'progress', 'start', 'name'].sort(),
    );
  });

  it('does not mutate the entries the consumer handed it', () => {
    const input = oneEntry();
    const dataset = new Dataset({ timeZone: 'UTC', entries: [input] });
    expect(input.start).toBe('2026-09-01');
    expect(first(dataset)).not.toBe(input);
  });
});
