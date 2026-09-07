import { describe, expect, it, vi } from 'vitest';
import { GesturePipeline } from './gesture-pipeline.js';
import type { GesturePipelineDeps } from './gesture-pipeline.js';
import { SegmentsOutOfSyncError, entryId, itemId, segmentId } from '../model/index.js';
import type { Entry, EntryId, ErrorReportInput, Instant, StoredEdits } from '../model/index.js';
import type { TimeScale, ViewPreset } from '../layout/index.js';
import { reconcileExtenderEdits } from '../data/entry-reader.js';

/** `view/` may not import `time/` (I1) — a linear px<->ms fake stands in for the bound `TimeScale`;
 *  paired with `snap: () => 'none'` (the default dep below) this is exactly what
 *  `draftForMove`/`draftForResize` read (`scale.xForInstant`/`scale.instantForX`), so the real
 *  `layout/gesture-draft.ts` math still runs unmocked. */
const linearScale: TimeScale = {
  range: { start: 0 as Instant, end: 1000 as Instant },
  timeZone: 'UTC',
  pxPerMs: 1,
  xForInstant: (i) => i,
  instantForX: (x) => x as Instant,
  widthForDuration: () => 0,
  ticks: () => [],
  contentWidth: 1000,
};

/** D-S3-24: the pipeline asks `deps.snap()` what a drag snaps to, so a fake preset carries no snap
 *  of its own. This one stands in wherever only the tick unit is unused. */
const barePreset = {} as unknown as ViewPreset;

function entry(id: string, start: number, end: number): Entry {
  const startInstant = start as Instant;
  const endInstant = end as Instant;
  return {
    id: entryId(id),
    kind: 'span',
    name: id,
    start: startInstant,
    end: endInstant,
    segments: [{ id: segmentId(`${id}-1`), start: startInstant, end: endInstant }],
  };
}

function makeDeps(overrides: Partial<GesturePipelineDeps> = {}): {
  deps: GesturePipelineDeps;
  emitted: [string, unknown][];
  applied: unknown[];
  reported: ErrorReportInput[];
} {
  const emitted: [string, unknown][] = [];
  const applied: unknown[] = [];
  const reported: ErrorReportInput[] = [];
  const entries = new Map<EntryId, Entry>();
  const deps: GesturePipelineDeps = {
    timeZone: () => 'UTC',
    timeScale: () => linearScale,
    preset: () => barePreset,
    snap: () => 'none',
    selectedSegmentIds: () => [],
    selectedEntryIds: () => [],
    entryById: (id) => entries.get(id),
    canGesture: () => true,
    commitEntryEdits: () => true,
    emit: (name, payload) => {
      emitted.push([name, payload]);
      return true;
    },
    applyGestureState: (preview) => applied.push(preview),
    raiseError: (report) => reported.push(report),
    ...overrides,
  };
  return { deps, emitted, applied, reported };
}

/** Wires `entryById` off a fixed roster, the shape most tests below want: one grabbed
 *  entry, every capability granted, no multi-selection. */
function withRoster(entries: readonly Entry[], overrides: Partial<GesturePipelineDeps> = {}) {
  const byId = new Map(entries.map((e) => [e.id, e]));
  return makeDeps({ entryById: (id) => byId.get(id), ...overrides });
}

