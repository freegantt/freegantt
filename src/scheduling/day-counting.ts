// scheduling/ — the one place the engine counts days. Without a working calendar a day is 24 hours.
// With one, a day count skips the days off, and a bar keeps its length in workdays when it moves.
import type { Duration, EntryId, Instant } from '../model/index.js';
import { addMs, diffMs } from '../time/index.js';
import type { ZonedTime } from '../time/index.js';
import { applyLag } from './apply-lag.js';
import type { ScheduleField } from './schedule-entry.js';
import type { WorkingCalendar } from './working-calendar.js';

/** The two dates of one Entry. */
export interface Span {
  readonly start: Instant;
  readonly end: Instant;
}

/**
 * The working calendars of one request. The engine reads `time` to place a day in the Dataset zone.
 * An Entry uses its own calendar from `ofEntry`, then `calendar`, then 24-hour days.
 */
export interface ScheduleCalendar {
  readonly time: ZonedTime;
  /** The calendar of every Entry that `ofEntry` does not name. */
  readonly calendar?: WorkingCalendar;
  readonly ofEntry?: ReadonlyMap<EntryId, WorkingCalendar>;
}

/** How one Entry counts days. The engine asks it and never reads a calendar directly. */
export interface DayCounting {
  /** Can the engine count this lag? A calendar counts hours and whole days. A month, a year or a week has no length in workdays. */
  supports(lag: Duration): boolean;
  /**
   * The date a lag lands on, counted from `anchor`. `field` names the date of this Entry that lands:
   * a start waits for the next workday, an end counts back to its last worked day.
   * Answers `undefined` for a lag this counting does not support.
   */
  lagLanding(anchor: Instant, lag: Duration, field: ScheduleField): Instant | undefined;
  /** The date in the form `lagLanding` answers, so two dates that mean the same working time compare equal. */
  settle(field: ScheduleField, date: Instant): Instant;
  /** The span after its `anchor` date lands on `to`. The span keeps its length: in workdays with a calendar, in time without one. */
  follow(span: Span, anchor: ScheduleField, to: Instant): Span;
}

const elapsedDays: DayCounting = Object.freeze<DayCounting>({
  supports: (lag) => applyLag(0 as Instant, lag) !== undefined,
  lagLanding: (anchor, lag) => applyLag(anchor, lag),
  settle: (_field, date) => date,
  follow(span, anchor, to) {
    const shift = diffMs(to, span[anchor]);
    return { start: addMs(span.start, shift), end: addMs(span.end, shift) };
  },
});

function countingFor(calendar: WorkingCalendar, time: ZonedTime): DayCounting {
  /** `source` with its calendar day replaced by the day of `dateFrom`. The wall-clock time stays. */
  const onDayOf = (source: Instant, dateFrom: Instant): Instant => {
    const { year, month, day } = time.toPlain(dateFrom);
    return time.fromPlain({ ...time.toPlain(source), year, month, day });
  };
  /** The last day an end covers. An end is the start of the day after. */
  const lastWorkedDay = (end: Instant): Instant => calendar.addWorkdays(end, -1, time);
  const dayAfter = (day: Instant, endTime: Instant): Instant => onDayOf(endTime, time.addDays(day, 1));

  const settle = (field: ScheduleField, date: Instant): Instant => {
    if (field === 'start') return calendar.isWorkday(date, time) ? date : calendar.addWorkdays(date, 1, time);
    return dayAfter(lastWorkedDay(date), date);
  };

  return Object.freeze<DayCounting>({
    supports: (lag) =>
      lag.unit === 'day'
        ? Number.isInteger(lag.value)
        : applyLag(0 as Instant, lag) !== undefined && lag.unit !== 'week',

    lagLanding(anchor, lag, field) {
      if (lag.unit !== 'day') return lag.unit === 'week' ? undefined : applyLag(anchor, lag);
      if (!Number.isInteger(lag.value)) return undefined;
      if (field === 'start') return calendar.addWorkdays(settle('start', anchor), lag.value, time);
      const landing = calendar.addWorkdays(lastWorkedDay(anchor), lag.value, time);
      return dayAfter(landing, anchor);
    },

    settle,

    follow(span, anchor, to) {
      const length = calendar.workdaysBetween(span.start, span.end, time);
      if (length <= 0) return elapsedDays.follow(span, anchor, to);
      if (anchor === 'start') {
        const last = calendar.addWorkdays(to, length - 1, time);
        return { start: to, end: dayAfter(last, span.end) };
      }
      const first = calendar.addWorkdays(lastWorkedDay(to), -(length - 1), time);
      return { start: onDayOf(span.start, first), end: to };
    },
  });
}

/** The counting one Entry uses. `undefined` means the request names no calendar, so days are 24 hours. */
export function dayCountingFor(scheduleCalendar: ScheduleCalendar | undefined, id: EntryId): DayCounting {
  if (!scheduleCalendar) return elapsedDays;
  const calendar = scheduleCalendar.ofEntry?.get(id) ?? scheduleCalendar.calendar;
  return calendar ? countingFor(calendar, scheduleCalendar.time) : elapsedDays;
}
