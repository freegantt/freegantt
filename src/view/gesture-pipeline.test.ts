import { describe, expect, it, vi } from 'vitest';
import { GesturePipeline } from './gesture-pipeline.js';
import type { GesturePipelineDeps } from './gesture-pipeline.js';
import { entryId } from '../model/index.js';
import type { Entry, EntryEdits, EntryId, Instant } from '../model/index.js';
import type { TimeScale } from '../layout/index.js';

/** `view/` may not import `time/` (I1) — a linear px<->ms fake stands in for the bound `TimeScale`;
 *  paired with `snap: 'none'` (unused zone) this is exactly what `draftForMove`/`draftForResize`
 *  read (`scale.xForInstant`/`scale.instantForX`), so the real `layout/gesture-draft.ts` math still
 *  runs unmocked. */
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

function entry(id: string, start: number, end: number): Entry {
  return { id: entryId(id), kind: 'span', name: id, start: start as Instant, end: end as Instant };
}

function makeDeps(overrides: Partial<GesturePipelineDeps> = {}): {
  deps: GesturePipelineDeps;
  emitted: [string, unknown][];
  applied: (EntryEdits | undefined)[];
} {
  const emitted: [string, unknown][] = [];
  const applied: (EntryEdits | undefined)[] = [];
  const deps: GesturePipelineDeps = {
    timeZone: () => 'UTC',
    timeScale: () => linearScale,
    snap: () => 'none',
    entriesForGesture: (grabbed) => [entry(grabbed, 0, 100)],
    commitEntryEdits: () => true,
    emit: (name, payload) => {
      emitted.push([name, payload]);
      return undefined as never;
    },
    applyPreview: (draft) => applied.push(draft),
    ...overrides,
  };
  return { deps, emitted, applied };
}

describe('GesturePipeline.draftFor (D-GH-2)', () => {
  it('moves a single entry by raw px delta when snap is none', () => {
    const { deps } = makeDeps();
    const pipeline = new GesturePipeline(deps);
    const a = entry('a', 100, 200);

    const draft = pipeline.draftFor({ kind: 'move' }, [a], 50, undefined);

    expect(draft.get(a.id)).toEqual({ start: 150, end: 250 });
  });

  it('moves every entry of a multi-select rigidly by the grabbed entry’s own delta', () => {
    const { deps } = makeDeps();
    const pipeline = new GesturePipeline(deps);
    const a = entry('a', 100, 200);
    const b = entry('b', 300, 400);

    const draft = pipeline.draftFor({ kind: 'move' }, [a, b], 50, undefined);

    expect(draft.get(a.id)).toEqual({ start: 150, end: 250 });
    expect(draft.get(b.id)).toEqual({ start: 350, end: 450 });
  });

  it('resizes the start edge, clamped so it never crosses the end', () => {
    const { deps } = makeDeps();
    const pipeline = new GesturePipeline(deps);
    const a = entry('a', 100, 200);

    const draft = pipeline.draftFor({ kind: 'resize', edge: 'start' }, [a], 150, undefined);
    expect(draft.get(a.id)).toEqual({ start: 200, end: 200 }); // clamped at the fixed end

    const normal = pipeline.draftFor({ kind: 'resize', edge: 'start' }, [a], 30, undefined);
    expect(normal.get(a.id)).toEqual({ start: 130, end: 200 });
  });

  it('resizes the end edge, clamped so it never crosses the start', () => {
    const { deps } = makeDeps();
    const pipeline = new GesturePipeline(deps);
    const a = entry('a', 100, 200);

    const draft = pipeline.draftFor({ kind: 'resize', edge: 'end' }, [a], -150, undefined);
    expect(draft.get(a.id)).toEqual({ start: 100, end: 100 }); // clamped at the fixed start
  });

  it('passes suspendSnap through to the injected snap resolver', () => {
    const snap = vi.fn().mockReturnValue('none');
    const { deps } = makeDeps({ snap });
    const pipeline = new GesturePipeline(deps);
    const a = entry('a', 100, 200);

    pipeline.draftFor({ kind: 'move' }, [a], 10, { suspendSnap: true });
    expect(snap).toHaveBeenCalledWith(true);

    pipeline.draftFor({ kind: 'move' }, [a], 10, undefined);
    expect(snap).toHaveBeenCalledWith(undefined);
  });
});

