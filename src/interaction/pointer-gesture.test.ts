import { describe, expect, it, vi } from 'vitest';
import { createPointerGesture } from './pointer-gesture.js';
import type { PointerGestureCallbacks } from './pointer-gesture.js';

const DRAG_THRESHOLD_PX = 4;
const LONG_PRESS_MS = 400;

function mockPointerCapture(el: HTMLElement): {
  setCapture: ReturnType<typeof vi.fn>;
  releaseCapture: ReturnType<typeof vi.fn>;
} {
  const setCapture = vi.fn();
  const releaseCapture = vi.fn();
  el.setPointerCapture = setCapture;
  el.releasePointerCapture = releaseCapture;
  return { setCapture, releaseCapture };
}

function down(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerdown', { clientX, clientY: 0, pointerId: 1, ...mods });
}

function move(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointermove', { clientX, clientY: 0, pointerId: 1, ...mods });
}

function up(clientX: number, mods: Partial<PointerEventInit> = {}): PointerEvent {
  return new PointerEvent('pointerup', { clientX, clientY: 0, pointerId: 1, ...mods });
}

function makeCallbacks(overrides: Partial<PointerGestureCallbacks> = {}): {
  callbacks: PointerGestureCallbacks;
  calls: string[];
} {
  const calls: string[] = [];
  const callbacks: PointerGestureCallbacks = {
    start: () => {
      calls.push('start');
      return true;
    },
    move: () => calls.push('move'),
    commit: () => calls.push('commit'),
    cancel: () => calls.push('cancel'),
    ...overrides,
  };
  return { callbacks, calls };
}

describe('createPointerGesture — mouse/pen threshold (D-S3-5)', () => {
  it('does not arm below the drag threshold', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    drag.move(move(DRAG_THRESHOLD_PX - 1, { pointerType: 'mouse' }));

    expect(calls).toEqual([]);
  });

  it('arms once movement crosses the drag threshold, then reports commit on pointerup', () => {
    const pane = document.createElement('div');
    const { setCapture, releaseCapture } = mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    drag.move(move(DRAG_THRESHOLD_PX + 1, { pointerType: 'mouse' }));
    expect(calls).toEqual(['start', 'move']);
    expect(setCapture).toHaveBeenCalledWith(1);

    const wasDrag = drag.up(up(DRAG_THRESHOLD_PX + 5, { pointerType: 'mouse' }));
    expect(wasDrag).toBe(true);
    expect(calls).toEqual(['start', 'move', 'commit']);
    expect(releaseCapture).toHaveBeenCalledWith(1);
  });

  it('a pointerup before the threshold arms reports no drag and calls no callback', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    const wasDrag = drag.up(up(1, { pointerType: 'mouse' }));

    expect(wasDrag).toBe(false);
    expect(calls).toEqual([]);
  });

  it('start() returning false refuses arming — no capture taken, no move/commit follow', () => {
    const pane = document.createElement('div');
    const { setCapture } = mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks({ start: () => false });
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    drag.move(move(DRAG_THRESHOLD_PX + 1, { pointerType: 'mouse' }));
    const wasDrag = drag.up(up(DRAG_THRESHOLD_PX + 5, { pointerType: 'mouse' }));

    expect(wasDrag).toBe(false);
    expect(calls).toEqual([]);
    expect(setCapture).not.toHaveBeenCalled();
  });
});

describe('createPointerGesture — touch long-press (D-S3-21)', () => {
  it('a touch pointer does not arm on threshold crossing alone', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'touch' }));
    drag.move(move(DRAG_THRESHOLD_PX + 20, { pointerType: 'touch' }));

    expect(calls).toEqual([]);
  });

  it('arms after LONG_PRESS_MS holding still, at the last-known pointer position', () => {
    vi.useFakeTimers();
    try {
      const pane = document.createElement('div');
      const { setCapture } = mockPointerCapture(pane);
      const { callbacks, calls } = makeCallbacks();
      const drag = createPointerGesture(pane, callbacks);

      drag.down(down(10, { pointerType: 'touch' }));
      vi.advanceTimersByTime(LONG_PRESS_MS);

      expect(calls).toEqual(['start']);
      expect(setCapture).toHaveBeenCalledWith(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('a pointerup before the long-press timer fires cancels the timer — no late arming', () => {
    vi.useFakeTimers();
    try {
      const pane = document.createElement('div');
      mockPointerCapture(pane);
      const { callbacks, calls } = makeCallbacks();
      const drag = createPointerGesture(pane, callbacks);

      drag.down(down(0, { pointerType: 'touch' }));
      drag.up(up(0, { pointerType: 'touch' }));
      vi.advanceTimersByTime(LONG_PRESS_MS);

      expect(calls).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('createPointerGesture — Escape and detach', () => {
  it('Escape mid-drag releases capture and reports cancel, not commit', () => {
    const pane = document.createElement('div');
    const { releaseCapture } = mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    drag.move(move(DRAG_THRESHOLD_PX + 1, { pointerType: 'mouse' }));
    const wasCancelled = drag.escape();

    expect(wasCancelled).toBe(true);
    expect(calls).toEqual(['start', 'move', 'cancel']);
    expect(releaseCapture).toHaveBeenCalledWith(1);
  });

  it('Escape with no armed drag reports false and calls nothing', () => {
    const pane = document.createElement('div');
    mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    const wasCancelled = drag.escape();

    expect(wasCancelled).toBe(false);
    expect(calls).toEqual([]);
  });

  it('pointercancel mid-drag releases capture and reports cancel, not commit (B6)', () => {
    const pane = document.createElement('div');
    const { releaseCapture } = mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    drag.move(move(DRAG_THRESHOLD_PX + 1, { pointerType: 'mouse' }));
    drag.pointercancel(new PointerEvent('pointercancel', { pointerId: 1 }));

    expect(calls).toEqual(['start', 'move', 'cancel']);
    expect(releaseCapture).toHaveBeenCalledWith(1);
  });

  it('pointercancel for an unrelated pointer id is a no-op', () => {
    const pane = document.createElement('div');
    const { releaseCapture } = mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    drag.move(move(DRAG_THRESHOLD_PX + 1, { pointerType: 'mouse' }));
    drag.pointercancel(new PointerEvent('pointercancel', { pointerId: 2 }));

    expect(calls).toEqual(['start', 'move']);
    expect(releaseCapture).not.toHaveBeenCalled();
  });

  it('detach() releases capture without calling cancel', () => {
    const pane = document.createElement('div');
    const { releaseCapture } = mockPointerCapture(pane);
    const { callbacks, calls } = makeCallbacks();
    const drag = createPointerGesture(pane, callbacks);

    drag.down(down(0, { pointerType: 'mouse' }));
    drag.move(move(DRAG_THRESHOLD_PX + 1, { pointerType: 'mouse' }));
    drag.detach();

    expect(calls).toEqual(['start', 'move']);
    expect(releaseCapture).toHaveBeenCalledWith(1);
  });
});
