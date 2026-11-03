// Hand-worked answers for the three constraint kinds and for the precedence between rules.
import type { GoldenScenario } from './scenario.js';

export const constraintScenarios: readonly GoldenScenario[] = Object.freeze([
  {
    name: 'a start floor later than the dependency date wins and moves the successor to the floor',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    startNoEarlierThan: { b: 5 },
    expected: {
      patch: [
        ['b', 'start', 1, 5],
        ['b', 'end', 2, 6],
      ],
    },
  },
  {
    name: 'a dependency beats a start floor and moves the successor later than the floor',
    entries: [
      ['a', 0, 6],
      ['b', 1, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    startNoEarlierThan: { b: 3 },
    expected: {
      patch: [
        ['b', 'start', 1, 6],
        ['b', 'end', 2, 7],
      ],
    },
  },
  {
    name: 'a finish ceiling that holds moves nothing and reports nothing',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    finishNoLaterThan: { b: 5 },
    expected: { patch: [] },
  },
  {
    name: 'a dependency that pushes the finish past the ceiling wins and the engine names the ceiling',
    entries: [
      ['a', 0, 4],
      ['b', 1, 3],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    finishNoLaterThan: { b: 5 },
    expected: {
      patch: [
        ['b', 'start', 1, 4],
        ['b', 'end', 3, 6],
      ],
      diagnostics: [
        { code: 'constraint-violated', constraint: 'finishNoLaterThan', entryId: 'b', dependencyIds: ['d1'] },
      ],
    },
  },
  {
    name: 'the engine never moves an Entry to meet its finish ceiling',
    entries: [['a', 0, 6]],
    dependencies: [],
    finishNoLaterThan: { a: 3 },
    expected: {
      patch: [],
      diagnostics: [
        { code: 'constraint-violated', constraint: 'finishNoLaterThan', entryId: 'a', dependencyIds: [] },
      ],
    },
  },
  {
    name: 'a must-start-on date moves an Entry with no dependency later',
    entries: [['a', 0, 2]],
    dependencies: [],
    mustStartOn: { a: 5 },
    expected: {
      patch: [
        ['a', 'start', 0, 5],
        ['a', 'end', 2, 7],
      ],
    },
  },
  {
    name: 'a must-start-on date moves an Entry with no dependency earlier',
    entries: [['a', 5, 7]],
    dependencies: [],
    mustStartOn: { a: 2 },
    expected: {
      patch: [
        ['a', 'start', 5, 2],
        ['a', 'end', 7, 4],
      ],
    },
  },
  {
    name: 'a must-start-on date later than the dependency date holds',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    mustStartOn: { b: 6 },
    expected: {
      patch: [
        ['b', 'start', 1, 6],
        ['b', 'end', 2, 7],
      ],
    },
  },
  {
    name: 'a must-start-on date beats a dependency and the engine reports the dependency it breaks',
    entries: [
      ['a', 0, 4],
      ['b', 4, 5],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    mustStartOn: { b: 2 },
    expected: {
      patch: [
        ['b', 'start', 4, 2],
        ['b', 'end', 5, 3],
      ],
      diagnostics: [
        {
          code: 'blocked-move',
          reason: 'mustStartOn',
          entryId: 'b',
          dependencyIds: ['d1'],
          wouldChange: [
            ['b', 'start', 2, 4],
            ['b', 'end', 3, 5],
          ],
        },
      ],
    },
  },
  {
    name: 'a manually scheduled Entry beats its must-start-on date and the engine reports the date',
    entries: [['a', 3, 4]],
    dependencies: [],
    manuallyScheduled: ['a'],
    mustStartOn: { a: 6 },
    expected: {
      patch: [],
      diagnostics: [
        { code: 'constraint-violated', constraint: 'mustStartOn', entryId: 'a', dependencyIds: [] },
      ],
    },
  },
  {
    name: 'a start the user proposes stays and the engine reports the must-start-on date it breaks',
    entries: [['a', 0, 2]],
    dependencies: [],
    proposed: { a: { start: 3, end: 5 } },
    mustStartOn: { a: 5 },
    expected: {
      patch: [],
      diagnostics: [
        { code: 'constraint-violated', constraint: 'mustStartOn', entryId: 'a', dependencyIds: [] },
      ],
    },
  },
]);
