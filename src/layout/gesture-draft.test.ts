import { describe, expect, it } from 'vitest';
import { cursorLabelForX, draftForMove, draftForResize, previewOffsets } from './gesture-draft.js';
import type { StoredEntry, Instant, ProposedEdit, ProposedEdits } from '../model/index.js';
import { entryId, itemId, segmentId } from '../model/index.js';
import { instant, createTimeScale, MS } from '../time/index.js';

const ZONE = 'America/New_York';
const scale = createTimeScale({
  timeZone: ZONE,
  range: { start: instant('2026-06-01T00:00:00Z'), end: instant('2026-07-01T00:00:00Z') },
  pxPerMs: 1 / MS.MINUTE, // 1px per minute
});

function entry(id: string, start: string, end: string): StoredEntry {
  const startInstant = instant(start);
  const endInstant = instant(end);
  return {
    id: entryId(id),
    name: id,
    start: startInstant,
    end: endInstant,
    segments: [{ id: segmentId(`${id}-1`), start: startInstant, end: endInstant }],
    props: {},
  };
}

/** The edit a one-Segment entry produces: its lone Segment always moves or resizes with it, so the
 *  edit always carries a `segments` array of one alongside `start`/`end` (#212). */
function singleSegmentEdit(id: string, start: Instant, end: Instant): ProposedEdit {
  return {
    __brand: 'ProposedEdit',
    props: {},
    proposedKeys: new Set(['segments', 'start', 'end']),
    segments: [{ id: segmentId(`${id}-1`), start, end }],
    start,
    end,
  };
}

describe('draftForMove', () => {
  it('returns an empty map when there are no entries', () => {
    const draft = draftForMove({ zone: ZONE, scale, snap: 'none', entries: [], dxPx: 100 });
    expect(draft.size).toBe(0);
  });

  it('moves a single entry by the snapped calendar delta', () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    // 65 minutes of pixel travel snapped to the hour rounds to +1 hour.
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: { unit: 'hour', increment: 1 },
      entries: [a],
      dxPx: 65,
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T15:00:00Z'), instant('2026-06-15T17:00:00Z')),
    );
  });

  it('moves every entry in a multi-selection by the same whole-unit step, rigidly', () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const b = entry('b', '2026-06-16T09:00:00Z', '2026-06-16T12:00:00Z');
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: { unit: 'hour', increment: 1 },
      entries: [a, b],
      dxPx: 65,
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T15:00:00Z'), instant('2026-06-15T17:00:00Z')),
    );
    expect(draft.get(b.id)).toEqual(
      singleSegmentEdit('b', instant('2026-06-16T10:00:00Z'), instant('2026-06-16T13:00:00Z')),
    );
  });

  it("falls back to raw millisecond delta when snap is 'none'", () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForMove({ zone: ZONE, scale, snap: 'none', entries: [a], dxPx: 30 });
    // 30px at 1px/min = 30 minutes.
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T14:30:00Z'), instant('2026-06-15T16:30:00Z')),
    );
  });

  it('steps by whole calendar days across a spring-forward DST transition, preserving wall time', () => {
    // America/New_York spring-forward is 2026-03-08 02:00 local. A day-snapped drag of 1 day from
    // noon March 7 (EST) must land on noon March 8 (already EDT by then) — 23 real hours later, not
    // 24 — so the wall-clock hour survives the transition instead of drifting with it.
    const a = entry('a', '2026-03-07T17:00:00Z', '2026-03-07T19:00:00Z'); // 12:00-14:00 EST
    const target = instant('2026-03-08T16:00:00Z'); // 12:00 EDT
    const dxPx = scale.xForInstant(target) - scale.xForInstant(a.start!);
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: { unit: 'day', increment: 1 },
      entries: [a],
      dxPx,
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-03-08T16:00:00Z'), instant('2026-03-08T18:00:00Z')), // 12:00-14:00 EDT
    );
  });
});

