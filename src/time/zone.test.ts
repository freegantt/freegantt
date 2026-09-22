import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { instant } from './instant.js';
import {
  startOfDay,
  addDays,
  diffDays,
  dayOfWeek,
  eachDay,
  eachUnit,
  toPlain,
  fromPlain,
  startOf,
  stepBy,
  resolveDefaultTimeZone,
  SUPPORTED_TIME_UNITS,
  isTimeUnit,
  isCoarserThan,
  tickFloor,
  nextTick,
} from './zone.js';
import { diffMs, addMs } from './instant.js';
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

  it('isTimeUnit accepts every unit startOf/stepBy step by, and rejects everything else (#201)', () => {
    for (const unit of SUPPORTED_TIME_UNITS) expect(isTimeUnit(unit)).toBe(true);
    expect(isTimeUnit('q')).toBe(false);
    expect(isTimeUnit('')).toBe(false);
    expect(isTimeUnit('Day')).toBe(false);
  });

  it('SUPPORTED_TIME_UNITS declares every unit coarsest-last, pinned rather than trusted (#268)', () => {
    // isCoarserThan reads UNITS' own declaration order — this pins that order against a change that
    // reorders it (calendar-nesting order, not duration order: a month is not a whole number of
    // weeks, so "coarsest last" here means nesting, not "biggest ms span").
    expect([...SUPPORTED_TIME_UNITS]).toEqual([
      'millisecond',
      'minute',
      'hour',
      'day',
      'week',
      'month',
      'year',
    ]);
  });

  it('isCoarserThan (#268) answers by calendar-nesting rank, not by unit equality or duration', () => {
    expect(isCoarserThan('week', 'day')).toBe(true);
    expect(isCoarserThan('month', 'week')).toBe(true);
    expect(isCoarserThan('day', 'day')).toBe(false);
    expect(isCoarserThan('day', 'week')).toBe(false);
    expect(isCoarserThan('hour', 'day')).toBe(false);
    // Every unit ranks coarser than every unit before it in SUPPORTED_TIME_UNITS's own order.
    const units = [...SUPPORTED_TIME_UNITS];
    for (let i = 0; i < units.length; i++) {
      for (let j = 0; j < units.length; j++) {
        const a = units[i]!;
        const b = units[j]!;
        expect(isCoarserThan(a, b)).toBe(i > j);
      }
    }
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

  it('eachUnit("day") agrees with eachDay exactly (the walk is one implementation, not two)', () => {
    const start = startOfDay(ZONE, instant('2026-06-15T12:00:00Z'));
    const end = addDays(ZONE, start, 10);
    expect(eachUnit(ZONE, { start, end }, 'day')).toEqual(eachDay(ZONE, { start, end }));
  });

  it('eachUnit("hour") walks every hour boundary across a spring-forward day (23-hour day)', () => {
    // America/Chicago springs forward on 2026-03-08: 02:00 CST jumps to 03:00 CDT, so the day has 23 hours.
    const chicago = 'America/Chicago';
    const start = startOfDay(chicago, instant('2026-03-08T06:00:00Z')); // local midnight
    const end = addDays(chicago, start, 1);
    const hours = eachUnit(chicago, { start, end }, 'hour');
    expect(hours).toHaveLength(23);
    for (let i = 1; i < hours.length; i++) expect(hours[i]).toBeGreaterThan(hours[i - 1]!);
    expect(toPlain(chicago, hours[0]!)).toMatchObject({ hour: 0 });
    expect(toPlain(chicago, hours[hours.length - 1]!)).toMatchObject({ hour: 23 });
  });

  it('eachUnit("hour") walks every hour boundary across a fall-back day (25-hour day)', () => {
    // America/Chicago falls back on 2026-11-01: 01:00 CDT repeats as 01:00 CST, so the day has 25 hours.
    const chicago = 'America/Chicago';
    const start = startOfDay(chicago, instant('2026-11-01T05:00:00Z'));
    const end = addDays(chicago, start, 1);
    const hours = eachUnit(chicago, { start, end }, 'hour');
    expect(hours).toHaveLength(25);
    for (let i = 1; i < hours.length; i++) expect(hours[i]).toBeGreaterThan(hours[i - 1]!);
  });

  it('stepBy with an increment above 1 steps that many whole units, DST included', () => {
    const chicago = 'America/Chicago';
    const before = startOfDay(chicago, instant('2026-03-07T12:00:00Z'));
    const threeDaysOn = stepBy(chicago, before, 'day', 3);
    expect(diffDays(chicago, before, threeDaysOn)).toBe(3);
    expect(toPlain(chicago, threeDaysOn)).toMatchObject({ year: 2026, month: 3, day: 10, hour: 0 });

    const monthStart = startOf(chicago, instant('2026-01-15T12:00:00Z'), 'month');
    const twoMonthsOn = stepBy(chicago, monthStart, 'month', 2);
    expect(toPlain(chicago, twoMonthsOn)).toMatchObject({ year: 2026, month: 3, day: 1, hour: 0 });
  });

  it('eachUnit("week") with an increment-1 walk lands on successive week boundaries', () => {
    const start = startOf(ZONE, instant('2026-06-01T00:00:00Z'), 'week');
    const end = stepBy(ZONE, start, 'week', 4);
    const weeks = eachUnit(ZONE, { start, end }, 'week');
    expect(weeks).toHaveLength(4);
    expect(weeks[0]).toBe(start);
    for (let i = 1; i < weeks.length; i++) expect(diffDays(ZONE, weeks[i - 1]!, weeks[i]!)).toBe(7);
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

// #489: a stride that leaves its own anchor container (day × 10 leaves week, hour × 30 leaves day,
// minute × 90 leaves hour) must count on in whole `increment` steps, never reset to the container it
// lands in — a reset silently shortens the stated increment down to the container's own span.
describe('nextTick / tickFloor: a stride bigger than its anchor container (#489)', () => {
  const NON_FITTING: readonly { unit: TimeUnit; increment: number }[] = [
    { unit: 'day', increment: 10 }, // anchor: week (7 days)
    { unit: 'hour', increment: 30 }, // anchor: day (24 hours)
    { unit: 'minute', increment: 90 }, // anchor: hour (60 minutes)
  ];

  it('day × 10 spaces ticks 10 calendar days apart, not the 7-day week it starts in', () => {
    const chicago = 'America/Chicago'; // a DST zone, so the 10-day stride crosses a spring-forward
    const at = instant('2026-03-05T12:00:00Z');
    const b1 = tickFloor(chicago, at, 'day', 10);
    const b2 = nextTick(chicago, b1, 'day', 10);
    expect(diffDays(chicago, b1, b2)).toBe(10);
  });

  it('hour × 30 spaces ticks 30 hours apart, not the 24-hour day it starts in', () => {
    const chicago = 'America/Chicago';
    const at = instant('2026-06-15T09:00:00Z');
    const b1 = tickFloor(chicago, at, 'hour', 30);
    const b2 = nextTick(chicago, b1, 'hour', 30);
    expect(diffMs(b2, b1)).toBe(30 * 60 * 60 * 1000);
  });

  it('minute × 90 spaces ticks 90 minutes apart, not the 60-minute hour it starts in', () => {
    const chicago = 'America/Chicago';
    const at = instant('2026-06-15T09:00:00Z');
    const b1 = tickFloor(chicago, at, 'minute', 90);
    const b2 = nextTick(chicago, b1, 'minute', 90);
    expect(diffMs(b2, b1)).toBe(90 * 60 * 1000);
  });

  it('property: consecutive ticks are exactly `increment` units apart, across zones and DST', () => {
    const zones = ['America/Chicago', 'America/New_York', 'Europe/London', 'Australia/Lord_Howe', 'UTC'];
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_FITTING),
        fc.constantFrom(...zones),
        fc.integer({ min: instant('2025-01-01T00:00:00Z'), max: instant('2027-01-01T00:00:00Z') }),
        ({ unit, increment }, zone, atMs) => {
          const b1 = tickFloor(zone, instant(atMs), unit, increment);
          const b2 = nextTick(zone, b1, unit, increment);
          if (unit === 'day') {
            expect(diffDays(zone, b1, b2)).toBe(increment);
          } else {
            const msPerUnit = unit === 'hour' ? 60 * 60 * 1000 : 60 * 1000;
            expect(diffMs(b2, b1)).toBe(increment * msPerUnit);
          }
        },
      ),
    );
  });

  it('property: two overlapping tickFloor walks agree on every shared boundary (the pan-shift check)', () => {
    const zones = ['America/Chicago', 'Europe/London', 'UTC'];
    fc.assert(
      fc.property(
        fc.constantFrom(...NON_FITTING),
        fc.constantFrom(...zones),
        fc.integer({ min: instant('2025-01-01T00:00:00Z'), max: instant('2027-01-01T00:00:00Z') }),
        fc.integer({ min: 1, max: 5 }),
        ({ unit, increment }, zone, atMs, ticksApart) => {
          const anchorA = tickFloor(zone, instant(atMs), unit, increment);
          let cursor = anchorA;
          for (let i = 0; i < ticksApart; i++) cursor = nextTick(zone, cursor, unit, increment);
          // Flooring from a later instant that shares the same tick lattice must land back on a tick
          // this walk already produced — the lattice does not shift depending on where you enter it.
          const anchorB = tickFloor(zone, cursor, unit, increment);
          expect(anchorB).toBe(cursor);
        },
      ),
    );
  });

  it('increment: 1 is unchanged — tickFloor still answers the plain unit floor', () => {
    const zones = ['America/Chicago', 'Europe/London', 'UTC'];
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.constantFrom<TimeUnit>('minute', 'hour', 'day', 'week', 'month', 'year'),
        fc.integer({ min: instant('2025-01-01T00:00:00Z'), max: instant('2027-01-01T00:00:00Z') }),
        (zone, unit, atMs) => {
          expect(tickFloor(zone, instant(atMs), unit, 1)).toBe(startOf(zone, instant(atMs), unit));
        },
      ),
    );
  });

  it('a millisecond snap stays cheap: tickFloor never walks tick by tick (perf, #489)', () => {
    // Before the arithmetic rewrite, tickFloor walked one tick at a time from its anchor container's
    // own start — up to 60,000 iterations for `{ millisecond, 1 }`, anchored on the minute `at` falls
    // in. That walk would cost milliseconds per call, so calling it thousands of times (one render, one
    // pointer move) would be seconds of work. The arithmetic rewrite costs one `startOf`/`stepBy` pair
    // regardless of `at` or `increment` — cheap enough that 10,000 calls stay well under a frame budget.
    const zone = 'UTC';
    const at = instant('2026-06-15T09:00:00.777Z');
    const start = performance.now();
    for (let i = 0; i < 10_000; i++) tickFloor(zone, addMs(at, i), 'millisecond', 1);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
