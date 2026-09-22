import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Viewport } from './viewport.js';
import type { DatasetBinding } from './viewport.js';
import { TimeScaleModel } from './time-scale-model.js';
import { ScrollAxis } from './scroll-axis.js';
import { diffMs, instant, MS } from '../../time/index.js';
import type { Entry } from '../../model/index.js';
import { entryDouble } from '../entry-double.js';

function entry(id: string, start: string, end: string): Entry {
  return entryDouble({ id, start: instant(start), end: instant(end) });
}

const dataset: DatasetBinding = {
  timeZone: 'UTC',
  entries: [entry('t1', '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z')],
};

const wideDataset: DatasetBinding = {
  timeZone: 'UTC',
  entries: [entry('t1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')],
};

const noop = (): void => {};

function boundViewport(width = 400, height = 200): { viewport: Viewport; calls: () => number } {
  const viewport = new Viewport({ scale: new TimeScaleModel({ fit: 'preset', preset: 'day' }) });
  let calls = 0;
  const handle = viewport.bind(wideDataset, () => calls++);
  handle.setPaneSize({ width, height });
  // A real GanttShell.render() pushes this after computing a frame — done by hand here so the
  // x ScrollAxis's max is non-zero and panTo/reveal have somewhere to move to.
  handle.setContentSize({ width: viewport.timeScale.contentWidth, height: 5000 });
  calls = 0;
  return { viewport, calls: () => calls };
}

describe('Viewport', () => {
  it('a fresh Viewport with no options resolves a usable window', () => {
    const viewport = new Viewport();
    expect(viewport.preset).toBeDefined();
    expect(viewport.timeScale).toBeDefined();
    expect(viewport.visible).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  });

  it('setPaneSize reaches both models with exactly one onChange', () => {
    const viewport = new Viewport();
    let calls = 0;
    const handle = viewport.bind(dataset, () => calls++);
    calls = 0;

    handle.setContentSize({ width: 1000, height: 500 });
    handle.setPaneSize({ width: 300, height: 150 });
    expect(calls).toBe(2); // two separate calls outside a batch -> two reactions, one per call

    calls = 0;
    // A single setPaneSize call touches both the scale and the scroll model, but delivers one
    // reaction, not two (D-S1.7-1) — batched internally.
    handle.setPaneSize({ width: 400, height: 200 });
    expect(calls).toBe(1);
    expect(viewport.visible.width).toBe(400);
    expect(viewport.visible.height).toBe(200);
  });

  it('visible uses the LOCALLY clamped position when the shared position exceeds this Gantt’s own max (U3, the §0 defect)', () => {
    const sharedY = new ScrollAxis();
    const big = new Viewport({ scroll: { y: sharedY } });
    const small = new Viewport({ scroll: { y: sharedY } });
    const bigHandle = big.bind(dataset, noop);
    const smallHandle = small.bind(dataset, noop);

    bigHandle.setContentSize({ width: 0, height: 5000 });
    bigHandle.setPaneSize({ width: 0, height: 800 });
    smallHandle.setContentSize({ width: 0, height: 1000 });
    smallHandle.setPaneSize({ width: 0, height: 800 });

    // Pin past the small chart's own max (200) but within the big chart's (4200) — the shared
    // ScrollAxis's position is what the user asked for; each chart must still render what it can
    // show, not what was asked for (D-S1.5-2).
    sharedY.panTo(4200);

    expect(big.visible.y).toBe(4200);
    expect(small.visible.y).toBe(200);
  });

  it('unbind detaches both models', () => {
    const sharedScale = new TimeScaleModel();
    const sharedY = new ScrollAxis();
    let otherCalls = 0;
    const other = new Viewport({ scale: sharedScale, scroll: { y: sharedY } });
    const otherHandle = other.bind(dataset, () => otherCalls++);
    otherHandle.setContentSize({ width: 0, height: 1000 });
    otherHandle.setPaneSize({ width: 0, height: 200 });

    const unbinding = new Viewport({ scale: sharedScale, scroll: { y: sharedY } });
    let calls = 0;
    const handle = unbinding.bind(dataset, () => calls++);
    calls = 0;
    otherCalls = 0;

    handle.unbind();

    // A change on the remaining binding still notifies it, but not the one that unbound.
    other.scroll.y.panTo(500);
    expect(otherCalls).toBeGreaterThan(0);
    expect(calls).toBe(0);
  });

  it('overscan set re-notifies iff it actually changed', () => {
    const viewport = new Viewport();
    let calls = 0;
    viewport.bind(dataset, () => calls++);
    calls = 0;

    viewport.overscan = { verticalRows: 5 };
    expect(calls).toBe(1);
    expect(viewport.overscan).toEqual({ verticalRows: 5 });

    calls = 0;
    viewport.overscan = { verticalRows: 5 };
    expect(calls).toBe(0);
  });

  it('batch delivers one consumer reaction and no observer sees an intermediate state', () => {
    const viewport = new Viewport();
    let calls = 0;
    const seenWidths: number[] = [];
    const handle = viewport.bind(dataset, () => {
      calls++;
      seenWidths.push(viewport.visible.width);
    });
    calls = 0;
    seenWidths.length = 0;

    viewport.batch(() => {
      handle.setContentSize({ width: 1000, height: 500 });
      handle.setPaneSize({ width: 400, height: 200 });
    });

    expect(calls).toBe(1);
    expect(seenWidths).toEqual([400]);
  });

  it('a throwing run still flushes', () => {
    const viewport = new Viewport();
    let calls = 0;
    const handle = viewport.bind(dataset, () => calls++);
    calls = 0;

    expect(() =>
      viewport.batch(() => {
        // Wide enough that the resolved density clears S1.12's floor, so this genuinely changes
        // the scale — a size the floor would clamp away leaves nothing to notify.
        handle.setPaneSize({ width: 800, height: 500 });
        throw new Error('boom');
      }),
    ).toThrow('boom');

    expect(calls).toBe(1);
  });

  it('a second bind is refused — one Viewport serves one Gantt (share the models instead)', () => {
    const viewport = new Viewport();
    viewport.bind(dataset, noop);

    expect(() => viewport.bind(dataset, noop)).toThrow(/already bound/);
  });

  it('unbind releases the Viewport for a later bind', () => {
    const viewport = new Viewport();
    const handle = viewport.bind(dataset, noop);
    handle.unbind();

    expect(() => viewport.bind(dataset, noop)).not.toThrow();
  });
});