describe('draftForResize', () => {
  it('returns an empty map when there are no entries', () => {
    const draft = draftForResize({ zone: ZONE, scale, snap: 'none', entries: [], dxPx: 100, edge: 'end' });
    expect(draft.size).toBe(0);
  });

  it('moves only the dragged edge, holding the other fixed', () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: { unit: 'hour', increment: 1 },
      entries: [a],
      dxPx: 65, // snaps to +1 hour
      edge: 'end',
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T14:00:00Z'), instant('2026-06-15T17:00:00Z')),
    );
  });

  it('resizes the start edge, holding end fixed', () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: { unit: 'hour', increment: 1 },
      entries: [a],
      dxPx: -65, // snaps to -1 hour
      edge: 'start',
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T13:00:00Z'), instant('2026-06-15T16:00:00Z')),
    );
  });

  it('clamps the end edge at zero length instead of crossing start (inverted span refused)', () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [a],
      dxPx: -300, // 300 minutes back, well past start
      edge: 'end',
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T14:00:00Z'), instant('2026-06-15T14:00:00Z')),
    );
  });

  it('clamps the start edge at zero length instead of crossing end (inverted span refused)', () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [a],
      dxPx: 300, // 300 minutes forward, well past end
      edge: 'start',
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T16:00:00Z'), instant('2026-06-15T16:00:00Z')),
    );
  });

  it('moves the envelope edge of a segmented entry, leaving its other Segments alone (#200)', () => {
    // Authored out of order on purpose: the envelope edge is a comparison, never index 0.
    const segmented: StoredEntry = {
      ...entry('seg', '2026-06-15T14:00:00Z', '2026-06-17T00:00:00Z'),
      segments: [
        {
          id: segmentId('seg-later'),
          start: instant('2026-06-16T09:00:00Z'),
          end: instant('2026-06-17T00:00:00Z'),
        },
        {
          id: segmentId('seg-earlier'),
          start: instant('2026-06-15T14:00:00Z'),
          end: instant('2026-06-16T00:00:00Z'),
        },
      ],
    };

    const grown = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
      edge: 'end',
    });
    expect(grown.get(segmented.id)).toEqual({
      __brand: 'ProposedEdit',
      props: {},
      proposedKeys: new Set(['segments', 'start', 'end']),
      segments: [{ ...segmented.segments[0], end: instant('2026-06-17T00:30:00Z') }, segmented.segments[1]],
      start: instant('2026-06-15T14:00:00Z'),
      end: instant('2026-06-17T00:30:00Z'),
    });

    const pulled = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: -30,
      edge: 'start',
    });
    expect(pulled.get(segmented.id)).toEqual({
      __brand: 'ProposedEdit',
      props: {},
      proposedKeys: new Set(['segments', 'start', 'end']),
      segments: [segmented.segments[0], { ...segmented.segments[1], start: instant('2026-06-15T13:30:00Z') }],
      start: instant('2026-06-15T13:30:00Z'),
      end: instant('2026-06-17T00:00:00Z'),
    });
  });

  it('clamps a segmented entry at its own edge Segment, never inverting it (#200)', () => {
    const segmented: StoredEntry = {
      ...entry('seg', '2026-06-15T14:00:00Z', '2026-06-17T00:00:00Z'),
      segments: [
        {
          id: segmentId('seg-earlier'),
          start: instant('2026-06-15T14:00:00Z'),
          end: instant('2026-06-16T00:00:00Z'),
        },
        {
          id: segmentId('seg-later'),
          start: instant('2026-06-16T09:00:00Z'),
          end: instant('2026-06-17T00:00:00Z'),
        },
      ],
    };
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: -3000, // far past the latest Segment's own start
      edge: 'end',
    });
    expect(draft.get(segmented.id)).toEqual({
      __brand: 'ProposedEdit',
      props: {},
      proposedKeys: new Set(['segments', 'start', 'end']),
      segments: [segmented.segments[0], { ...segmented.segments[1], end: instant('2026-06-16T09:00:00Z') }],
      start: instant('2026-06-15T14:00:00Z'),
      end: instant('2026-06-16T09:00:00Z'),
    });
  });

  it('resizes every entry in a multi-selection by the same whole-unit step, rigidly', () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const b = entry('b', '2026-06-16T09:00:00Z', '2026-06-16T12:00:00Z');
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: { unit: 'hour', increment: 1 },
      entries: [a, b],
      dxPx: 65,
      edge: 'end',
    });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T14:00:00Z'), instant('2026-06-15T17:00:00Z')),
    );
    expect(draft.get(b.id)).toEqual(
      singleSegmentEdit('b', instant('2026-06-16T09:00:00Z'), instant('2026-06-16T13:00:00Z')),
    );
  });

  it("falls back to raw millisecond delta when snap is 'none'", () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForResize({ zone: ZONE, scale, snap: 'none', entries: [a], dxPx: 30, edge: 'end' });
    expect(draft.get(a.id)).toEqual(
      singleSegmentEdit('a', instant('2026-06-15T14:00:00Z'), instant('2026-06-15T16:30:00Z')),
    );
  });
});

