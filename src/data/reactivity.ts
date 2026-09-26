// The only file that sees the reactive dependency (plans/04 §1, docs/02 §3.8). Instance-scoped:
// nothing here holds module-level state (I2) — every `signal`/`computed` call creates its own cell,
// and two Gantt instances' stores share no reactive graph.
//
// Exactly the three primitives S2's own code calls (`data/reactivity.test.ts`). `effect` is not
// exported: nothing in S2 subscribes to a derived value — delta delivery is the event bus's job
// — and an unused export is the I11 defect B8 lands to catch.

import { computed as alienComputed, endBatch, signal as alienSignal, startBatch } from 'alien-signals';

export interface Signal<T> {
  get(): T;
  set(value: T): void;
}

export function signal<T>(initial: T): Signal<T> {
  const cell = alienSignal(initial);
  return {
    get: () => cell(),
    set: (value: T) => {
      cell(value);
    },
  };
}

export function computed<T>(compute: () => T): () => T {
  return alienComputed(compute);
}

export function batch(run: () => void): void {
  startBatch();
  try {
    run();
  } finally {
    endBatch();
  }
}
