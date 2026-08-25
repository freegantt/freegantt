import { describe, expect, it } from 'vitest';
import { ScrollModel } from './scroll-model.js';

const noop = () => {};

describe('ScrollModel', () => {
  it('starts at {0,0} by default', () => {
    const model = new ScrollModel();
    expect(model.state.position).toEqual({ x: 0, y: 0 });
    expect(model.state.max).toEqual({ x: 0, y: 0 });
  });

  it('honours an initial position intent', () => {
    const model = new ScrollModel({ position: { x: 10, y: 20 } });
    expect(model.state.position).toEqual({ x: 10, y: 20 });
  });

  it('panTo clamps to [0, max]', () => {
    const model = new ScrollModel();
    model.bind({ content: { width: 1000, height: 500 }, pane: { width: 400, height: 200 } }, noop);

    model.panTo({ x: -50, y: -50 });
    expect(model.state.position).toEqual({ x: 0, y: 0 });

    model.panTo({ x: 10000, y: 10000 });
    expect(model.state.position).toEqual({ x: 600, y: 300 });
  });

  it('max is the loosest bound across bindings (D-S1.5-1)', () => {
    const model = new ScrollModel();
    // A: 5000-tall content in an 800 pane -> max.y 4200. B: 1000-tall content in an 800 pane -> max.y 200.
    model.bind({ content: { width: 100, height: 5000 }, pane: { width: 100, height: 800 } }, noop);
    model.bind({ content: { width: 100, height: 1000 }, pane: { width: 100, height: 800 } }, noop);

    expect(model.state.max.y).toBe(4200);
  });

  it('a max shrink leaves position untouched; restoring the extent restores the place (U4, D-S1.5-2)', () => {
    const model = new ScrollModel();
    const handle = model.bind(
      { content: { width: 100, height: 5000 }, pane: { width: 100, height: 800 } },
      noop,
    );
    model.panTo({ y: 4200 });
    expect(model.state.position.y).toBe(4200);

    // Filter collapses the content to 10 rows.
    handle.setContent({ width: 100, height: 320 });
    expect(model.state.position.y).toBe(4200);
    expect(model.state.max.y).toBe(0);

    // Clear the filter: position was never touched, so the place comes right back.
    handle.setContent({ width: 100, height: 5000 });
    expect(model.state.position.y).toBe(4200);
    expect(model.state.max.y).toBe(4200);
  });

  it('bind always notifies the newcomer', () => {
    const model = new ScrollModel();
    let calls = 0;
    model.bind({ content: { width: 0, height: 0 }, pane: { width: 0, height: 0 } }, () => calls++);
    expect(calls).toBe(1);
  });

  it('a bind that changes nothing notifies nobody else', () => {
    const model = new ScrollModel();
    let calls = 0;
    model.bind({ content: { width: 100, height: 100 }, pane: { width: 100, height: 100 } }, () => calls++);
    calls = 0;

    // Second binding with an identical, non-loosening extent: max stays {0,0}, position stays {0,0}.
    model.bind({ content: { width: 100, height: 100 }, pane: { width: 100, height: 100 } }, noop);
    expect(calls).toBe(0);
  });

  it('setContent that grows content notifies once; the follow-up push with the same numbers notifies nobody', () => {
    const model = new ScrollModel();
    let calls = 0;
    const handle = model.bind(
      { content: { width: 100, height: 100 }, pane: { width: 100, height: 100 } },
      () => calls++,
    );
    calls = 0;

    handle.setContent({ width: 100, height: 900 });
    expect(calls).toBe(1);

    handle.setContent({ width: 100, height: 900 });
    expect(calls).toBe(1);
  });

  it('unbind leaves the others notified', () => {
    const model = new ScrollModel();
    let calls = 0;
    model.bind({ content: { width: 100, height: 900 }, pane: { width: 100, height: 100 } }, () => calls++);
    const other = model.bind(
      { content: { width: 100, height: 2000 }, pane: { width: 100, height: 100 } },
      noop,
    );
    calls = 0;

    other.unbind();
    expect(calls).toBe(1);
  });

  describe('batch', () => {
    it('delivers one notification for several writes', () => {
      const model = new ScrollModel();
      let calls = 0;
      const handle = model.bind(
        { content: { width: 100, height: 100 }, pane: { width: 100, height: 100 } },
        () => calls++,
      );
      calls = 0;

      model.batch(() => {
        handle.setContent({ width: 100, height: 500 });
        model.panTo({ y: 400 });
      });
      expect(calls).toBe(1);
      expect(model.state.position.y).toBe(400);
    });

    it('no observer sees an intermediate state', () => {
      const model = new ScrollModel();
      const seen: number[] = [];
      const handle = model.bind(
        { content: { width: 100, height: 1000 }, pane: { width: 100, height: 100 } },
        () => seen.push(model.state.position.y),
      );
      seen.length = 0;

      model.batch(() => {
        model.panTo({ y: 100 });
        model.panTo({ y: 300 });
      });
      expect(seen).toEqual([300]);
      void handle;
    });

    it('a throwing run still flushes and leaves the model usable', () => {
      const model = new ScrollModel();
      let calls = 0;
      model.bind({ content: { width: 100, height: 1000 }, pane: { width: 100, height: 100 } }, () => calls++);
      calls = 0;

      expect(() =>
        model.batch(() => {
          model.panTo({ y: 200 });
          throw new Error('boom');
        }),
      ).toThrow('boom');
      expect(calls).toBe(1);
      expect(model.state.position.y).toBe(200);

      calls = 0;
      model.panTo({ y: 300 });
      expect(calls).toBe(1);
    });
  });
});
