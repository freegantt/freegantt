// data/ — entries.load() (#496), the property step (5): a child may list before its parent, in any
// order, and `load` still lands the oracle — the same rows `new Dataset({ entries })` builds.
// Beside `history.property.test.ts`, the property test style step 5 asks for.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';

// A small tree, several levels deep, so a shuffle can genuinely put a child before its parent, a
// grandchild before its grandparent, or a leaf ahead of an unrelated root.
const seed = new DatasetState({
  timeZone: 'UTC',
  entries: [
    { id: 'p1', name: 'p1', start: 0, end: 100 },
    { id: 'c1', name: 'c1', parentId: 'p1', start: 0, end: 50 },
    { id: 'c2', name: 'c2', parentId: 'p1', start: 50, end: 100 },
    { id: 'g1', name: 'g1', parentId: 'c1', start: 0, end: 20 },
    { id: 'p2', name: 'p2', start: 0, end: 10 },
  ],
});
const seedInputs = seed.entries.all.map((entry) => entry.toInput());

describe('entries.load, any shuffle of a valid input list (#496 Q1 property)', () => {
  it('lands the same rows, in the same order, as new Dataset({ entries: shuffled })', () => {
    fc.assert(
      fc.property(
        fc.shuffledSubarray(seedInputs, { minLength: seedInputs.length, maxLength: seedInputs.length }),
        (shuffled) => {
          const fresh = new DatasetState({ entries: shuffled, timeZone: 'UTC' });
          // A live Dataset holding unrelated stale data — `load` must fully replace it, never merge.
          const state = new DatasetState({
            entries: [{ id: 'stale', name: 'stale', start: 0, end: 1 }],
            timeZone: 'UTC',
          });

          state.entries.load(shuffled);

          expect(state.entries.all.map((entry) => entry.toInput())).toEqual(
            fresh.entries.all.map((entry) => entry.toInput()),
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});
