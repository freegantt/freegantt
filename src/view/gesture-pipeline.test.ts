import { describe, expect, it, vi } from 'vitest';
import { GesturePipeline } from './gesture-pipeline.js';
import type { GesturePipelineDeps } from './gesture-pipeline.js';
import { entryId, itemId } from '../model/index.js';
import type { Entry, EntryId, Instant } from '../model/index.js';
import type { TimeScale, ViewPreset } from '../layout/index.js';

/** `view/` may not import `time/` (I1) — a linear px<->ms fake stands in for the bound `TimeScale`;
 *  paired with `snap: 'none'` (the default preset below) this is exactly what
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

const noneSnapPreset = { snap: 'none' } as unknown as ViewPreset;

function entry(id: string, start: number, end: number): Entry {
  return { id: entryId(id), kind: 'span', name: id, start: start as Instant, end: end as Instant };
}

function makeDeps(overrides: Partial<GesturePipelineDeps> = {}): {
  deps: GesturePipelineDeps;
  emitted: [string, unknown][];
  applied: unknown[];
} {
  const emitted: [string, unknown][] = [];
  const applied: unknown[] = [];
  const entries = new Map<EntryId, Entry>();
  const deps: GesturePipelineDeps = {
    timeZone: () => 'UTC',
    timeScale: () => linearScale,
    preset: () => noneSnapPreset,
    selection: () => [],
    entryById: (id) => entries.get(id),
    canGesture: () => true,
    commitEntryEdits: () => true,
    emit: (name, payload) => {
      emitted.push([name, payload]);
      return true;
    },
    applyGestureState: (preview) => applied.push(preview),
    ...overrides,
  };
  return { deps, emitted, applied };
}

/** Wires `entryById`/`selection` off a fixed roster, the shape most tests below want: one grabbed
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

  it("asks canGesture with 'move' for a move gesture and 'resize' for a resize gesture", () => {
    const canGesture = vi.fn(() => true);
    const { deps } = withRoster([entry('a', 0, 100)], { canGesture });
    const pipeline = new GesturePipeline(deps);

    pipeline.session(entryId('a'), { kind: 'move' });
    expect(canGesture).toHaveBeenCalledWith('move', entryId('a'));

    pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' });
    expect(canGesture).toHaveBeenCalledWith('resize', entryId('a'));
  });

  it('arms every capable entry of a multi-selection, grabbed first, and skips an incapable one', () => {
    const a = entry('a', 0, 100);
    const b = entry('b', 100, 200);
    const c = entry('c', 200, 300);
    const checked: EntryId[] = [];
    const { deps } = withRoster([a, b, c], {
      selection: () => [b.id, a.id, c.id],
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
  });

  it('commit() on a resize gesture fires beforeEntryResize/entryResize, carrying the grabbed edge', async () => {
    const { deps, emitted } = withRoster([entry('a', 100, 200)]);
    const pipeline = new GesturePipeline(deps);
    const session = pipeline.session(entryId('a'), { kind: 'resize', edge: 'end' })!;

    await session.commit(50);

    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryResize', 'entryResize']);
    expect((emitted[0]![1] as { edge: string }).edge).toBe('end');
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
     *  1` nudge is unambiguously "one tick forward" — `linearScale`/`noneSnapPreset` above stub
     *  `widthForDuration` to 0, which would make every nudge a no-op. 300_000 (not one of I10's
     *  banned literals: 60_000/3_600_000/86_400_000/604_800_000) is 5 real minutes in ms — this file
     *  is `view/`, which may not import `time/` (view-boundary), so the expected deltas below have to
     *  be spelled out as a literal rather than computed via a `time/` helper. */
    const FIVE_MIN_MS = 300_000;
    const tickPreset = { snap: 'tick', tickUnit: 'minute', tickIncrement: 5 } as unknown as ViewPreset;
    const tickScale: TimeScale = { ...linearScale, widthForDuration: () => FIVE_MIN_MS };

    it('moves the anchor entry forward one tick on direction: 1', async () => {
      const { deps, emitted } = withRoster([entry('a', 600_000, 900_000)], {
        preset: () => tickPreset,
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

    it('[S3-A4] session().preview() calls the injected extend and previews its extra as a ghost', async () => {
      const a = entry('a', 100, 200);
      const x = entry('x', 300, 400);
      const requests: unknown[] = [];
      const extend: GesturePipelineDeps['extend'] = (request) => {
        requests.push(request);
        return new Map([[x.id, { start: 350 as unknown as Instant, end: 450 as unknown as Instant }]]);
      };
      const { deps, applied } = withRoster([a, x], {
        extend,
        allEntries: () =>
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

    it('[S3-A4] no extend (identity, P1 default) previews only the caller’s own draft, no ghost', async () => {
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
      const extend: GesturePipelineDeps['extend'] = () =>
        new Map([[x.id, { start: 350 as unknown as Instant, end: 450 as unknown as Instant }]]);
      const { deps, applied } = withRoster([a, x], {
        extend,
        allEntries: () =>
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
  });
});
