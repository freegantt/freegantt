import { describe, expect, it } from 'vitest';
import { ScrollAxis, bindScrollAxis } from './scroll-axis.js';

const noop = () => {};

describe('ScrollAxis', () => {
  it('starts at 0 by default', () => {
    const axis = new ScrollAxis();
    expect(axis.state.position).toBe(0);
    expect(axis.state.max).toBe(0);
  });

  it('honours an initial position', () => {
    const axis = new ScrollAxis(10);
    expect(axis.state.position).toBe(10);
  });

  it('panTo clamps to [0, max]', () => {
    const axis = new ScrollAxis();
    bindScrollAxis(axis, { content: 1000, pane: 400 }, noop);

    axis.panTo(-50);
    expect(axis.state.position).toBe(0);

    axis.panTo(10000);
    expect(axis.state.position).toBe(600);
  });

  it('max is the loosest bound across bindings (D-S1.5-1)', () => {
    const axis = new ScrollAxis();
    // A: 5000px content in an 800px pane -> max 4200. B: 1000px content in an 800px pane -> max 200.
    bindScrollAxis(axis, { content: 5000, pane: 800 }, noop);
    bindScrollAxis(axis, { content: 1000, pane: 800 }, noop);

    expect(axis.state.max).toBe(4200);
  });

  it('a max shrink leaves position untouched; restoring the extent restores the place (U4, D-S1.5-2)', () => {
    const axis = new ScrollAxis();
    const handle = bindScrollAxis(axis, { content: 5000, pane: 800 }, noop);
    axis.panTo(4200);
    expect(axis.state.position).toBe(4200);

    // Filter collapses the content to 10 rows.
    handle.setContentSize(320);
    expect(axis.state.position).toBe(4200);
    expect(axis.state.max).toBe(0);

    // Clear the filter: position was never touched, so the place comes right back.
    handle.setContentSize(5000);
    expect(axis.state.position).toBe(4200);
    expect(axis.state.max).toBe(4200);
  });

  it('bind always notifies the newcomer', () => {
    const axis = new ScrollAxis();
    let calls = 0;
    bindScrollAxis(axis, { content: 0, pane: 0 }, () => calls++);
    expect(calls).toBe(1);
  });

  it('a bind that changes nothing notifies nobody else', () => {
    const axis = new ScrollAxis();
    let calls = 0;
    bindScrollAxis(axis, { content: 100, pane: 100 }, () => calls++);
    calls = 0;

    // Second binding with an identical, non-loosening extent: max stays 0, position stays 0.
    bindScrollAxis(axis, { content: 100, pane: 100 }, noop);
    expect(calls).toBe(0);
  });

  it('setContentSize that grows content notifies once; the follow-up push with the same number notifies nobody', () => {
    const axis = new ScrollAxis();
    let calls = 0;
    const handle = bindScrollAxis(axis, { content: 100, pane: 100 }, () => calls++);
    calls = 0;

    handle.setContentSize(900);
    expect(calls).toBe(1);

    handle.setContentSize(900);
    expect(calls).toBe(1);
  });

  it('unbind leaves the others notified', () => {
    const axis = new ScrollAxis();
    let calls = 0;
    bindScrollAxis(axis, { content: 900, pane: 100 }, () => calls++);
    const other = bindScrollAxis(axis, { content: 2000, pane: 100 }, noop);
    calls = 0;

    other.unbind();
    expect(calls).toBe(1);
  });

  describe('batch', () => {
    it('delivers one notification for several writes', () => {
      const axis = new ScrollAxis();
      let calls = 0;
      const handle = bindScrollAxis(axis, { content: 100, pane: 100 }, () => calls++);
      calls = 0;

      axis.batch(() => {
        handle.setContentSize(500);
        axis.panTo(400);
      });
      expect(calls).toBe(1);
      expect(axis.state.position).toBe(400);
    });

    it('no observer sees an intermediate state', () => {
      const axis = new ScrollAxis();
      const seen: number[] = [];
      const handle = bindScrollAxis(axis, { content: 1000, pane: 100 }, () => seen.push(axis.state.position));
      seen.length = 0;

      axis.batch(() => {
        axis.panTo(100);
        axis.panTo(300);
      });
      expect(seen).toEqual([300]);
      void handle;
    });

    it('a throwing run still flushes and leaves the axis usable', () => {
      const axis = new ScrollAxis();
      let calls = 0;
      bindScrollAxis(axis, { content: 1000, pane: 100 }, () => calls++);
      calls = 0;

      expect(() =>
        axis.batch(() => {
          axis.panTo(200);
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(calls).toBe(1);
      expect(axis.state.position).toBe(200);

      calls = 0;
      axis.panTo(300);
      expect(calls).toBe(1);
    });
  });

  describe('state is not a way into the axis', () => {
    it('is frozen — a write through state throws instead of moving the shared axis', () => {
      const axis = new ScrollAxis();
      bindScrollAxis(axis, { content: 1000, pane: 100 }, () => {});
      axis.panTo(40);
      const state = axis.state;

      expect(() => {
        (state as { position: number }).position = 999;
      }).toThrow(TypeError);
      expect(axis.state.position).toBe(40);
      expect(axis.state.max).toBe(900);
    });
  });
});
