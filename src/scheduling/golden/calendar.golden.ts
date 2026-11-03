// Hand-worked answers for a working calendar. Day 0 is a Thursday, so day 4 is Monday and day 6 is Wednesday.
import type { GoldenCalendars, GoldenScenario } from './scenario.js';

const weekdays = (): GoldenCalendars => ({
  named: { office: { workdays: [1, 2, 3, 4, 5] } },
  calendar: 'office',
});

export const calendarScenarios: readonly GoldenScenario[] = Object.freeze([
  {
    name: 'a one-day lag from Friday lands on Monday',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 1]],
    calendars: weekdays(),
    expected: {
      patch: [
        ['b', 'start', 1, 4],
        ['b', 'end', 2, 5],
      ],
    },
  },
  {
    name: 'a one-day lag skips a holiday',
    entries: [
      ['a', 4, 5],
      ['b', 5, 6],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 1]],
    calendars: {
      named: { office: { workdays: [1, 2, 3, 4, 5], holidays: ['1970-01-07'] } },
      calendar: 'office',
    },
    expected: {
      patch: [
        ['b', 'start', 5, 7],
        ['b', 'end', 6, 8],
      ],
    },
  },
  {
    name: 'a negative lag over a weekend overlaps the last workday',
    entries: [
      ['a', 4, 9],
      ['b', 12, 13],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', -1]],
    calendars: weekdays(),
    expected: {
      patch: [
        ['b', 'start', 12, 8],
        ['b', 'end', 13, 9],
      ],
    },
  },
  {
    name: 'a moved Entry keeps its length in workdays over a weekend',
    entries: [
      ['a', 0, 1],
      ['b', 1, 7],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 1]],
    calendars: weekdays(),
    expected: {
      patch: [
        ['b', 'start', 1, 4],
        ['b', 'end', 7, 8],
      ],
    },
  },
  {
    name: 'two Entries on two calendars count the same lag on their own',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
      ['c', 1, 2],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 2],
      ['d2', 'a', 'c', 'FS', 2],
    ],
    calendars: {
      named: { office: { workdays: [1, 2, 3, 4, 5] }, shop: { workdays: [1, 2, 3, 4, 5, 6] } },
      calendar: 'office',
      ofEntry: { c: 'shop' },
    },
    expected: {
      patch: [
        ['b', 'start', 1, 5],
        ['b', 'end', 2, 6],
        ['c', 'start', 1, 4],
        ['c', 'end', 2, 5],
      ],
    },
  },
  {
    name: 'a finish demand that needs more workdays than a start demand wins across a weekend',
    entries: [
      ['p', 3, 4],
      ['q', 7, 8],
      ['s', 1, 6],
    ],
    dependencies: [
      ['d1', 'p', 's', 'FS', 0],
      ['d2', 'q', 's', 'FF', 0],
    ],
    calendars: weekdays(),
    expected: {
      patch: [
        ['s', 'start', 1, 5],
        ['s', 'end', 6, 8],
      ],
    },
  },
  {
    name: 'with no calendar a lag counts 24-hour days',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 2]],
    expected: {
      patch: [
        ['b', 'start', 1, 3],
        ['b', 'end', 2, 4],
      ],
    },
  },
]);
