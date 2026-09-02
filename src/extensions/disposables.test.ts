import { describe, expect, it } from 'vitest';
import { DisposableStore } from './disposables.js';

describe('DisposableStore', () => {
  it('runs added disposers in reverse order', () => {
    const store = new DisposableStore();
    const order: number[] = [];
    store.add(() => order.push(1));
    store.add(() => order.push(2));
    store.add(() => order.push(3));

    store.disposeAll();

    expect(order).toEqual([3, 2, 1]);
  });

  it('is idempotent — a second disposeAll() runs nothing again', () => {
    let calls = 0;
    const store = new DisposableStore();
    store.add(() => calls++);

    store.disposeAll();
    store.disposeAll();

    expect(calls).toBe(1);
  });

  it('runs a disposer added after disposeAll() immediately', () => {
    const store = new DisposableStore();
    store.disposeAll();

    let ran = false;
    store.add(() => (ran = true));

    expect(ran).toBe(true);
  });
});
