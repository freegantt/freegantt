// extensions/ — the plugin runtime (S5.1, D-S5-1..D-S5-5). Generic over its own context type so this
// file never imports `api/plugin.ts` or `api/gantt.ts`: `view/gantt-shell.ts` (which builds the real,
// api-level `PluginContext`) is itself imported BY `api/gantt.ts`, so a `PluginRuntime` that named the
// concrete `PluginContext`/`Gantt` types here would close an import cycle (api -> view -> extensions
// -> api). `ShellPlugin<TContext>` stays structurally identical to the public `Plugin` — same
// `id`/`requires`/`view` shape — so `api/gantt.ts` binding `TContext = PluginContext<Gantt>` and
// assigning a `readonly ChromePlugin[]` into `GanttShell.plugins` (declared `readonly ShellPlugin<unknown>[]`)
// type-checks with no cast: TypeScript's own (bivariant) method-parameter check for interface method
// shorthand permits it, the same latitude `Array.prototype.forEach`'s callback parameter relies on.

import { PluginSetupError, RegistrationClosedError } from '../model/index.js';
import type { Disposer, PluginId, RaiseError } from '../model/index.js';
import { DisposableStore } from './disposables.js';
import { assertNoDuplicateIds, resolveSetupOrder } from './plugin-order.js';

/** What `PluginRuntime` installs — structurally the public `Plugin`, kept generic here (see file
 *  header). Not exported past `view/gantt-shell.ts`'s own use of it.
 *
 *  ADR 0019: `view` is optional because this list also carries the Dataset's own plugins, and a
 *  plugin whose only half is `data` has nothing for a Gantt to run. It still joins the list, so one
 *  `requires` graph covers both halves and a chrome plugin may require it. */
export interface ShellPlugin<TContext> {
  id: PluginId;
  /** Plugin ids that must also be installed. Does not imply an order in the array (D-S5-31). */
  requires?: readonly PluginId[];
  view?(ctx: TContext): Disposer | void;
}

interface Installed<TContext> {
  plugin: ShellPlugin<TContext>;
  dispose: Disposer;
}

/** Built fresh for each plugin's own `view()` call — `context` is whatever `view/gantt-shell.ts`
 *  composed (its own `events`, a fresh `disposables`, and the api-level `dataset`/`gantt` it was
 *  handed); `disposables` is that same store, kept here so `PluginRuntime` can dispose it without
 *  knowing anything about `context`'s shape. `registrationGate` is optional so S5.1's own tests (no
 *  `register*` surface at all yet) need not supply one; a step that ships a `register*` — S5.2's
 *  `registerKeybinding` first — opens one alongside `context` and this class closes it right after
 *  `view()` returns (D-S5-4). */
export interface BuiltPluginContext<TContext> {
  context: TContext;
  disposables: DisposableStore;
  registrationGate?: RegistrationGate;
}

/** D-S5-4: every `ctx.*.register*` opens one of these alongside its `PluginContext`. `PluginRuntime`
 *  closes every plugin's gate the moment that plugin's own `view()` returns. A `register*` reached
 *  after that is what turns into `RegistrationClosedError`. `view/plugin-ports.ts`'s
 *  `registerWhileOpen` is the one place that calls `assertOpen()`, so a new seam inherits the check
 *  instead of re-deriving it (C2). */
export class RegistrationGate {
  #pluginId: PluginId;
  #open = true;

  constructor(pluginId: PluginId) {
    this.#pluginId = pluginId;
  }

  assertOpen(): void {
    if (!this.#open) throw new RegistrationClosedError(this.#pluginId);
  }

  close(): void {
    this.#open = false;
  }
}

/** Installs, diffs and disposes one Gantt's plugin list (D-S5-1, D-S5-3). One instance per
 *  `GanttShell` — never shared across Gantt instances (I2). */
export class PluginRuntime<TContext> {
  #installed: Installed<TContext>[] = [];
  #buildContext: (pluginId: PluginId) => BuiltPluginContext<TContext>;
  /** S5.12, D-S5-40: where a dropped reconfigure and a throwing disposer are reported. */
  #raiseError: RaiseError;

  constructor(buildContext: (pluginId: PluginId) => BuiltPluginContext<TContext>, raiseError: RaiseError) {
    this.#buildContext = buildContext;
    this.#raiseError = raiseError;
  }

  get plugins(): readonly ShellPlugin<TContext>[] {
    return this.#installed.map((installed) => installed.plugin);
  }

