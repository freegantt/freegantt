import { describe, expect, it } from 'vitest';
import { Dataset } from '../../api/dataset.js';
import type { ZonedTime } from '../../api/time-facade.js';
// Through the public barrel: a consumer catches on `instanceof` (#404 review).
import { EmptyCoversError } from '../../api/index.js';
import type { TimeSpan } from '../../model/index.js';
import {
  coarsestFloor,
  complement,
  daysOfWeek,
  dates,
  hours,
  mergeSpans,
  notCovered,
  spans,
} from './time-shading-covers.js';

// America/Chicago: springs forward on 2026-03-08 (23-hour day), falls back on 2026-11-01
// (25-hour day) — the two DST boundaries every acceptance box asks for.
const CHICAGO = 'America/Chicago';

function zonedTime(zone: string): ZonedTime {
  return new Dataset({ entries: [], timeZone: zone }).time;
}

describe('daysOfWeek()', () => {
  it('shades every matching ISO weekday, merged into one run over a weekend (no hairline)', () => {
    const time = zonedTime(CHICAGO);
    const window: TimeSpan = { start: time.toInstant('2026-06-01'), end: time.toInstant('2026-06-15') };
    const merged = mergeSpans(daysOfWeek(6, 7).coveredSpans(window, time));
    // June 2026 has two full weekends inside the window: the 6th-7th and the 13th-14th.
    expect(merged).toEqual([
      { start: time.toInstant('2026-06-06'), end: time.toInstant('2026-06-08') },
      { start: time.toInstant('2026-06-13'), end: time.toInstant('2026-06-15') },
    ]);
  });

  it('shades the rest of a day the window opens inside (#404 review F1)', () => {
    const time = zonedTime(CHICAGO);
    // A decoration window opens wherever the pan left it, so it is almost never day-aligned. The
    // Saturday this window opens inside must still shade from `window.start` to its own midnight.
    const saturdayMorning = time.fromPlain({
      ...time.toPlain(time.toInstant('2026-06-06')),
      hour: 10,
      minute: 0,
      second: 0,
    });
    const window: TimeSpan = { start: saturdayMorning, end: time.toInstant('2026-06-08') };

    const merged = mergeSpans(daysOfWeek(6, 7).coveredSpans(window, time));

    expect(merged).toEqual([{ start: saturdayMorning, end: time.toInstant('2026-06-08') }]);
  });

  it('leaves nothing uncovered when the window opens inside a covered day (#404 review F1)', () => {
    const time = zonedTime(CHICAGO);
    const saturdayMorning = time.fromPlain({
      ...time.toPlain(time.toInstant('2026-06-06')),
      hour: 10,
      minute: 0,
      second: 0,
    });
    const window: TimeSpan = { start: saturdayMorning, end: time.toInstant('2026-06-08') };

    // The whole window is weekend, so its complement is empty. Before the fix this painted
    // Saturday 10:00 to midnight as "not weekend" — working time over a Saturday afternoon.
    expect(notCovered(daysOfWeek(6, 7)).coveredSpans(window, time)).toEqual([]);
  });

  it('shades the spring-forward day (23 hours) as a whole day, wall-clock to wall-clock', () => {
    const time = zonedTime(CHICAGO);
    const day = time.startOfDay(time.toInstant('2026-03-08'));
    const weekday = time.dayOfWeek(day) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    const window: TimeSpan = { start: day, end: time.addDays(day, 1) };
    const [span] = daysOfWeek(weekday).coveredSpans(window, time);
    expect(span).toEqual({ start: day, end: time.addDays(day, 1) });
    expect(time.each(span!, 'hour')).toHaveLength(23);
  });

  it('shades the fall-back day (25 hours) as a whole day, wall-clock to wall-clock', () => {
    const time = zonedTime(CHICAGO);
    const day = time.startOfDay(time.toInstant('2026-11-01'));
    const weekday = time.dayOfWeek(day) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    const window: TimeSpan = { start: day, end: time.addDays(day, 1) };
    const [span] = daysOfWeek(weekday).coveredSpans(window, time);
    expect(span).toEqual({ start: day, end: time.addDays(day, 1) });
    expect(time.each(span!, 'hour')).toHaveLength(25);
  });
});