// C3/#482 review: `viewport.preset` and `viewport.zoomPresets` both reach `resolvePreset` — an
// invalid custom preset must name the door the caller actually wrote, not a door shared with the
// other setter.
describe('Viewport preset doors name themselves in InvalidPresetError (C3/#482)', () => {
  const tooNarrow = {
    id: 'custom-too-narrow',
    tickUnit: 'hour' as const,
    tickIncrement: 6,
    headers: [{ unit: 'hour' as const, increment: 6, format: () => 'x' }],
    preferredTickWidthPx: 24,
    minTickWidthPx: 32,
  };

  it('an invalid gantt.preset assignment names "gantt.preset"', () => {
    const viewport = new Viewport();
    try {
      viewport.preset = tooNarrow;
      expect.unreachable('expected InvalidPresetError');
    } catch (error) {
      expect((error as { operation?: string }).operation).toBe('gantt.preset');
      expect((error as Error).message).toMatch(/^gantt\.preset:/);
    }
  });

  it('an invalid gantt.zoomPresets assignment names "gantt.zoomPresets", not "gantt.preset"', () => {
    const viewport = new Viewport();
    try {
      viewport.zoomPresets = [tooNarrow];
      expect.unreachable('expected InvalidPresetError');
    } catch (error) {
      expect((error as { operation?: string }).operation).toBe('gantt.zoomPresets');
      expect((error as Error).message).toMatch(/^gantt\.zoomPresets:/);
    }
  });
});

