// extensions/ — installs one Dataset's `DatasetPlugin` list (D-S5-24, D-S5-31). Generic over its own
// context type for the reason `PluginRuntime` is: `api/dataset.ts` builds the real, api-level
// `DatasetPluginContext` and is itself what imports this file, so naming the concrete context here
// would close an import cycle (api -> extensions -> api). `OrderedPlugin<TContext>` stays structurally
// identical to the public `DatasetPlugin`, so binding `TContext = DatasetPluginContext` and passing a
// `readonly DatasetPlugin[]` type-checks with no cast.
//
// Installation is one shot, never a diff: `Dataset.plugins` is read-only, unlike `Gantt.plugins`,
// because a plugin may declare a Field and a Field must exist before the first Rollup (D-S5-4).

import { DuplicatePluginIdError, MissingPluginError, PluginRequirementCycleError } from '../model/index.js';
import type { Disposer, PluginId } from '../model/index.js';
import { PluginSetupError } from '../model/index.js';
import { DisposableStore } from './disposables.js';
import { RegistrationGate } from './plugin-runtime.js';

/** What `installDatasetPlugins` installs — structurally the public `DatasetPlugin`, kept generic here
 *  (see file header). */
export interface OrderedPlugin<TContext> {
  id: PluginId;
  /** Plugin ids that must also be installed. Does not imply an order in the array. */
  requires?: readonly PluginId[];
  setup(ctx: TContext): Disposer | void;
}

/** Built fresh for each plugin's own `setup()` call, the same three members `PluginRuntime` builds:
 *  the context that plugin sees, the store its registrations file into, and the gate this file closes
 *  the moment `setup()` returns (D-S5-4). */
export interface BuiltDatasetPluginContext<TContext> {
  context: TContext;
  disposables: DisposableStore;
  registrationGate: RegistrationGate;
}

function assertNoDuplicateIds<TContext>(plugins: readonly OrderedPlugin<TContext>[]): void {
  const seen = new Set<PluginId>();
  for (const plugin of plugins) {
    if (seen.has(plugin.id)) throw new DuplicatePluginIdError(plugin.id);
    seen.add(plugin.id);
  }
}

/**
 * Setup order, resolved from `requires` alone (D-S5-31). `[b, a]` and `[a, b]` give the same order
 * when `b.requires = ['a']`, so the array is an unordered set of what to install, never a sequence of
 * when. A required id nobody installs throws `MissingPluginError` naming both ids; a requirement cycle
 * throws `PluginRequirementCycleError` naming every plugin in it.
 *
 * This is also the order extenders wrap in, so a second plugin composing onto a first sees the first's
 * output (D-S5-23), and the order `store.read()` becomes answerable in: a reader always sets up after
 * the plugin whose store it reads.
 */
export function resolveSetupOrder<TContext>(
  plugins: readonly OrderedPlugin<TContext>[],
): readonly OrderedPlugin<TContext>[] {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const ordered: OrderedPlugin<TContext>[] = [];
  const settled = new Set<PluginId>();
  const visiting = new Set<PluginId>();

  const visit = (plugin: OrderedPlugin<TContext>): void => {
    if (settled.has(plugin.id)) return;
    if (visiting.has(plugin.id)) throw new PluginRequirementCycleError([...visiting, plugin.id]);
    visiting.add(plugin.id);
    for (const requiredId of plugin.requires ?? []) {
      const required = byId.get(requiredId);
      if (!required) throw new MissingPluginError(plugin.id, requiredId);
      visit(required);
    }
    visiting.delete(plugin.id);
    settled.add(plugin.id);
    ordered.push(plugin);
  };

  for (const plugin of plugins) visit(plugin);
  return ordered;
}

/**
 * Installs every plugin in `requires`-resolved order and returns the disposer for the whole set.
 *
 * A `setup()` that throws disposes this batch's already-installed plugins in reverse, then rethrows
 * `PluginSetupError` — the same unwind `PluginRuntime.install` does, and the reason a half-installed
 * Dataset never reaches a caller: the constructor that asked for it throws instead.
 */
export function installDatasetPlugins<TContext>(
  plugins: readonly OrderedPlugin<TContext>[],
  buildContext: (pluginId: PluginId) => BuiltDatasetPluginContext<TContext>,
): Disposer {
  assertNoDuplicateIds(plugins);
  const ordered = resolveSetupOrder(plugins);
  const installed: { id: PluginId; dispose: Disposer }[] = [];

  const disposeOne = (entry: { id: PluginId; dispose: Disposer }): void => {
    try {
      entry.dispose();
    } catch (cause) {
      console.error(`FreeGantt: dataset plugin "${entry.id}"'s disposer threw`, cause);
    }
  };

  try {
    for (const plugin of ordered) {
      const built = buildContext(plugin.id);
      const ownDispose = plugin.setup(built.context);
      // D-S5-4: registration is legal while setup() runs only.
      built.registrationGate.close();
      installed.push({
        id: plugin.id,
        dispose: () => {
          built.disposables.disposeAll();
          ownDispose?.();
        },
      });
    }
  } catch (cause) {
    for (let i = installed.length - 1; i >= 0; i--) disposeOne(installed[i]!);
    throw new PluginSetupError(ordered[installed.length]!.id, cause);
  }

  return () => {
    for (let i = installed.length - 1; i >= 0; i--) disposeOne(installed[i]!);
    installed.length = 0;
  };
}
