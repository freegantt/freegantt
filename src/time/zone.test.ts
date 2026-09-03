import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import {
  startOfDay,
  addDays,
  diffDays,
  dayOfWeek,
  eachDay,
  toPlain,
  fromPlain,
  startOf,
  stepBy,
  resolveDefaultTimeZone,
  SUPPORTED_TIME_UNITS,
} from './zone.js';
import { UnsupportedUnitError } from '../model/index.js';
import type { TimeUnit } from '../model/index.js';

const ZONE = 'America/New_York';

describe('zone-aware date arithmetic', () => {
  it('startOfDay floors to local midnight in the dataset zone', () => {
    const i = instant('2026-06-15T18:30:00Z'); // 14:30 EDT
    const plain = toPlain(ZONE, startOfDay(ZONE, i));
    expect(plain).toMatchObject({ year: 2026, month: 6, day: 15, hour: 0, minute: 0 });
  });

  it('addDays is DST-correct across a spring-forward transition', () => {
    // 2026-03-08 is the US DST transition (spring forward) in America/New_York.
    const before = startOfDay(ZONE, instant('2026-03-07T12:00:00Z'));
    const after = addDays(ZONE, before, 1);
    const plain = toPlain(ZONE, after);
    expect(plain).toMatchObject({ year: 2026, month: 3, day: 8, hour: 0, minute: 0 });
  });

  it('diffDays counts whole calendar days, not 24h chunks', () => {
    // 2026-03-07T23:00Z is March 7 18:00 EST; 2026-03-09T01:00Z is March 8 21:00 EDT — one calendar day apart,
    // even though the wall-clock gap across the spring-forward transition is only 23 hours of elapsed time.
    const a = instant('2026-03-07T23:00:00Z');
    const b = instant('2026-03-09T01:00:00Z');
    expect(diffDays(ZONE, a, b)).toBe(1);
  });

  it('fromPlain resolves a spring-forward gap time by shifting forward past the gap', () => {
    // 2026-03-08 02:30 does not exist in America/New_York (clocks jump 02:00 -> 03:00). 'compatible'
    // disambiguation shifts it forward by the gap size, landing on 03:30 EDT.
    const gap = fromPlain(ZONE, { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 });
    expect(toPlain(ZONE, gap)).toMatchObject({ year: 2026, month: 3, day: 8, hour: 3, minute: 30 });
  });

  it('fromPlain resolves a fall-back fold time to the earlier of the two valid offsets', () => {
    // 2026-11-01 01:30 occurs twice in America/New_York (once EDT, once EST). 'compatible' disambiguation
    // picks the earlier offset (EDT, UTC-4).
    const fold = fromPlain(ZONE, { year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 });
    const plain = toPlain(ZONE, fold);
    expect(plain).toMatchObject({ year: 2026, month: 11, day: 1, hour: 1, minute: 30 });
    expect(
      diffDays(ZONE, fromPlain(ZONE, { year: 2026, month: 11, day: 1, hour: 0, minute: 0, second: 0 }), fold),
    ).toBe(0);
  });

  it('addDays/diffDays round-trip by whole calendar days across DST transitions, in any IANA zone', () => {
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'UTC'];
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.integer({ min: instant('2025-01-01T00:00:00Z'), max: instant('2027-01-01T00:00:00Z') }),
        fc.integer({ min: -400, max: 400 }),
        (zone, startMs, days) => {
          const start = startOfDay(zone, instant(startMs));
          const shifted = addDays(zone, start, days);
          expect(diffDays(zone, start, shifted)).toBe(days);
        },
      ),
    );
  });

  it('startOf is idempotent, never later than the input, and steps strictly forward per unit', () => {
    const zones = ['America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'Pacific/Chatham', 'UTC'];
    const units: TimeUnit[] = [...SUPPORTED_TIME_UNITS];
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.constantFrom(...units),
        fc.integer({ min: instant('2025-01-01T00:00:00Z'), max: instant('2027-01-01T00:00:00Z') }),
        (zone, unit, xMs) => {
          const x = instant(xMs);
          const floored = startOf(zone, x, unit);
          expect(floored).toBeLessThanOrEqual(x);
          expect(startOf(zone, floored, unit)).toBe(floored);
          expect(stepBy(zone, floored, unit, 1)).toBeGreaterThan(floored);
        },
      ),
    );
  });

  it('startOf/stepBy step "w" and "M" correctly across a DST transition (S1.9, [S1-A5])', () => {
    // America/Chicago spring-forward: 2026-03-08. A week and a month boundary each straddle it, so
    // stepping by either must land on the correct wall-clock day, not drift by the 1h DST gap.
    const zone = 'America/Chicago';
    const beforeTransition = instant('2026-03-05T12:00:00Z'); // Thursday, before the transition
    const weekStart = startOf(zone, beforeTransition, 'week');
    const nextWeek = stepBy(zone, weekStart, 'week', 1);
    expect(toPlain(zone, nextWeek).hour).toBe(0);
    expect(diffDays(zone, weekStart, nextWeek)).toBe(7);

    const monthStart = startOf(zone, instant('2026-03-01T12:00:00Z'), 'month');
    const nextMonth = stepBy(zone, monthStart, 'month', 1);
    expect(toPlain(zone, monthStart)).toMatchObject({ year: 2026, month: 3, day: 1, hour: 0 });
    expect(toPlain(zone, nextMonth)).toMatchObject({ year: 2026, month: 4, day: 1, hour: 0 });
  });

  it('startOf/stepBy reject a unit outside the shared registry with UnsupportedUnitError', () => {
    const badUnit = 'q' as TimeUnit;
    expect(() => startOf(ZONE, instant('2026-01-01T00:00:00Z'), badUnit)).toThrow(UnsupportedUnitError);
    expect(() => stepBy(ZONE, instant('2026-01-01T00:00:00Z'), badUnit, 1)).toThrow(UnsupportedUnitError);
  });

  it('dayOfWeek is ISO (1 = Monday … 7 = Sunday) and stays correct across a southern-hemisphere DST fold', () => {
    // Australia/Sydney falls back (AEDT -> AEST) on 2026-04-05, a Sunday. The day before is Saturday.
    const sydney = 'Australia/Sydney';
    const saturday = startOfDay(sydney, instant('2026-04-04T12:00:00Z'));
    const sunday = addDays(sydney, saturday, 1);
    expect(dayOfWeek(sydney, saturday)).toBe(6);
    expect(dayOfWeek(sydney, sunday)).toBe(7);
    expect(toPlain(sydney, sunday).dayOfWeek).toBe(7);
  });

  it('eachDay returns 7 ascending boundaries for a week', () => {
    const start = startOfDay(ZONE, instant('2026-06-15T12:00:00Z'));
    const end = addDays(ZONE, start, 7);
    const days = eachDay(ZONE, { start, end });
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(start);
    for (let i = 1; i < days.length; i++) {
      expect(days[i]).toBeGreaterThan(days[i - 1]!);
      expect(diffDays(ZONE, days[i - 1]!, days[i]!)).toBe(1);
    }
  });

  it('eachDay skips nothing on a spring-forward day (southern hemisphere)', () => {
    // Australia/Sydney springs forward (AEST -> AEDT) on 2026-10-04.
    const sydney = 'Australia/Sydney';
    const start = startOfDay(sydney, instant('2026-10-01T12:00:00Z'));
    const end = addDays(sydney, start, 7);
    const days = eachDay(sydney, { start, end });
    expect(days).toHaveLength(7);
    const plainDays = days.map((day) => toPlain(sydney, day).day);
    expect(plainDays).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

function stubResolvedTimeZone(timeZone: string): () => void {
  const original = Intl.DateTimeFormat;
  Intl.DateTimeFormat = (() => ({
    resolvedOptions: () => ({ timeZone }) as Intl.ResolvedDateTimeFormatOptions,
  })) as unknown as typeof Intl.DateTimeFormat;
  return () => {
    Intl.DateTimeFormat = original;
  };
}

describe('resolveDefaultTimeZone (#129)', () => {
  it("reads the environment's own zone from Intl.DateTimeFormat", () => {
    const restore = stubResolvedTimeZone(ZONE);
    try {
      expect(resolveDefaultTimeZone()).toBe(ZONE);
    } finally {
      restore();
    }
  });

  it("falls back to 'UTC' when the environment reports no zone", () => {
    const restore = stubResolvedTimeZone('');
    try {
      expect(resolveDefaultTimeZone()).toBe('UTC');
    } finally {
      restore();
    }
  });
});
