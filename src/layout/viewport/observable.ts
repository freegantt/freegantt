// A tiny, hand-rolled notify primitive for layout/'s shareable viewport models (#6, D-A). Deliberately
// not `data/`'s alien-signals façade: layout/ has no edge to data/ (I1), and this is one Set of
// callbacks, not a reactivity system — the moment a third shareable model wants more than
// subscribe/notify, that's the signal to consolidate under the data/ façade instead of growing this.

interface Observable {
  /** Registers `fn` to run on every `notify()` until the returned dispose is called. */
  subscribe(fn: () => void): () => void;
  /** Runs every current subscriber, in subscription order. */
  notify(): void;
}

export function createObservable(): Observable {
  const listeners = new Set<() => void>();
  return {
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    notify() {
      for (const fn of listeners) fn();
    },
  };
}
