// data/ — the shared bus, moved verbatim from view/event-bus.ts (D-S2-5). `view/event-bus.ts`'s own
// header used to defer this call: "a bus shared with a future Dataset event would be a third runtime
// carve-out in a module specified as types-only. The step that actually needs sharing makes that
// call, with the caller in front of it (D-S1.8-4)." This is that step: `plans/02` §3 puts `change` on
// the Dataset and `gridWidthChange` on the Gantt, and both need one `EventBus`. `data/` is pure,
// DOM-free, and `view/ --> data/` is an existing edge in the layer map (§1) — `model/` stays types
// only (`model-is-types-only`).
//
// The event maps themselves stay with their owners: `GanttEventMap` in `view/event-bus.ts`,
// `DatasetEventMap` in `data/dataset-state.ts`. This file exports only the mechanism.

export class EventBus<TEvents> {
  #handlers = new Map<keyof TEvents, Set<(payload: TEvents[keyof TEvents]) => void | false>>();

  on<K extends keyof TEvents>(name: K, handler: (payload: TEvents[K]) => void | false): void {
    let handlers = this.#handlers.get(name);
    if (!handlers) {
      handlers = new Set();
      this.#handlers.set(name, handlers);
    }
    handlers.add(handler as (payload: TEvents[keyof TEvents]) => void | false);
  }

  off<K extends keyof TEvents>(name: K, handler: (payload: TEvents[K]) => void | false): void {
    this.#handlers.get(name)?.delete(handler as (payload: TEvents[keyof TEvents]) => void | false);
  }

  /** Returns `false` if any handler returned `false`. Notification events ignore the result. */
  emit<K extends keyof TEvents>(name: K, payload: TEvents[K]): boolean {
    const handlers = this.#handlers.get(name);
    if (!handlers) return true;
    let ok = true;
    for (const handler of handlers) {
      if (handler(payload) === false) ok = false;
    }
    return ok;
  }
}
