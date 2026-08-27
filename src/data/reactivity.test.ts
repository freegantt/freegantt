import { describe, expect, it } from 'vitest';
import { batch, computed, signal } from './reactivity.js';

describe('reactivity façade', () => {
  it('a computed recomputes once after N signal writes inside one batch', () => {
    const a = signal(1);
    const b = signal(2);
    let computeCount = 0;
    const sum = computed(() => {
      computeCount++;
      return a.get() + b.get();
    });

    expect(sum()).toBe(3);
    computeCount = 0;

    batch(() => {
      a.set(10);
      b.set(20);
      a.set(11);
    });

    expect(sum()).toBe(31);
    expect(computeCount).toBe(1);
  });

  it('two façade instances share nothing (I2)', () => {
    const a = signal(1);
    const b = signal(1);
    a.set(2);
    expect(a.get()).toBe(2);
    expect(b.get()).toBe(1);
  });

  it('a signal read outside any computed just returns the current value', () => {
    const count = signal(0);
    count.set(5);
    expect(count.get()).toBe(5);
  });
});
