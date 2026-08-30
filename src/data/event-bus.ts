// data/ — the shared bus, moved verbatim from view/event-bus.ts (D-S2-5). `view/event-bus.ts`'s own
// header used to defer this call: "a bus shared with a future Dataset event would be a third runtime
// carve-out in a module specified as types-only. The step that actually needs sharing makes that
// call, with the caller in front of it (D-S1.8-4)." This is that step: `plans/02` §3 puts `change` on
// the Dataset and `gridWidthChange` on the Gantt, and both need one `EventBus`. `data/` is pure,
// DOM-free, and `view/ --> data/` is an existing edge in the layer map (§1) — `model/` stays types
// only (`model-is-types-only`).
//
// The event maps themselves stay with their owners: `GanttEventMap` in `view/event-bus.ts`,
// `DatasetEventMap` in `model/change-set.ts` (public event vocabulary, so it lives with the rest of
// the model/ type surface). This file exports only the mechanism.
//
// S3.5, D-S3-17: a handler may veto asynchronously by returning a `Promise` instead of `false` — but
// only for the event names a caller opts into via `TAsyncKeys` (default `never`, D-S2-9's `beforeChange`
// stays sync-only, unchanged). `GanttEventMap`'s `beforeEntryMove`/`beforeEntryResize` are the first
// (and, for now, only) `TAsyncKeys` a caller names — see `view/event-bus.ts`'s `AsyncCancelableEvent`.

export type SyncVeto = void | false;

export class EventBus<TEvents, TAsyncKeys extends keyof TEvents = never> {
  #handlers = new Map<
    keyof TEvents,
    Set<(payload: TEvents[keyof TEvents]) => SyncVeto | Promise<SyncVeto>>
  >();

  on<K extends keyof TEvents>(
    name: K,
    handler: (payload: TEvents[K]) => SyncVeto | (K extends TAsyncKeys ? Promise<SyncVeto> : never),
  ): void {
    let handlers = this.#handlers.get(name);
    if (!handlers) {
      handlers = new Set();
      this.#handlers.set(name, handlers);
    }
    handlers.add(handler as (payload: TEvents[keyof TEvents]) => SyncVeto | Promise<SyncVeto>);
  }

  off<K extends keyof TEvents>(
    name: K,
    handler: (payload: TEvents[K]) => SyncVeto | (K extends TAsyncKeys ? Promise<SyncVeto> : never),
  ): void {
    this.#handlers
      .get(name)
      ?.delete(handler as (payload: TEvents[keyof TEvents]) => SyncVeto | Promise<SyncVeto>);
  }

  /** Every handler runs, same as before (a sync veto from one handler does not skip the rest).
   *  Returns `false`/`true` synchronously when no handler returned a `Promise`. When one did, the
   *  overall result waits on all of them (D-S3-17) — a synchronous `false` from another handler still
   *  wins immediately, without waiting. */
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
    if (!ok) return false;
    if (pending.length === 0) return true;
    return Promise.all(pending).then((results) => !results.includes(false));
  }
}
