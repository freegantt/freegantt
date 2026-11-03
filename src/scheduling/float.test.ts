import { describe, expect, it } from 'vitest';
import { entryId } from '../model/index.js';
import type { EntryId } from '../model/index.js';
import { createZonedTime } from '../time/index.js';
import { findDrivingPath } from './find-driving-path.js';
import { calculateFloat } from './float.js';
import type { FloatRequest } from './float.js';
import { day } from './golden/scenario.js';
import type { ScheduleDependency, ScheduleDependencyType, ScheduleEntry } from './schedule-request.js';
import { workingCalendar } from './working-calendar.js';

const id = (name: string): EntryId => entryId(name);

function entryOf(name: string, start: number, end: number, hasChildren = false): ScheduleEntry {
  return { id: id(name), start: day(start), end: day(end), hasChildren };
}

function link(from: string, to: string, type: ScheduleDependencyType = 'FS', lag = 0): ScheduleDependency {
  return { id: `${from}-${to}`, fromId: id(from), toId: id(to), type, lag: { value: lag, unit: 'day' } };
}

function floatsOf(request: FloatRequest): Record<string, number> {
  const { entries } = calculateFloat(request);
  return Object.fromEntries([...entries].map(([entry, result]) => [entry, result.totalFloat]));
}

// The textbook network: A(3) then B(4) or C(2), then D(2). B is the long branch.
const textbook: FloatRequest = {
  entries: [entryOf('A', 0, 3), entryOf('B', 3, 7), entryOf('C', 3, 5), entryOf('D', 7, 9)],
  dependencies: [link('A', 'B'), link('A', 'C'), link('B', 'D'), link('C', 'D')],
};

describe('calculateFloat — textbook network', () => {
  it('gives the short branch its slack and the long branch none', () => {
    expect(floatsOf(textbook)).toEqual({ A: 0, B: 0, C: 2, D: 0 });
  });

  it('marks exactly the zero-float Entries critical', () => {
    const { entries } = calculateFloat(textbook);
    const critical = [...entries].filter(([, result]) => result.critical).map(([entry]) => entry);
    expect(critical).toEqual(['A', 'B', 'D']);
  });

  it('takes the project finish from the latest finish', () => {
    expect(calculateFloat(textbook).projectFinish).toBe(day(9));
  });

  it('gives an Entry with no Dependency the gap to the project finish', () => {
    const request: FloatRequest = { ...textbook, entries: [...textbook.entries, entryOf('E', 0, 2)] };
    expect(floatsOf(request)['E']).toBe(7);
  });

  it('answers nothing for no Entries', () => {
    expect(calculateFloat({ entries: [], dependencies: [] })).toEqual({
      projectFinish: undefined,
      entries: new Map(),
    });
  });
});

describe('calculateFloat — lag and Dependency types', () => {
  it('counts a lag against the predecessor', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 0, 2), entryOf('B', 5, 7), entryOf('C', 0, 7)],
      dependencies: [link('A', 'B', 'FS', 3)],
    };
    expect(floatsOf(request)).toEqual({ A: 0, B: 0, C: 0 });
  });

  it('reads a start-to-start Dependency from the start of the predecessor', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 0, 4), entryOf('B', 1, 9)],
      dependencies: [link('A', 'B', 'SS', 1)],
    };
    expect(floatsOf(request)).toEqual({ A: 0, B: 0 });
  });

  it('reads a finish-to-finish Dependency from the end of the predecessor', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 0, 4), entryOf('B', 3, 9)],
      dependencies: [link('A', 'B', 'FF', 2)],
    };
    // A may finish no later than day 7, so it has 3 days of float.
    expect(floatsOf(request)).toEqual({ A: 3, B: 0 });
  });

  it('reads a start-to-finish Dependency from the start of the predecessor', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 4, 6), entryOf('B', 0, 8)],
      dependencies: [link('A', 'B', 'SF', 0)],
    };
    // B ends at day 8, so A may start as late as day 8. A must also end by the project finish, day 8.
    expect(floatsOf(request)).toEqual({ A: 2, B: 0 });
  });

  it('reports a negative float when the schedule breaks a Dependency', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 0, 5), entryOf('B', 3, 8)],
      dependencies: [link('A', 'B')],
    };
    expect(floatsOf(request)['A']).toBe(-2);
    expect(calculateFloat(request).entries.get(id('A'))?.critical).toBe(true);
  });
});

