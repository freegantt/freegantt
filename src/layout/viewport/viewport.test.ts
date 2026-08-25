import { describe, expect, it } from 'vitest';
import { Viewport } from './viewport.js';
import { TimeScaleModel } from './time-scale-model.js';
import { ScrollModel } from './scroll-model.js';
import { instant } from '../../time/index.js';
import { entryId } from '../../model/index.js';
import type { Dataset, Entry } from '../../model/index.js';

function entry(id: string, start: string, end: string): Entry {
  return { id: entryId(id), name: id, start: instant(start), end: instant(end) };
}

const dataset: Dataset = {
  timeZone: 'UTC',
  entries: [entry('t1', '2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z')],
};

const noop = (): void => {};

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

  it('batch delivers one host reaction and no observer sees an intermediate state', () => {
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
