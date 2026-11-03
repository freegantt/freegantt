// scheduling/working-calendar — which days count as workdays. A pure value: the weekday set and the
// holiday dates a consumer states. The library ships no holiday list. Nothing in core reads it.

import type { BuiltInThrownCode, Instant, InstantInput, TimeSpan, TimeUnit } from '../model/index.js';
import { FreeGanttError } from '../model/index.js';
import type { ZonedTime } from '../time/index.js';

/** ISO day of week: 1 = Monday … 7 = Sunday. */
export type Workday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WorkingCalendarOptions {
  /** The weekdays people work. At least one. */
  workdays: readonly Workday[];
  /** Whole days off, as `'YYYY-MM-DD'` dates in the Dataset zone. A holiday on a non-workday changes nothing. */
  holidays?: readonly string[];
}

/** The shape `timeShading()` reads as a `TimeCover`. `scheduling/` may not import `extensions/`,
 *  so the shape is stated here and a type test in `api/` proves the two match. */
export interface OffTimeCover {
  hideWhenCoarserThan: TimeUnit;
  coveredSpans(window: TimeSpan, time: ZonedTime): readonly TimeSpan[];
}

/** An immutable set of workdays and holidays. A new calendar is a new object. Every answer reads the
 *  day in the Dataset zone, so a 23-hour or 25-hour day still counts as one day. */
export interface WorkingCalendar {
  /** Is the day that holds `day` a workday? */
  isWorkday(day: InstantInput, time: ZonedTime): boolean;
  /** `instant` moved by `count` workdays, at the same wall-clock time. A negative count moves back.
   *  From a non-workday, `1` lands on the next workday and `-1` on the previous one. */
  addWorkdays(instant: InstantInput, count: number, time: ZonedTime): Instant;
  /** Workdays in the half-open day range from the day of `a` up to the day of `b`. It is negative when `b` is earlier. */
  workdaysBetween(a: InstantInput, b: InstantInput, time: ZonedTime): number;
  /** The days off, as a cover for `timeShading()`. */
  offTime(): OffTimeCover;
}

/** `code: 'invalid-working-calendar'` — `workingCalendar()` got a weekday set or a holiday it cannot read. */
export class InvalidWorkingCalendarError extends FreeGanttError {
  constructor(reason: string) {
    super('invalid-working-calendar' satisfies BuiltInThrownCode, `workingCalendar(): ${reason}`);
    this.name = 'InvalidWorkingCalendarError';
  }
}

const DAYS_PER_WEEK = 7;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

// A day is an integer: days since 1970-01-01 plus 3. Then `day mod 7` is the ISO weekday minus 1,
// and every week starts at a multiple of 7. Integer days make every answer point arithmetic.
const EPOCH_SHIFT = 3;

// Civil-date conversion on whole numbers (proleptic Gregorian). Eras of 400 years, 146097 days each.
// Pure integer math keeps `Date` out of this file, as the time rules require.
const DAYS_PER_ERA = 146_097;
const ERA_YEARS = 400;
const DAYS_FROM_MARCH_1_TO_EPOCH = 719_468;

interface PlainDate {
  year: number;
  month: number;
  day: number;
}

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function dayNumber(year: number, month: number, day: number): number {
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / ERA_YEARS);
  const yearOfEra = shiftedYear - era * ERA_YEARS;
  const monthFromMarch = month > 2 ? month - 3 : month + 9;
  const dayOfYear = Math.floor((153 * monthFromMarch + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * DAYS_PER_ERA + dayOfEra - DAYS_FROM_MARCH_1_TO_EPOCH + EPOCH_SHIFT;
}

function dayNumberOf(instant: Instant, time: ZonedTime): number {
  const { year, month, day } = time.toPlain(instant);
  return dayNumber(year, month, day);
}

function plainDateOf(dayNumberValue: number): PlainDate {
  const shifted = dayNumberValue - EPOCH_SHIFT + DAYS_FROM_MARCH_1_TO_EPOCH;
  const era = Math.floor(shifted / DAYS_PER_ERA);
  const dayOfEra = shifted - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) /
      365,
  );
  const dayOfYear = dayOfEra - (yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const month = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  const year = yearOfEra + era * ERA_YEARS + (month <= 2 ? 1 : 0);
  return { year, month, day };
}

