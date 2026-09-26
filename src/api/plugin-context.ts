// api/ — what a plugin's `view` half receives (S5.1, issue #137, ADR 0019). The three
// files read together: `api/plugin.ts` says what a plugin is, this one says what its `view` half
// sees, and `api/dataset-plugin.ts` says what its `data` half sees.
//
// This file names `view/` types, and `view/` reaches back to `api/command.ts`. So `api/plugin.ts`
// and `api/dataset.ts` may never import it — dependency-cruiser's `no-circular` rule treats a
// type-only edge the same as a runtime one. That is why the plugin shapes take the `view` half's
// context as a plain type argument and never name this file.
//
// `PluginContextOf` stays generic over `TGantt`/`TDataset` here, so this file names no concrete
// class either. `api/gantt.ts` is the one file that sees both classes. It binds the type arguments
// once, locally — `export type PluginContext = PluginContextOf<Gantt, Dataset>`. `api/index.ts` then
// re-exports the bound alias alongside the generic shape. A plugin author writing against `Gantt`
// names the bound `PluginContext`. Code that parameterizes over its own Gantt type names the `*Of`
// form. `api/command.ts` uses the same pairing.

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
