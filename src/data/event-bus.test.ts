import { describe, expect, it, vi } from 'vitest';
import { EventBus } from './event-bus.js';

describe('EventBus async veto (D-S3-17)', () => {
  it('a rejected handler Promise vetoes and rethrows on a later turn', async () => {
    const scheduled: Array<() => void> = [];
    vi.stubGlobal('queueMicrotask', (cb: () => void) => {
      scheduled.push(cb);
    });
    const bus = new EventBus<{ before: number }, 'before'>();
    const err = new Error('handler rejected');
    bus.on('before', () => Promise.reject(err));

    const result = bus.emit('before', 1);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(() => scheduled[0]!()).toThrow(err);
    vi.unstubAllGlobals();
  });

  it('a sync false still waits on another handler’s already-started Promise, then vetoes', async () => {
    const bus = new EventBus<{ before: number }, 'before'>();
    let settle!: () => void;
    const delayed = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const order: string[] = [];
    bus.on('before', () => {
      order.push('sync-false');
      return false;
    });
    bus.on('before', () => {
      order.push('async-start');
      return delayed.then(() => {
        order.push('async-settled');
      });
    });

    const result = bus.emit('before', 1);
    expect(result).toBeInstanceOf(Promise);
    expect(order).toEqual(['sync-false', 'async-start']);
    settle();
    await expect(result).resolves.toBe(false);
    expect(order).toEqual(['sync-false', 'async-start', 'async-settled']);
  });

  it('a sync false plus a later reject still folds the Promise, vetoes, and rethrows', async () => {
    const scheduled: Array<() => void> = [];
    vi.stubGlobal('queueMicrotask', (cb: () => void) => {
      scheduled.push(cb);
    });
    const bus = new EventBus<{ before: number }, 'before'>();
    const err = new Error('late reject');
    let rejectLater!: (reason: unknown) => void;
    const delayed = new Promise<void>((_resolve, reject) => {
      rejectLater = reject;
    });
    bus.on('before', () => false);
    bus.on('before', () => delayed);

    const result = bus.emit('before', 1);
    expect(result).toBeInstanceOf(Promise);
    rejectLater(err);
    await expect(result).resolves.toBe(false);
    expect(scheduled).toHaveLength(1);
    expect(() => scheduled[0]!()).toThrow(err);
    vi.unstubAllGlobals();
  });
});

// Every plugin registration seam returns a Disposer (I2) — `on` is that seam for an event.
describe('EventBus.on returns a Disposer', () => {
  it('removes exactly the handler it was returned for, leaving another handler on the same event alone', () => {
    const bus = new EventBus<{ tick: number }>();
    const seenA: number[] = [];
    const seenB: number[] = [];
    const disposeA = bus.on('tick', (n) => {
      seenA.push(n);
    });
    bus.on('tick', (n) => {
      seenB.push(n);
    });

    bus.emit('tick', 1);
    disposeA();
    bus.emit('tick', 2);

    expect(seenA).toEqual([1]);
    expect(seenB).toEqual([1, 2]);
  });

  it('calling the Disposer twice is safe — the second call is a no-op', () => {
    const bus = new EventBus<{ tick: number }>();
    const seen: number[] = [];
    const dispose = bus.on('tick', (n) => {
      seen.push(n);
    });

    dispose();
    expect(() => dispose()).not.toThrow();
    bus.emit('tick', 1);
    expect(seen).toEqual([]);
  });
});
