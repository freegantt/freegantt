// Hand-worked answers for a user edit: a move, a resize, a conflict the engine reports.
import type { GoldenScenario } from './scenario.js';

export const editScenarios: readonly GoldenScenario[] = Object.freeze([
  {
    name: 'a moved predecessor keeps its length and pushes its successor',
    entries: [
      ['a', 0, 2],
      ['b', 2, 3],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    proposed: { a: { start: 3, end: 5 } },
    expected: {
      patch: [
        ['b', 'start', 2, 5],
        ['b', 'end', 3, 6],
      ],
    },
  },
  {
    name: 'a resized end keeps the start',
    entries: [['a', 0, 2]],
    dependencies: [],
    proposed: { a: { end: 5 } },
    expected: { patch: [] },
  },
  {
    name: 'a resized start keeps the end',
    entries: [['a', 0, 4]],
    dependencies: [],
    proposed: { a: { start: 1 } },
    expected: { patch: [] },
  },
  {
    name: 'a resized predecessor pushes its successor',
    entries: [
      ['a', 0, 2],
      ['b', 2, 3],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    proposed: { a: { start: 0, end: 4 } },
    expected: {
      patch: [
        ['b', 'start', 2, 4],
        ['b', 'end', 3, 5],
      ],
    },
  },
  {
    name: 'an edit moves only what lies downstream of it',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
      ['x', 0, 1],
      ['y', 0, 1],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 0],
      ['d2', 'x', 'y', 'FS', 0],
    ],
    proposed: { a: { start: 1, end: 2 } },
    expected: {
      patch: [
        ['b', 'start', 1, 2],
        ['b', 'end', 2, 3],
      ],
    },
  },
  {
    name: 'a successor dragged into its predecessor is reported and stays',
    entries: [
      ['a', 0, 2],
      ['b', 3, 4],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    proposed: { b: { start: 0, end: 1 } },
    expected: {
      patch: [],
      diagnostics: [
        {
          code: 'blocked-move',
          reason: 'proposed',
          entryId: 'b',
          dependencyIds: ['d1'],
          wouldChange: [
            ['b', 'start', 0, 2],
            ['b', 'end', 1, 3],
          ],
        },
      ],
    },
  },
  {
    name: 'a half-proposed successor stretches to meet an end demand',
    entries: [
      ['a', 0, 6],
      ['b', 0, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FF', 0]],
    proposed: { b: { start: 0 } },
    expected: { patch: [['b', 'end', 2, 6]] },
  },
  {
    name: 'a move that would put the end before the start is reported',
    entries: [
      ['a', 0, 10],
      ['b', 0, 4],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    proposed: { b: { end: 4 } },
    expected: {
      patch: [],
      diagnostics: [
        {
          code: 'blocked-move',
          reason: 'inverted',
          entryId: 'b',
          dependencyIds: ['d1'],
          wouldChange: [
            ['b', 'start', 0, 10],
            ['b', 'end', 4, 14],
          ],
        },
      ],
    },
  },
  {
    name: 'a proposal for an unknown Entry changes nothing',
    entries: [
      ['a', 0, 2],
      ['b', 5, 6],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    proposed: { ghost: { start: 3 } },
    expected: { patch: [] },
  },
]);
