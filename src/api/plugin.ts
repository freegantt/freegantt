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
  DomTarget,
  EntryFieldEdit,
  GanttDom,
  Overlay,
  OverlayHandle,
  PluginContextPorts,
  RowLayer,
} from '../view/index.js';
import type { CommandRegistryOf, KeyBindingOf } from './command.js';

// Re-exported for the same reason `Overlay`/`OverlayHandle` are, just below: a plugin author typing
// a `registerKeyHandler` callback names this.
export type { KeyEventLike };

// Re-exported so `extensions/features/inline-editing.ts` can import this file directly, not the
// `api/index.js` barrel. That barrel re-exports `inlineEditing` from that very file. Importing the
// barrel back would close that edge into a cycle (`no-circular`). `Overlay`/`OverlayHandle` just
// below are re-exported here rather than from `view/` for the same reason.
export type { EntryFieldEdit };

// Re-exported so `extensions/popup.ts` can import this file directly, not the `api/index.js`
// barrel. That barrel re-exports `createPopup` from `extensions/popup.ts`. Importing the barrel
// back would close that edge into a cycle (`no-circular`). `GanttDom` travels with them: a `Popup`
// clamps against `bounds`/`paneBounds`, which review N1 moved off `Overlay`.
export type { GanttDom, DomTarget, Overlay, OverlayHandle, RowLayer };

// #166: re-exported because `PluginContextOf` below is a projection of it, and `etc/freegantt.api.md`
// must keep showing the plugin surface member by member. It is the I11 contract for that surface, and
// a report that only printed `Omit<PluginContextPorts, …>` would no longer notice a member coming or
// going. A plugin author never names this type: they name `PluginContext`, or `PluginContextOf`.
export type { PluginContextPorts };

/** What a plugin's `setup()` receives, once, after the Gantt mounts.
 *
 *  #166: a projection of `PluginContextPorts`, not a copy of it. That interface (`view/plugin-ports.ts`)
 *  is the one member list, and carries the doc for every member. This adds the two api-level members
 *  `view/` may not name, and re-types the two that are genuinely generic over `TGantt`/`TDataset`.
 *  A new plugin capability is one edit there, and it reaches a plugin author with no edit here.
 *  Before this, both lists were typed by hand and nothing checked that they matched.
 *
 *  `TDataset` defaults to the public, untyped `Dataset`, the same way `TGantt` defaults to
 *  `unknown`. A plugin author who binds their own `Dataset<TMeta, TFields>` gets a typed
 *  `ctx.dataset` throughout `setup()`. A plugin that binds neither type argument sees the exact
 *  surface it always has (#141 item #9). */
export type PluginContextOf<TGantt = unknown, TDataset = Dataset> = Omit<
  PluginContextPorts,
  'commands' | 'interaction'
> & {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: TDataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
  /** S5.2, D-S5-6: the one command registry. `register` here is legal only while `setup` runs
   *  (D-S5-4). `run`/`available` work any time, including after this plugin's own setup returns.
   *  A command this plugin registers lives exactly as long as the plugin. Uninstalling restores
   *  whatever the id held before. For an overridden core command that is core's own (#155). */
  commands: CommandRegistryOf<TGantt, TDataset>;
  interaction: Omit<PluginContextPorts['interaction'], 'registerKeybinding'> & {
    /** The one `interaction` member that binds `TGantt`: a `KeyBinding`'s own `when` reads a
     *  `CommandContextOf<TGantt, TDataset>`. See `PluginContextPorts` for what it does. */
    registerKeybinding(binding: KeyBindingOf<TGantt>): Disposer;
  };
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
