// Hand-worked answers for each dependency type, each lag sign, and chains. Days are whole 24-hour days.
import type { GoldenScenario } from './scenario.js';

export const dependencyTypeScenarios: readonly GoldenScenario[] = Object.freeze([
  {
    name: 'FS pushes the successor to the predecessor end',
    entries: [
      ['a', 0, 2],
      ['b', 0, 1],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    expected: {
      patch: [
        ['b', 'start', 0, 2],
        ['b', 'end', 1, 3],
      ],
    },
  },
  {
    name: 'SS pushes the successor start to the predecessor start',
    entries: [
      ['a', 1, 3],
      ['b', 0, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'SS', 0]],
    expected: {
      patch: [
        ['b', 'start', 0, 1],
        ['b', 'end', 2, 3],
      ],
    },
  },
  {
    name: 'FF pushes the successor end to the predecessor end',
    entries: [
      ['a', 0, 4],
      ['b', 0, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'FF', 0]],
    expected: {
      patch: [
        ['b', 'start', 0, 2],
        ['b', 'end', 2, 4],
      ],
    },
  },
  {
    name: 'SF pushes the successor end to the predecessor start',
    entries: [
      ['a', 3, 5],
      ['b', 0, 2],
    ],
    dependencies: [['d1', 'a', 'b', 'SF', 0]],
    expected: {
      patch: [
        ['b', 'start', 0, 1],
        ['b', 'end', 2, 3],
      ],
    },
  },
  {
    name: 'positive lag leaves a gap',
    entries: [
      ['a', 0, 2],
      ['b', 0, 1],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 2]],
    expected: {
      patch: [
        ['b', 'start', 0, 4],
        ['b', 'end', 1, 5],
      ],
    },
  },
  {
    name: 'negative lag overlaps',
    entries: [
      ['a', 0, 3],
      ['b', 0, 1],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', -1]],
    expected: {
      patch: [
        ['b', 'start', 0, 2],
        ['b', 'end', 1, 3],
      ],
    },
  },
  {
    name: 'a satisfied dependency moves nothing',
    entries: [
      ['a', 0, 2],
      ['b', 5, 6],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    expected: { patch: [] },
  },
  {
    name: 'a milestone keeps its zero length',
    entries: [
      ['a', 0, 2],
      ['m', 0, 0],
    ],
    dependencies: [['d1', 'a', 'm', 'FS', 0]],
    expected: {
      patch: [
        ['m', 'start', 0, 2],
        ['m', 'end', 0, 2],
      ],
    },
  },
  {
    name: 'the latest of several predecessors decides',
    entries: [
      ['a', 0, 2],
      ['b', 0, 5],
      ['c', 0, 1],
    ],
    dependencies: [
      ['d1', 'a', 'c', 'FS', 0],
      ['d2', 'b', 'c', 'FS', 0],
    ],
    expected: {
      patch: [
        ['c', 'start', 0, 5],
        ['c', 'end', 1, 6],
      ],
    },
  },
  {
    name: 'mixed types and lags in one chain',
    entries: [
      ['a', 0, 2],
      ['b', 0, 1],
      ['c', 0, 1],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 1],
      ['d2', 'b', 'c', 'SS', -1],
    ],
    expected: {
      patch: [
        ['b', 'start', 0, 3],
        ['b', 'end', 1, 4],
        ['c', 'start', 0, 2],
        ['c', 'end', 1, 3],
      ],
    },
  },
  {
    name: 'a start and an end demand together shift by the larger one',
    entries: [
      ['a', 0, 6],
      ['b', 0, 2],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'SS', 1],
      ['d2', 'a', 'b', 'FF', 0],
    ],
    expected: {
      patch: [
        ['b', 'start', 0, 4],
        ['b', 'end', 2, 6],
      ],
    },
  },
]);
