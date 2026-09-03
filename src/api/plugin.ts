// api/ — the public plugin contract (S5.1, D-S5-1, issue #137 F1). `GanttPluginOf`/`PluginContextOf`
// stay generic over `TGantt` here so this file never imports `./gantt.js` for the concrete `Gantt`
// class: `api/gantt.ts` already imports this file for the generic shape, and if this file also
// imported `Gantt` the two would close an import cycle (dependency-cruiser's `no-circular` rule
// treats a type-only edge the same as a runtime one). `api/gantt.ts` binds the type argument once,
// locally — `export type GanttPlugin = GanttPluginOf<Gantt>` — and `api/index.ts` re-exports the
// bound aliases alongside the generic shapes. A plugin author writing against `Gantt` names the
// bound `GanttPlugin`/`PluginContext`; code that parameterizes over its own Gantt type names the
// `*Of` forms, the same pairing `api/command.ts` uses.

import type { Disposer, PluginId } from '../model/index.js';
import type { Dataset } from './dataset.js';
import type { DisposableStore } from '../extensions/disposables.js';
import type { GanttEvents, Overlay, OverlayHandle } from '../view/index.js';
import type { CommandRegistryOf, KeyBindingOf } from './command.js';

// Re-exported so `extensions/popup.ts` can import this file directly instead of the `api/index.js`
// barrel (which itself re-exports `createPopup` from `extensions/popup.ts` — importing the barrel
// back would close that edge into a cycle, `no-circular`).
export type { Overlay, OverlayHandle };

/** What a plugin's `setup()` receives, once, after the Gantt mounts. S5.1 ships `dataset`,
 *  `gantt`, `events` and `disposables` only — every other member (`commands`, `view`, `layout`,
 *  `interaction`) arrives in the step that ships the code honouring it (I11): a `register*` that does
 *  nothing is exactly the dishonest surface `no-not-implemented` catches. See
 *  `plans/s5-extensibility-and-editing/s5.1-plugin-runtime.md` §1 for the full shape this grows into. */
export interface PluginContextOf<TGantt = unknown> {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: Dataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
  /** `on`/`off` over `GanttEventMap`, including the cancelable `before*` pairs. */
  events: GanttEvents;
  /** This plugin's own cleanup list — add a listener or a timer here instead of closing over it by
   *  hand in the returned `Disposer`. Disposed in reverse order, ahead of that returned `Disposer`. */
  disposables: DisposableStore;
  /** S5.2, D-S5-6: the one command registry — `register` here is legal only while `setup` runs
   *  (D-S5-4); `run`/`available` work any time, including after this plugin's own setup returns. */
  commands: CommandRegistryOf<TGantt>;
  interaction: {
    /** S5.2, D-S5-7: adds one `KeyBinding`. Legal only while `setup` runs (D-S5-4) — removed
     *  automatically when this plugin is disposed, the same lifetime every other `register*` gets. */
    registerKeybinding(binding: KeyBindingOf<TGantt>): void;
  };
  view: {
    /** S5.3, D-S5-8: the overlay layer a plugin's own popup, tooltip or menu mounts into — the same
     *  primitive `extensions/popup.ts`'s `Popup` is built on. Live for the plugin's whole lifetime,
     *  not gated by `RegistrationGate` (D-S5-4 only gates one-shot `register*` calls; presenting and
     *  dismissing overlay content happens for as long as the plugin runs). */
    overlay: Overlay;
  };
}

export interface GanttPluginOf<TGantt = unknown> {
  id: PluginId;
  /** Called once, after the Gantt mounts. Returns a disposer for the plugin's own resources. */
  setup(ctx: PluginContextOf<TGantt>): Disposer;
}