function envelopeEdit(start: Instant | undefined, end: Instant | undefined): ProposedEdit {
  return {
    __brand: 'ProposedEdit',
    props: {},
    proposedKeys: new Set(['start', 'end']),
    start,
    end,
  };
}

describe('previewOffsets', () => {
  const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
  const b = entry('b', '2026-06-16T09:00:00Z', '2026-06-16T12:00:00Z');

  it('reports dx/dWidth for a proposed edit, diffed against the committed entry', () => {
    const proposed = new Map([
      [a.id, envelopeEdit(instant('2026-06-15T15:00:00Z'), instant('2026-06-15T17:00:00Z'))],
    ]);
    const [preview] = previewOffsets({ proposed, extra: new Map(), entries: [a], scale });
    expect(preview).toEqual({ itemId: itemId(a.id), dx: 60, dWidth: 0, extra: false });
  });

  it('reports a width delta when the edit changes duration', () => {
    const proposed = new Map([[a.id, envelopeEdit(a.start, instant('2026-06-15T18:00:00Z'))]]);
    const [preview] = previewOffsets({ proposed, extra: new Map(), entries: [a], scale });
    expect(preview).toEqual({ itemId: itemId(a.id), dx: 0, dWidth: 120, extra: false });
  });

  it('marks entries from the extra map as extra: true', () => {
    const extra = new Map([
      [b.id, envelopeEdit(instant('2026-06-16T10:00:00Z'), instant('2026-06-16T13:00:00Z'))],
    ]);
    const [preview] = previewOffsets({ proposed: new Map(), extra, entries: [b], scale });
    expect(preview).toEqual({ itemId: itemId(b.id), dx: 60, dWidth: 0, extra: true });
  });

  it('skips an id with no matching original entry', () => {
    const proposed = new Map([[entryId('missing'), envelopeEdit(a.start, a.end)]]);
    const previews = previewOffsets({ proposed, extra: new Map(), entries: [a], scale });
    expect(previews).toEqual([]);
  });
});

describe('draftForMove — segments (S4.10, D-S4-30)', () => {
  const segmented: StoredEntry = {
    ...entry('seg', '2026-06-15T14:00:00Z', '2026-06-20T00:00:00Z'),
    segments: [
      {
        id: segmentId('seg-0'),
        start: instant('2026-06-15T14:00:00Z'),
        end: instant('2026-06-16T00:00:00Z'),
      },
      {
        id: segmentId('seg-1'),
        start: instant('2026-06-16T09:00:00Z'),
        end: instant('2026-06-17T00:00:00Z'),
      },
      {
        id: segmentId('seg-2'),
        start: instant('2026-06-17T12:00:00Z'),
        end: instant('2026-06-20T00:00:00Z'),
      },
    ],
  };

  it('moves every segment by the same delta and rewrites the envelope (#200)', () => {
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
    });
    const edit = draft.get(segmented.id)!;
    expect(edit.segments).toEqual([
      {
        ...segmented.segments[0],
        start: instant('2026-06-15T14:30:00Z'),
        end: instant('2026-06-16T00:30:00Z'),
      },
      {
        ...segmented.segments[1],
        start: instant('2026-06-16T09:30:00Z'),
        end: instant('2026-06-17T00:30:00Z'),
      },
      {
        ...segmented.segments[2],
        start: instant('2026-06-17T12:30:00Z'),
        end: instant('2026-06-20T00:30:00Z'),
      },
    ]);
    expect(edit.start).toEqual(instant('2026-06-15T14:30:00Z'));
    expect(edit.end).toEqual(instant('2026-06-20T00:30:00Z'));
  });

  it('moves a single-segment entry, writing its one Segment alongside start/end', () => {
    const single = entry('one', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForMove({ zone: ZONE, scale, snap: 'none', entries: [single], dxPx: 30 });
    expect(draft.get(single.id)).toEqual(
      singleSegmentEdit('one', instant('2026-06-15T14:30:00Z'), instant('2026-06-15T16:30:00Z')),
    );
  });

  it('writes segments for a one-segment entry so the store does not throw (D3)', () => {
    const one: StoredEntry = {
      ...entry('t1', '2026-06-15T14:00:00Z', '2026-06-16T00:00:00Z'),
      segments: [
        {
          id: segmentId('t1-0'),
          start: instant('2026-06-15T14:00:00Z'),
          end: instant('2026-06-16T00:00:00Z'),
        },
      ],
    };
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [one],
      dxPx: 30,
    });
    const edit = draft.get(one.id)!;
    expect(edit.segments).toEqual([
      { ...one.segments[0], start: instant('2026-06-15T14:30:00Z'), end: instant('2026-06-16T00:30:00Z') },
    ]);
    expect(edit.start).toEqual(instant('2026-06-15T14:30:00Z'));
    expect(edit.end).toEqual(instant('2026-06-16T00:30:00Z'));
  });

  it('moves every segment of a co-selected segmented entry as one span (D-S4-30)', () => {
    const grabbed = entry('g', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const other: StoredEntry = {
      ...entry('o', '2026-06-16T09:00:00Z', '2026-06-18T00:00:00Z'),
      segments: [
        {
          id: segmentId('o-0'),
          start: instant('2026-06-16T09:00:00Z'),
          end: instant('2026-06-17T00:00:00Z'),
        },
        {
          id: segmentId('o-1'),
          start: instant('2026-06-17T12:00:00Z'),
          end: instant('2026-06-18T00:00:00Z'),
        },
      ],
    };
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [grabbed, other],
      dxPx: 30,
    });
    expect(draft.get(other.id)?.segments).toEqual([
      { ...other.segments[0], start: instant('2026-06-16T09:30:00Z'), end: instant('2026-06-17T00:30:00Z') },
      { ...other.segments[1], start: instant('2026-06-17T12:30:00Z'), end: instant('2026-06-18T00:30:00Z') },
    ]);
  });
});

