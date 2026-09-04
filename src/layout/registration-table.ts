// layout/ — the one table behind every plugin `register*` seam (S5.9, #154). A key holds a stack of
// live registrations. The newest one wins. Disposing one removes exactly that registration, so
// dropping an early plugin never disturbs a later one on the same key.

import type { Disposer } from '../model/index.js';

export interface RegistrationTable<K, V> {
  /** The winning registration for `key` — the newest one still live — or `undefined`. */
  get(key: K): V | undefined;
  /** Every key's winning registration, in first-registration order. Deliberately not `values()`:
   *  it answers one value per key, not every value ever registered. */
  active(): readonly V[];
  /** Adds `value` as the newest registration for `key`. The returned `Disposer` removes exactly
   *  this registration — never a sibling on the same key, in any disposal order — and is
   *  idempotent. `get(key)` then falls back to the newest registration left, or to the initial
   *  value, or to `undefined`. */
  register(key: K, value: V): Disposer;
}

interface Registration<V> {
  readonly value: V;
}

function winner<V>(stack: Registration<V>[] | undefined): Registration<V> | undefined {
  return stack?.[stack.length - 1];
}

/** Call: `createRegistrationTable<EntryKind, ItemProducer>([['span', produceSpanItems]])`. Initial
 *  pairs are the floor nothing disposes; a later pair for the same key replaces an earlier one. */
export function createRegistrationTable<K, V>(
  initial: Iterable<readonly [K, V]> = [],
): RegistrationTable<K, V> {
  const stacks = new Map<K, Registration<V>[]>();
  for (const [key, value] of initial) stacks.set(key, [{ value }]);

  return {
    get(key) {
      return winner(stacks.get(key))?.value;
    },
    active() {
      const values: V[] = [];
      for (const stack of stacks.values()) {
        const top = winner(stack);
        if (top !== undefined) values.push(top.value);
      }
      return values;
    },
    register(key, value) {
      const stack = stacks.get(key) ?? [];
      stacks.set(key, stack);
      const registration: Registration<V> = { value };
      stack.push(registration);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        const index = stack.indexOf(registration);
        if (index !== -1) stack.splice(index, 1);
        if (stack.length === 0) stacks.delete(key);
      };
    },
  };
}
