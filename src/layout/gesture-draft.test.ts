import { describe, expect, it } from 'vitest';
import { cursorLabelForX, draftForMove, draftForResize, previewOffsets } from './gesture-draft.js';
import type { Entry } from '../model/index.js';
import { entryId, itemId } from '../model/index.js';
import { instant, createTimeScale, MS } from '../time/index.js';

const ZONE = 'America/New_York';
const scale = createTimeScale({
  timeZone: ZONE,
  range: { start: instant('2026-06-01T00:00:00Z'), end: instant('2026-07-01T00:00:00Z') },
  pxPerMs: 1 / MS.MINUTE, // 1px per minute
});

function entry(id: string, start: string, end: string): Entry {
  return { id: entryId(id), kind: 'span', name: id, start: instant(start), end: instant(end) };
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
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T15:00:00Z'),
      end: instant('2026-06-15T17:00:00Z'),
    });
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
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T15:00:00Z'),
      end: instant('2026-06-15T17:00:00Z'),
    });
    expect(draft.get(b.id)).toEqual({
      start: instant('2026-06-16T10:00:00Z'),
      end: instant('2026-06-16T13:00:00Z'),
    });
  });

  it("falls back to raw millisecond delta when snap is 'none'", () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForMove({ zone: ZONE, scale, snap: 'none', entries: [a], dxPx: 30 });
    // 30px at 1px/min = 30 minutes.
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T14:30:00Z'),
      end: instant('2026-06-15T16:30:00Z'),
    });
  });

  it('steps by whole calendar days across a spring-forward DST transition, preserving wall time', () => {
    // America/New_York spring-forward is 2026-03-08 02:00 local. A day-snapped drag of 1 day from
    // noon March 7 (EST) must land on noon March 8 (already EDT by then) — 23 real hours later, not
    // 24 — so the wall-clock hour survives the transition instead of drifting with it.
    const a = entry('a', '2026-03-07T17:00:00Z', '2026-03-07T19:00:00Z'); // 12:00-14:00 EST
    const target = instant('2026-03-08T16:00:00Z'); // 12:00 EDT
    const dxPx = scale.xForInstant(target) - scale.xForInstant(a.start);
    const draft = draftForMove({
      zone: ZONE,
      scale,
      snap: { unit: 'day', increment: 1 },
      entries: [a],
      dxPx,
    });
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-03-08T16:00:00Z'), // 12:00 EDT
      end: instant('2026-03-08T18:00:00Z'), // 14:00 EDT
    });
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
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T14:00:00Z'),
      end: instant('2026-06-15T17:00:00Z'),
    });
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
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T13:00:00Z'),
      end: instant('2026-06-15T16:00:00Z'),
    });
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
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T14:00:00Z'),
      end: instant('2026-06-15T14:00:00Z'),
    });
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
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T16:00:00Z'),
      end: instant('2026-06-15T16:00:00Z'),
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
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T14:00:00Z'),
      end: instant('2026-06-15T17:00:00Z'),
    });
    expect(draft.get(b.id)).toEqual({
      start: instant('2026-06-16T09:00:00Z'),
      end: instant('2026-06-16T13:00:00Z'),
    });
  });

  it("falls back to raw millisecond delta when snap is 'none'", () => {
    const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
    const draft = draftForResize({ zone: ZONE, scale, snap: 'none', entries: [a], dxPx: 30, edge: 'end' });
    expect(draft.get(a.id)).toEqual({
      start: instant('2026-06-15T14:00:00Z'),
      end: instant('2026-06-15T16:30:00Z'),
    });
  });
});

describe('previewOffsets', () => {
  const a = entry('a', '2026-06-15T14:00:00Z', '2026-06-15T16:00:00Z');
  const b = entry('b', '2026-06-16T09:00:00Z', '2026-06-16T12:00:00Z');

  it('reports dx/dWidth for a proposed edit, diffed against the committed entry', () => {
    const proposed = new Map([
      [a.id, { start: instant('2026-06-15T15:00:00Z'), end: instant('2026-06-15T17:00:00Z') }],
    ]);
    const [preview] = previewOffsets({ proposed, extra: new Map(), entries: [a], scale });
    expect(preview).toEqual({ itemId: itemId(a.id), dx: 60, dWidth: 0, extra: false });
  });

  it('reports a width delta when the edit changes duration', () => {
    const proposed = new Map([[a.id, { start: a.start, end: instant('2026-06-15T18:00:00Z') }]]);
    const [preview] = previewOffsets({ proposed, extra: new Map(), entries: [a], scale });
    expect(preview).toEqual({ itemId: itemId(a.id), dx: 0, dWidth: 120, extra: false });
  });

  it('marks entries from the extra map as extra: true', () => {
    const extra = new Map([
      [b.id, { start: instant('2026-06-16T10:00:00Z'), end: instant('2026-06-16T13:00:00Z') }],
    ]);
    const [preview] = previewOffsets({ proposed: new Map(), extra, entries: [b], scale });
    expect(preview).toEqual({ itemId: itemId(b.id), dx: 60, dWidth: 0, extra: true });
  });

  it('skips an id with no matching original entry', () => {
    const proposed = new Map([[entryId('missing'), { start: a.start, end: a.end }]]);
    const previews = previewOffsets({ proposed, extra: new Map(), entries: [a], scale });
    expect(previews).toEqual([]);
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