describe('draftForMove/draftForResize — the Selection picks the Segments (#211, #212)', () => {
  const segmented: StoredEntry = {
    ...entry('seg', '2026-06-15T14:00:00Z', '2026-06-20T00:00:00Z'),
    segments: [
      {
        id: segmentId('seg-0'),
        start: instant('2026-06-15T14:00:00Z'),
        end: instant('2026-06-16T00:00:00Z'),
      },
      {
        id: segmentId('seg-1'),
        start: instant('2026-06-16T09:00:00Z'),
        end: instant('2026-06-17T00:00:00Z'),
      },
      {
        id: segmentId('seg-2'),
        start: instant('2026-06-17T12:00:00Z'),
        end: instant('2026-06-20T00:00:00Z'),
      },
    ],
  };

  it('move: a Selection of one Segment moves that Segment only and rewrites the envelope', () => {
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
      selectedSegmentIds: new Set([segmentId('seg-1')]),
    });
    const edit = draft.get(segmented.id)!;
    expect(edit.segments).toEqual([
      segmented.segments[0],
      {
        ...segmented.segments[1],
        start: instant('2026-06-16T09:30:00Z'),
        end: instant('2026-06-17T00:30:00Z'),
      },
      segmented.segments[2],
    ]);
    // The envelope follows the moved Segment's new end, the untouched Segments' own extent.
    expect(edit.start).toEqual(instant('2026-06-15T14:00:00Z'));
    expect(edit.end).toEqual(instant('2026-06-20T00:00:00Z'));
  });

  it('move: several Entries each move their own selected Segment, or whole when none is selected', () => {
    const other: StoredEntry = {
      ...entry('other', '2026-06-15T14:00:00Z', '2026-06-18T00:00:00Z'),
      segments: [
        {
          id: segmentId('other-0'),
          start: instant('2026-06-15T14:00:00Z'),
          end: instant('2026-06-16T00:00:00Z'),
        },
        {
          id: segmentId('other-1'),
          start: instant('2026-06-17T00:00:00Z'),
          end: instant('2026-06-18T00:00:00Z'),
        },
      ],
    };
    // A ctrl-click multi-selection: the Selection holds `segmented`'s first Segment and none of
    // `other`'s.
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented, other],
      dxPx: 30,
      selectedSegmentIds: new Set([segmentId('seg-0')]),
    });
    expect(draft.get(segmented.id)?.segments).toEqual([
      {
        ...segmented.segments[0],
        start: instant('2026-06-15T14:30:00Z'),
        end: instant('2026-06-16T00:30:00Z'),
      },
      segmented.segments[1],
      segmented.segments[2],
    ]);
    // No Segment of `other` is selected, so every one of them moves by the same rigid-group delta
    // (D-S3-19).
    expect(draft.get(other.id)?.segments).toEqual([
      { ...other.segments[0], start: instant('2026-06-15T14:30:00Z'), end: instant('2026-06-16T00:30:00Z') },
      { ...other.segments[1], start: instant('2026-06-17T00:30:00Z'), end: instant('2026-06-18T00:30:00Z') },
    ]);
  });

  it('move: two segmented Entries each with one Segment selected move only those two bars', () => {
    // The exact case a ctrl-click multi-selection paints: exactly one bar per Entry lights up, so
    // exactly one bar per Entry must move — never the other four Segments across the two Entries.
    const other: StoredEntry = {
      ...entry('other', '2026-06-15T14:00:00Z', '2026-06-18T00:00:00Z'),
      segments: [
        {
          id: segmentId('other-0'),
          start: instant('2026-06-15T14:00:00Z'),
          end: instant('2026-06-16T00:00:00Z'),
        },
        {
          id: segmentId('other-1'),
          start: instant('2026-06-17T00:00:00Z'),
          end: instant('2026-06-18T00:00:00Z'),
        },
      ],
    };
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented, other],
      dxPx: 30,
      selectedSegmentIds: new Set([segmentId('seg-1'), segmentId('other-0')]),
    });
    expect(draft.get(segmented.id)?.segments).toEqual([
      segmented.segments[0],
      {
        ...segmented.segments[1],
        start: instant('2026-06-16T09:30:00Z'),
        end: instant('2026-06-17T00:30:00Z'),
      },
      segmented.segments[2],
    ]);
    expect(draft.get(other.id)?.segments).toEqual([
      { ...other.segments[0], start: instant('2026-06-15T14:30:00Z'), end: instant('2026-06-16T00:30:00Z') },
      other.segments[1],
    ]);
  });

  it('resize: one selected Segment writes that Segment edge, never the envelope edge', () => {
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
      edge: 'end',
      selectedSegmentIds: new Set([segmentId('seg-0')]),
    });
    expect(draft.get(segmented.id)).toEqual({
      __brand: 'ProposedEdit',
      props: {},
      proposedKeys: new Set(['segments', 'start', 'end']),
      segments: [
        { ...segmented.segments[0], end: instant('2026-06-16T00:30:00Z') },
        segmented.segments[1],
        segmented.segments[2],
      ],
      start: instant('2026-06-15T14:00:00Z'),
      end: instant('2026-06-20T00:00:00Z'),
    });
  });

  it('resize: several Entries use each own selected edge, else the envelope edge, same delta', () => {
    const other: StoredEntry = {
      ...entry('other', '2026-06-15T14:00:00Z', '2026-06-18T00:00:00Z'),
      segments: [
        {
          id: segmentId('other-0'),
          start: instant('2026-06-15T14:00:00Z'),
          end: instant('2026-06-16T00:00:00Z'),
        },
        {
          id: segmentId('other-1'),
          start: instant('2026-06-17T00:00:00Z'),
          end: instant('2026-06-18T00:00:00Z'),
        },
      ],
    };
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented, other],
      dxPx: 30,
      edge: 'end',
      selectedSegmentIds: new Set([segmentId('seg-0')]),
    });
    // The Selection holds `segmented`'s first Segment — its own edge moves, not the envelope's.
    expect(draft.get(segmented.id)?.segments).toEqual([
      { ...segmented.segments[0], end: instant('2026-06-16T00:30:00Z') },
      segmented.segments[1],
      segmented.segments[2],
    ]);
    // No Segment of `other` is selected — the envelope edge (its latest Segment's end) moves instead.
    expect(draft.get(other.id)?.segments).toEqual([
      other.segments[0],
      { ...other.segments[1], end: instant('2026-06-18T00:30:00Z') },
    ]);
  });

  it('resize: a multi-Segment Selection moves only the Segment holding the dragged edge (#212)', () => {
    // Two of three Segments selected. The `end` handle sits on the later of the two, so that one
    // grows and the third Segment — the Entry's own envelope end — never moves.
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
      edge: 'end',
      selectedSegmentIds: new Set([segmentId('seg-0'), segmentId('seg-1')]),
    });
    expect(draft.get(segmented.id)?.segments).toEqual([
      segmented.segments[0],
      { ...segmented.segments[1], end: instant('2026-06-17T00:30:00Z') },
      segmented.segments[2],
    ]);
  });

  it('resize: the dragged start edge is the earliest selected Segment, never the first authored one', () => {
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
      edge: 'start',
      selectedSegmentIds: new Set([segmentId('seg-1'), segmentId('seg-2')]),
    });
    expect(draft.get(segmented.id)?.segments).toEqual([
      segmented.segments[0],
      { ...segmented.segments[1], start: instant('2026-06-16T09:30:00Z') },
      segmented.segments[2],
    ]);
  });

  it('move: a Selection naming no Segment of this Entry moves it whole, not nothing', () => {
    // A multi-Entry drag reaches an Entry the Selection says nothing about, and a hover resize
    // grabs a bar nobody selected. Both must fall back to the whole Entry, never to a no-op.
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
      selectedSegmentIds: new Set([segmentId('nothing-here')]),
    });
    expect(draft.get(segmented.id)?.segments).toEqual([
      {
        ...segmented.segments[0],
        start: instant('2026-06-15T14:30:00Z'),
        end: instant('2026-06-16T00:30:00Z'),
      },
      {
        ...segmented.segments[1],
        start: instant('2026-06-16T09:30:00Z'),
        end: instant('2026-06-17T00:30:00Z'),
      },
      {
        ...segmented.segments[2],
        start: instant('2026-06-17T12:30:00Z'),
        end: instant('2026-06-20T00:30:00Z'),
      },
    ]);
  });

  it('resize: a Selection naming no Segment of this Entry uses the envelope edge, not a no-op', () => {
    const draft = draftForResize({
      zone: ZONE,
      scale,
      snap: 'none',
      entries: [segmented],
      dxPx: 30,
      edge: 'end',
      selectedSegmentIds: new Set([segmentId('nothing-here')]),
    });
    // Nothing of this Entry is selected, so the envelope edge (the latest Segment's end) moves.
    expect(draft.get(segmented.id)?.segments).toEqual([
      segmented.segments[0],
      segmented.segments[1],
      { ...segmented.segments[2], end: instant('2026-06-20T00:30:00Z') },
    ]);
  });
});

