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