function readHoliday(text: string): number {
  const match = ISO_DATE.exec(text);
  if (!match) throw new InvalidWorkingCalendarError(`"${text}" is not a date. Write it as YYYY-MM-DD.`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const number = dayNumber(year, month, day);
  const real = plainDateOf(number);
  if (real.year !== year || real.month !== month || real.day !== day) {
    throw new InvalidWorkingCalendarError(`"${text}" is not a real date.`);
  }
  return number;
}

function readWorkdays(workdays: readonly Workday[]): number[] {
  const positions = new Set<number>();
  for (const workday of workdays) {
    if (!Number.isInteger(workday) || workday < 1 || workday > DAYS_PER_WEEK) {
      throw new InvalidWorkingCalendarError(
        `${String(workday)} is not an ISO weekday. Use 1 (Monday) to 7 (Sunday).`,
      );
    }
    positions.add(workday - 1);
  }
  if (positions.size === 0)
    throw new InvalidWorkingCalendarError('workdays names no weekday, so no day can be a workday.');
  return [...positions].sort((a, b) => a - b);
}

/** Call: `workingCalendar({ workdays: [1, 2, 3, 4, 5], holidays: ['2026-12-25'] })`. Pass the result
 *  to `timeShading([{ covers: calendar.offTime() }])`, or ask it the three workday questions. */
export function workingCalendar(options: WorkingCalendarOptions): WorkingCalendar {
  const positions = readWorkdays(options.workdays);
  const perWeek = positions.length;
  const isPatternDay = (day: number) => positions.includes(modulo(day, DAYS_PER_WEEK));

  // Only a holiday on a pattern weekday removes a workday. Sorted, so a binary search counts them.
  const holidays = [...new Set((options.holidays ?? []).map(readHoliday))]
    .filter(isPatternDay)
    .sort((a, b) => a - b);
  const isHoliday = new Set(holidays);

  // Pattern workdays before `day`, with holidays ignored.
  const patternBefore = (day: number): number => {
    const week = Math.floor(day / DAYS_PER_WEEK);
    const weekday = modulo(day, DAYS_PER_WEEK);
    return week * perWeek + positions.filter((position) => position < weekday).length;
  };
  // The pattern workday with this zero-based index.
  const patternDayAt = (index: number): number =>
    Math.floor(index / perWeek) * DAYS_PER_WEEK + (positions[modulo(index, perWeek)] as number);
  const holidaysBefore = (day: number): number => {
    let low = 0;
    let high = holidays.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if ((holidays[middle] as number) < day) low = middle + 1;
      else high = middle;
    }
    return low;
  };

  const workdaysBefore = (day: number): number => patternBefore(day) - holidaysBefore(day);
  const isWorkdayNumber = (day: number): boolean => isPatternDay(day) && !isHoliday.has(day);

  // The workday with this zero-based index. A holiday at or before the guess pushes it one pattern day on.
  const workdayAt = (index: number): number => {
    let patternIndex = index;
    for (const holiday of holidays) {
      if (patternBefore(holiday) > patternIndex) break;
      patternIndex += 1;
    }
    return patternDayAt(patternIndex);
  };

  return Object.freeze({
    isWorkday(day, time) {
      return isWorkdayNumber(dayNumberOf(time.toInstant(day), time));
    },

    addWorkdays(from, count, time) {
      const start = time.toInstant(from);
      if (count === 0) return start;
      const origin = dayNumberOf(start, time);
      const index = count > 0 ? workdaysBefore(origin + 1) + count - 1 : workdaysBefore(origin) + count;
      return time.fromPlain({ ...time.toPlain(start), ...plainDateOf(workdayAt(index)) });
    },

    workdaysBetween(a, b, time) {
      return (
        workdaysBefore(dayNumberOf(time.toInstant(b), time)) -
        workdaysBefore(dayNumberOf(time.toInstant(a), time))
      );
    },

    offTime() {
      return {
        hideWhenCoarserThan: 'day',
        coveredSpans(window, time) {
          const days = time.eachDay({ start: time.startOfDay(window.start), end: window.end });
          const spans: TimeSpan[] = [];
          for (const day of days) {
            if (isWorkdayNumber(dayNumberOf(day, time))) continue;
            const start = Math.max(day, window.start) as Instant;
            const end = Math.min(time.addDays(day, 1), window.end) as Instant;
            if (start < end) spans.push({ start, end });
          }
          return spans;
        },
      };
    },
  } satisfies WorkingCalendar);
}
