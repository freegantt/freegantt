// api/ — what a plugin is (ADR 0019). One plugin type, two halves, one install site.
//
// The `view` half's context arrives as a plain type argument, never as an import. Naming
// `api/plugin-context.ts` here would pull `view/` in, and `view/` reaches back to `api/command.ts`
// and `api/dataset.ts`. Dependency-cruiser's `no-circular` rule treats a type-only edge the same as
// a runtime one, so that import would close a ring. `api/gantt.ts` is the one file that sees both
// concrete classes, and it binds `TViewContext` and `TDataset` there — `export type ChromePlugin =
// ChromePluginOf<PluginContext>`. `api/index.ts` re-exports the bound aliases alongside these
// generic shapes, the same `*Of` pairing `api/command.ts` uses.
//
// A plugin author writes `definePlugin` (`api/define-plugin.ts`) and meets the bound names.

import type { Disposer, PluginId } from '../model/index.js';
import type { DatasetPluginContextOf } from './dataset-plugin.js';

/** The two members every plugin declares, whichever halves it fills.
 *
 *  #178: a plugin that page scope has to call back into publishes those calls **on itself**, beside
 *  `id` and its halves. Declare an interface extending `ChromePluginOf` or `DataPluginOf`, return it
 *  from the factory, and hold what the half built in a variable inside that factory call. The page
 *  then keeps the plugin object it installed and calls it. That is the supported way to reach a
 *  plugin's own state. It is also why no `Gantt` method hands a `PluginContext` back. One factory
 *  call is one install's worth of state, so two Gantts on one page share none of it (I2). A
 *  module-level stash shares all of it. */
export interface PluginIdentity {
  id: PluginId;
  /** Plugin ids that must also be installed. Does not imply an order in the array: installation
   *  resolves setup order from `requires` alone, so `[a, b]` and `[b, a]` install identically
   *  (D-S5-31). A required id nobody installs throws `MissingPluginError`. One list covers both
   *  halves (ADR 0019). */
  requires?: readonly PluginId[];
}

/** A plugin that is chrome and nothing else — `weekendShading()`. It declares no Field, reserves no
 *  store and claims no edit hook. So it installs on the `Gantt`, and `gantt.plugins` reconfigures it
 *  live.
 *
 *  `data?: never` makes the wrong install site unrepresentable. `GanttOptions.plugins` takes this arm
 *  alone. So a plugin with a `data` half is a red squiggle in the editor, never a runtime discovery.
 *  It is the rule that keeps a shared `scale` off a `Gantt` that names `preset`. */
export interface ChromePluginOf<TViewContext = unknown> extends PluginIdentity {
  /** Variants, renderers, decorations, commands and keys. Runs once, as a Gantt mounts. It returns a
   *  `Disposer` for the plugin's own resources, or nothing at all (review P4). Every `register*` and
   *  every `onDomEvent` files its own removal in `ctx.disposables`. */
  view(ctx: TViewContext): Disposer | void;
  data?: never;
}

/** A plugin that owns state — Fields, the edit hook, a store — and may paint it too.
 *
 *  **The install site is where the state lives.** This arm installs on the `Dataset`, because a Field
 *  must exist before the first Rollup (D-S5-4). Every `Gantt` bound to that Dataset then runs `view`
 *  once, each with its own context, so I2 holds by construction. */
export interface DataPluginOf<TViewContext = unknown, TDataset = unknown> extends PluginIdentity {
  /** Fields, the edit hook and the store. DOM-free, and runs as the `Dataset` constructs. */
  data(ctx: DatasetPluginContextOf<TDataset>): Disposer | void;
  /** The same half a chrome-only plugin fills. Optional: a headless plugin paints nothing. */
  view?(ctx: TViewContext): Disposer | void;
}

/** One installed plugin, either arm. `DatasetOptions.plugins` takes this; `GanttOptions.plugins`
 *  takes `ChromePluginOf` alone. */
export type PluginOf<TViewContext = unknown, TDataset = unknown> =
  ChromePluginOf<TViewContext> | DataPluginOf<TViewContext, TDataset>;
