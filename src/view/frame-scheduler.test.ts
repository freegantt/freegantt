import { describe, expect, it, vi } from 'vitest';
import { FrameScheduler } from './frame-scheduler.js';

describe('FrameScheduler (D-S2-15)', () => {
  it('coalesces several request() calls in one tick into one render, on the next animation frame', async () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);

    scheduler.request();
    scheduler.request();
    scheduler.request();
    expect(render).not.toHaveBeenCalled();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('flush() renders synchronously and cancels a pending frame', async () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);

    scheduler.request();
    scheduler.flush();
    expect(render).toHaveBeenCalledTimes(1);

    await new Promise((resolve) => requestAnimationFrame(resolve));
    // The pending frame flush() ran early was cancelled — not a second render.
    expect(render).toHaveBeenCalledTimes(1);
  });

  it('cancel() drops a pending frame without rendering', async () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);

    scheduler.request();
    scheduler.cancel();

    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(render).not.toHaveBeenCalled();
  });

  it('a request after flush() schedules a fresh frame', async () => {
    const render = vi.fn();
    const scheduler = new FrameScheduler(render);

    scheduler.flush();
    expect(render).toHaveBeenCalledTimes(1);

    scheduler.request();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(render).toHaveBeenCalledTimes(2);
  });
});
