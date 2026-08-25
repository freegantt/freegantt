// layout/viewport — the delivery half of a Batch (CONTEXT.md): several writes, at most one
// notification, and no observer ever sees an intermediate state. Every viewport object needs it
// and all three implemented it identically (depth counter, pending flag, flush in a `finally` so a
// throwing `run` cannot wedge the object). It is deliberately the *whole* mechanism: it knows
// nothing about bindings, resolved values or "changed" — `BoundValue` layers that on top, and
// `Viewport`, which has one subscriber and delegates every comparison to the models it fans in,
// uses this alone.

export class BatchedNotifier {
  readonly #deliver: () => void;
  #depth = 0;
  #pending = false;

  constructor(deliver: () => void) {
    this.#deliver = deliver;
  }

  /** Deliver now, or once at the end of the outermost batch. */
  notify(): void {
    if (this.#depth > 0) {
      this.#pending = true;
      return;
    }
    this.#deliver();
  }

  /** Re-entrant; flushes at the outermost exit, in a `finally` (conventions §5). */
  batch(run: () => void): void {
    this.#depth++;
    try {
      run();
    } finally {
      this.#depth--;
      if (this.#depth === 0 && this.#pending) {
        this.#pending = false;
        this.#deliver();
      }
    }
  }
}
