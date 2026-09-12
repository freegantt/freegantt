// data/ — property test for the envelope invariant (#212, finding 4, `plans/01` §6): an Entry's
// `start`/`end` are always the earliest `start` and the latest `end` among its own Segments, no
// matter which write path last touched them. `envelopeOfSegments` (`time/instant.ts`) is the one
// function every path below calls; this test proves the invariant it is meant to hold, not the
// function's own arithmetic (`src/time/instant.test.ts` covers that).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DatasetState } from './dataset-state.js';
import type { EntryInput, SegmentInput } from '../model/index.js';
import { envelopeOfSegments, instant } from '../time/index.js';

/** A calendar day in January 2026, far enough from the month edge that `day + length` never rolls
 *  over — the fixture only needs distinct, orderable dates, not real calendar arithmetic. The `Z`
 *  suffix names an instant outright, so `instant()` reads it with no zone resolution involved. */
const pad = (n: number): string => String(n).padStart(2, '0');
const isoDay = (day: number): string => `2026-01-${pad(day)}T00:00:00.000Z`;

/** One authored Segment, given an explicit id so a later action can name it (`fc.array` alone gives
 *  every generated element the same shape but not a stable identity across runs). */
function segmentInput(id: string, day: number, length: number): SegmentInput {
  return { id, start: isoDay(day), end: isoDay(day + length) };
}

const segmentSpecArb = fc.record({
  day: fc.integer({ min: 1, max: 20 }),
  length: fc.integer({ min: 1, max: 8 }),
});

/** At least one Segment (every stored Entry keeps one), each with its own stable id so `removeSegments`
 *  and a positional `update` both have something to name. */
const segmentListArb = fc
  .array(segmentSpecArb, { minLength: 1, maxLength: 5 })
  .map((specs) => specs.map((spec, i) => segmentInput(`sg${i}`, spec.day, spec.length)));

function envelopeOf(segments: readonly SegmentInput[]): { start: string; end: string } {
  let start = segments[0]!.start as string;
  let end = segments[0]!.end as string;
  for (const segment of segments) {
    if ((segment.start as string) < start) start = segment.start as string;
    if ((segment.end as string) > end) end = segment.end as string;
  }
  return { start, end };
}

function assertEnvelopeMatches(state: DatasetState, id: string, segments: readonly SegmentInput[]): void {
  const expected = envelopeOf(segments);
  const entry = state.entries.get(id)!;
  expect(entry.start).toBe(instant(expected.start));
  expect(entry.end).toBe(instant(expected.end));
}

describe('the envelope has one owner (#212, finding 4)', () => {
  it('ingest computes the envelope from Segments, even against a deliberately stale authored start/end', () => {
    fc.assert(
      fc.property(segmentListArb, (segments) => {
        const input: EntryInput = {
          id: 'a',
          name: 'A',
          // A wrong span on purpose (#212, "Critical correction"): ingest must not trust this over
          // the Segments it is handed in the same input.
          start: '2026-01-01',
          end: '2026-01-02',
          segments,
        };
        const state = new DatasetState({ timeZone: 'UTC', entries: [input] });
        assertEnvelopeMatches(state, 'a', segments);
      }),
    );
  });

  it('a plain update({ segments }), naming no start or end, still recomputes the envelope', () => {
    fc.assert(
      fc.property(segmentListArb, segmentListArb, (first, second) => {
        const state = new DatasetState({
          timeZone: 'UTC',
          entries: [{ id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-02', segments: first }],
        });
        state.entries.update('a', { segments: second });
        assertEnvelopeMatches(state, 'a', second);
      }),
    );
  });

  it('removeSegments recomputes the envelope over whatever Segments survive', () => {
    fc.assert(
      fc.property(
        fc.array(segmentSpecArb, { minLength: 2, maxLength: 6 }),
        fc.array(fc.nat(), { maxLength: 5 }),
        (specs, dropIndexes) => {
          const segments = specs.map((spec, i) => segmentInput(`sg${i}`, spec.day, spec.length));
          const state = new DatasetState({
            timeZone: 'UTC',
            entries: [{ id: 'a', name: 'A', start: '2026-01-01', end: '2026-01-02', segments }],
          });
          // Never drop every Segment — that removes the Entry itself, a different, already-tested
          // path (`entry-store.mutation.test.ts`), not the envelope this test pins.
          const dropped = new Set(dropIndexes.map((i) => i % segments.length));
          if (dropped.size >= segments.length) dropped.delete([...dropped][0]!);
          if (dropped.size === 0) return;
          state.entries.removeSegments([...dropped].map((i) => segments[i]!.id!));
          const remaining = segments.filter((_segment, i) => !dropped.has(i));
          assertEnvelopeMatches(state, 'a', remaining);
        },
      ),
    );
  });

  // #212 R2 fix-plan review, finding B1 remainder: a roll-up-kind parent drawing exactly one Segment
  // widens that Segment to its rolled-up span, but a parent drawing several had no such pairing and
  // could publish an envelope its own Segments disagreed with. `widenSegmentsToEnvelope`
  // (`data/rollup.ts`) closes this by widening whichever Segment draws each edge — the earliest
  // `start`, the latest `end` — instead of picking one Segment to own the whole rewrite.
  it('a several-Segment roll-up-kind parent still matches its own envelope after the Rollup moves it', () => {
    fc.assert(
      fc.property(
        fc.array(segmentSpecArb, { minLength: 2, maxLength: 4 }),
        segmentSpecArb,
        (parentSpecs, childSpec) => {
          const parentSegments = parentSpecs.map((spec, i) => segmentInput(`p${i}`, spec.day, spec.length));
          const state = new DatasetState({
            timeZone: 'UTC',
            entries: [
              { id: 'p', name: 'P', segments: parentSegments },
              {
                id: 'c',
                name: 'C',
                parentId: 'p',
                start: isoDay(childSpec.day),
                end: isoDay(childSpec.day + childSpec.length),
              },
            ],
          });

          const parent = state.entries.get('p')!;
          const envelope = envelopeOfSegments(parent.segments);
          expect(parent.start).toBe(envelope.start);
          expect(parent.end).toBe(envelope.end);
        },
      ),
    );
  });
});
