// extensions/ — the plugin runtime (S5.1, D-S5-1..D-S5-5). Generic over its own context type so this
// file never imports `api/plugin.ts` or `api/gantt.ts`: `view/gantt-shell.ts` (which builds the real,
// api-level `PluginContext`) is itself imported BY `api/gantt.ts`, so a `PluginRuntime` that named the
// concrete `PluginContext`/`Gantt` types here would close an import cycle (api -> view -> extensions
// -> api). `ShellPlugin<TContext>` stays structurally identical to the public `GanttPlugin` — same
// `id`/`setup` shape — so `api/gantt.ts` binding `TContext = PluginContext<Gantt>` and assigning a
// `readonly GanttPlugin[]` into `GanttShell.plugins` (declared `readonly ShellPlugin<unknown>[]`)
// type-checks with no cast: TypeScript's own (bivariant) method-parameter check for interface method
// shorthand permits it, the same latitude `Array.prototype.forEach`'s callback parameter relies on.

import { DuplicatePluginIdError, PluginSetupError, RegistrationClosedError } from '../model/index.js';
import type { Disposer, PluginId } from '../model/index.js';
import { DisposableStore } from './disposables.js';

/** What `PluginRuntime` installs — structurally the public `GanttPlugin`, kept generic here (see
 *  file header). Not exported past `view/gantt-shell.ts`'s own use of it. */
export interface ShellPlugin<TContext> {
  id: PluginId;
  setup(ctx: TContext): Disposer;
}

interface Installed<TContext> {
  plugin: ShellPlugin<TContext>;
  dispose: Disposer;
}

/** Built fresh for each plugin's own `setup()` call — `context` is whatever `view/gantt-shell.ts`
 *  composed (its own `events`, a fresh `disposables`, and the api-level `dataset`/`gantt` it was
 *  handed); `disposables` is that same store, kept here so `PluginRuntime` can dispose it without
 *  knowing anything about `context`'s shape. `registrationGate` is optional so S5.1's own tests (no
 *  `register*` surface at all yet) need not supply one; a step that ships a `register*` — S5.2's
 *  `registerKeybinding` first — opens one alongside `context` and this class closes it right after
 *  `setup()` returns (D-S5-4). */
export interface BuiltPluginContext<TContext> {
  context: TContext;
  disposables: DisposableStore;
  registrationGate?: RegistrationGate;
}

function isDevMode(): boolean {
  // extensions/ may import api/ and model/ only (D-S5-5) — data/dev-mode.ts is neither, so this
  // repeats that file's one-line check rather than reaching past the boundary for it.
  return (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;
}

/** D-S5-4: every `ctx.*.register*` a later step ships (S5.2's `registerKeybinding`, S5.4's
 *  `registerRenderer`, …) opens one of these alongside its `PluginContext` and calls `assertOpen()`
 *  first. `PluginRuntime` closes every plugin's gate the moment that plugin's own `setup()` returns
 *  — a `register*` reached after is what turns into `RegistrationClosedError`. Ships now, with a
 *  direct test, so no future step re-derives the same close-after-setup bookkeeping (D-S5-4). */
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

function assertNoDuplicateIds<TContext>(plugins: readonly ShellPlugin<TContext>[]): void {
  const seen = new Set<PluginId>();
  for (const plugin of plugins) {
    if (seen.has(plugin.id)) throw new DuplicatePluginIdError(plugin.id);
    seen.add(plugin.id);
  }
}

/** Installs, diffs and disposes one Gantt's `GanttPlugin` list (D-S5-1, D-S5-3). One instance per
 *  `GanttShell` — never shared across Gantt instances (I2). */
export class PluginRuntime<TContext> {
  #installed: Installed<TContext>[] = [];
  #buildContext: (pluginId: PluginId) => BuiltPluginContext<TContext>;

  constructor(buildContext: (pluginId: PluginId) => BuiltPluginContext<TContext>) {
    this.#buildContext = buildContext;
  }

  get plugins(): readonly ShellPlugin<TContext>[] {
    return this.#installed.map((installed) => installed.plugin);
  }

  /** Diffs `next` against what is installed by `id` (D-S5-3): a plugin present in both lists is left
   *  alone, even when the new array holds a fresh object for that `id` — only the `id`-level
   *  difference is disposed and set up. New plugins are set up *before* any dropped plugin is
   *  disposed, and `#installed` is committed last, so a `setup()` throw unwinds only this batch's
   *  own already-set-up plugins (in reverse) before rethrowing `PluginSetupError` — the previous
   *  installed set, dropped plugins included, is untouched either way (issue #137 F4, C1). Disposing
   *  `removed` before every addition's `setup()` had succeeded left `#installed` holding plugins
   *  already disposed once, primed to be disposed again on the next `install()` call. */
  install(next: readonly ShellPlugin<TContext>[]): void {
    assertNoDuplicateIds(next);

    const nextIds = new Set(next.map((plugin) => plugin.id));
    const kept: Installed<TContext>[] = [];
    const removed: Installed<TContext>[] = [];
    for (const installed of this.#installed) {
      (nextIds.has(installed.plugin.id) ? kept : removed).push(installed);
    }

    if (isDevMode()) this.#warnAboutDroppedReconfigures(next, kept);

    const keptIds = new Set(kept.map((installed) => installed.plugin.id));
    const toAdd = next.filter((plugin) => !keptIds.has(plugin.id));

    const justInstalled: Installed<TContext>[] = [];
    try {
      for (const plugin of toAdd) {
        const built = this.#buildContext(plugin.id);
        const ownDispose = plugin.setup(built.context);
        // D-S5-4: registration is legal while setup() runs only — closing the gate the moment it
        // returns is what turns a register* reached afterward into RegistrationClosedError.
        built.registrationGate?.close();
        justInstalled.push({
          plugin,
          dispose: () => {
            built.disposables.disposeAll();
            ownDispose();
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
   *  installed matches by `id` and is silently a no-op — the new options never reach `setup()` again.
   *  Dev builds warn so the mistake is visible; production stays silent, the same posture as every
   *  other dev-only diagnostic in this codebase. */
  #warnAboutDroppedReconfigures(
    next: readonly ShellPlugin<TContext>[],
    kept: readonly Installed<TContext>[],
  ): void {
    for (const plugin of next) {
      const existing = kept.find((installed) => installed.plugin.id === plugin.id);
      if (existing !== undefined && existing.plugin !== plugin) {
        console.warn(
          `FreeGantt: plugin "${plugin.id}" was reassigned with a new instance; its options were ` +
            'not applied. Reconfigure with two assignments (remove, then add) or a distinct id.',
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
      console.error(`FreeGantt: plugin "${installed.plugin.id}"'s disposer threw`, cause);
    }
  }
}