describe('hours()', () => {
  it('wraps midnight — the evening reading until the next morning reading', () => {
    const time = zonedTime(CHICAGO);
    const day = time.startOfDay(time.toInstant('2026-06-15'));
    // Two days wide on purpose. A one-day window clips the band at its own midnight, so the wrap
    // itself would be unobservable and any present band would pass (#404 review).
    const window: TimeSpan = { start: day, end: time.addDays(day, 2) };
    const eveningReading = time.fromPlain({ ...time.toPlain(day), hour: 17, minute: 0, second: 0 });
    const nextMorningReading = time.fromPlain({
      ...time.toPlain(time.addDays(day, 1)),
      hour: 7,
      minute: 0,
      second: 0,
    });

    const evening = hours('17:00', '07:00')
      .coveredSpans(window, time)
      .find((span) => span.start === eveningReading);

    expect(evening).toEqual({ start: eveningReading, end: nextMorningReading });
  });

  it('shades nothing when both readings are equal (#404 review F6)', () => {
    const time = zonedTime(CHICAGO);
    const day = time.startOfDay(time.toInstant('2026-06-15'));
    const window: TimeSpan = { start: day, end: time.addDays(day, 1) };

    // Equal readings name a band of no width. Reading them as a wrap would shade all 24 hours —
    // the opposite of what `hours('09:00', '09:00')` says.
    expect(hours('09:00', '09:00').coveredSpans(window, time)).toEqual([]);
  });

  it('resolves both boundaries through ZonedTime.fromPlain, adding no arithmetic of its own — 13 hours across the spring-forward transition', () => {
    // The overnight band that crosses the transition is the one starting the evening before the
    // spring-forward day: 2026-03-07 17:00 to 2026-03-08 07:00. Ordinarily 14 hours, this one loses
    // the hour the clocks skip, so it measures 13.
    const time = zonedTime(CHICAGO);
    const transitionDay = time.startOfDay(time.toInstant('2026-03-08'));
    const eveningBefore = time.addDays(transitionDay, -1);
    const window: TimeSpan = { start: eveningBefore, end: time.addDays(transitionDay, 1) };
    const band = hours('17:00', '07:00')
      .coveredSpans(window, time)
      .find(
        (span) =>
          span.start === time.fromPlain({ ...time.toPlain(eveningBefore), hour: 17, minute: 0, second: 0 }),
      );
    expect(band).toBeDefined();
    expect(band!.end).toBe(time.fromPlain({ ...time.toPlain(transitionDay), hour: 7, minute: 0, second: 0 }));
    expect(time.each(band!, 'hour')).toHaveLength(13);
  });

  it('measures 15 hours across the fall-back transition, still ending on the 07:00 reading', () => {
    // Same shape, the other direction: 2026-10-31 17:00 to 2026-11-01 07:00 gains the repeated hour.
    const time = zonedTime(CHICAGO);
    const transitionDay = time.startOfDay(time.toInstant('2026-11-01'));
    const eveningBefore = time.addDays(transitionDay, -1);
    const window: TimeSpan = { start: eveningBefore, end: time.addDays(transitionDay, 1) };
    const band = hours('17:00', '07:00')
      .coveredSpans(window, time)
      .find(
        (span) =>
          span.start === time.fromPlain({ ...time.toPlain(eveningBefore), hour: 17, minute: 0, second: 0 }),
      );
    expect(band).toBeDefined();
    expect(band!.end).toBe(time.fromPlain({ ...time.toPlain(transitionDay), hour: 7, minute: 0, second: 0 }));
    expect(time.each(band!, 'hour')).toHaveLength(15);
  });

  it('starts a band on a plain time that does not exist that day, resolved forward by the gap size (fromPlain, disambiguation: compatible)', () => {
    const time = zonedTime(CHICAGO);
    const day = time.startOfDay(time.toInstant('2026-03-08'));
    // 02:30 never happens on a spring-forward day in America/Chicago (clocks jump 02:00 -> 03:00).
    // 'compatible' shifts it forward by the gap's own size (one hour), landing on 03:30, not 03:00.
    // `hours()` adds no arithmetic of its own, so the band inherits that reading (#404 review:
    // this asserts through the builder, so a builder that stopped using `fromPlain` fails it).
    const shiftedForward = time.fromPlain({ ...time.toPlain(day), hour: 3, minute: 30, second: 0 });
    const window: TimeSpan = { start: day, end: time.addDays(day, 1) };

    const band = hours('02:30', '06:00')
      .coveredSpans(window, time)
      .find((span) => span.start >= day);

    expect(band?.start).toBe(shiftedForward);
  });
});

