import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Viewport } from './viewport.js';
import type { DatasetBinding } from './viewport.js';
import { TimeScaleModel } from './time-scale-model.js';
import { ScrollModel } from './scroll-model.js';
import { diffMs, instant } from '../../time/index.js';
import { entryId } from '../../model/index.js';
import type { Entry } from '../../model/index.js';

function entry(id: string, start: string, end: string): Entry {
  return { id: entryId(id), name: id, start: instant(start), end: instant(end) };
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
  // A real GanttShell.render() pushes this after computing a frame — done by hand here so
  // ScrollModel.max is non-zero and panTo/reveal have somewhere to move to.
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
    const sharedScroll = new ScrollModel();
    const big = new Viewport({ scroll: sharedScroll });
    const small = new Viewport({ scroll: sharedScroll });
    const bigHandle = big.bind(dataset, noop);
    const smallHandle = small.bind(dataset, noop);

    bigHandle.setContentSize({ width: 0, height: 5000 });
    bigHandle.setPaneSize({ width: 0, height: 800 });
    smallHandle.setContentSize({ width: 0, height: 1000 });
    smallHandle.setPaneSize({ width: 0, height: 800 });

    // Pin past the small chart's own max (200) but within the big chart's (4200) — the shared
    // ScrollModel's position is what the user asked for; each chart must still render what it can
    // show, not what was asked for (D-S1.5-2).
    sharedScroll.panTo({ y: 4200 });

    expect(big.visible.y).toBe(4200);
    expect(small.visible.y).toBe(200);
  });

  it('unbind detaches both models', () => {
    const sharedScale = new TimeScaleModel();
    const sharedScroll = new ScrollModel();
    let otherCalls = 0;
    const other = new Viewport({ scale: sharedScale, scroll: sharedScroll });
    const otherHandle = other.bind(dataset, () => otherCalls++);
    otherHandle.setContentSize({ width: 0, height: 1000 });
    otherHandle.setPaneSize({ width: 0, height: 200 });

    const unbinding = new Viewport({ scale: sharedScale, scroll: sharedScroll });
    let calls = 0;
    const handle = unbinding.bind(dataset, () => calls++);
    calls = 0;
    otherCalls = 0;

    handle.unbind();

    // A change on the remaining binding still notifies it, but not the one that unbound.
    other.scroll.panTo({ y: 500 });
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
        handle.setPaneSize({ width: 50, height: 50 });
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
    const before = viewport.timeScale.instantForX(viewport.scroll.state.position.x + anchorX);

    viewport.zoomBy(3, anchorX);

    const after = viewport.timeScale.instantForX(viewport.scroll.state.position.x + anchorX);
    expect(Math.abs(diffMs(after, before))).toBeLessThanOrEqual(1);
  });

  it('with no anchorX, the pane center stays centered', () => {
    const { viewport } = boundViewport(400, 200);
    const centerX = 200;
    const before = viewport.timeScale.instantForX(viewport.scroll.state.position.x + centerX);

    viewport.zoomBy(2);

    const after = viewport.timeScale.instantForX(viewport.scroll.state.position.x + centerX);
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
    const x0 = viewport.scroll.state.position.x;

    viewport.zoomBy(2, 60);
    viewport.zoomBy(0.5, 60);

    expect(viewport.timeScale.pxPerMs).toBeCloseTo(pxPerMs0, 8);
    expect(viewport.scroll.state.position.x).toBeCloseTo(x0, 5);
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
            const before = viewport.timeScale.instantForX(viewport.scroll.state.position.x + anchorX);
            viewport.zoomBy(factor, anchorX);
            const { position, max } = viewport.scroll.state;
            // Clamping at either scroll bound (D-S1.5-2) is the ONE case where the anchor cannot
            // stay fixed — there is no valid position that would keep it there. Away from both
            // bounds, the invariant must hold exactly (to rounding).
            if (position.x <= 0 || position.x >= max.x) continue;
            const after = viewport.timeScale.instantForX(position.x + anchorX);
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
});

describe('Viewport.reveal (S1.9, D-S1.9-6)', () => {
  it('is a no-op when target is already inside visible', () => {
    const { viewport, calls } = boundViewport(400, 200);
    viewport.reveal({ x: 10, y: 10, width: 20, height: 20 });
    expect(calls()).toBe(0);
    expect(viewport.scroll.state.position).toEqual({ x: 0, y: 0 });
  });

  it('moves exactly to the near edge on the x axis when off-screen to the right', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.reveal({ x: 500, y: 10, width: 50, height: 20 });
    // Near edge: target's right edge (550) aligns with visible's right edge.
    expect(viewport.scroll.state.position.x).toBe(550 - 400);
    expect(viewport.scroll.state.position.y).toBe(0);
  });

  it('moves exactly to the near edge on the y axis when off-screen above', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.scroll.panTo({ y: 300 });
    viewport.reveal({ x: 10, y: 100, width: 20, height: 20 });
    expect(viewport.scroll.state.position.y).toBe(100);
  });

  it('moves the minimum distance on both axes at once when off-screen on both', () => {
    const { viewport } = boundViewport(400, 200);
    viewport.reveal({ x: 500, y: 400, width: 50, height: 20 });
    expect(viewport.scroll.state.position).toEqual({ x: 550 - 400, y: 420 - 200 });
  });
});