describe('calculateFloat — working calendar', () => {
  const time = createZonedTime('UTC');
  const calendar = workingCalendar({ workdays: [1, 2, 3, 4, 5] });
  // Day 0 is Thursday. Day 1 is Friday, days 2 and 3 are the weekend, day 4 is Monday.
  const entries = [entryOf('A', 0, 1), entryOf('B', 1, 5), entryOf('C', 1, 2), entryOf('D', 5, 6)];
  const dependencies = [link('A', 'B'), link('A', 'C'), link('B', 'D'), link('C', 'D')];

  it('counts workdays when a calendar is given', () => {
    expect(floatsOf({ entries, dependencies, calendar: { time, calendar } })).toEqual({
      A: 0,
      B: 0,
      C: 1,
      D: 0,
    });
  });

  it('counts 24-hour days without a calendar', () => {
    expect(floatsOf({ entries, dependencies })).toEqual({ A: 0, B: 0, C: 3, D: 0 });
  });
});

describe('calculateFloat — loops and gaps', () => {
  it('skips the members of a loop and keeps the rest', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 0, 2), entryOf('B', 2, 4), entryOf('C', 4, 6), entryOf('Z', 0, 6)],
      dependencies: [link('A', 'B'), link('B', 'A'), link('B', 'C')],
    };
    expect(floatsOf(request)).toEqual({ C: 0, Z: 0 });
  });

  it('counts the end of a loop member in the project finish', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 0, 2), entryOf('B', 2, 9), entryOf('Z', 0, 5)],
      dependencies: [link('A', 'B'), link('B', 'A')],
    };
    expect(calculateFloat(request).projectFinish).toBe(day(9));
    expect(floatsOf(request)).toEqual({ Z: 4 });
  });

  it('skips a summary Entry and an Entry with a missing date', () => {
    const undated: ScheduleEntry = { id: id('U'), start: undefined, end: undefined, hasChildren: false };
    const request: FloatRequest = {
      entries: [entryOf('G', 0, 5, true), undated, entryOf('A', 0, 5)],
      dependencies: [link('A', 'U')],
    };
    expect(floatsOf(request)).toEqual({ A: 0 });
  });

  it('ignores a Dependency that names an unknown Entry', () => {
    const request: FloatRequest = { entries: [entryOf('A', 0, 5)], dependencies: [link('A', 'missing')] };
    expect(floatsOf(request)).toEqual({ A: 0 });
  });
});

describe('calculateFloat — deep chains', () => {
  it('walks a 5,000-link chain with no recursion failure', () => {
    const length = 5000;
    const entries = Array.from({ length: length + 1 }, (_, index) => entryOf(`e${index}`, index, index + 1));
    const dependencies = Array.from({ length }, (_, index) => link(`e${index}`, `e${index + 1}`));
    const result = calculateFloat({ entries, dependencies });
    expect(result.entries.size).toBe(length + 1);
    expect([...result.entries.values()].every((entry) => entry.critical)).toBe(true);
  });
});

describe('findDrivingPath', () => {
  it('follows the predecessors that hold the Entry with no slack', () => {
    expect(findDrivingPath(textbook, id('D'))).toEqual(['A', 'B', 'D']);
  });

  it('gives the Entry alone when no Dependency holds it', () => {
    expect(findDrivingPath(textbook, id('A'))).toEqual(['A']);
  });

  it('skips a predecessor with slack', () => {
    expect(findDrivingPath(textbook, id('C'))).toEqual(['A', 'C']);
  });

  it('answers an empty path for an unknown Entry or a loop member', () => {
    const loop: FloatRequest = {
      entries: [entryOf('A', 0, 2), entryOf('B', 2, 4)],
      dependencies: [link('A', 'B'), link('B', 'A')],
    };
    expect(findDrivingPath(textbook, id('nope'))).toEqual([]);
    expect(findDrivingPath(loop, id('A'))).toEqual([]);
  });

  it('reads the drive through a lag', () => {
    const request: FloatRequest = {
      entries: [entryOf('A', 0, 2), entryOf('B', 4, 6)],
      dependencies: [link('A', 'B', 'FS', 2)],
    };
    expect(findDrivingPath(request, id('B'))).toEqual(['A', 'B']);
  });

  it('walks a 5,000-link chain with no recursion failure', () => {
    const length = 5000;
    const entries = Array.from({ length: length + 1 }, (_, index) => entryOf(`e${index}`, index, index + 1));
    const dependencies = Array.from({ length }, (_, index) => link(`e${index}`, `e${index + 1}`));
    expect(findDrivingPath({ entries, dependencies }, id(`e${length}`))).toHaveLength(length + 1);
  });
});