describe('previewOffsets — segments (S4.10)', () => {
  it('offsets each segment item independently', () => {
    const segmented: StoredEntry = {
      ...entry('seg', '2026-06-15T14:00:00Z', '2026-06-20T00:00:00Z'),
      segments: [
        {
          id: segmentId('seg-0'),
          start: instant('2026-06-15T14:00:00Z'),
          end: instant('2026-06-16T00:00:00Z'),
        },
        {
          id: segmentId('seg-1'),
          start: instant('2026-06-16T09:00:00Z'),
          end: instant('2026-06-17T00:00:00Z'),
        },
      ],
    };
    const proposed: ProposedEdits = new Map([
      [
        segmented.id,
        {
          __brand: 'ProposedEdit',
          props: {},
          proposedKeys: new Set(['segments', 'start', 'end']),
          segments: [
            segmented.segments[0]!,
            {
              ...segmented.segments[1]!,
              start: instant('2026-06-16T10:00:00Z'),
              end: instant('2026-06-17T01:00:00Z'),
            },
          ],
          start: segmented.start,
          end: instant('2026-06-20T00:00:00Z'),
        },
      ],
    ]);
    const previews = previewOffsets({ proposed, extra: new Map(), entries: [segmented], scale });
    expect(previews).toEqual([
      { itemId: itemId(segmented.id, 0), dx: 0, dWidth: 0, extra: false },
      { itemId: itemId(segmented.id, 1), dx: 60, dWidth: 0, extra: false },
    ]);
  });
});

describe('cursorLabelForX (S3.8, D-S3-15)', () => {
  it('snaps before format, in a non-UTC zone', () => {
    // 23:50 EDT on 14 Jun (2026-06-15T03:50:00Z) is 10 minutes from 15 Jun 00:00 EDT, so a day
    // snap rounds forward. Unsnapped formatDate would still read 14 Jun.
    const x = scale.xForInstant(instant('2026-06-15T03:50:00Z'));
    expect(cursorLabelForX(x, scale, { unit: 'day', increment: 1 })).toBe('Jun 15, 2026');
    expect(cursorLabelForX(x, scale, 'none')).toBe('Jun 14, 2026');
  });
});
