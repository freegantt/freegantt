// data/ — the shared bus, moved verbatim from view/event-bus.ts. `view/event-bus.ts`'s own
// header used to defer this call: "a bus shared with a future Dataset event would be a third runtime
// carve-out in a module specified as types-only. The step that actually needs sharing makes that
// call, with the caller in front of it." This is that step: `plans/02` §3 puts `change` on
// the Dataset and `gridWidthChange` on the Gantt, and both need one `EventBus`. `data/` is pure,
// DOM-free, and `view/ --> data/` is an existing edge in the layer map (§1) — `model/` stays types
// only (`model-is-types-only`).
//
// The event maps themselves stay with their owners: `GanttEventMap` in `view/event-bus.ts`,
// `DatasetEventMap` in `model/change-set.ts` (public event vocabulary, so it lives with the rest of
// the model/ type surface). This file exports only the mechanism.
//
// S3.5: a handler may veto asynchronously by returning a `Promise` instead of `false` — but
// only for the event names a caller opts into via `TAsyncKeys` (default `never`, `beforeChange`
// stays sync-only, unchanged). `GanttEventMap`'s `beforeEntryMove`/`beforeEntryResize` are the first
// (and, for now, only) `TAsyncKeys` a caller names — see `view/event-bus.ts`'s `AsyncCancelableEvent`.

import type { Disposer } from '../model/index.js';

export type SyncVeto = void | false;

/**
 * The reason one `before*` emit was refused (#210).
 *
 * Core makes one per emit, hands `refuse` to the handlers on the payload, and reads `reason` back
 * once the veto has settled. Two steps, because the bus answers a boolean and a boolean carries no
 * words: `refuse` writes the words down here, and returns the same `false` the bus already
 * understands.
 *
 * The first reason wins. Two handlers may both refuse one changeset, and core cannot rank their
 * words — so it keeps the first and never joins two sentences into one message.
 *
 * `refuse` is an arrow property, not a method, so a handler may destructure it
 * (`({ refuse }) => refuse('…')`) and still write here.
 */
export class RefusalNote {
  #reason: string | undefined;

  readonly refuse = (reason: string): false => {
    this.#reason ??= reason;
    return false;
  };

  /** What the first refusing handler said, or `undefined` when none said anything. */
  get reason(): string | undefined {
    return this.#reason;
  }
}

export class EventBus<TEvents, TAsyncKeys extends keyof TEvents = never> {
  #handlers = new Map<
    keyof TEvents,
    Set<(payload: TEvents[keyof TEvents]) => SyncVeto | Promise<SyncVeto>>
  >();

  /** Every plugin registration seam returns a `Disposer` (I2); this is the one an event handler
   *  gets. Calling it removes exactly this `handler` from `name` — `off(name, handler)` still works
   *  too, for a caller that already held both. A second call is a no-op, the same as calling `off`
   *  twice: `Set.delete` on an already-removed handler answers `false` and does nothing else. */
  on<K extends keyof TEvents>(
    name: K,
    handler: (payload: TEvents[K]) => SyncVeto | (K extends TAsyncKeys ? Promise<SyncVeto> : never),
  ): Disposer {
    let handlers = this.#handlers.get(name);
    if (!handlers) {
      handlers = new Set();
      this.#handlers.set(name, handlers);
    }
    const stored = handler as (payload: TEvents[keyof TEvents]) => SyncVeto | Promise<SyncVeto>;
    handlers.add(stored);
    return () => this.#handlers.get(name)?.delete(stored);
  }

  off<K extends keyof TEvents>(
    name: K,
    handler: (payload: TEvents[K]) => SyncVeto | (K extends TAsyncKeys ? Promise<SyncVeto> : never),
  ): void {
    this.#handlers
      .get(name)
      ?.delete(handler as (payload: TEvents[keyof TEvents]) => SyncVeto | Promise<SyncVeto>);
  }

  /** Whether anything is listening to `name`. `emit` answers a veto, not a delivery, so a caller
   *  that must know whether a report reached anyone asks here — ADR 0009's console fallback fires
   *  only when the answer is `false`. */
  hasHandler<K extends keyof TEvents>(name: K): boolean {
    const handlers = this.#handlers.get(name);
    return handlers !== undefined && handlers.size > 0;
  }

  /** Every handler runs (a sync veto from one handler does not skip the rest). Returns
   *  `false`/`true` synchronously when no handler returned a `Promise`. When one did, the overall
   *  result waits on **all** of them — a synchronous `false` still vetoes, but it does not
   *  abandon an already-started Promise. A rejected Promise is a veto; the rejection is re-thrown
   *  on a later turn so `void emit()` / `void session.commit()` do not become the unhandled path. */
  emit<K extends keyof TEvents>(
    name: K,
    payload: TEvents[K],
  ): K extends TAsyncKeys ? boolean | Promise<boolean> : boolean {
    // The conditional return type is provable to a caller (K is known there), not to this generic
    // body — one cast, isolated to this line, stands in for the two mirrored `if (K extends ...)`
    // overload bodies that type would otherwise force.
    return this.#emitRaw(name, payload) as K extends TAsyncKeys ? boolean | Promise<boolean> : boolean;
  }

  #emitRaw<K extends keyof TEvents>(name: K, payload: TEvents[K]): boolean | Promise<boolean> {
    const handlers = this.#handlers.get(name);
    if (!handlers) return true;
    let ok = true;
    const pending: Promise<SyncVeto>[] = [];
    for (const handler of handlers) {
      const result = handler(payload);
      if (result === false) ok = false;
      else if (result instanceof Promise) pending.push(result);
    }
    if (pending.length === 0) return ok;
    return Promise.allSettled(pending).then((outcomes) => {
      let allowed = ok;
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') {
          allowed = false;
          const reason: unknown = outcome.reason;
          queueMicrotask(() => {
            throw reason;
          });
        } else if (outcome.value === false) {
          allowed = false;
        }
      }
      return allowed;
    });
  }
}
