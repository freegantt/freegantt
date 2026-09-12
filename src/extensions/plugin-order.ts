// extensions/ — the one place that answers "in what order do these plugins set up?" (D-S5-31).
// Both install sites ask it. The Dataset installs a plugin's `data` half. The Gantt installs its
// `view` half. ADR 0019 gives the two halves one `requires` list between them, so the sort belongs
// to neither install site alone.
//
// Generic over the plugin shape on purpose — it reads `id` and `requires` and nothing else, so it
// never names a context type and never reaches into `api/`.

import { DuplicatePluginIdError, MissingPluginError, PluginRequirementCycleError } from '../model/index.js';
import type { PluginId } from '../model/index.js';

/** All this sort reads. Both `ChromePluginOf` and `DataPluginOf` satisfy it structurally. */
export interface OrderedPlugin {
  id: PluginId;
  /** Plugin ids that must also be installed. Does not imply an order in the array. */
  requires?: readonly PluginId[];
}

/** Two entries of one `plugins` list share an id (D-S5-3). */
export function assertNoDuplicateIds(plugins: readonly OrderedPlugin[]): void {
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
 *
 * ADR 0019: one `requires` list covers both halves. A Gantt sorts the Dataset's own plugins together
 * with its own chrome ones. A plugin whose only half is `data` still joins that sort, so a chrome
 * plugin may require it.
 */
export function resolveSetupOrder<TPlugin extends OrderedPlugin>(
  plugins: readonly TPlugin[],
): readonly TPlugin[] {
  const byId = new Map(plugins.map((plugin) => [plugin.id, plugin]));
  const ordered: TPlugin[] = [];
  const settled = new Set<PluginId>();
  const visiting = new Set<PluginId>();

  const visit = (plugin: TPlugin): void => {
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