describe('Viewport.zoomTo / zoomBy (S1.9, D-S1.9-5)', () => {
  it('delivers exactly one notification', () => {
    const { viewport, calls } = boundViewport();
    viewport.zoomTo(viewport.timeScale.pxPerMs * 2);
    expect(calls()).toBe(1);
  });

  it('[S1-A3] zoomBy delivers exactly one notification', () => {
    const { viewport, calls } = boundViewport();
    viewport.zoomBy(1.5);
    expect(calls()).toBe(1);
  });

  it('keeps the instant under a stated anchorX fixed across a zoom', () => {
    const { viewport } = boundViewport();
    const anchorX = 100;
    const before = viewport.timeScale.instantForX(viewport.scroll.x.state.position + anchorX);

    viewport.zoomBy(3, anchorX);

    const after = viewport.timeScale.instantForX(viewport.scroll.x.state.position + anchorX);
    expect(Math.abs(diffMs(after, before))).toBeLessThanOrEqual(1);
  });

  it('with no anchorX, the pane center stays centered', () => {
    const { viewport } = boundViewport(400, 200);
    const centerX = 200;
    const before = viewport.timeScale.instantForX(viewport.scroll.x.state.position + centerX);

    viewport.zoomBy(2);

    const after = viewport.timeScale.instantForX(viewport.scroll.x.state.position + centerX);
    expect(Math.abs(diffMs(after, before))).toBeLessThanOrEqual(1);
  });

  it('never moves range.start (D-F′)', () => {
    const { viewport } = boundViewport();
    const rangeStart = viewport.timeScale.range.start;
    viewport.zoomBy(4, 50);
    expect(viewport.timeScale.range.start).toBe(rangeStart);
  });

  it('zoomBy(2) then zoomBy(0.5) returns pxPerMs and scroll.x to their starting values', () => {
    const { viewport } = boundViewport();
    const pxPerMs0 = viewport.timeScale.pxPerMs;
    const x0 = viewport.scroll.x.state.position;

    viewport.zoomBy(2, 60);
    viewport.zoomBy(0.5, 60);

    expect(viewport.timeScale.pxPerMs).toBeCloseTo(pxPerMs0, 8);
    expect(viewport.scroll.x.state.position).toBeCloseTo(x0, 5);
  });

  it('random zoomBy sequences keep the anchored instant within 0.5px of anchorX, whenever the anchor is reachable within scroll bounds', () => {
    fc.assert(
      fc.property(
        fc.array(fc.double({ min: 0.5, max: 2, noNaN: true, noDefaultInfinity: true }), {
          minLength: 1,
          maxLength: 8,
        }),
        (factors) => {
          const { viewport } = boundViewport();
          const anchorX = 80;
          for (const factor of factors) {
            const before = viewport.timeScale.instantForX(viewport.scroll.x.state.position + anchorX);
            viewport.zoomBy(factor, anchorX);
            const { position, max } = viewport.scroll.x.state;
            // Clamping at either scroll bound (D-S1.5-2) is the ONE case where the anchor cannot
            // stay fixed — there is no valid position that would keep it there. Away from both
            // bounds, the invariant must hold exactly (to rounding).
            if (position <= 0 || position >= max) continue;
            const after = viewport.timeScale.instantForX(position + anchorX);
            expect(Math.abs(diffMs(after, before))).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });

  it('called before the first render (pane width 0) resolves to a defined, non-throwing value', () => {
    const viewport = new Viewport({ scale: new TimeScaleModel({ fit: 'preset', preset: 'day' }) });
    viewport.bind(wideDataset, noop);
    expect(() => viewport.zoomTo(viewport.timeScale.pxPerMs * 2)).not.toThrow();
  });

  it('zoomTo pushes content width into visible so a shrink clamps before the next render', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.scroll.x.panTo(50_000);
    expect(viewport.visible.x).toBeGreaterThan(0);

    viewport.zoomTo(viewport.timeScale.pxPerMs / 20);

    const maxX = Math.max(0, viewport.timeScale.contentWidth - 400);
    expect(viewport.visible.x).toBeLessThanOrEqual(maxX);
  });
});

describe('Viewport.zoomIn / zoomOut (S1.12, D-S1.12-6)', () => {
  it('[S1-A7] zoomIn steps one finer zoomPresets entry, keeps the anchored instant, and notifies once', () => {
    const { viewport, calls } = boundViewport();
    const startId = viewport.preset.id;
    const startIndex = viewport.zoomPresets.findIndex((p) => p.id === startId);
    const anchorX = 100;
    const before = viewport.timeScale.instantForX(viewport.scroll.x.state.position + anchorX);

    viewport.zoomIn(anchorX);

    expect(calls()).toBe(1);
    expect(viewport.preset.id).toBe(viewport.zoomPresets[startIndex - 1]!.id);
    const after = viewport.timeScale.instantForX(viewport.scroll.x.state.position + anchorX);
    expect(Math.abs(diffMs(after, before))).toBeLessThanOrEqual(1);
  });

  it('[S1-A7] zoomOut steps one coarser zoomPresets entry and canZoomOut agrees until the coarsest', () => {
    const { viewport, calls } = boundViewport();
    expect(viewport.canZoomOut).toBe(true);
    const startId = viewport.preset.id;
    const startIndex = viewport.zoomPresets.findIndex((p) => p.id === startId);

    viewport.zoomOut();

    expect(calls()).toBe(1);
    expect(viewport.preset.id).toBe(viewport.zoomPresets[startIndex + 1]!.id);
  });

  it('[S1-A7] zoomIn / zoomOut are no-ops at the ends and canZoomIn / canZoomOut agree', () => {
    const finest = new Viewport({ scale: new TimeScaleModel({ fit: 'preset', preset: 'hour' }) });
    let finestCalls = 0;
    const finestHandle = finest.bind(wideDataset, () => finestCalls++);
    finestHandle.setPaneSize({ width: 400, height: 200 });
    finestHandle.setContentSize({ width: finest.timeScale.contentWidth, height: 5000 });
    finestCalls = 0;

    expect(finest.canZoomIn).toBe(false);
    expect(finest.canZoomOut).toBe(true);
    finest.zoomIn();
    expect(finestCalls).toBe(0);
    expect(finest.preset.id).toBe('hour');

    const coarsest = new Viewport({ scale: new TimeScaleModel({ fit: 'preset', preset: 'year' }) });
    let coarsestCalls = 0;
    const coarsestHandle = coarsest.bind(wideDataset, () => coarsestCalls++);
    coarsestHandle.setPaneSize({ width: 400, height: 200 });
    coarsestHandle.setContentSize({ width: coarsest.timeScale.contentWidth, height: 5000 });
    coarsestCalls = 0;

    expect(coarsest.canZoomOut).toBe(false);
    expect(coarsest.canZoomIn).toBe(true);
    coarsest.zoomOut();
    expect(coarsestCalls).toBe(0);
    expect(coarsest.preset.id).toBe('year');
  });

  it('canZoomIn / canZoomOut and zoom stepping work when the active preset is a spread clone of a ladder member (#116)', () => {
    const { viewport } = boundViewport();
    viewport.scale.preset = { ...viewport.preset, snap: 'none' };
    expect(viewport.canZoomIn).toBe(true);
    expect(viewport.canZoomOut).toBe(true);

    viewport.zoomOut();
    expect(viewport.preset.id).toBe('dayAndWeek');
    expect(viewport.preset.snap).toBe('none');
  });

  it('[S1-A7] zoomIn then zoomOut returns preset and scroll x to their starting values', () => {
    const { viewport } = boundViewport();
    const preset0 = viewport.preset.id;
    const x0 = viewport.scroll.x.state.position;
    expect(viewport.canZoomIn).toBe(true);
    viewport.zoomIn(80);
    viewport.zoomOut(80);
    expect(viewport.preset.id).toBe(preset0);
    expect(viewport.scroll.x.state.position).toBeCloseTo(x0, 5);
  });
});

describe('Viewport.zoomToSpan (S1.12, D-S1.12-7)', () => {
  it('fills the pane with the span, or hits the density floor', () => {
    const { viewport } = boundViewport(400, 200);
    const start = instant('2026-06-01T00:00:00Z');
    const end = instant('2026-07-01T00:00:00Z');
    viewport.zoomToSpan({ start, end });
    expect(viewport.scroll.x.state.position).toBe(viewport.timeScale.xForInstant(start));
    const spanMs = diffMs(end, start);
    const requested = 400 / spanMs;
    expect(viewport.timeScale.pxPerMs).toBeGreaterThanOrEqual(requested - 1e-12);
  });
});

describe('Viewport.panToInstant (S1.12, D-S1.12-8)', () => {
  it("align 'start' (default) puts the instant's content x at the pane's left edge", () => {
    const { viewport } = boundViewport(400, 200);
    const target = instant('2026-06-15T00:00:00Z');
    viewport.panToInstant(target, 'start');
    expect(viewport.scroll.x.state.position).toBe(viewport.timeScale.xForInstant(target));
  });

  it("align 'center' puts the instant at the pane's own centre — exactly paneWidth/2 left of 'start'", () => {
    const { viewport: startViewport } = boundViewport(400, 200);
    const { viewport: centerViewport } = boundViewport(400, 200);
    const target = instant('2026-06-15T00:00:00Z');

    startViewport.panToInstant(target, 'start');
    centerViewport.panToInstant(target, 'center');

    expect(centerViewport.scroll.x.state.position).toBe(startViewport.scroll.x.state.position - 200);
  });

  it('delivers exactly one notification', () => {
    const { viewport, calls } = boundViewport(400, 200);
    viewport.panToInstant(instant('2026-06-15T00:00:00Z'), 'start');
    expect(calls()).toBe(1);
  });

  it('an instant before the scale range clamps to scroll position 0, never negative', () => {
    const { viewport } = boundViewport(400, 200);
    // wideDataset runs Jan-Dec 2026 — well before its own range.start.
    viewport.panToInstant(instant('2020-01-01T00:00:00Z'), 'start');
    expect(viewport.scroll.x.state.position).toBe(0);
  });

  it('an instant past the scale range clamps to scroll.x.max, never past it', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.panToInstant(instant('2099-01-01T00:00:00Z'), 'start');
    expect(viewport.scroll.x.state.position).toBe(viewport.scroll.x.state.max);
  });
});

describe('Viewport.reveal (S1.9, D-S1.9-6)', () => {
  it('is a no-op when target is already inside visible', () => {
    const { viewport, calls } = boundViewport(400, 200);
    viewport.reveal({ x: 10, y: 10, width: 20, height: 20 });
    expect(calls()).toBe(0);
    expect(viewport.scroll.x.state.position).toBe(0);
    expect(viewport.scroll.y.state.position).toBe(0);
  });

  it('moves exactly to the near edge on the x axis when off-screen to the right', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.reveal({ x: 500, y: 10, width: 50, height: 20 });
    // Near edge: target's right edge (550) aligns with visible's right edge.
    expect(viewport.scroll.x.state.position).toBe(550 - 400);
    expect(viewport.scroll.y.state.position).toBe(0);
  });

  it('moves exactly to the near edge on the y axis when off-screen above', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.scroll.y.panTo(300);
    viewport.reveal({ x: 10, y: 100, width: 20, height: 20 });
    expect(viewport.scroll.y.state.position).toBe(100);
  });

  it('moves the minimum distance on both axes at once when off-screen on both', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.reveal({ x: 500, y: 400, width: 50, height: 20 });
    expect(viewport.scroll.x.state.position).toBe(550 - 400);
    expect(viewport.scroll.y.state.position).toBe(420 - 200);
  });

  describe('setEntries (S2.4, D-S2-20)', () => {
    it("an edit inside the bound span does not churn 'fitDataset' (D-S1.5-4)", () => {
      const viewport = new Viewport({ scale: new TimeScaleModel({ range: 'fitDataset' }) });
      let calls = 0;
      const handle = viewport.bind(wideDataset, () => calls++);
      const rangeBefore = viewport.timeScale.range;
      calls = 0;

      // Same span (Jan 1 - Dec 31), just a renamed entry — the resolved scale is unchanged.
      handle.setEntries([entry('t1', '2026-01-01T00:00:00Z', '2026-12-31T00:00:00Z')]);

      expect(calls).toBe(0);
      expect(viewport.timeScale.range).toEqual(rangeBefore);
    });

    it("an edit outside the bound span re-fits 'fitDataset' and notifies", () => {
      const viewport = new Viewport({ scale: new TimeScaleModel({ range: 'fitDataset' }) });
      let calls = 0;
      const handle = viewport.bind(wideDataset, () => calls++);
      calls = 0;

      handle.setEntries([entry('t1', '2026-01-01T00:00:00Z', '2027-06-30T00:00:00Z')]);

      expect(calls).toBe(1);
      expect(viewport.timeScale.range.end).toEqual(instant('2027-06-30T00:00:00Z'));
    });
  });
});