describe('GesturePipeline.session (D-GH-1/D-GH-2)', () => {
  it('returns undefined when the grabbed entry is not capable', () => {
    const { deps } = withRoster([entry('a', 0, 100)], { canGesture: () => false });
    const pipeline = new GesturePipeline(deps);

    expect(pipeline.session(entryId('a'), { kind: 'move' })).toBeUndefined();
  });

  it('returns undefined when the grabbed entry has no dataset row', () => {
    const { deps } = withRoster([], {});
    const pipeline = new GesturePipeline(deps);

    expect(pipeline.session(entryId('missing'), { kind: 'move' })).toBeUndefined();
  });

  it("asks canGesture with 'move' for a move gesture and 'resize' with the grabbed edge for a resize gesture (#142)", () => {
    const canGesture = vi.fn(() => true);
    const { deps } = withRoster([entry('a', 0, 100)], { canGesture });
    const pipeline = new GesturePipeline(deps);

    pipeline.session(entryId('a'), { kind: 'move' });
    expect(canGesture).toHaveBeenCalledWith('move', entryId('a'), undefined);

    pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' });
    expect(canGesture).toHaveBeenCalledWith('resize', entryId('a'), 'end');
  });

  it('arms every capable entry of a multi-selection, grabbed first, and skips an incapable one', () => {
    const a = entry('a', 0, 100);
    const b = entry('b', 100, 200);
    const c = entry('c', 200, 300);
    const checked: EntryId[] = [];
    const { deps } = withRoster([a, b, c], {
      selectedEntryIds: () => [b.id, a.id, c.id],
      canGesture: (_capability, id) => {
        checked.push(id);
        return id !== c.id;
      },
    });
    const pipeline = new GesturePipeline(deps);

    // session() resolves the armed entry set synchronously (D-S3-19/D-S3-22): a first, then the
    // selection in order — b (capable), a (already seen, skipped without a second capability check),
    // c (checked and refused).
    expect(pipeline.session(a.id, { kind: 'move' })).toBeDefined();
    expect(checked).toEqual([a.id, b.id, c.id]);
  });

  it('a multi-select resize checks every co-selected entry against the grabbed edge only, and skips a closed one (#142)', () => {
    const a = entry('a', 0, 100);
    const b = entry('b', 100, 200);
    const c = entry('c', 200, 300);
    const checked: Array<{ id: EntryId; edge: 'start' | 'end' | undefined }> = [];
    const { deps } = withRoster([a, b, c], {
      selectedEntryIds: () => [b.id, a.id, c.id],
      // c's own 'end' Field is closed; a and b stay open. A grab on a's 'end' handle should
      // arm a and b and leave c out, without ever asking about 'start'.
      canGesture: (_capability, id, edge) => {
        checked.push({ id, edge });
        return id !== c.id;
      },
    });
    const pipeline = new GesturePipeline(deps);

    expect(pipeline.session(a.id, { kind: 'resize', edge: 'end' })).toBeDefined();
    expect(checked).toEqual([
      { id: a.id, edge: 'end' },
      { id: b.id, edge: 'end' },
      { id: c.id, edge: 'end' },
    ]);
  });

  it('preview() and commit() move every armed entry of a multi-selection by the same delta', async () => {
    const a = entry('a', 0, 100);
    const b = entry('b', 200, 300);
    const { deps, applied, emitted } = withRoster([a, b], { selectedEntryIds: () => [a.id, b.id] });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(a.id, { kind: 'move' })!;

    session.preview(40);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const preview = applied.at(-1) as readonly { itemId: string; dx: number }[];
    expect(preview).toHaveLength(2);
    expect(preview.map((p) => p.dx)).toEqual([40, 40]);

    const committed = await session.commit(40);
    expect(committed).toBe(true);
    const payload = emitted[0]![1] as { entries: readonly unknown[] };
    expect(payload.entries).toHaveLength(2);
  });

  it('preview() on the end edge grows width and leaves dx at 0', async () => {
    const a = entry('a', 100, 200);
    const { deps, applied } = withRoster([a]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(a.id, { kind: 'resize', edge: 'end' })!;

    session.preview(50);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const preview = applied.at(-1) as readonly { dx: number; dWidth: number }[];
    expect(preview[0]?.dx).toBe(0);
    expect(preview[0]?.dWidth).toBe(50);
  });

  it('moves every bar of a segmented entry with no pick (#211, D-S4-30)', async () => {
    const segmented: Entry = {
      ...entry('seg', 0, 300),
      segments: [
        { id: segmentId('seg-a'), start: 0 as Instant, end: 100 as Instant },
        { id: segmentId('seg-b'), start: 200 as Instant, end: 300 as Instant },
      ],
    };
    const committed: StoredEdits[] = [];
    const { deps, applied } = withRoster([segmented], {
      commitEntryEdits: (edits) => {
        committed.push(edits);
        return true;
      },
    });
    const pipeline = new GesturePipeline(deps);
    // A row click named the Entry with no pick — every Segment steps (#211).
    const session = pipeline.session(segmented.id, { kind: 'move' })!;

    session.preview(40);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const preview = applied.at(-1) as readonly { itemId: string; dx: number }[];
    expect(preview.map((p) => p.dx)).toEqual([40, 40]);

    await session.commit(40);
    expect(committed[0]?.get(segmented.id)).toEqual({
      segments: [
        { ...segmented.segments[0], start: 40, end: 140 },
        { ...segmented.segments[1], start: 240, end: 340 },
      ],
      start: 40,
      end: 340,
    });
  });

  it('moves only the selected bar of a segmented entry, envelope follows (#211, #212)', async () => {
    const segmented: Entry = {
      ...entry('seg', 0, 300),
      segments: [
        { id: segmentId('seg-a'), start: 0 as Instant, end: 100 as Instant },
        { id: segmentId('seg-b'), start: 200 as Instant, end: 300 as Instant },
      ],
    };
    const committed: StoredEdits[] = [];
    const { deps, applied } = withRoster([segmented], {
      selectedSegmentIds: () => [segmentId('seg-b')],
      commitEntryEdits: (edits) => {
        committed.push(edits);
        return true;
      },
    });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(segmented.id, { kind: 'move' })!;

    session.preview(40);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // Both bars preview — but only the selected one (Segment 1) carries a dx; Segment 0 stays put.
    const preview = applied.at(-1) as readonly { itemId: string; dx: number }[];
    expect(preview).toEqual([
      { itemId: itemId(segmented.id, 0), dx: 0, dWidth: 0, extra: false },
      { itemId: itemId(segmented.id, 1), dx: 40, dWidth: 0, extra: false },
    ]);

    await session.commit(40);
    expect(committed[0]?.get(segmented.id)).toEqual({
      segments: [segmented.segments[0], { ...segmented.segments[1], start: 240, end: 340 }],
      start: 0,
      end: 340,
    });
  });

  it('a multi-Entry drag moves each Entry’s own selected Segment, or whole when none is (#211)', async () => {
    const picked: Entry = {
      ...entry('picked', 0, 200),
      segments: [
        { id: segmentId('picked-a'), start: 0 as Instant, end: 100 as Instant },
        { id: segmentId('picked-b'), start: 100 as Instant, end: 200 as Instant },
      ],
    };
    const unpicked: Entry = {
      ...entry('unpicked', 300, 500),
      segments: [
        { id: segmentId('unpicked-a'), start: 300 as Instant, end: 400 as Instant },
        { id: segmentId('unpicked-b'), start: 400 as Instant, end: 500 as Instant },
      ],
    };
    const committed: StoredEdits[] = [];
    const { deps } = withRoster([picked, unpicked], {
      selectedEntryIds: () => [picked.id, unpicked.id],
      selectedSegmentIds: () => [segmentId('picked-b')],
      commitEntryEdits: (edits) => {
        committed.push(edits);
        return true;
      },
    });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(picked.id, { kind: 'move' })!;

    await session.commit(40);
    expect(committed[0]?.get(picked.id)?.segments).toEqual([
      picked.segments[0],
      { ...picked.segments[1], start: 140, end: 240 },
    ]);
    // No Segment of `unpicked` is selected, so both move by the same rigid-group delta (D-S3-19).
    expect(committed[0]?.get(unpicked.id)?.segments).toEqual([
      { ...unpicked.segments[0], start: 340, end: 440 },
      { ...unpicked.segments[1], start: 440, end: 540 },
    ]);
  });

  it('a resize on a selected Segment writes only that Segment’s edge (#211, #212)', async () => {
    const segmented: Entry = {
      ...entry('seg', 0, 300),
      segments: [
        { id: segmentId('seg-a'), start: 0 as Instant, end: 100 as Instant },
        { id: segmentId('seg-b'), start: 200 as Instant, end: 300 as Instant },
      ],
    };
    const committed: StoredEdits[] = [];
    const { deps } = withRoster([segmented], {
      selectedSegmentIds: () => [segmentId('seg-a')],
      commitEntryEdits: (edits) => {
        committed.push(edits);
        return true;
      },
    });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(segmented.id, { kind: 'resize', edge: 'end' })!;

    await session.commit(40);
    // The selected Segment (0) grows; the envelope-latest Segment (1) never moves.
    expect(committed[0]?.get(segmented.id)).toEqual({
      segments: [{ ...segmented.segments[0], start: 0, end: 140 }, segmented.segments[1]],
      start: 0,
      end: 300,
    });
  });

  it('a milestone grab is refused through canGesture, not a kind check in the pipeline', () => {
    const milestone: Entry = { ...entry('m', 50, 50), kind: 'milestone' };
    const { deps } = withRoster([milestone], { canGesture: () => false });
    const pipeline = new GesturePipeline(deps);

    expect(pipeline.session(milestone.id, { kind: 'move' })).toBeUndefined();
  });

  it('preview() moves a single entry by raw px delta when snap is none', async () => {
    const { deps, applied } = withRoster([entry('a', 100, 200)]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    session.preview(50);
    expect(applied).toEqual([]); // rAF-coalesced, not applied synchronously

    await new Promise((resolve) => requestAnimationFrame(resolve));
    const preview = applied.at(-1) as readonly { itemId: string; dx: number; dWidth: number }[];
    expect(preview).toHaveLength(1);
    expect(preview[0]?.dx).toBe(50);
    expect(preview[0]?.dWidth).toBe(0);
  });

  it('resizes the start edge, clamped so it never crosses the end', async () => {
    const a = entry('a', 100, 200);
    const { deps, applied } = withRoster([a]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(a.id, { kind: 'resize', edge: 'start' })!;

    session.preview(150); // would push start past end — clamped in layout/gesture-draft.ts
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const preview = applied.at(-1) as readonly { dx: number; dWidth: number }[];
    // Clamped to the fixed end (200): start moves the full remaining span, width collapses to 0.
    expect(preview[0]?.dx).toBe(100);
    expect(preview[0]?.dWidth).toBe(-100);
  });

  it('passes suspendSnap through to the resolved preset snap', async () => {
    const preset = vi.fn(() => ({ snap: 'tick', tickUnit: 'hour', tickIncrement: 1 }) as ViewPreset);
    const { deps, applied } = withRoster([entry('a', 0, 100)], { preset });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    // suspendSnap: true always falls back to raw px, bypassing the tick preset entirely.
    session.preview(37, { suspendSnap: true });
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const preview = applied.at(-1) as readonly { dx: number }[];
    expect(preview[0]?.dx).toBe(37);
  });

  it('coalesces several preview() calls into one applyGestureState call, with only the last draft', async () => {
    const { deps, applied } = withRoster([entry('a', 0, 100)]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    session.preview(10);
    session.preview(20);
    expect(applied).toEqual([]);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(applied).toHaveLength(1);
    const preview = applied[0] as readonly { dx: number }[];
    expect(preview[0]?.dx).toBe(20);
  });

  it('commit() on a move gesture fires beforeEntryMove, writes, then entryMove', async () => {
    const { deps, emitted } = withRoster([entry('a', 100, 200)]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    const committed = await session.commit(50);

    expect(committed).toBe(true);
    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove', 'entryMove']);
    // #210/T1-2: `Refusable` belongs to the `before*` payload alone (event-bus.ts's map types
    // `entryMove` without it) — the after-payload must not carry a stray `refuse`.
    expect(emitted[0]![1]).toHaveProperty('refuse');
    expect(emitted[1]![1]).not.toHaveProperty('refuse');
  });

  it('commit() on a resize gesture fires beforeEntryResize/entryResize, carrying the grabbed edge', async () => {
    const { deps, emitted } = withRoster([entry('a', 100, 200)]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' })!;

    await session.commit(50);

    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryResize', 'entryResize']);
    expect((emitted[0]![1] as { edge: string }).edge).toBe('end');
    // T1-2: `edge` stays on both resize payloads; only the before-payload carries `refuse`.
    expect((emitted[1]![1] as { edge: string }).edge).toBe('end');
    expect(emitted[0]![1]).toHaveProperty('refuse');
    expect(emitted[1]![1]).not.toHaveProperty('refuse');
  });

  it('a sync veto (beforeEntryMove returning false) skips the write and resolves commit() false', async () => {
    const { deps, emitted } = withRoster([entry('a', 100, 200)], {
      emit: ((name: string, payload: unknown) => {
        emitted.push([name, payload]);
        return name === 'beforeEntryMove' ? false : undefined;
      }) as GesturePipelineDeps['emit'],
    });
    const commitEntryEdits = vi.fn(() => true);
    const pipeline = new GesturePipeline({ ...deps, commitEntryEdits });
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    const committed = await session.commit(50);

    expect(committed).toBe(false);
    expect(commitEntryEdits).not.toHaveBeenCalled();
    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove']);
  });

  it('a vetoed drag draws nothing, throws nothing, and raises one Error report (D-S5-40)', async () => {
    const { deps, reported, applied } = withRoster([entry('a', 100, 200)], {
      emit: ((name: string) =>
        name === 'beforeEntryMove' ? false : undefined) as GesturePipelineDeps['emit'],
    });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    const committed = await session.commit(50);

    expect(committed).toBe(false);
    expect(applied).toEqual([]); // nothing painted: the preview clears on the next frame, not now
    expect(reported).toEqual([
      {
        code: 'entry-move-cancelled',
        message: 'Nothing was saved. A beforeEntryMove handler refused this move.',
        severity: 'info',
        by: 'consumer',
        entryId: entryId('a'),
      },
    ]);
  });

  it('a vetoed drag reports the words the handler refused with (#210)', async () => {
    const { deps, reported } = withRoster([entry('a', 100, 200)], {
      emit: ((name: string, payload: { refuse(reason: string): false }) =>
        name === 'beforeEntryMove'
          ? payload.refuse('The drop is before mobilization.')
          : undefined) as unknown as GesturePipelineDeps['emit'],
    });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    await session.commit(50);

    expect(reported[0]?.reason).toBe('The drop is before mobilization.');
    expect(reported[0]?.message).toBe(
      'Nothing was saved. A beforeEntryMove handler refused this move and said: "The drop is before mobilization.".',
    );
  });

  it('a vetoed resize names the resize event and its own code', async () => {
    const { deps, reported } = withRoster([entry('a', 100, 200)], {
      emit: ((name: string) =>
        name === 'beforeEntryResize' ? false : undefined) as GesturePipelineDeps['emit'],
    });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' })!;

    await session.commit(50);

    expect(reported.map((report) => report.code)).toEqual(['entry-resize-cancelled']);
    expect(reported[0]?.message).toBe('Nothing was saved. A beforeEntryResize handler refused this resize.');
  });

  it('a refused commit reports nothing here — data/transaction.ts already raised it', async () => {
    const { deps, reported } = withRoster([entry('a', 100, 200)], { commitEntryEdits: () => false });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    await session.commit(50);

    expect(reported).toEqual([]);
  });

  it('commitEntryEdits resolving false (async veto already folded by the caller) skips the after-event', async () => {
    const { deps, emitted } = withRoster([entry('a', 100, 200)], { commitEntryEdits: () => false });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    const committed = await session.commit(50);

    expect(committed).toBe(false);
    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove']);
  });

  it('cancel() clears the preview and never commits', async () => {
    const { deps, applied } = withRoster([entry('a', 100, 200)]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    session.preview(50);
    session.cancel();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(applied.at(-1)).toBeUndefined();
  });

  describe('nudge() (S3.5, D-S3-13)', () => {
    /** `tickPreset`/`tickScale` pair a 5-minute tick with a fixed 5-minute px width, so a `direction:
     *  1` nudge is unambiguously "one tick forward" — `linearScale`/`barePreset` above stub
     *  `widthForDuration` to 0, which would make every nudge a no-op. 300_000 (not one of I10's
     *  banned literals: 60_000/3_600_000/86_400_000/604_800_000) is 5 real minutes in ms — this file
     *  is `view/`, which may not import `time/` (view-boundary), so the expected deltas below have to
     *  be spelled out as a literal rather than computed via a `time/` helper. */
    const FIVE_MIN_MS = 300_000;
    const tickPreset = { tickUnit: 'minute', tickIncrement: 5 } as unknown as ViewPreset;
    const tickScale: TimeScale = { ...linearScale, widthForDuration: () => FIVE_MIN_MS };

    it('moves the anchor entry forward one tick on direction: 1', async () => {
      const { deps, emitted } = withRoster([entry('a', 600_000, 900_000)], {
        preset: () => tickPreset,
        snap: () => 'tick',
        timeScale: () => tickScale,
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      await session.nudge(1);

      const payload = emitted[0]![1] as { start: number; end: number };
      expect(payload.start).toBe(600_000 + FIVE_MIN_MS);
      expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove', 'entryMove']);
    });

    it('moves the anchor entry backward one tick on direction: -1', async () => {
      const { deps, emitted } = withRoster([entry('a', 1_200_000, 1_500_000)], {
        preset: () => tickPreset,
        snap: () => 'tick',
        timeScale: () => tickScale,
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      await session.nudge(-1);

      const payload = emitted[0]![1] as { start: number };
      expect(payload.start).toBe(1_200_000 - FIVE_MIN_MS);
    });

    it('resizes the grabbed edge one tick for a resize gesture', async () => {
      const { deps, emitted } = withRoster([entry('a', 600_000, 900_000)], {
        preset: () => tickPreset,
        snap: () => 'tick',
        timeScale: () => tickScale,
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' })!;

      await session.nudge(1);

      const payload = emitted[0]![1] as { end: number };
      expect(payload.end).toBe(900_000 + FIVE_MIN_MS);
      expect(emitted.map(([name]) => name)).toEqual(['beforeEntryResize', 'entryResize']);
    });

    it('suspendSnap still sizes the step off the preset tick, just skips grid alignment', async () => {
      // 150_000 is not a multiple of FIVE_MIN_MS — a plain (snapped) nudge would round it onto the
      // grid; suspendSnap must not.
      const { deps, emitted } = withRoster([entry('a', 150_000, 450_000)], {
        preset: () => tickPreset,
        snap: () => 'tick',
        timeScale: () => tickScale,
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      await session.nudge(1, { suspendSnap: true });

      const payload = emitted[0]![1] as { start: number };
      expect(payload.start).toBe(150_000 + FIVE_MIN_MS);
    });
  });

  describe('async veto and pending (S3.5, D-S3-17)', () => {
    it('an unsettled before* Promise paints pending ids and the commit-draft preview, then clears both', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const paints: { preview: unknown; pending: unknown }[] = [];
      const { deps } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
        applyGestureState: (preview, pendingItemIds) => {
          paints.push({ preview, pending: pendingItemIds });
        },
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      expect(paints).toHaveLength(1);
      expect(paints[0]?.pending).toEqual([itemId(entryId('a'))]);
      const preview = paints[0]?.preview as readonly { dx: number }[];
      expect(preview[0]?.dx).toBe(50);

      resolveVeto(true);
      const committed = await commitPromise;

      expect(committed).toBe(true);
      expect(paints.at(-1)).toEqual({ preview: undefined, pending: undefined });
    });

    it('session() refuses to arm a new gesture while a prior async veto is unsettled', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const { deps } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      void session.commit(50);
      expect(pipeline.session(entryId('a'), { kind: 'move' })).toBeUndefined();

      resolveVeto(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(pipeline.session(entryId('a'), { kind: 'move' })).toBeDefined();
    });

    it('an async veto resolving false commits nothing', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const commitEntryEdits = vi.fn(() => true);
      const { deps } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
        commitEntryEdits,
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      resolveVeto(false);
      const committed = await commitPromise;

      expect(committed).toBe(false);
      expect(commitEntryEdits).not.toHaveBeenCalled();
    });

    it('an async veto resolving false raises one Error report, the same as a sync one', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      resolveVeto(false);
      await commitPromise;

      expect(reported.map((report) => report.code)).toEqual(['entry-move-cancelled']);
    });

    it('[S3-A4] session().preview() calls the injected extraEditsFor and previews its extra as a ghost', async () => {
      const a = entry('a', 100, 200);
      const x = entry('x', 300, 400);
      const requests: unknown[] = [];
      const extraEditsFor: GesturePipelineDeps['extraEditsFor'] = (request) => {
        requests.push(request);
        return new Map([[x.id, { start: 350 as unknown as Instant, end: 450 as unknown as Instant }]]);
      };
      const { deps, applied } = withRoster([a, x], {
        extraEditsFor,
        committedEntriesById: () =>
          new Map([
            [a.id, a],
            [x.id, x],
          ]),
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(a.id, { kind: 'move' })!;

      session.preview(50);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(requests).toHaveLength(1);
      const preview = applied.at(-1) as readonly { itemId: string; dx: number; extra: boolean }[];
      expect(preview).toHaveLength(2);
      const dragging = preview.find((p) => p.itemId === itemId(a.id))!;
      const ghost = preview.find((p) => p.itemId === itemId(x.id))!;
      expect(dragging.extra).toBe(false);
      expect(ghost.extra).toBe(true);
      expect(ghost.dx).toBe(50); // x0 300 -> x1 350
    });

    // #212 R2 fix-plan review, unified to one refusal at D-S5-44: a `start`-alone cascade against a
    // several-Segment Entry is refused (`SegmentsOutOfSyncError`, `'ambiguous'`) exactly as it is from
    // `entries.update()`. This reconciliation runs inside the pipeline's own rAF callback, with
    // nothing to catch a throw, so the preview must not let it through: `#extraFor` calls
    // `reconcileExtenderEditsForPreview`, which drops the refused edit instead of throwing — that
    // Entry paints no ghost for this frame, and the frame still paints the entry the caller drags.
    // The commit path calls `reconcileExtenderEdits` (no drop) against the same effective state, and
    // it throws for real.
    it('[S3-A4] a several-Segment envelope-only cascade paints no ghost for it, and the commit path still throws', async () => {
      const a = entry('a', 100, 200);
      const x: Entry = {
        id: entryId('x'),
        kind: 'span',
        name: 'x',
        start: 300 as Instant,
        end: 500 as Instant,
        segments: [
          { id: segmentId('x-1'), start: 300 as Instant, end: 400 as Instant },
          { id: segmentId('x-2'), start: 400 as Instant, end: 500 as Instant },
        ],
      };
      const committedEntriesById = () =>
        new Map([
          [a.id, a],
          [x.id, x],
        ]);
      const extraEditsFor: GesturePipelineDeps['extraEditsFor'] = () =>
        new Map([[x.id, { start: 350 as unknown as Instant }]]);
      const commitEntryEdits = vi.fn((draft: StoredEdits) => {
        // Mirrors what `data/build-commit-change-set.ts` runs for real, at commit, against the real
        // Dataset: the extraEditsFor hook's cascade goes through `reconcileExtenderEdits` — the same function
        // the preview above calls a skip-on-refusal wrapper of — and this one does not skip.
        const entries = committedEntriesById();
        reconcileExtenderEdits(
          entries,
          extraEditsFor({ entries, proposed: draft, entryAfterEdits: (id) => entries.get(id) }),
        );
        return true;
      });
      const { deps, applied } = withRoster([a, x], { extraEditsFor, committedEntriesById, commitEntryEdits });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(a.id, { kind: 'move' })!;

      session.preview(50);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const preview = applied.at(-1) as readonly { itemId: string; extra: boolean }[];
      expect(preview.some((p) => p.extra)).toBe(false); // no ghost painted for the refused cascade
      expect(preview.some((p) => p.itemId === itemId(a.id))).toBe(true); // the frame still paints the drag

      expect(() => session.commit(50)).toThrow(SegmentsOutOfSyncError);
      expect(commitEntryEdits).toHaveBeenCalledTimes(1);
    });

    it('[S3-A4] no extraEditsFor (identity, P1 default) previews only the caller’s own draft, no ghost', async () => {
      const a = entry('a', 100, 200);
      const { deps, applied } = withRoster([a]);
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(a.id, { kind: 'move' })!;

      session.preview(50);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const preview = applied.at(-1) as readonly { extra: boolean }[];
      expect(preview).toHaveLength(1);
      expect(preview[0]?.extra).toBe(false);
    });

    it('[S3-A4] cancel() clears the ghost along with the caller’s own preview', async () => {
      const a = entry('a', 100, 200);
      const x = entry('x', 300, 400);
      const extraEditsFor: GesturePipelineDeps['extraEditsFor'] = () =>
        new Map([[x.id, { start: 350 as unknown as Instant, end: 450 as unknown as Instant }]]);
      const { deps, applied } = withRoster([a, x], {
        extraEditsFor,
        committedEntriesById: () =>
          new Map([
            [a.id, a],
            [x.id, x],
          ]),
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(a.id, { kind: 'move' })!;

      session.preview(50);
      session.cancel();
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(applied.at(-1)).toBeUndefined();
    });

    it('a sync true result commits without painting pending', async () => {
      const paints: unknown[] = [];
      const { deps } = withRoster([entry('a', 100, 200)], {
        applyGestureState: (_preview, pendingItemIds) => paints.push(pendingItemIds),
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const committed = await session.commit(50);

      expect(committed).toBe(true);
      expect(paints.filter((pending) => pending !== undefined)).toEqual([]);
    });

    it('preview with cursorX paints a Cursor line and cancel parks it (D-S3-15)', async () => {
      const cursors: ({ x: number; label: string } | undefined)[] = [];
      const { deps } = withRoster([entry('a', 100, 200)], {
        applyGestureState: (_preview, _pending, cursor) => cursors.push(cursor),
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      session.preview(50, { suspendSnap: true, cursorX: 120 });
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const painted = cursors.at(-1);
      expect(painted?.x).toBe(120);
      expect(painted?.label?.length).toBeGreaterThan(0);

      session.cancel();
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(cursors.at(-1)).toBeUndefined();
    });
  });
});

describe('GesturePipeline hot path (review finding 9, I5)', () => {
  it('reads the Selection once per gesture, not once per preview', async () => {
    // The Selection cannot change mid-drag (the arming grab is its last write before commit/cancel
    // ends the gesture), so `session()` must read it exactly once — never once per `preview()`, which
    // a rAF-coalesced drag calls on every pointermove.
    const selectedSegmentIds = vi.fn(() => [segmentId('a-1')]);
    const { deps } = withRoster([entry('a', 0, 100)], { selectedSegmentIds });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    session.preview(10);
    session.preview(20);
    session.preview(30);
    await session.commit(40);

    expect(selectedSegmentIds).toHaveBeenCalledTimes(1);
  });

  it('never copies the dataset on a preview frame when no extension hook is installed', async () => {
    // The default `identityExtender` writes nothing, so a frame has nothing to reconcile and must
    // read no entry at all. Copying the roster to build "effective" entries first made every frame
    // cost the whole dataset — invisible on a 3-row fixture, O(dataset) on D2's 10k target.
    const roster = new Map([[entryId('a'), entry('a', 0, 100)]]);
    let walks = 0;
    const walk = roster[Symbol.iterator].bind(roster);
    roster[Symbol.iterator] = () => {
      walks += 1;
      return walk();
    };

    const { deps } = withRoster([entry('a', 0, 100)], { committedEntriesById: () => roster });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    session.preview(10);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    session.preview(20);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(walks).toBe(0);
  });

  it('answers entryAfterEdits with one .get, never a dataset walk, even when the hook writes nothing', async () => {
    // D-S5-45: the hook can read `entryAfterEdits` on every frame to see this transaction's own body
    // edit — that read must cost one lookup, not a copy of the roster, whether or not the hook goes on
    // to write anything (the "writes nothing" half of this idea is `never copies the dataset` above).
    const roster = new Map([[entryId('a'), entry('a', 0, 100)]]);
    let walks = 0;
    const walk = roster[Symbol.iterator].bind(roster);
    roster[Symbol.iterator] = () => {
      walks += 1;
      return walk();
    };

    let sawStart: Instant | undefined;
    const extraEditsFor: GesturePipelineDeps['extraEditsFor'] = (request) => {
      sawStart = request.entryAfterEdits(entryId('a'))?.start;
      return new Map();
    };

    const { deps } = withRoster([entry('a', 0, 100)], { extraEditsFor, committedEntriesById: () => roster });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    session.preview(10);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(walks).toBe(0);
    expect(sawStart).not.toBe(0 as unknown as Instant);
  });
});
