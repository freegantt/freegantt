// api/ — the public plugin contract (S5.1, D-S5-1, issue #137 F1). `GanttPluginOf`/`PluginContextOf`
// stay generic over `TGantt` here so this file never imports `./gantt.js` for the concrete `Gantt`
// class: `api/gantt.ts` already imports this file for the generic shape, and if this file also
// imported `Gantt` the two would close an import cycle (dependency-cruiser's `no-circular` rule
// treats a type-only edge the same as a runtime one). `api/gantt.ts` binds the type argument once,
// locally — `export type GanttPlugin = GanttPluginOf<Gantt>` — and `api/index.ts` re-exports the
// bound aliases alongside the generic shapes. A plugin author writing against `Gantt` names the
// bound `GanttPlugin`/`PluginContext`; code that parameterizes over its own Gantt type names the
// `*Of` forms, the same pairing `api/command.ts` uses.

import type { Disposer, KeyChord, PluginId } from '../model/index.js';
import type { Dataset } from './dataset.js';
import type { DisposableStore } from '../extensions/disposables.js';
import type { KeyEventLike } from '../extensions/keymap.js';
import type { EntryFieldEdit, GanttEvents, Overlay, OverlayHandle } from '../view/index.js';
import type { CommandRegistryOf, KeyBindingOf } from './command.js';
import type { RendererPoint, RendererFor } from '../layout/index.js';
import type { DecorationLayer, DecorationProvider } from '../layout/index.js';
import type { ElementDescription, Entry, EntryId, FieldKey } from '../model/index.js';

// Re-exported for the same reason `Overlay`/`OverlayHandle` are, just below: a plugin author typing
// a `registerKeyHandler` callback names this.
export type { KeyEventLike };