describe('dates()', () => {
  it('shades each named calendar day whole, across a DST boundary', () => {
    const time = zonedTime(CHICAGO);
    const window: TimeSpan = { start: time.toInstant('2026-03-01'), end: time.toInstant('2026-03-15') };
    const spansFound = dates('2026-03-08').coveredSpans(window, time);
    expect(spansFound).toHaveLength(1);
    expect(time.each(spansFound[0]!, 'hour')).toHaveLength(23);
  });
});

describe('spans()', () => {
  it("reads a date-only end inclusively — '2026-07-15' covers the 15th", () => {
    const time = zonedTime(CHICAGO);
    const window: TimeSpan = { start: time.toInstant('2026-06-01'), end: time.toInstant('2026-08-01') };
    const [span] = spans({ start: '2026-07-01', end: '2026-07-15' }).coveredSpans(window, time);
    expect(span!.end).toBe(time.toInstant('2026-07-16'));
  });

  it('never hides on its own — the floor is the coarsest unit', () => {
    expect(spans({ start: '2026-07-01', end: '2026-07-15' }).hideWhenCoarserThan).toBe('year');
  });
});

describe('mergeSpans() and complement()', () => {
  it('merges touching and overlapping spans into one run', () => {
    const time = zonedTime(CHICAGO);
    const a = { start: time.toInstant('2026-06-06'), end: time.toInstant('2026-06-07') };
    const b = { start: time.toInstant('2026-06-07'), end: time.toInstant('2026-06-08') };
    const c = { start: time.toInstant('2026-06-20'), end: time.toInstant('2026-06-21') };
    expect(mergeSpans([b, a, c])).toEqual([
      { start: time.toInstant('2026-06-06'), end: time.toInstant('2026-06-08') },
      c,
    ]);
  });

  it('finds the gaps a merged span list leaves inside a window', () => {
    const time = zonedTime(CHICAGO);
    const window: TimeSpan = { start: time.toInstant('2026-06-01'), end: time.toInstant('2026-06-10') };
    const merged = [{ start: time.toInstant('2026-06-03'), end: time.toInstant('2026-06-05') }];
    expect(complement(window, merged)).toEqual([
      { start: time.toInstant('2026-06-01'), end: time.toInstant('2026-06-03') },
      { start: time.toInstant('2026-06-05'), end: time.toInstant('2026-06-10') },
    ]);
  });
});

describe('coarsestFloor()', () => {
  it('picks the coarsest of several covers, not the finest', () => {
    expect(coarsestFloor([daysOfWeek(6, 7), hours('17:00', '07:00')])).toBe('day');
  });
});

describe('notCovered()', () => {
  it('shades the complement of the inner cover inside the window', () => {
    const time = zonedTime(CHICAGO);
    // 2026-06-06/07 is the one weekend inside [06-01, 06-08) — Saturday through the window's own end.
    const window: TimeSpan = { start: time.toInstant('2026-06-01'), end: time.toInstant('2026-06-08') };
    const complementSpans = notCovered(daysOfWeek(6, 7)).coveredSpans(window, time);
    expect(complementSpans).toEqual([
      { start: time.toInstant('2026-06-01'), end: time.toInstant('2026-06-06') },
    ]);
  });

  it('takes a list the same way a rule does, and floors at the coarsest member', () => {
    const cover = notCovered([daysOfWeek(6, 7), hours('17:00', '07:00')]);
    expect(cover.hideWhenCoarserThan).toBe('day');
  });

  it('throws EmptyCoversError on an empty list — there is no complement to compute', () => {
    expect(() => notCovered([])).toThrow(EmptyCoversError);
  });
});

// #404 review: a builder that names nothing matches nothing, and `notCovered()` around it shades
// the whole window — the state `EmptyCoversError` refuses at the list door, reached through a cover
// that door cannot see. The first argument is required, so the call never compiles.
describe('a builder always names at least one thing', () => {
  it('refuses a zero-argument call at compile time', () => {
    // @ts-expect-error — daysOfWeek() names no days.
    expect(() => daysOfWeek()).toBeDefined();
    // @ts-expect-error — dates() names no dates.
    expect(() => dates()).toBeDefined();
    // @ts-expect-error — spans() names no spans.
    expect(() => spans()).toBeDefined();
  });
});
