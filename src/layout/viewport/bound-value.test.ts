import { describe, expect, it } from 'vitest';
import { BoundValue } from './bound-value.js';
import { BatchedNotifier } from './batched-notifier.js';

// The D-S1.5-4 contract, tested once, on the object that implements it for both viewport models.
// TimeScaleModel's and ScrollModel's own suites still exercise it end to end through what they
// resolve; what is here is the contract itself, with a resolution simple enough to read.

interface Contribution {
  value: number;
}

/** Resolves the largest contribution — enough to make "the inputs changed but the resolved value
 * did not" a real case, which is the half of the contract that is easy to get wrong. */
function largest(): BoundValue<Contribution, { max: number }> {
  return new BoundValue<Contribution, { max: number }>({
    resolve: (bindings) => {
      let max = 0;
      for (const binding of bindings) max = Math.max(max, binding.value);
      return { max };
    },
    equals: (a, b) => a.max === b.max,
  });
}

describe('BoundValue — the D-S1.5-4 contract', () => {
  it('notifies the newcomer on bind, even when the resolved value did not move', () => {
    const bound = largest();
    let first = 0;
    bound.bind({ value: 10 }, () => first++);
    first = 0;

    let second = 0;
    bound.bind({ value: 10 }, () => second++);

    expect(second).toBe(1); // its own first render
    expect(first).toBe(0); // nothing changed for the one already bound
  });

  it('notifies the bindings already there when a bind does move the value', () => {
    const bound = largest();
    let first = 0;
    bound.bind({ value: 10 }, () => first++);
    first = 0;

    bound.bind({ value: 20 }, () => {});

    expect(first).toBe(1);
  });

  it('resolves from every binding, and re-resolves after an invalidate', () => {
    const bound = largest();
    const contribution = { value: 10 };
    bound.bind(contribution, () => {});
    expect(bound.resolved.max).toBe(10);

    contribution.value = 30;
    expect(bound.resolved.max).toBe(10); // memoized until something says otherwise
    bound.invalidate();
    expect(bound.resolved.max).toBe(30);
  });

  it('an invalidate that does not move the resolved value notifies nobody', () => {
    const bound = largest();
    let calls = 0;
    bound.bind({ value: 10 }, () => calls++);
    bound.bind({ value: 5 }, () => calls++);
    calls = 0;

    bound.invalidate();

    expect(calls).toBe(0);
  });

  it('unbind never notifies the departing binding, and notifies the rest iff the value moved', () => {
    const bound = largest();
    let staying = 0;
    let leaving = 0;
    bound.bind({ value: 10 }, () => staying++);
    const tallest = bound.bind({ value: 20 }, () => leaving++);
    staying = 0;
    leaving = 0;

    tallest.unbind();

    expect(leaving).toBe(0);
    expect(staying).toBe(1);
    expect(bound.resolved.max).toBe(10);
  });

  it('unbind removes its own binding and no other, even when two bindings are identical', () => {
    const bound = largest();
    let survivorCalls = 0;
    const survivor = { value: 10 };
    let unboundCalls = 0;
    const first = bound.bind({ value: 10 }, () => unboundCalls++);
    bound.bind(survivor, () => survivorCalls++);
    survivorCalls = 0;
    unboundCalls = 0;

    first.unbind();
    survivor.value = 40;
    bound.invalidate();

    expect(survivorCalls).toBe(1);
    expect(unboundCalls).toBe(0);
    expect(bound.resolved.max).toBe(40);
  });

  it('batch delivers at most one notification, and only if the value moved', () => {
    const bound = largest();
    let calls = 0;
    const contribution = { value: 10 };
    bound.bind(contribution, () => calls++);
    calls = 0;

    bound.batch(() => {
      contribution.value = 20;
      bound.invalidate();
      contribution.value = 30;
      bound.invalidate();
    });

    expect(calls).toBe(1);
    expect(bound.resolved.max).toBe(30);

    calls = 0;
    bound.batch(() => bound.invalidate());
    expect(calls).toBe(0);
  });
});

describe('BatchedNotifier', () => {
  it('delivers immediately outside a batch', () => {
    let calls = 0;
    const notifier = new BatchedNotifier(() => calls++);

    notifier.notify();
    notifier.notify();

    expect(calls).toBe(2);
  });

  it('is re-entrant — only the outermost batch flushes', () => {
    let calls = 0;
    const notifier = new BatchedNotifier(() => calls++);

    notifier.batch(() => {
      notifier.notify();
      notifier.batch(() => notifier.notify());
      expect(calls).toBe(0);
    });

    expect(calls).toBe(1);
  });

  it('a throwing run still flushes, and leaves the notifier usable', () => {
    let calls = 0;
    const notifier = new BatchedNotifier(() => calls++);

    expect(() =>
      notifier.batch(() => {
        notifier.notify();
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(calls).toBe(1);

    notifier.notify();
    expect(calls).toBe(2);
  });

  it('a batch with nothing to say delivers nothing', () => {
    let calls = 0;
    const notifier = new BatchedNotifier(() => calls++);

    notifier.batch(() => {});

    expect(calls).toBe(0);
  });
});
