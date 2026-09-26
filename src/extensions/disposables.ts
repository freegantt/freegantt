// extensions/ — a plugin's own cleanup list. One per plugin, handed to it fresh on
// `ctx.disposables` at setup: whatever a plugin adds here runs on the same schedule as its own
// `setup()` return value — on removal, or on `Gantt.destroy()`.

import type { Disposer } from '../model/plugin.js';

/** Add-only from a plugin's point of view; `disposeAll()` is the runtime's own call, never the
 *  plugin's (a plugin frees its resources by returning from `setup()`, not by disposing itself
 *  mid-flight). Reverse-order and idempotent, the same two guarantees `PluginRuntime` gives the
 *  plugin list itself. */
export class DisposableStore {
  #disposers: Disposer[] = [];
  #disposed = false;

  add(dispose: Disposer): void {
    if (this.#disposed) {
      dispose();
      return;
    }
    this.#disposers.push(dispose);
  }

  /** Runs every added disposer in reverse order, then again is a no-op — a second `destroy()`
   *  call, or a store a plugin never added anything to, both cost nothing. */
  disposeAll(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    const disposers = this.#disposers;
    this.#disposers = [];
    for (let i = disposers.length - 1; i >= 0; i--) {
      disposers[i]!();
    }
  }
}
