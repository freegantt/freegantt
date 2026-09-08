// api/ — the public plugin contract (S5.1, D-S5-1, issue #137 F1). `GanttPluginOf`/`PluginContextOf`
// stay generic over `TGantt` here, so this file never imports `./gantt.js` for the concrete `Gantt`
// class. `api/gantt.ts` already imports this file for the generic shape. If this file also imported
// `Gantt`, the two would close an import cycle. Dependency-cruiser's `no-circular` rule treats a
// type-only edge the same as a runtime one. `api/gantt.ts` binds the type argument once,
// locally — `export type GanttPlugin = GanttPluginOf<Gantt>` — and `api/index.ts` re-exports the
// bound aliases alongside the generic shapes. A plugin author writing against `Gantt` names the
// bound `GanttPlugin`/`PluginContext`. Code that parameterizes over its own Gantt type names the
// `*Of` forms. `api/command.ts` uses the same pairing.

import type { Disposer, PluginId } from '../model/index.js';
import type { Dataset } from './dataset.js';
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

/** What a plugin's `setup()` receives, once, after the Gantt mounts.
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
 *  `TDataset` defaults to the public, untyped `Dataset`, the same way `TGantt` defaults to
 *  `unknown`. A plugin author who binds their own `Dataset<TMeta, TFields>` gets a typed
 *  `ctx.dataset` throughout `setup()`. A plugin that binds neither type argument sees the exact
 *  surface it always has (#141 item #9). */
export type PluginContextOf<TGantt = unknown, TDataset = Dataset> = PluginContextParts<TGantt, TDataset> & {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: TDataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
};

/** One installed plugin. `setup()` runs once, after the Gantt mounts.
 *
 *  #178: a plugin that page scope has to call back into publishes those calls **on itself**, beside
 *  `id` and `setup`. Declare an interface extending this one, return it from the factory, and hold
 *  what `setup()` built in a variable inside that factory call. The page then keeps the plugin
 *  object it installed and calls it. That is the supported way to reach a plugin's own state. It is
 *  also why no `Gantt` method hands a `PluginContext` back. One factory call is one Gantt's worth of
 *  state, so two Gantts on one page share none of it (I2). A module-level stash shares all of it. */
export interface GanttPluginOf<TGantt = unknown, TDataset = Dataset> {
  id: PluginId;
  /** Called once, after the Gantt mounts. Returns a `Disposer` for the plugin's own resources, or
   *  nothing at all (review P4). Every `register*` and every `onDomEvent` files its own removal in
   *  `ctx.disposables`. A plugin that owns no timer, socket or subscription of its own has nothing
   *  left to return. */
  setup(ctx: PluginContextOf<TGantt, TDataset>): Disposer | void;
}
