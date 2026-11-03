// Hand-worked answers for manually scheduled Entries, parents, cycles and unreadable dependencies.
import type { GoldenScenario } from './scenario.js';

export const conflictScenarios: readonly GoldenScenario[] = Object.freeze([
  {
    name: 'a manually scheduled successor never moves and the engine reports the move it skipped',
    entries: [
      ['a', 0, 2],
      ['b', 0, 1],
      ['c', 0, 1],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 0],
      ['d2', 'b', 'c', 'FS', 0],
    ],
    manuallyScheduled: ['b'],
    expected: {
      patch: [
        ['c', 'start', 0, 1],
        ['c', 'end', 1, 2],
      ],
      diagnostics: [
        {
          code: 'blocked-move',
          reason: 'manuallyScheduled',
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
    name: 'moving the predecessor of a manually scheduled Entry moves nothing past it',
    entries: [
      ['a', 0, 1],
      ['b', 1, 2],
      ['c', 2, 3],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 0],
      ['d2', 'b', 'c', 'FS', 0],
    ],
    manuallyScheduled: ['b'],
    proposed: { a: { start: 2, end: 3 } },
    expected: {
      patch: [],
      diagnostics: [
        {
          code: 'blocked-move',
          reason: 'manuallyScheduled',
          entryId: 'b',
          dependencyIds: ['d1'],
          wouldChange: [
            ['b', 'start', 1, 3],
            ['b', 'end', 2, 4],
          ],
        },
      ],
    },
  },
  {
    name: 'a parent never moves because its children decide its span',
    entries: [
      ['a', 0, 2],
      ['g', 0, 1, 'parent'],
    ],
    dependencies: [['d1', 'a', 'g', 'FS', 0]],
    expected: {
      patch: [],
      diagnostics: [
        {
          code: 'blocked-move',
          reason: 'policy',
          entryId: 'g',
          dependencyIds: ['d1'],
          wouldChange: [
            ['g', 'start', 0, 2],
            ['g', 'end', 1, 3],
          ],
        },
      ],
    },
  },
  {
    name: 'a cycle names exactly its members and moves none of them',
    entries: [
      ['a', 0, 1],
      ['b', 0, 1],
      ['c', 0, 1],
      ['d', 0, 1],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 0],
      ['d2', 'b', 'c', 'FS', 0],
      ['d3', 'c', 'a', 'FS', 0],
      ['d4', 'c', 'd', 'FS', 0],
    ],
    expected: {
      patch: [
        ['d', 'start', 0, 1],
        ['d', 'end', 1, 2],
      ],
      diagnostics: [{ code: 'cycle', entryIds: ['a', 'b', 'c'] }],
    },
  },
  {
    name: 'a dependency on itself is a cycle of one',
    entries: [['a', 0, 1]],
    dependencies: [['d1', 'a', 'a', 'FS', 0]],
    expected: { patch: [], diagnostics: [{ code: 'cycle', entryIds: ['a'] }] },
  },
  {
    name: 'two separate cycles are two diagnostics',
    entries: [
      ['a', 0, 1],
      ['b', 0, 1],
      ['c', 0, 1],
      ['d', 0, 1],
    ],
    dependencies: [
      ['d1', 'a', 'b', 'FS', 0],
      ['d2', 'b', 'a', 'FS', 0],
      ['d3', 'c', 'd', 'SS', 0],
      ['d4', 'd', 'c', 'SS', 0],
    ],
    expected: {
      patch: [],
      diagnostics: [
        { code: 'cycle', entryIds: ['a', 'b'] },
        { code: 'cycle', entryIds: ['c', 'd'] },
      ],
    },
  },
  {
    name: 'a dependency on an unknown Entry is reported and skipped',
    entries: [
      ['a', 0, 2],
      ['b', 0, 1],
    ],
    dependencies: [
      ['d1', 'a', 'ghost', 'FS', 0],
      ['d2', 'a', 'b', 'FS', 0],
    ],
    expected: {
      patch: [
        ['b', 'start', 0, 2],
        ['b', 'end', 1, 3],
      ],
      diagnostics: [{ code: 'unknown-entry', dependencyId: 'd1' }],
    },
  },
]);