describe('Viewport.visibleSpan (issue #461)', () => {
  // A pinned range and an exact `fit` (px per ms, not a preset) so every edge here is hand-verifiable:
  // 1px == 1 minute, so a 400px pane reads as exactly 400 minutes, no rounding to chase.
  const pinnedRange = { start: instant('2026-01-01T00:00:00Z'), end: instant('2026-01-02T00:00:00Z') };
  const pxPerMs = 1 / MS.MINUTE;

  function exactViewport(
    width: number,
    height = 200,
  ): { viewport: Viewport; handle: ReturnType<Viewport['bind']>; calls: () => number } {
    const viewport = new Viewport({ scale: new TimeScaleModel({ range: pinnedRange, fit: pxPerMs }) });
    let calls = 0;
    const handle = viewport.bind(dataset, () => calls++);
    handle.setPaneSize({ width, height });
    handle.setContentSize({ width: viewport.timeScale.contentWidth, height: 5000 });
    calls = 0;
    return { viewport, handle, calls: () => calls };
  }

  it('at rest, starts exactly at the content range start (D-S1.8-1: no time outside the content)', () => {
    const { viewport } = exactViewport(400);
    expect(viewport.visibleSpan.start).toBe(pinnedRange.start);
  });

  it("is pixel-derived off `visible`'s own edges — exact `instantForX`, never snapped to a tick", () => {
    const { viewport } = exactViewport(400);
    viewport.scroll.x.panTo(37); // an arbitrary, non-tick-aligned offset
    const { start, end } = viewport.visibleSpan;
    expect(start).toBe(viewport.timeScale.instantForX(viewport.visible.x));
    expect(end).toBe(viewport.timeScale.instantForX(viewport.visible.x + viewport.visible.width));
  });

  it('half-open: `end` is exclusive, exactly the pane width ahead of `start` in the scale’s own unit', () => {
    const { viewport } = exactViewport(400); // 400px @ 1px/min == 400 minutes
    const { start, end } = viewport.visibleSpan;
    expect(diffMs(end, start)).toBe(400 * MS.MINUTE);
  });

  it('pan moves the span and leaves its width (duration) unchanged', () => {
    const { viewport } = exactViewport(400);
    const before = viewport.visibleSpan;

    viewport.scroll.x.panTo(120);
    const after = viewport.visibleSpan;

    expect(after.start).not.toBe(before.start);
    expect(diffMs(after.end, after.start)).toBe(diffMs(before.end, before.start));
  });

  it('zoom in narrows the span; zoom out widens it', () => {
    const { viewport } = exactViewport(400);
    const atRest = diffMs(viewport.visibleSpan.end, viewport.visibleSpan.start);

    viewport.zoomBy(2); // denser: the same pane now covers less time
    expect(diffMs(viewport.visibleSpan.end, viewport.visibleSpan.start)).toBeLessThan(atRest);

    viewport.zoomBy(0.125); // coarser than the original rest state
    expect(diffMs(viewport.visibleSpan.end, viewport.visibleSpan.start)).toBeGreaterThan(atRest);
  });

  it('scrolling to either end clamps the span to the content range — there is no time outside the content', () => {
    const { viewport } = exactViewport(400);

    viewport.scroll.x.panTo(0);
    expect(viewport.visibleSpan.start).toBe(pinnedRange.start);

    viewport.scroll.x.panTo(viewport.scroll.x.state.max);
    expect(viewport.visibleSpan.end).toBe(pinnedRange.end);
  });

  it('a wide pane under a narrow content range clamps to content on both edges, no wider (`fit: "pane"` case)', () => {
    // The pane (2000px) is wider than the pinned day's own content (1440px @ 1px/min), the same
    // shape a `fit: 'pane'` Gantt sees when its content is narrower than the measured pane.
    const { viewport } = exactViewport(2000);
    expect(viewport.visibleSpan).toEqual(pinnedRange);
  });

  it('a zero-width pane answers the degenerate span {start, end} at the clamped left edge — not "everything visible"', () => {
    const { viewport, handle } = exactViewport(400);
    viewport.scroll.x.panTo(120);
    const leftEdgeBefore = viewport.visibleSpan.start;

    handle.setPaneSize({ width: 0, height: 200 });

    const span = viewport.visibleSpan;
    expect(span.start).toBe(span.end);
    // `visible.width > 0` disabling culling (`layout/frame.ts`) is a renderer convenience meaning
    // "cull nothing" — reusing it here would claim the whole content is visible, which is false.
    expect(span.start).toBe(leftEdgeBefore);
  });

  it('per Gantt, not per scale model: two Viewports sharing one ScrollAxis but different pane widths report different spans', () => {
    const sharedX = new ScrollAxis();
    const sharedScale = new TimeScaleModel({ range: pinnedRange, fit: pxPerMs });
    const narrow = new Viewport({ scale: sharedScale, scroll: { x: sharedX } });
    const wide = new Viewport({ scale: sharedScale, scroll: { x: sharedX } });
    const narrowHandle = narrow.bind(dataset, noop);
    const wideHandle = wide.bind(dataset, noop);
    narrowHandle.setContentSize({ width: narrow.timeScale.contentWidth, height: 1000 });
    wideHandle.setContentSize({ width: wide.timeScale.contentWidth, height: 1000 });
    narrowHandle.setPaneSize({ width: 200, height: 200 });
    wideHandle.setPaneSize({ width: 800, height: 200 });

    expect(narrow.visibleSpan.start).toBe(wide.visibleSpan.start); // same shared scroll position
    expect(narrow.visibleSpan.end).not.toBe(wide.visibleSpan.end); // different pane width
  });
});
