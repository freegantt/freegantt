// view/ — the first bus in the codebase (plans/01 §8.3, D-S1.8-3/D-S1.8-4). `plans/02` §3 puts view
// events on the Gantt and data events on the Dataset — two emitters, not one object. `GanttShell`
// owns this instance because the shell is what holds the splitter; `Gantt.on`/`Gantt.off` delegate
// to it, the same way `Gantt` delegates every other job to its shell.
//
// Not `model/`: `data/` may import only `model/`, and a bus shared with a future Dataset event would
// be a third runtime carve-out in a module specified as types-only. The step that actually needs
// sharing makes that call, with the caller in front of it (D-S1.8-4).

export interface GridWidthChange {
  readonly from: number;
  readonly to: number;
}

/** Ships with exactly two events, and both fire — nothing is declared that does not (I11). Sync veto
 *  only; the async-veto path `plans/02` §3 describes belongs to S4's gesture controllers. */
export interface GanttEventMap {
  beforeGridWidthChange: GridWidthChange;
  gridWidthChange: GridWidthChange;
}

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
