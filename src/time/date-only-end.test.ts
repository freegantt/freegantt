import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { startOfLastCoveredDay, startOfNextDay } from './date-only-end.js';
import { toEndInstant, toInstant } from './input.js';
import { toPlain } from './zone.js';
import type { Instant } from '../model/index.js';

const utc = (iso: string): number => Date.parse(iso);
const SANTIAGO = 'America/Santiago';
const CHICAGO = 'America/Chicago';

describe('startOfNextDay()', () => {
  it('steps a plain day forward by one calendar day in UTC', () => {
    expect(startOfNextDay('UTC', utc('2026-09-08T00:00:00Z') as Instant)).toBe(utc('2026-09-09T00:00:00Z'));
  });

  it('lands on the next day’s own local midnight across a DST spring-forward gap', () => {
    // America/Santiago springs forward on 2026-09-06 at 00:00, so that day starts at 2026-09-06T04:00Z
    // (UTC-4) and the 7th starts at 2026-09-07T03:00Z (UTC-3) — a 23-hour day, not +86,400,000 ms.
    const day = toInstant(SANTIAGO, '2026-09-06', 'test');
    expect(startOfNextDay(SANTIAGO, day)).toBe(utc('2026-09-07T03:00:00Z'));
  });
});

describe('startOfLastCoveredDay()', () => {
  it('reads the day before a boundary end, one span in from a start', () => {
    const start = toInstant(CHICAGO, '2026-03-02', 'test');
    const end = toInstant(CHICAGO, '2026-03-05', 'test'); // boundary: covers through the 4th
    expect(startOfLastCoveredDay(CHICAGO, { start, end })).toBe(toInstant(CHICAGO, '2026-03-04', 'test'));
  });

  it('reads end’s own day unchanged for a zero-length span', () => {
    const at = toInstant(CHICAGO, '2026-03-05', 'test');
    expect(startOfLastCoveredDay(CHICAGO, { start: at, end: at })).toBe(at);
  });

  it('works with no start at all', () => {
    const end = toInstant(CHICAGO, '2026-03-05', 'test');
    expect(startOfLastCoveredDay(CHICAGO, { end })).toBe(toInstant(CHICAGO, '2026-03-04', 'test'));
  });
});

describe('the DST bug this fixes (America/Santiago 2026-09-06)', () => {
  it('reads a date-only end back at one hour past midnight before the fix, at midnight after it', () => {
    // Before the fix, toEndInstant used addDays (a plain calendar step) on a wall clock already
    // sitting at 01:00 on the spring-forward day, so the result kept that 01:00 offset into the 7th
    // instead of landing on the 7th's own midnight. This pins the corrected value.
    const end = toEndInstant(SANTIAGO, '2026-09-06', 'test');
    expect(end).toBe(utc('2026-09-07T03:00:00Z'));
  });
});

describe('a date-only end reads back as the date written (property)', () => {
  const zones = [
    'UTC',
    'America/New_York',
    'Europe/London',
    'Australia/Lord_Howe',
    'Pacific/Chatham',
    SANTIAGO,
  ];

  it('holds for any zone and any date from 1971 to 2099', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.date({ min: new Date('1971-01-01'), max: new Date('2099-12-31') }),
        (zone, date) => {
          const iso = date.toISOString().slice(0, 10);
          const end = toEndInstant(zone, iso, 'test');
          const lastDay = toPlain(zone, startOfLastCoveredDay(zone, { end }));
          const written = toPlain(zone, toInstant(zone, iso, 'test'));
          expect(lastDay.year).toBe(written.year);
          expect(lastDay.month).toBe(written.month);
          expect(lastDay.day).toBe(written.day);
        },
      ),
      { numRuns: 100 },
    );
  });
});
