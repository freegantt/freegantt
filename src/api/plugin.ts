// api/ — the public plugin contract (S5.1, D-S5-1, issue #137 F1). `GanttPlugin`/`PluginContext` stay
// generic over `TGantt` here so this file never imports `./gantt.js` for the concrete `Gantt` class:
// `api/gantt.ts` already imports this file for the generic shape, and if this file also imported
// `Gantt` the two would close an import cycle (dependency-cruiser's `no-circular` rule treats a
// type-only edge the same as a runtime one). `api/gantt.ts` binds the type argument once, locally —
// `export type GanttPlugin = GanttPluginOf<Gantt>` — and that bound alias is what `api/index.ts`
// re-exports; a plugin author's `import type { GanttPlugin } from 'freegantt'` always resolves to it,
// never to the generic declared here.

import type { Disposer, PluginId } from '../model/index.js';
import type { Dataset } from './dataset.js';
import type { DisposableStore } from '../extensions/disposables.js';
import type { GanttEvents } from '../view/index.js';

/** What a `GanttPlugin`'s `setup()` receives, once, after the Gantt mounts. S5.1 ships `dataset`,
 *  `gantt`, `events` and `disposables` only — every other member (`commands`, `view`, `layout`,
 *  `interaction`) arrives in the step that ships the code honouring it (I11): a `register*` that does
 *  nothing is exactly the dishonest surface `no-not-implemented` catches. See
 *  `plans/s5-extensibility-and-editing/s5.1-plugin-runtime.md` §1 for the full shape this grows into. */
export interface PluginContext<TGantt = unknown> {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: Dataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
  /** `on`/`off` over `GanttEventMap`, including the cancelable `before*` pairs. */
  events: GanttEvents;
  /** This plugin's own cleanup list — add a listener or a timer here instead of closing over it by
   *  hand in the returned `Disposer`. Disposed in reverse order, ahead of that returned `Disposer`. */
  disposables: DisposableStore;
}

export interface GanttPlugin<TGantt = unknown> {
  id: PluginId;
  /** Called once, after the Gantt mounts. Returns a disposer for the plugin's own resources. */
  setup(ctx: PluginContext<TGantt>): Disposer;
}
