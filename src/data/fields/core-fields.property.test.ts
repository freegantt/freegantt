import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { DatasetState } from '../dataset-state.js';
import type { EntryInput } from '../../model/index.js';
import { diffMs } from '../../time/index.js';

// A row either has both dates, one date, or none. `end` never sits before `start` when both are
// present, so an arbitrary tree never asks a Field to measure a negative span.
const datesArb = fc.oneof(
  fc.constant({}),
  fc.integer({ min: 0, max: 1000 }).map((start) => ({ start })),
  fc.integer({ min: 0, max: 1000 }).map((end) => ({ end })),
  fc
    .integer({ min: 0, max: 1000 })
    .chain((start) => fc.integer({ min: 0, max: 500 }).map((span) => ({ start, end: start + span }))),
);

// 1-30 rows. Row `i`'s parent selector is `0..i`: `i` itself means "no parent", and any lower value
// names an earlier row — so the tree can never hold a cycle.
const treeArb = fc.integer({ min: 1, max: 30 }).chain((rowCount) =>
  fc.record({
    dates: fc.array(datesArb, { minLength: rowCount, maxLength: rowCount }),
    parentSelectors: fc.tuple(...Array.from({ length: rowCount }, (_, i) => fc.integer({ min: 0, max: i }))),
  }),
);

describe("reads a row's duration Field (issue #428)", () => {
  it("reads a row's duration as its own end minus start, on every row of an arbitrary tree", () => {
    // A parent row can carry its own authored dates in this arbitrary; Rollup then owns them once
    // it gains a child, and reports that on `console.warn`. Expected noise, not the property.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    fc.assert(
      fc.property(treeArb, ({ dates, parentSelectors }) => {
        const entries: EntryInput[] = dates.map((entryDates, i) => ({
          id: `r${i}`,
          name: `r${i}`,
          ...(parentSelectors[i] !== i ? { parentId: `r${parentSelectors[i]}` } : {}),
          ...entryDates,
        }));
        const state = new DatasetState({ entries, timeZone: 'UTC' });

        for (const entry of state.entries.all) {
          const duration = entry.read('duration');
          if (entry.start === undefined || entry.end === undefined) {
            expect(duration).toBeUndefined();
          } else {
            expect(duration).toEqual({ value: diffMs(entry.end, entry.start), unit: 'millisecond' });
          }
        }
      }),
      { numRuns: 50 },
    );
    warn.mockRestore();
  });
});
