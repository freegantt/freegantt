import { describe, expect, it, vi } from 'vitest';
import { GesturePipeline } from './gesture-pipeline.js';
import type { GesturePipelineDeps } from './gesture-pipeline.js';
import { entryId } from '../model/index.js';
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
      return undefined as never;
    },
    applyPreview: (preview) => applied.push(preview),
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

  it('coalesces several preview() calls into one applyPreview call, with only the last draft', async () => {
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
});
