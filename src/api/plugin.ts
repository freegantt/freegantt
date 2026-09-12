// api/ — the public plugin contract (S5.1, D-S5-1, issue #137 F1, ADR 0019). Every plugin shape and
// the view half's context stay generic over `TGantt`/`TDataset` here, so this file imports neither
// `./gantt.js` nor `./dataset.js` for a concrete class. `api/gantt.ts` and `api/dataset.ts` already
// import this file for the generic shapes. An import back would close a cycle, and
// dependency-cruiser's `no-circular` rule treats a type-only edge the same as a runtime one.
// `api/gantt.ts` is the one file that sees both classes. So it binds the type arguments once,
// locally — `export type ChromePlugin = ChromePluginOf<Gantt, Dataset>`. `api/index.ts` then
// re-exports the bound aliases alongside the generic shapes. A plugin author writing against `Gantt`
// names the bound `ChromePlugin`/`DataPlugin`/`Plugin`/`PluginContext`. Code that parameterizes over
// its own Gantt type names the `*Of` forms. `api/command.ts` uses the same pairing.

import type { Disposer, PluginId } from '../model/index.js';
import type { DatasetPluginContextOf } from './dataset-plugin.js';
import type { KeyEventLike } from '../extensions/keymap.js';
import type {
  DomEventHandler,
  DomEventOptions,
  DomTarget,
  EntryFieldEdit,
  GanttDom,
  MountLayer,
  PaneName,
  PluginContextParts,
} from '../view/index.js';

// Re-exported for the same reason `MountLayer` is, just below: a plugin author typing a
// `registerKeyHandler` callback names this.
export type { KeyEventLike };

// Re-exported so `extensions/features/inline-editing.ts` can import this file directly, not the
// `api/index.js` barrel. That barrel re-exports `inlineEditing` from that very file. Importing the
// barrel back would close that edge into a cycle (`no-circular`). `MountLayer` just below is
// re-exported here rather than from `view/` for the same reason.
export type { EntryFieldEdit };

// Re-exported so `extensions/popup.ts` can import this file directly, not the `api/index.js`
// barrel. That barrel re-exports `createPopup` from `extensions/popup.ts`. Importing the barrel
// back would close that edge into a cycle (`no-circular`). `GanttDom` travels with it: a `Popup`
// clamps against `bounds`/`paneBounds`, which review N1 moved off the mount layer.
export type { GanttDom, DomTarget, PaneName, MountLayer, DomEventHandler, DomEventOptions };

// #166: re-exported because `PluginContextOf` below is built from it, and `etc/freegantt.api.md`
// must keep showing the plugin surface member by member. It is the I11 contract for that surface.
// A report that printed only the intersection's own two members would miss a member coming or going.
// A plugin author names `PluginContext`, or `PluginContextOf`. Naming this type is legal all the
// same: bind `TGantt`/`TDataset` and every member is the one a plugin reads (#191).
// #183: it was `PluginContextPorts` until this export made it public. "Ports" names the seam a
// collaborator calls back through, which this is not, and every other `*Ports` here stays private.
// `Parts` says what it is — the pieces `PluginContext` is made of — the way `PlainParts` already does.
export type { PluginContextParts };

/** What a plugin's `view()` half receives, once, after the Gantt mounts.
 *
 *  #166: `PluginContextParts` (`view/plugin-ports.ts`) is the one member list, and carries the doc
 *  for every member. This adds the two api-level members `view/` may not name, and nothing else.
 *  A new plugin capability is one edit there, and it reaches a plugin author with no edit here.
 *  Before this, both lists were typed by hand and nothing checked that they matched.
 *
 *  #191: the two members that bind `TGantt`/`TDataset` — `commands` and
 *  `interaction.registerKeybinding` — now take those type arguments where they are declared. So this
 *  is an intersection and no longer an `Omit` of a surface that published the unbound forms.
 *
 *  Both type arguments default to `unknown`, the way `PluginContextParts`'s own already do. A plugin
 *  author binds them through the `PluginContext` alias `api/gantt.ts` publishes, and a typed
 *  `ctx.dataset`/`ctx.gantt` comes with it (#141 item #9). */
export type PluginContextOf<TGantt = unknown, TDataset = unknown> = PluginContextParts<TGantt, TDataset> & {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: TDataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
};

/** The two members every plugin declares, whichever halves it fills (ADR 0019).
 *
 *  #178: a plugin that page scope has to call back into publishes those calls **on itself**, beside
 *  `id` and its halves. Declare an interface extending `ChromePluginOf` or `DataPluginOf`, return it
 *  from the factory, and hold what the half built in a variable inside that factory call. The page
 *  then keeps the plugin object it installed and calls it. That is the supported way to reach a
 *  plugin's own state. It is also why no `Gantt` method hands a `PluginContext` back. One factory
 *  call is one Gantt's worth of state, so two Gantts on one page share none of it (I2). A
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
 *  store and claims no edit hook, so it installs on the `Gantt`, and `gantt.plugins` reconfigures it
 *  live.
 *
 *  `data?: never` makes the wrong install site unrepresentable. `GanttOptions.plugins` takes this arm
 *  alone. So a plugin with a `data` half is a red squiggle in the editor, never a runtime discovery.
 *  It is the rule that keeps a shared `scale` off a `Gantt` that names `preset`. */
export interface ChromePluginOf<TGantt = unknown, TDataset = unknown> extends PluginIdentity {
  /** Variants, renderers, decorations, commands and keys. Runs once, as a Gantt mounts. Returns a
   *  `Disposer` for the plugin's own resources, or nothing at all (review P4). Every `register*` and
   *  every `onDomEvent` files its own removal in `ctx.disposables`. */
  view(ctx: PluginContextOf<TGantt, TDataset>): Disposer | void;
  data?: never;
}

/** A plugin that owns state — Fields, the edit hook, a store — and may paint it too.
 *
 *  **The install site is where the state lives** (ADR 0019). This arm installs on the `Dataset`,
 *  because a Field must exist before the first Rollup (D-S5-4). Every `Gantt` bound to that Dataset
 *  then runs `view` once, each with its own context, so I2 holds by construction. */
export interface DataPluginOf<TGantt = unknown, TDataset = unknown> extends PluginIdentity {
  /** Fields, the edit hook and the store. DOM-free, and runs as the `Dataset` constructs. */
  data(ctx: DatasetPluginContextOf<TDataset>): Disposer | void;
  /** The same half a chrome-only plugin fills. Optional: a headless plugin paints nothing. */
  view?(ctx: PluginContextOf<TGantt, TDataset>): Disposer | void;
}

/** One installed plugin, either arm (ADR 0019). `DatasetOptions.plugins` takes this;
 *  `GanttOptions.plugins` takes `ChromePluginOf` alone. */
export type PluginOf<TGantt = unknown, TDataset = unknown> =
  ChromePluginOf<TGantt, TDataset> | DataPluginOf<TGantt, TDataset>;
