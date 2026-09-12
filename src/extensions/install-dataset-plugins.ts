// extensions/ — installs one Dataset's plugin list (D-S5-24, D-S5-31, ADR 0019). Generic over its own
// context type for the reason `PluginRuntime` is: `api/dataset.ts` builds the real, api-level
// `DatasetPluginContext` and is itself what imports this file, so naming the concrete context here
// would close an import cycle (api -> extensions -> api). `InstallablePlugin<TContext>` stays
// structurally identical to the public `DataPluginOf`, so binding `TContext = DatasetPluginContext`
// and passing a `readonly Plugin[]` type-checks with no cast.
//
// Installation is one shot, never a diff: `Dataset.plugins` is read-only, unlike `Gantt.plugins`,
// because a plugin may declare a Field and a Field must exist before the first Rollup (D-S5-4).
//
// ADR 0019: a plugin on this list may carry a `view` half, a `data` half, or both. This file runs the
// `data` half. A plugin with no `data` half is still ordered and still counted against duplicate ids —
// its `view` half runs when a Gantt binds to this Dataset.

import type { Disposer, PluginId, RaiseError } from '../model/index.js';
import { PluginSetupError } from '../model/index.js';
import { DisposableStore } from './disposables.js';
import { RegistrationGate } from './plugin-runtime.js';
import { assertNoDuplicateIds, resolveSetupOrder } from './plugin-order.js';

/** What `installDatasetPlugins` installs — structurally the public `Plugin`, kept generic here
 *  (see file header). */
export interface InstallablePlugin<TContext> {
  id: PluginId;
  /** Plugin ids that must also be installed. Does not imply an order in the array. */
  requires?: readonly PluginId[];
  /** The half the Dataset runs. Absent on a chrome-only plugin. */
  data?(ctx: TContext): Disposer | void;
}

/** Built fresh for each plugin's own `data()` call, the same three members `PluginRuntime` builds:
 *  the context that plugin sees, the store its registrations file into, and the gate this file closes
 *  the moment `data()` returns (D-S5-4). */
export interface BuiltDatasetPluginContext<TContext> {
  context: TContext;
  disposables: DisposableStore;
  registrationGate: RegistrationGate;
}

/**
 * Installs every plugin's `data` half in `requires`-resolved order and returns the disposer for the
 * whole set.
 *
 * A `data()` that throws disposes this batch's already-installed plugins in reverse, then rethrows
 * `PluginSetupError` — the same unwind `PluginRuntime.install` does, and the reason a half-installed
 * Dataset never reaches a caller: the constructor that asked for it throws instead.
 */
export function installDatasetPlugins<TContext>(
  plugins: readonly InstallablePlugin<TContext>[],
  raiseError: RaiseError,
  buildContext: (pluginId: PluginId) => BuiltDatasetPluginContext<TContext>,
): Disposer {
  assertNoDuplicateIds(plugins);
  const ordered = resolveSetupOrder(plugins);
  const installed: { id: PluginId; dispose: Disposer }[] = [];

  const disposeOne = (entry: { id: PluginId; dispose: Disposer }): void => {
    try {
      entry.dispose();
    } catch (cause) {
      // S5.12, D-S5-41: the report always goes out; the `console.error` behind it fires only when
      // nothing is subscribed to `error`, so an unsubscribed consumer keeps today's output.
      const message = `dataset plugin "${entry.id}"'s disposer threw`;
      raiseError({ code: 'disposer-failed', message, severity: 'error', by: entry.id, cause }, () =>
        console.error(`FreeGantt: ${message}`, cause),
      );
    }
  };

  let reached = 0;
  try {
    for (const plugin of ordered) {
      reached += 1;
      if (plugin.data === undefined) continue;
      const built = buildContext(plugin.id);
      const ownDispose = plugin.data(built.context);
      // D-S5-4: registration is legal while data() runs only.
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
    throw new PluginSetupError(ordered[reached - 1]!.id, cause);
  }

  return () => {
    for (let i = installed.length - 1; i >= 0; i--) disposeOne(installed[i]!);
    installed.length = 0;
  };
}