  /** Diffs `next` against what is installed by `id` (D-S5-3): a plugin present in both lists is left
   *  alone, even when the new array holds a fresh object for that `id` — only the `id`-level
   *  difference is disposed and set up. New plugins are set up *before* any dropped plugin is
   *  disposed, and `#installed` is committed last, so a `view()` throw unwinds only this batch's
   *  own already-set-up plugins (in reverse) before rethrowing `PluginSetupError` — the previous
   *  installed set, dropped plugins included, is untouched either way (issue #137 F4, C1). Disposing
   *  `removed` before every addition's `view()` had succeeded left `#installed` holding plugins
   *  already disposed once, primed to be disposed again on the next `install()` call. */
  install(next: readonly ShellPlugin<TContext>[]): void {
    assertNoDuplicateIds(next);

    const nextIds = new Set(next.map((plugin) => plugin.id));
    const kept: Installed<TContext>[] = [];
    const removed: Installed<TContext>[] = [];
    for (const installed of this.#installed) {
      (nextIds.has(installed.plugin.id) ? kept : removed).push(installed);
    }

    this.#reportDroppedReconfigures(next, kept);

    // D-S5-31: the whole list is sorted, then the already-installed ones drop out. Sorting `toAdd`
    // alone would read a kept plugin as missing the moment a new one required it.
    const keptIds = new Set(kept.map((installed) => installed.plugin.id));
    const toAdd = resolveSetupOrder(next).filter((plugin) => !keptIds.has(plugin.id));

    const justInstalled: Installed<TContext>[] = [];
    try {
      for (const plugin of toAdd) {
        if (plugin.view === undefined) {
          // ADR 0019: a `data`-only plugin is on this list for the `requires` graph alone. Nothing
          // to run, nothing to dispose — the Dataset owns both.
          justInstalled.push({ plugin, dispose: () => {} });
          continue;
        }
        const built = this.#buildContext(plugin.id);
        const ownDispose = plugin.view(built.context);
        // D-S5-4: registration is legal while view() runs only — closing the gate the moment it
        // returns is what turns a register* reached afterward into RegistrationClosedError.
        built.registrationGate?.close();
        justInstalled.push({
          plugin,
          // Review P4: `view` may return nothing. Every registration is already retracted by
          // `ctx.disposables`, so a plugin that owns no resource of its own writes no disposer —
          // and an empty `return () => {};` no longer reads as if something were missing.
          dispose: () => {
            built.disposables.disposeAll();
            ownDispose?.();
          },
        });
      }
    } catch (cause) {
      for (let i = justInstalled.length - 1; i >= 0; i--) this.#disposeOne(justInstalled[i]!);
      throw new PluginSetupError(toAdd[justInstalled.length]!.id, cause);
    }

    for (let i = removed.length - 1; i >= 0; i--) this.#disposeOne(removed[i]!);

    this.#installed = [...kept, ...justInstalled];
  }

  /** `GanttShell.destroy()`'s own first step — plugins may still need their overlay node or other
   *  pane-owned resource, so this runs before any pane is torn down. Reverse registration order. */
  disposeAll(): void {
    for (let i = this.#installed.length - 1; i >= 0; i--) this.#disposeOne(this.#installed[i]!);
    this.#installed = [];
  }

  /** Issue #137 F5: `gantt.plugins = [tooltips({ delayMs: 50 })]` after `tooltips()` is already
   *  installed matches by `id` and is silently a no-op — the new options never reach `view()` again.
   *
   *  S5.12, D-S5-41: this used to sit behind `isDevMode()`, which reads a flag Vite resolves when
   *  *this repo* builds `dist/`. The warning therefore reached nobody but our own harness. It now
   *  reports every time, and the `console.warn` behind it fires only when nothing is subscribed. */
  #reportDroppedReconfigures(
    next: readonly ShellPlugin<TContext>[],
    kept: readonly Installed<TContext>[],
  ): void {
    for (const plugin of next) {
      const existing = kept.find((installed) => installed.plugin.id === plugin.id);
      if (existing !== undefined && existing.plugin !== plugin) {
        const message =
          `plugin "${plugin.id}" was reassigned with a new instance; its options were ` +
          'not applied. Reconfigure with two assignments (remove, then add) or a distinct id.';
        this.#raiseError(
          { code: 'plugin-reconfigure-dropped', message, severity: 'warning', by: plugin.id },
          () => console.warn(`FreeGantt: ${message}`),
        );
      }
    }
  }

  /** A disposer throwing must not stop the rest from freeing their own resources (issue #137 F4) —
   *  logged, not rethrown. */
  #disposeOne(installed: Installed<TContext>): void {
    try {
      installed.dispose();
    } catch (cause) {
      // S5.12, D-S5-41: report first, console only when nothing is subscribed.
      const message = `plugin "${installed.plugin.id}"'s disposer threw`;
      this.#raiseError(
        { code: 'disposer-failed', message, severity: 'error', by: installed.plugin.id, cause },
        () => console.error(`FreeGantt: ${message}`, cause),
      );
    }
  }
}
