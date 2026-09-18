import { describe, expect, it, vi } from 'vitest';
import { GesturePipeline } from './gesture-pipeline.js';
import type { GesturePipelineDeps } from './gesture-pipeline.js';
import { EntryNotFoundError, entryId, barId } from '../model/index.js';
import type {
  Entry,
  EntryId,
  ErrorReportInput,
  Instant,
  ProposedEdits,
  StoredEntry,
} from '../model/index.js';
import { entryDouble } from '../layout/entry-double.js';
import type { TimeScale, ViewPreset } from '../layout/index.js';
import type { EntryMove } from './event-bus.js';

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

/** A `ProposedEdit` fixture: fills the required brand/`props`/`proposedKeys` a raw envelope patch
 *  no longer carries (ADR 0011). */
function pe(patch: Record<string, unknown>): {
  __brand: 'ProposedEdit';
  props: Record<string, unknown>;
  proposedKeys: Set<string>;
} & typeof patch {
  return { __brand: 'ProposedEdit', props: {}, proposedKeys: new Set(Object.keys(patch)), ...patch };
}

function entry(id: string, start: number, end: number): Entry {
  return entryDouble({ id, start, end });
}

/** The same row as stored values. `EditRequest.entries` is the pre-transaction snapshot and is
 *  committed-only by contract (D-S5-45, ADR 0017), so it never carries a live row. */
function storedRow(id: string, start: number, end: number): StoredEntry {
  return {
    id: entryId(id),
    name: id,
    start: start as Instant,
    end: end as Instant,
    props: {},
  };
}