describe('GesturePipeline.entriesForGesture', () => {
  it('delegates to the injected deps', () => {
    const entriesForGesture = vi.fn((grabbed: EntryId) => [entry(grabbed, 0, 1)]);
    const { deps } = makeDeps({ entriesForGesture });
    const pipeline = new GesturePipeline(deps);

    pipeline.entriesForGesture(entryId('a'), 'resize');
    expect(entriesForGesture).toHaveBeenCalledWith(entryId('a'), 'resize');
  });
});

describe('GesturePipeline.commit (D-S3-16/D-S3-22)', () => {
  it('an empty draft resolves false and emits nothing', async () => {
    const { deps, emitted } = makeDeps();
    const pipeline = new GesturePipeline(deps);

    await expect(pipeline.commit({ kind: 'move' }, new Map())).resolves.toBe(false);
    expect(emitted).toEqual([]);
  });

  it('a move commit fires beforeEntryMove, writes, then entryMove', async () => {
    const { deps, emitted } = makeDeps();
    const pipeline = new GesturePipeline(deps);
    const draft: EntryEdits = new Map([[entryId('a'), { start: 10 as Instant, end: 20 as Instant }]]);

    const committed = await pipeline.commit({ kind: 'move' }, draft);

    expect(committed).toBe(true);
    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove', 'entryMove']);
  });

  it('a resize commit fires beforeEntryResize/entryResize, carrying the grabbed edge', async () => {
    const { deps, emitted } = makeDeps();
    const pipeline = new GesturePipeline(deps);
    const draft: EntryEdits = new Map([[entryId('a'), { start: 10 as Instant, end: 20 as Instant }]]);

    await pipeline.commit({ kind: 'resize', edge: 'end' }, draft);

    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryResize', 'entryResize']);
    expect((emitted[0]![1] as { edge: string }).edge).toBe('end');
  });

  it('a sync veto (beforeEntryMove returning false) skips the write and resolves false', async () => {
    const { deps, emitted } = makeDeps({
      emit: ((name: string, payload: unknown) => {
        emitted.push([name, payload]);
        return name === 'beforeEntryMove' ? false : undefined;
      }) as GesturePipelineDeps['emit'],
    });
    const commitEntryEdits = vi.fn(() => true);
    const pipeline = new GesturePipeline({ ...deps, commitEntryEdits });
    const draft: EntryEdits = new Map([[entryId('a'), { start: 10 as Instant, end: 20 as Instant }]]);

    const committed = await pipeline.commit({ kind: 'move' }, draft);

    expect(committed).toBe(false);
    expect(commitEntryEdits).not.toHaveBeenCalled();
    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove']);
  });

  it('commitEntryEdits resolving false (async veto already folded by the caller) skips the after-event', async () => {
    const { deps, emitted } = makeDeps({ commitEntryEdits: () => false });
    const pipeline = new GesturePipeline(deps);
    const draft: EntryEdits = new Map([[entryId('a'), { start: 10 as Instant, end: 20 as Instant }]]);

    const committed = await pipeline.commit({ kind: 'move' }, draft);

    expect(committed).toBe(false);
    expect(emitted.map(([name]) => name)).toEqual(['beforeEntryMove']);
  });
});

describe('GesturePipeline.preview (D-S3-18)', () => {
  it('coalesces several preview() calls into one applyPreview call, with only the last draft', async () => {
    const { deps, applied } = makeDeps();
    const pipeline = new GesturePipeline(deps);
    const draftA: EntryEdits = new Map([[entryId('a'), { start: 1 as Instant, end: 2 as Instant }]]);
    const draftB: EntryEdits = new Map([[entryId('b'), { start: 3 as Instant, end: 4 as Instant }]]);

    pipeline.preview(draftA);
    pipeline.preview(draftB);
    expect(applied).toEqual([]);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(applied).toEqual([draftB]);
  });
});
