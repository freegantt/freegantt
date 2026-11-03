// Hand-worked answers for how a successor follows: earlier or only later, and the start floor.
import type { GoldenScenario } from './scenario.js';

export const followScenarios: readonly GoldenScenario[] = Object.freeze([
  {
    name: 'a successor with slack moves earlier to meet its predecessor',
    entries: [
      ['a', 0, 2],
      ['b', 5, 6],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    expected: {
      patch: [
        ['b', 'start', 5, 2],
        ['b', 'end', 6, 3],
      ],
    },
  },
  {
    name: 'a predecessor that moves earlier pulls its successors with it',
    entries: [
      ['a', 4, 6],
      ['b', 6, 7],
      ['c', 7, 8],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 0],
      ['d2', 'b', 'c', 'FS', 0],
    ],
    proposed: { a: { start: 0 } },
    expected: {
      patch: [
        ['a', 'end', 6, 2],
        ['b', 'start', 6, 2],
        ['b', 'end', 7, 3],
        ['c', 'start', 7, 3],
        ['c', 'end', 8, 4],
      ],
    },
  },
  {
    name: 'a successor held by a second predecessor stays when the first moves earlier',
    entries: [
      ['a', 4, 6],
      ['x', 0, 5],
      ['b', 6, 7],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 0],
      ['d2', 'x', 'b', 'FS', 0],
    ],
    proposed: { a: { start: 0 } },
    expected: {
      patch: [
        ['a', 'end', 6, 2],
        ['b', 'start', 6, 5],
        ['b', 'end', 7, 6],
      ],
    },
  },
  {
    name: 'a start floor later than the start moves an Entry that has no incoming dependency',
    entries: [
      ['a', 3, 4],
      ['b', 9, 10],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    startNoEarlierThan: { a: 8 },
    expected: {
      patch: [
        ['a', 'start', 3, 8],
        ['a', 'end', 4, 9],
      ],
    },
  },
  {
    name: 'push only moves a successor later and never earlier',
    entries: [
      ['a', 4, 6],
      ['b', 6, 7],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    proposed: { a: { start: 0 } },
    successorMoves: 'pushOnly',
    expected: { patch: [['a', 'end', 6, 2]] },
  },
  {
    name: 'the start floor stops a successor that would move earlier',
    entries: [
      ['a', 0, 2],
      ['b', 5, 6],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    startNoEarlierThan: { b: 4 },
    expected: {
      patch: [
        ['b', 'start', 5, 4],
        ['b', 'end', 6, 5],
      ],
    },
  },
  {
    name: 'a dependency beats the start floor and moves the successor later',
    entries: [
      ['a', 0, 7],
      ['b', 4, 5],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    startNoEarlierThan: { b: 4 },
    expected: {
      patch: [
        ['b', 'start', 4, 7],
        ['b', 'end', 5, 8],
      ],
    },
  },
  {
    name: 'a manually scheduled Entry keeps its dates and the diagnostic names the broken dependency',
    entries: [
      ['a', 0, 5],
      ['b', 2, 3],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    manuallyScheduled: ['b'],
    expected: {
      patch: [],
      diagnostics: [
        {
          code: 'blocked-move',
          reason: 'manuallyScheduled',
          entryId: 'b',
          dependencyIds: ['d1'],
          wouldChange: [
            ['b', 'start', 2, 5],
            ['b', 'end', 3, 6],
          ],
        },
      ],
    },
  },
  {
    name: 'a manually scheduled Entry with slack stays and raises no diagnostic',
    entries: [
      ['a', 0, 2],
      ['b', 5, 6],
    ],
    dependencies: [['d1', 'a', 'b', 'FS', 0]],
    manuallyScheduled: ['b'],
    expected: { patch: [] },
  },
]);