function storedMap(...rows: readonly StoredEntry[]): ReadonlyMap<EntryId, StoredEntry> {
  return new Map(rows.map((row) => [row.id, row]));
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
    selectedEntryIds: () => [],
    entryById: (id) => entries.get(id),
    canGesture: () => true,
    // ADR 0013: an ordinary bar writes itself. The fixtures here are childless, and a test that
    // wants a parent bar's drag overrides this with the descendants below it.
    entriesMovedBy: (entry) => [entry],
    commitEntryEdits: () => true,
    // Part 3 (#273): required, not optional — a test that cares about the staleness guard overrides
    // this with a real, mutable roster (see `storedMap`/`storedRow` above); everyone else gets an
    // empty one, which measures every drafted id against `undefined` and never trips the guard.
    committedEntriesById: () => storedMap(),
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
    const preview = applied.at(-1) as readonly { barId: string; dx: number }[];
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

  // The four tests this comment replaces pinned a segmented Entry's own gesture behaviour: moving
  // every bar with no pick, moving only a selected bar while the envelope widened around it, a
  // multi-Entry drag resolving pick per Entry, and a resize touching only one Segment's edge.
  // ADR 0026 retired `Segment`: a Bar is one child Entry by default now, so none of those scenarios
  // exists at this layer any more. Each one maps onto coverage that already exists elsewhere:
  //   - "moves every bar ... with no pick" is `entriesMovedBy` writing every descendant of a grabbed
  //     parent bar — pinned by `'writes the descendants, leaves the parent unwritten, and names the
  //     parent in the event'` below (ADR 0013, Q9).
  //   - "moves only the selected bar, envelope follows" is now just grabbing that child Entry
  //     directly — an ordinary single-entry move (`'preview() moves a single entry by raw px delta
  //     when snap is none'` below). The envelope no longer "follows": `start`/`end` are ordinary
  //     rolling-up Fields the Rollup recomputes from children on commit (ADR 0013, decision 5),
  //     pinned in `data/rollup.test.ts`, not here — the gesture pipeline never computed an envelope.
  //   - "multi-Entry drag, pick per Entry" is the existing multi-selection test (`'preview() and
  //     commit() move every armed entry of a multi-selection by the same delta'` above) composed
  //     with `entriesMovedBy`: each selected Entry resolves its own write independently, whether it
  //     is an ordinary bar or itself a parent.
  //   - "resize on a selected Segment" is now grabbing that child Entry directly and resizing it —
  //     an ordinary resize gesture (`'resizes the start edge, clamped so it never crosses the end'`
  //     below). There is no sibling Segment left to leave untouched.

  it('a milestone grab is refused through canGesture, not a kind check in the pipeline', () => {
    const milestone: Entry = entry('m', 50, 50);
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
    const preview = applied.at(-1) as readonly { barId: string; dx: number; dWidth: number }[];
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
        applyGestureState: (preview, pendingBarIds) => {
          paints.push({ preview, pending: pendingBarIds });
        },
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      expect(paints).toHaveLength(1);
      expect(paints[0]?.pending).toEqual([barId(entryId('a'))]);
      const preview = paints[0]?.preview as readonly { dx: number }[];
      expect(preview[0]?.dx).toBe(50);

      resolveVeto(true);
      const committed = await commitPromise;

      expect(committed).toBe(true);
      expect(paints.at(-1)).toEqual({ preview: undefined, pending: undefined });
    });

    // Rewritten for #272/#273: this test used to assert the bug. A hung `beforeEntryMove` on entry
    // "a" arm-locked `session()` for *every* bar in the Gantt — grabbing an unrelated entry "b" while
    // "a"'s veto was still out returned `undefined`, refusing a gesture that had nothing to do with
    // the hang. There is no arm lock any more: a new gesture — on the same bar or a different one —
    // supersedes the held one instead of being refused. This is T1 (research §7): a hung veto now
    // locks only its own bar.
    it('a hung veto on one bar does not lock a gesture on another bar (#272, #273)', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const commitEntryEdits = vi.fn(() => true);
      const { deps, reported } = withRoster([entry('a', 100, 200), entry('b', 300, 400)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
        commitEntryEdits,
      });
      const pipeline = new GesturePipeline(deps);
      const aSession = pipeline.session(entryId('a'), { kind: 'move' })!;
      void aSession.commit(50);

      // "b" is a different bar and arms normally — the hung "a" veto never reaches it.
      const bSession = pipeline.session(entryId('b'), { kind: 'move' });
      expect(bSession).toBeDefined();

      // "a"'s own settle, once it finally resolves, does nothing: no commit, no second report beyond
      // the one `session()` already raised when it superseded the hold.
      resolveVeto(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(commitEntryEdits).not.toHaveBeenCalled();
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'entry-move-dropped',
        by: 'core',
        droppedReason: 'superseded',
      });
      expect(reported[0]?.message).toContain('dropped');
    });

    it('session() re-arming the same bar supersedes its own held gesture instead of refusing (#272, #273)', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const commitEntryEdits = vi.fn(() => true);
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
        commitEntryEdits,
      });
      const pipeline = new GesturePipeline(deps);
      const firstSession = pipeline.session(entryId('a'), { kind: 'move' })!;
      void firstSession.commit(50);

      // Re-grabbing "a" while its own veto is still out is now a valid new gesture, not a refusal.
      const secondSession = pipeline.session(entryId('a'), { kind: 'move' });
      expect(secondSession).toBeDefined();
      expect(reported).toHaveLength(1); // the superseded first gesture reported once, right away
      expect(reported[0]).toMatchObject({ code: 'entry-move-dropped', droppedReason: 'superseded' });
      expect(reported[0]?.message).toContain('dropped');

      resolveVeto(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The stale settle from the superseded first gesture never commits.
      expect(commitEntryEdits).not.toHaveBeenCalled();
    });

    // #377: the two dropped codes must pick move vs resize the same way the two cancelled codes
    // already do, and `droppedReason` must ride onto the report itself, not just the message.
    it('[#377] discarding a held resize reports entry-resize-dropped with droppedReason: discarded', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryResize' ? veto : true)) as GesturePipelineDeps['emit'],
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' })!;
      void session.commit(50);

      expect(pipeline.discardHeldGesture()).toBe(true);
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'entry-resize-dropped',
        by: 'core',
        droppedReason: 'discarded',
        severity: 'info',
      });

      resolveVeto(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
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

    // #273: a `finish()` that throws must not brick the pipeline for every bar that follows.
    it('an EntryNotFoundError from finish() resolves false and does not brick the pipeline (#273)', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
        commitEntryEdits: () => {
          throw new EntryNotFoundError(entryId('a'), 'entries.update');
        },
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      resolveVeto(true);

      await expect(commitPromise).resolves.toBe(false);
      expect(pipeline.session(entryId('a'), { kind: 'move' })).toBeDefined();
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'entry-move-dropped',
        by: 'core',
        droppedReason: 'entry-gone',
      });
    });

    // The sibling of the test above, and #341 reversed what it pins. #273 let a plain fault reach
    // the caller on purpose ("it is not swallowed") and only guarded the `finally`. But the caller
    // is `interaction/entry-gestures.ts`'s `void session.commit(...)`, inside a native `pointerup`
    // listener — nothing there can catch it, so "reaches the caller" meant an unhandled rejection
    // and no report at all. The fault is now reported, and the hold still clears.
    it('a plain Error from finish() resolves false, reports the fault, and still clears the hold (#341)', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const boom = new Error('boom');
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => (name === 'beforeEntryMove' ? veto : true)) as GesturePipelineDeps['emit'],
        commitEntryEdits: () => {
          throw boom;
        },
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      resolveVeto(true);

      await expect(commitPromise).resolves.toBe(false);
      expect(pipeline.session(entryId('a'), { kind: 'move' })).toBeDefined();
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'gesture-commit-failed',
        severity: 'error',
        by: 'plugin',
        entryId: entryId('a'),
        cause: boom,
      });
    });

    // #273: the draft is a snapshot, but the row it was measured from is not — a commit landing
    // during the hold must not let pointerup-era instants overwrite it silently.
    it('a row replaced during the hold refuses the settle instead of overwriting it (#273)', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const roster = new Map([[entryId('a'), storedRow('a', 100, 200)]]);
      const commitEntryEdits = vi.fn(() => true);
      const afterEmitted: string[] = [];
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => {
          if (name === 'beforeEntryMove') return veto;
          afterEmitted.push(name);
          return true;
        }) as GesturePipelineDeps['emit'],
        committedEntriesById: () => roster,
        commitEntryEdits,
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      // The store replaces the whole row object on every committed write (ADR 0017) — a new object
      // is what a real commit hands back, so the fixture mints one instead of mutating the old row.
      roster.set(entryId('a'), storedRow('a', 500, 600));
      resolveVeto(true);

      await expect(commitPromise).resolves.toBe(false);
      expect(commitEntryEdits).not.toHaveBeenCalled();
      expect(afterEmitted).toEqual([]);
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'entry-move-dropped',
        severity: 'warning',
        entryId: entryId('a'),
        droppedReason: 'data-changed',
      });
    });

    // The negative case: this is what proves the guard names its own rows, not the whole Dataset —
    // a `datasetRevision` compare would refuse this commit too, and that is the design this test
    // rules out.
    it('an unrelated row replaced during the hold does not refuse the settle (#273)', async () => {
      let resolveVeto!: (value: boolean) => void;
      const veto = new Promise<boolean>((resolve) => {
        resolveVeto = resolve;
      });
      const roster = new Map([
        [entryId('a'), storedRow('a', 100, 200)],
        [entryId('z'), storedRow('z', 300, 400)],
      ]);
      const commitEntryEdits = vi.fn(() => true);
      const afterEmitted: string[] = [];
      const { deps } = withRoster([entry('a', 100, 200)], {
        emit: ((name: string) => {
          if (name === 'beforeEntryMove') return veto;
          afterEmitted.push(name);
          return true;
        }) as GesturePipelineDeps['emit'],
        committedEntriesById: () => roster,
        commitEntryEdits,
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const commitPromise = session.commit(50);
      roster.set(entryId('z'), storedRow('z', 700, 800));
      resolveVeto(true);

      await expect(commitPromise).resolves.toBe(true);
      expect(commitEntryEdits).toHaveBeenCalledTimes(1);
      expect(afterEmitted).toEqual(['entryMove']);
    });

    it('[S3-A4] session().preview() calls the injected extraEditsFor and previews its extra as a ghost', async () => {
      const a = entry('a', 100, 200);
      const x = entry('x', 300, 400);
      const requests: unknown[] = [];
      const extraEditsFor: GesturePipelineDeps['extraEditsFor'] = (request) => {
        requests.push(request);
        return new Map([[x.id, pe({ start: 350, end: 450 })]]);
      };
      const { deps, applied } = withRoster([a, x], {
        extraEditsFor,
        committedEntriesById: () => storedMap(storedRow('a', 100, 200), storedRow('x', 300, 400)),
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(a.id, { kind: 'move' })!;

      session.preview(50);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(requests).toHaveLength(1);
      const preview = applied.at(-1) as readonly { barId: string; dx: number; extra: boolean }[];
      expect(preview).toHaveLength(2);
      const dragging = preview.find((p) => p.barId === barId(a.id))!;
      const ghost = preview.find((p) => p.barId === barId(x.id))!;
      expect(dragging.extra).toBe(false);
      expect(ghost.extra).toBe(true);
      expect(ghost.dx).toBe(50); // x0 300 -> x1 350
    });

    // [S3-A4] used to pin a several-Segment envelope-only cascade refusal (D-S5-44). ADR 0026/Q39
    // retired that scenario along with `Segment` itself: a Bar is one child Entry by default now, so
    // there is no several-Segment Entry left to refuse, and `'write-refused'` no longer exists on
    // `GestureDroppedReason` (`model/error-report.ts`) — an extender cascade on a rolling-up parent
    // meets the Rollup's silent overwrite-and-report instead (ADR 0013, decision 5; pinned for `data/`
    // itself in `data/rollup.test.ts`, not here — `gesture-pipeline.ts` never sees a throw for it, so
    // it has nothing left to pin). No replacement test lands here: there is no longer a scenario at
    // this layer for a gesture commit to refuse this way.

    // #332: an extender bug (not a typed refusal `isEnvelopeRefusal` names) still runs inside the
    // pipeline's own rAF callback with nothing to catch it. `#extraFor` must recover the same way
    // `render/dom`'s `callRenderer` recovers a bad renderer — this frame paints with no cascade
    // ghost, and the failure is reported instead of lost.
    it('[#332] an extender that throws reports the fault and previews with no ghost, not a crashed frame', async () => {
      const a = entry('a', 100, 200);
      const x = entry('x', 300, 400);
      const extraEditsFor: GesturePipelineDeps['extraEditsFor'] = () => {
        throw new Error('boom');
      };
      const { deps, applied, reported } = withRoster([a, x], {
        extraEditsFor,
        committedEntriesById: () => storedMap(storedRow('a', 100, 200), storedRow('x', 300, 400)),
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(a.id, { kind: 'move' })!;

      session.preview(50);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const preview = applied.at(-1) as readonly { barId: string; extra: boolean }[];
      expect(preview.some((p) => p.extra)).toBe(false); // no ghost painted for the fault
      expect(preview.some((p) => p.barId === barId(a.id))).toBe(true); // the drag itself still paints

      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'extender-preview-failed',
        severity: 'warning',
        by: 'plugin',
      });
      expect(reported[0]?.cause).toBeInstanceOf(Error);
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
        new Map([[x.id, pe({ start: 350, end: 450 })]]);
      const { deps, applied } = withRoster([a, x], {
        extraEditsFor,
        committedEntriesById: () => storedMap(storedRow('a', 100, 200), storedRow('x', 300, 400)),
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
        applyGestureState: (_preview, pendingBarIds) => paints.push(pendingBarIds),
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      const committed = await session.commit(50);

      expect(committed).toBe(true);
      expect(paints.filter((pending) => pending !== undefined)).toEqual([]);
    });

    // #341: the ordinary mouseup — a sync `true` from `beforeEntryMove`, no hold, no async veto.
    // `finish()` threw straight out of `session.commit()` into the native `pointerup` listener,
    // which discards the Promise, so nobody could catch it and nothing reported it. Worse, the
    // `#preview(undefined)` that follows never ran, so the drag ghost stayed painted over stored
    // data the unwound transaction never changed.
    it('[#341] a fault on the sync commit resolves false, reports it, and un-paints the drag', async () => {
      const boom = new Error('boom');
      const { deps, applied, reported } = withRoster([entry('a', 100, 200)], {
        commitEntryEdits: () => {
          throw boom;
        },
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      session.preview(50);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(applied.at(-1)).toBeDefined(); // the drag is on screen

      await expect(session.commit(50)).resolves.toBe(false);
      await new Promise((resolve) => requestAnimationFrame(resolve));

      expect(applied.at(-1)).toBeUndefined(); // and it is off it again
      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'gesture-commit-failed',
        severity: 'error',
        by: 'plugin',
        entryId: entryId('a'),
        cause: boom,
      });
      expect(reported[0]?.message).toContain('move');
    });

    // #341: the same fold the async branch has had since #273, now on the sync branch too — a
    // `beforeEntryMove` handler that removes the entry and then returns `true` reaches it. A
    // removed entry is not a bug, so it reports as a dropped gesture and never as a fault.
    it('[#341] an EntryNotFoundError on the sync commit reports the entry as gone, not as a fault', async () => {
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        commitEntryEdits: () => {
          throw new EntryNotFoundError(entryId('a'), 'entries.update');
        },
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'move' })!;

      await expect(session.commit(50)).resolves.toBe(false);

      expect(reported).toHaveLength(1);
      expect(reported[0]).toMatchObject({
        code: 'entry-move-dropped',
        by: 'core',
        droppedReason: 'entry-gone',
      });
      expect(reported[0]?.message).toContain('was removed before the write');
    });

    // #341: a resize reads as a resize. The noun comes from the event, through the one table
    // `data/error-reporting.ts` already keeps for every refusal sentence.
    it('[#341] a fault on a resize commit names the resize', async () => {
      const { deps, reported } = withRoster([entry('a', 100, 200)], {
        commitEntryEdits: () => {
          throw new Error('boom');
        },
      });
      const pipeline = new GesturePipeline(deps);
      const session = pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' })!;

      await expect(session.commit(50)).resolves.toBe(false);

      expect(reported[0]?.code).toBe('gesture-commit-failed');
      expect(reported[0]?.message).toContain('resize');
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
    const selectedEntryIds = vi.fn(() => []);
    const { deps } = withRoster([entry('a', 0, 100)], { selectedEntryIds });
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'move' })!;

    session.preview(10);
    session.preview(20);
    session.preview(30);
    await session.commit(40);

    expect(selectedEntryIds).toHaveBeenCalledTimes(1);
  });

  it('never copies the dataset on a preview frame when no extension hook is installed', async () => {
    // The default `identityExtender` writes nothing, so a frame has nothing to reconcile and must
    // read no entry at all. Copying the roster to build "effective" entries first made every frame
    // cost the whole dataset — invisible on a 3-row fixture, O(dataset) on D2's 10k target.
    const roster = new Map([[entryId('a'), storedRow('a', 0, 100)]]);
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
    const roster = new Map([[entryId('a'), storedRow('a', 0, 100)]]);
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

describe('a parent bar drag translates its descendants (ADR 0013, Q9)', () => {
  /** A row that holds one date, no span (ADR 0012): it shows in the grid and draws no bar. */
  function startOnly(id: string, start: number): Entry {
    return entryDouble({ id, start });
  }

  /** One phase bar over two children — the shape a real roll-up parent is always in. `entriesMovedBy`
   *  answers the way `view/capability.ts` does: the parent writes the rows below it, never itself. */
  function withParent(children: readonly Entry[]) {
    const parent = entry('phase', 100, 400);
    return withRoster([parent, ...children], {
      entriesMovedBy: (grabbed) => (grabbed.id === parent.id ? children : [grabbed]),
    });
  }

  it('writes the descendants, leaves the parent unwritten, and names the parent in the event', async () => {
    const child = entry('child', 100, 200);
    const { deps, emitted } = withParent([child]);
    const written: ProposedEdits[] = [];
    const pipeline = new GesturePipeline({
      ...deps,
      commitEntryEdits: (edits) => {
        written.push(edits);
        return true;
      },
    });

    const committed = await pipeline.session(entryId('phase'), { kind: 'move' })!.commit(50);

    expect(committed).toBe(true);
    // One transaction, one undo: `commitEntryEdits` is called once, with the descendants alone.
    expect(written).toHaveLength(1);
    expect([...written[0]!.keys()]).toEqual([entryId('child')]);
    const move = emitted[1]![1] as EntryMove;
    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove', 'entryMove']);
    // `event.entry` is the parent you grabbed, and its span is the envelope it lands on.
    expect(move.entry).toBe(entryId('phase'));
    expect(move.start).toBe(150);
    expect(move.end).toBe(450);
    expect(move.entries).toEqual([{ entry: entryId('child'), start: 150, end: 250 }]);
  });

  it('moves a child that holds only a start, and proposes no end for it', async () => {
    const child = startOnly('child', 100);
    const { deps, emitted } = withParent([child]);
    const written: ProposedEdits[] = [];
    const pipeline = new GesturePipeline({
      ...deps,
      commitEntryEdits: (edits) => {
        written.push(edits);
        return true;
      },
    });

    await pipeline.session(entryId('phase'), { kind: 'move' })!.commit(50);

    const edit = written[0]!.get(entryId('child'))!;
    expect(edit.start).toBe(150);
    expect(edit.end).toBeUndefined();
    expect([...edit.proposedKeys]).toEqual(['start']);
    const move = emitted[1]![1] as EntryMove;
    expect(move.entries).toEqual([{ entry: entryId('child'), start: 150 }]);
  });

  it('previews the parent bar following the pointer, though it writes nothing', async () => {
    const child = entry('child', 100, 200);
    const { deps, applied } = withParent([child]);
    const pipeline = new GesturePipeline(deps);

    pipeline.session(entryId('phase'), { kind: 'move' })!.preview(50);
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const preview = applied[0] as readonly { barId: string; dx: number; extra: boolean }[];
    // The parent's own bar is the caller's gesture, not an extender's ghost, so `extra` stays false.
    expect(preview.map((item) => [item.barId, item.dx, item.extra])).toEqual([
      [barId(entryId('phase')), 50, false],
      [barId(entryId('child')), 50, false],
    ]);
  });
});
