import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Instant } from '../model/index.js';
import { MS, addMs, createZonedTime } from '../time/index.js';
import { InvalidWorkingCalendarError, workingCalendar } from './working-calendar.js';

const CHICAGO = createZonedTime('America/Chicago');
const UTC = createZonedTime('UTC');
const WEEKDAYS = [1, 2, 3, 4, 5] as const;

function at(time: ReturnType<typeof createZonedTime>, text: string): Instant {
  return time.toInstant(text);
}

describe('workingCalendar()', () => {
  describe('isWorkday', () => {
    const calendar = workingCalendar({ workdays: WEEKDAYS, holidays: ['2026-12-25'] });

    it('reads weekdays', () => {
      expect(calendar.isWorkday('2026-12-24', UTC)).toBe(true); // Thursday
      expect(calendar.isWorkday('2026-12-26', UTC)).toBe(false); // Saturday
    });

    it('treats a holiday as a day off', () => {
      expect(calendar.isWorkday('2026-12-25', UTC)).toBe(false); // Friday
    });

    it('reads a time inside the day as that day', () => {
      expect(calendar.isWorkday('2026-12-24T23:30:00', CHICAGO)).toBe(true);
      expect(calendar.isWorkday('2026-12-25T00:30:00', CHICAGO)).toBe(false);
    });

    it('keeps a holiday on a weekend harmless', () => {
      const weekendHoliday = workingCalendar({ workdays: WEEKDAYS, holidays: ['2026-12-26'] });
      expect(weekendHoliday.isWorkday('2026-12-26', UTC)).toBe(false);
      expect(weekendHoliday.addWorkdays('2026-12-25', 1, UTC)).toBe(at(UTC, '2026-12-28'));
      expect(weekendHoliday.workdaysBetween('2026-12-21', '2026-12-28', UTC)).toBe(5);
    });

    it('reads a DST day as one day', () => {
      const spring = workingCalendar({ workdays: [7], holidays: [] }); // Sunday, 23 hours in Chicago
      expect(spring.isWorkday('2026-03-08T23:59:00', CHICAGO)).toBe(true);
      expect(spring.isWorkday('2026-03-09T00:00:00', CHICAGO)).toBe(false);
    });
  });

  describe('addWorkdays', () => {
    const calendar = workingCalendar({ workdays: WEEKDAYS, holidays: ['2026-12-25', '2026-12-28'] });

    it('returns the instant for a count of 0', () => {
      expect(calendar.addWorkdays('2026-12-26T10:00:00', 0, UTC)).toBe(at(UTC, '2026-12-26T10:00:00'));
    });

    it('moves forward over a weekend', () => {
      expect(calendar.addWorkdays('2026-12-18', 1, UTC)).toBe(at(UTC, '2026-12-21'));
      expect(calendar.addWorkdays('2026-12-18', 4, UTC)).toBe(at(UTC, '2026-12-24'));
    });

    it('skips a holiday and the weekend after it', () => {
      expect(calendar.addWorkdays('2026-12-24', 1, UTC)).toBe(at(UTC, '2026-12-29'));
    });

    it('moves back', () => {
      expect(calendar.addWorkdays('2026-12-29', -1, UTC)).toBe(at(UTC, '2026-12-24'));
      expect(calendar.addWorkdays('2026-12-24', -5, UTC)).toBe(at(UTC, '2026-12-17'));
    });

    it('starts from a non-workday: 1 is the next workday, -1 the previous', () => {
      expect(calendar.addWorkdays('2026-12-26', 1, UTC)).toBe(at(UTC, '2026-12-29'));
      expect(calendar.addWorkdays('2026-12-26', -1, UTC)).toBe(at(UTC, '2026-12-24'));
    });

    it('keeps the wall-clock time across a DST change', () => {
      const result = calendar.addWorkdays('2026-03-06T09:30:00', 1, CHICAGO); // Friday, spring forward Sunday
      expect(result).toBe(at(CHICAGO, '2026-03-09T09:30:00'));
    });

    it('adds 5,000 workdays in one step', () => {
      const result = calendar.addWorkdays('2026-01-05', 5000, UTC);
      expect(calendar.isWorkday(result, UTC)).toBe(true);
      expect(calendar.workdaysBetween('2026-01-05', result, UTC)).toBe(5000);
    });
  });

  describe('workdaysBetween', () => {
    const calendar = workingCalendar({ workdays: WEEKDAYS, holidays: ['2026-12-25'] });

    it('counts the half-open range from a up to b', () => {
      expect(calendar.workdaysBetween('2026-12-21', '2026-12-28', UTC)).toBe(4);
      expect(calendar.workdaysBetween('2026-12-21', '2026-12-21', UTC)).toBe(0);
    });

    it('is negative when b is earlier', () => {
      expect(calendar.workdaysBetween('2026-12-28', '2026-12-21', UTC)).toBe(-4);
    });
  });

  describe('construction', () => {
    it('is immutable', () => {
      const holidays = ['2026-12-25'];
      const calendar = workingCalendar({ workdays: WEEKDAYS, holidays });
      holidays.push('2026-12-24');
      expect(Object.isFrozen(calendar)).toBe(true);
      expect(calendar.isWorkday('2026-12-24', UTC)).toBe(true);
    });

    it('refuses an empty weekday set, a bad weekday and a bad holiday', () => {
      expect(() => workingCalendar({ workdays: [] })).toThrow(InvalidWorkingCalendarError);
      expect(() => workingCalendar({ workdays: [8 as 7] })).toThrow(InvalidWorkingCalendarError);
      expect(() => workingCalendar({ workdays: WEEKDAYS, holidays: ['25/12/2026'] })).toThrow(
        InvalidWorkingCalendarError,
      );
      expect(() => workingCalendar({ workdays: WEEKDAYS, holidays: ['2026-02-30'] })).toThrow(
        InvalidWorkingCalendarError,
      );
    });
  });

  describe('offTime', () => {
    const calendar = workingCalendar({ workdays: WEEKDAYS, holidays: ['2026-12-25'] });
    const cover = calendar.offTime();

    it('hides above the day tick', () => {
      expect(cover.hideWhenCoarserThan).toBe('day');
    });

    it('covers weekends and holidays, clipped to the window', () => {
      const window = { start: at(UTC, '2026-12-24T12:00:00'), end: at(UTC, '2026-12-27T12:00:00') };
      expect(cover.coveredSpans(window, UTC)).toEqual([
        { start: at(UTC, '2026-12-25'), end: at(UTC, '2026-12-26') },
        { start: at(UTC, '2026-12-26'), end: at(UTC, '2026-12-27') },
        { start: at(UTC, '2026-12-27'), end: window.end },
      ]);
    });

    it('covers a 23-hour day whole', () => {
      const sunday = workingCalendar({ workdays: [1, 2, 3, 4, 5, 6] }).offTime();
      const window = { start: at(CHICAGO, '2026-03-07'), end: at(CHICAGO, '2026-03-10') };
      expect(sunday.coveredSpans(window, CHICAGO)).toEqual([
        { start: at(CHICAGO, '2026-03-08'), end: at(CHICAGO, '2026-03-09') },
      ]);
    });
  });

  it('property: isWorkday agrees with offTime over random windows, zones and DST days', () => {
    const zones = ['UTC', 'America/Chicago', 'Europe/Berlin', 'Pacific/Auckland', 'Asia/Kolkata'];
    const dstDays = ['2026-03-08', '2026-11-01', '2026-03-29', '2026-10-25', '2026-09-27'];
    fc.assert(
      fc.property(
        fc.constantFrom(...zones),
        fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 6 }),
        fc.array(fc.integer({ min: 0, max: 400 }), { maxLength: 12 }),
        fc.oneof(
          fc.constantFrom(...dstDays),
          fc.integer({ min: 0, max: 365 }).map((n) => `d${n}`),
        ),
        fc.integer({ min: 0, max: 86_399 }),
        fc.integer({ min: 1, max: 20 }),
        (zone, weekdays, holidayOffsets, base, secondOfDay, windowDays) => {
          const time = createZonedTime(zone);
          const origin = base.startsWith('d')
            ? time.addDays(at(time, '2026-01-01'), Number(base.slice(1)))
            : at(time, base);
          const start = addMs(origin, secondOfDay * MS.SECOND);
          const end = time.addDays(start, windowDays);
          const holidays = holidayOffsets.map((n) => {
            const plain = time.toPlain(time.addDays(at(time, '2026-01-01'), n));
            return `${plain.year}-${String(plain.month).padStart(2, '0')}-${String(plain.day).padStart(2, '0')}`;
          });
          const calendar = workingCalendar({ workdays: weekdays as never, holidays });
          const covered = calendar.offTime().coveredSpans({ start, end }, time);
          for (const day of time.eachDay({ start: time.startOfDay(start), end })) {
            const middle = time.addDays(day, 0);
            const probe = Math.max(middle, start) as Instant;
            if (probe >= end) continue;
            const inCover = covered.some((span) => span.start <= probe && probe < span.end);
            if (inCover === calendar.isWorkday(probe, time)) return false;
          }
          return true;
        },
      ),
    );
  });

  it('property: addWorkdays and workdaysBetween agree', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 7 }),
        fc.array(fc.integer({ min: 0, max: 200 }), { maxLength: 10 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: -300, max: 300 }),
        (weekdays, holidayOffsets, startOffset, count) => {
          const holidays = holidayOffsets.map((n) => {
            const plain = UTC.toPlain(UTC.addDays(at(UTC, '2026-01-01'), n));
            return `${plain.year}-${String(plain.month).padStart(2, '0')}-${String(plain.day).padStart(2, '0')}`;
          });
          const calendar = workingCalendar({ workdays: weekdays as never, holidays });
          const start = UTC.addDays(at(UTC, '2026-01-01'), startOffset);
          const result = calendar.addWorkdays(start, count, UTC);
          if (count === 0) return result === start;
          if (!calendar.isWorkday(result, UTC)) return false;
          const between = calendar.workdaysBetween(start, result, UTC);
          // Forward ends one past the count at the start day itself; see `addWorkdays`' contract.
          return count > 0 ? between === count - (calendar.isWorkday(start, UTC) ? 0 : 1) : between === count;
        },
      ),
    );
  });
});