// Re-exported so `extensions/features/inline-editing.ts` can import this file directly instead of
// the `api/index.js` barrel (which itself re-exports `inlineEditing` from that very file — importing
// the barrel back would close that edge into a cycle, `no-circular`), the same reason `Overlay`/
// `OverlayHandle` just below are re-exported here rather than from `view/` directly.
export type { EntryFieldEdit };

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
    /** C3, `plans/reviews/2026-09-02-s5-start-fixes.md`: binds `chord` straight to `handler` through
     *  the same keymap `registerKeybinding` uses, for a caller with no `Command` to run — a plugin
     *  building its own `Popup` (over `view.overlay` below) so its Escape dismissal wins by the
     *  keymap's own newest-first order (D-S5-9), the same way `extensions/popup.ts`'s own dismissal
     *  does. Unlike `registerKeybinding`, callable any time this plugin is installed, not only while
     *  `setup` runs — a popup opens and closes for as long as the plugin does, not once at startup —
     *  and returns its own disposer instead of auto-removing on plugin disposal, because a popup adds
     *  and removes its handler on every `open()`/`close()`, not once. */
    registerKeyHandler(
      chord: KeyChord,
      handler: (event: KeyEventLike) => void,
      options?: { captureInEditable?: boolean },
    ): () => void;
    /** S5.8, D-S5-19: the `edit` capability's one resolution (I14) — the same answer `move`/`resize`
     *  already read through `interaction/entry-gestures.ts`'s `ctx.can`, exposed here because
     *  `inlineEditing()` is the first *plugin* that needs to ask it (every other capability check
     *  lives inside core's own gesture wiring, which a plugin cannot reach, D-S5-5). */
    canEdit(entry: Entry): boolean;
    /** S5.8, D-S5-19: raises `beforeEntryEdit` on this Gantt's own event bus and returns exactly
     *  what its registered handlers return — `true`/`undefined` (no veto), `false`, or an unsettled
     *  `Promise` (D-S3-17's async-veto shape, U8's `async (…) => { await myDialog.open(...); return
     *  false }`). The one seam a plugin has to raise a `before*` pair it implements itself: every
     *  other `before*` event is raised by core's own gesture pipeline, never by a plugin, so this is
     *  scoped to this one event name rather than a generic `emit` a plugin could use to forge
     *  `selectionChange` or any event core itself owns. */
    emitBeforeEntryEdit(payload: EntryFieldEdit): boolean | Promise<boolean>;
    /** S5.8, D-S5-19: raises `entryEdit` after the commit. No veto — nothing to return. */
    emitEntryEdit(payload: EntryFieldEdit): void;
  };
  view: {
    /** S5.3, D-S5-8: the overlay layer a plugin's own popup, tooltip or menu mounts into — the same
     *  primitive `extensions/popup.ts`'s `Popup` is built on. Live for the plugin's whole lifetime,
     *  not gated by `RegistrationGate` (D-S5-4 only gates one-shot `register*` calls; presenting and
     *  dismissing overlay content happens for as long as the plugin runs). */
    overlay: Overlay;
    /** S5.4, D-S5-11: claims one of the four renderer points — `bar`, `cell`, `header`, `tooltip`.
     *  One slot per point: a consumer's own `GanttOptions.*Renderer` always wins over this (a
     *  consumer that wants a plugin's renderer to win removes its own instead); two plugins claiming
     *  the same point throws `RendererAlreadyRegisteredError`, naming both plugin ids. Legal only
     *  while `setup` runs (D-S5-4). */
    registerRenderer<P extends RendererPoint>(point: P, renderer: RendererFor<P>): void;
    /** S5.5 (API gap found while building `tooltips()`): resolves what should paint `entryId`'s
     *  tooltip body right now — the same precedence `registerRenderer('tooltip', …)`'s slot resolves
     *  at paint time (D-S5-11: the consumer's own `GanttOptions.tooltipRenderer` always wins over a
     *  plugin's). `undefined` means "paint the library's own default content instead", which covers
     *  three cases alike: no renderer is registered at either level, the entry has no bar in the
     *  current frame (so there is no `FrameBar` to build a `TooltipRendererContext` from — a hover
     *  plugin works from the DOM after the fact, unlike `bar`/`cell`'s render-pass callers), or the
     *  resolved renderer threw (caught here, logged in dev mode, same fallback `render/dom/index.ts`'s
     *  own `callRenderer` gives `bar`/`cell`, issue #137 F14). `tooltips()` is this method's first
     *  caller, so a feature that owns a renderer point reads the same resolution the render backend
     *  would, without reaching `view/renderer-registry.ts` directly (D-S5-5). */
    resolveTooltip(entryId: EntryId): ElementDescription | undefined;
    /** D-S5-13: every Grid column marked `tooltip: true`, resolved against this Gantt's current
     *  `gridColumns`/`fields` — header text and `entry`'s formatted value for each. `tooltips()`'s
     *  default body appends these after name/dates; a consumer building its own tooltip content reads
     *  the same list instead of re-resolving columns itself (D-S5-5: `view/grid-columns.ts` stays out
     *  of reach). Empty when no column is marked `tooltip: true`. */
    resolveTooltipColumns(entry: Entry): readonly { header: string; value: string }[];
    /** S5.8, D-S5-19: whether the currently resolved Grid column for `field` allows inline editing —
     *  `GridColumn.editable` merged with the Field's own `column.editable` default, the same
     *  resolution the grid pane itself paints from (`ColumnChrome`). `undefined` when `field` names
     *  no column in the Gantt's current `gridColumns` (not shown right now). */
    isColumnEditable(field: FieldKey): boolean | undefined;
    /** S5.6, D-S5-15: registers a pure decoration provider into `layer` (`underBars` below the bar
     *  layer, `overBars` above). Legal only while `setup` runs (D-S5-4); removed automatically when
     *  this plugin is disposed — a provider has no `close()`/`unregister()` of its own, the plugin's
     *  own lifetime is its lifetime. Call: `ctx.view.registerDecoration('underBars', (ctx) =>
     *  ctx.time.eachDay(ctx.span).filter((day) => ctx.time.dayOfWeek(day) >= 6).map((day) => ({
     *  kind: 'rangeBand', start: day, end: ctx.time.addDays(day, 1) })))`. */
    registerDecoration(layer: DecorationLayer, provider: DecorationProvider): void;
  };
}

export interface GanttPluginOf<TGantt = unknown> {
  id: PluginId;
  /** Called once, after the Gantt mounts. Returns a disposer for the plugin's own resources. */
  setup(ctx: PluginContextOf<TGantt>): Disposer;
}
