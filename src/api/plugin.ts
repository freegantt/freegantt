// api/ — the public plugin contract (S5.1, D-S5-1, issue #137 F1). `GanttPluginOf`/`PluginContextOf`
// stay generic over `TGantt` here, so this file never imports `./gantt.js` for the concrete `Gantt`
// class. `api/gantt.ts` already imports this file for the generic shape. If this file also imported
// `Gantt`, the two would close an import cycle. Dependency-cruiser's `no-circular` rule treats a
// type-only edge the same as a runtime one. `api/gantt.ts` binds the type argument once,
// locally — `export type GanttPlugin = GanttPluginOf<Gantt>` — and `api/index.ts` re-exports the
// bound aliases alongside the generic shapes. A plugin author writing against `Gantt` names the
// bound `GanttPlugin`/`PluginContext`. Code that parameterizes over its own Gantt type names the
// `*Of` forms. `api/command.ts` uses the same pairing.

import type { Disposer, KeyChord, PluginId } from '../model/index.js';
import type { Dataset } from './dataset.js';
import type { DisposableStore } from '../extensions/disposables.js';
import type { KeyEventLike } from '../extensions/keymap.js';
import type {
  DomEventHandler,
  DomEventOptions,
  DomTarget,
  EntryFieldEdit,
  GanttDom,
  GanttEvents,
  Overlay,
  OverlayHandle,
  RowLayer,
} from '../view/index.js';
import type { CommandRegistryOf, KeyBindingOf } from './command.js';
import type { RendererPoint, RendererFor } from '../layout/index.js';
import type { DecorationLayer, DecorationProvider } from '../layout/index.js';
import type { ItemProducer } from '../layout/index.js';
import type { KindDefaults } from '../view/index.js';
import type {
  ElementDescription,
  Entry,
  EntryId,
  EntryKind,
  FieldKey,
  GridColumnInput,
  TooltipColumn,
} from '../model/index.js';

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

/** What a plugin's `setup()` receives, once, after the Gantt mounts. S5.1 ships `dataset`,
 *  `gantt`, `events` and `disposables` only. Every other member (`commands`, `view`, `layout`,
 *  `interaction`) arrives in the step that ships the code honouring it (I11). A `register*` that
 *  does nothing is exactly the dishonest surface `no-not-implemented` catches. See
 *  `plans/s5-extensibility-and-editing/s5.1-plugin-runtime.md` §1 for the full shape this grows
 *  into.
 *
 *  `TDataset` defaults to the public, untyped `Dataset`, the same way `TGantt` defaults to
 *  `unknown`. A plugin author who binds their own `Dataset<TMeta, TFields>` gets a typed
 *  `ctx.dataset` throughout `setup()`. A plugin that binds neither type argument sees the exact
 *  surface it always has (#141 item #9). */
export interface PluginContextOf<TGantt = unknown, TDataset = Dataset> {
  /** The public Dataset. No privileged access, no second surface. */
  dataset: TDataset;
  /** The public Gantt, for reading live config and calling public methods. */
  gantt: TGantt;
  /** `on`/`off` over `GanttEventMap`, including the cancelable `before*` pairs. */
  events: GanttEvents;
  /** This plugin's own cleanup list — add a listener or a timer here instead of closing over it by
   *  hand in the returned `Disposer`. Disposed in reverse order, ahead of that returned `Disposer`. */
  disposables: DisposableStore;
  /** S5.2, D-S5-6: the one command registry. `register` here is legal only while `setup` runs
   *  (D-S5-4). `run`/`available` work any time, including after this plugin's own setup returns.
   *  A command this plugin registers lives exactly as long as the plugin. Uninstalling restores
   *  whatever the id held before. For an overridden core command that is core's own (#155). */
  commands: CommandRegistryOf<TGantt, TDataset>;
  interaction: {
    /** S5.2, D-S5-7: adds one `KeyBinding`. Legal only while `setup` runs (D-S5-4) — removed
     *  automatically when this plugin is disposed, the same lifetime every other `register*` gets.
     *  The returned `Disposer` removes it sooner, for a plugin that binds a chord only in one mode
     *  (#155). Ignoring the return value is the common case. */
    registerKeybinding(binding: KeyBindingOf<TGantt>): Disposer;
    /** C3, `plans/reviews/2026-09-02-s5-start-fixes.md`: binds `chord` straight to `handler`,
     *  through the same keymap `registerKeybinding` uses. It serves a caller with no `Command` to
     *  run. A plugin that builds its own `Popup` (over `view.overlay` below) is that caller. Its
     *  Escape dismissal then wins by the keymap's own newest-first order (D-S5-9), the same way
     *  `extensions/popup.ts`'s own dismissal does.
     *
     *  Two things differ from `registerKeybinding`. This one is callable any time the plugin is
     *  installed, not only while `setup` runs. That is because a popup opens and closes for as long
     *  as the plugin does, not once at startup. This one also returns its own disposer instead of
     *  auto-removing on plugin disposal. That is because a popup adds and removes its handler on
     *  every `open()`/`close()`, not once. */
    registerKeyHandler(
      chord: KeyChord,
      handler: (event: KeyEventLike) => void,
      options?: { captureInEditable?: boolean },
    ): () => void;
    /** S5.8, D-S5-19: the `edit` capability's one resolution (I14). It is the same answer
     *  `move`/`resize` already read through `interaction/entry-gestures.ts`'s `ctx.can`. This
     *  surface exposes it because `inlineEditing()` is the first *plugin* that needs to ask it.
     *  Every other capability check lives inside core's own gesture wiring, which a plugin cannot
     *  reach (D-S5-5). */
    canEdit(entry: Entry): boolean;
    /** S5.8, D-S5-19: proposes the edit, and the answer is a Veto. This raises `beforeEntryEdit` on
     *  this Gantt's own event bus. It returns exactly what the registered handlers returned:
     *  `true`/`undefined` (no veto), `false`, or an unsettled `Promise` (D-S3-17's async-veto shape,
     *  U8's `async (…) => { await myDialog.open(...); return false }`). Read the answer — a plugin
     *  that ignores it opens an editor the consumer refused. This is the one seam a plugin has to
     *  raise a `before*` pair it implements itself. Core's own gesture pipeline raises every other
     *  `before*` event, so this is scoped to one event name. A generic `emit` would let a plugin
     *  forge `selectionChange`, or any other event core itself owns. */
    proposeEntryEdit(payload: EntryFieldEdit): boolean | Promise<boolean>;
    /** S5.8, D-S5-19: announces the committed edit. This raises `entryEdit` after the commit.
     *  It tells, it does not ask — no veto, and nothing to return. */
    announceEntryEdit(payload: EntryFieldEdit): void;
    /** S5.9, D-S5-22: fills the middle precedence layer `capability.ts` resolves — below the
     *  consumer's own `interactions`, above the library's per-kind table. `defaults` answers only
     *  the kinds it names; an omitted gesture still falls through to the library table for `kind`.
     *  Legal only while `setup` runs (D-S5-4); removed automatically when this plugin is disposed.
     *  When two plugins register defaults for the same Kind, the newest registration wins, and
     *  disposing one plugin never disturbs the other plugin's registration. The returned `Disposer`
     *  removes it sooner (#155). */
    registerKindDefaults(kind: EntryKind, defaults: KindDefaults): Disposer;
  };
  view: {
    /** S5.3, D-S5-8: the overlay layer a plugin's own popup, tooltip or menu mounts into — the same
     *  primitive `extensions/popup.ts`'s `Popup` is built on. Live for the plugin's whole lifetime,
     *  not gated by `RegistrationGate`. D-S5-4 only gates one-shot `register*` calls, and a plugin
     *  presents and dismisses overlay content for as long as it runs. */
    overlay: Overlay;
    /** #158: the grid's own row layer. It is for content that must stay glued to a row or a cell
     *  while the pane scrolls. An open cell editor is the case.
     *
     *  The Grid pane has no vertical scrollbar of its own. This layer follows the Timeline pane's
     *  scroll by one transform per frame (D-S1.8-1). The pane scrolls horizontally around it
     *  (D-S1.8-13). Content mounted here therefore travels with the rows on both axes, in the same
     *  frame — no scroll listener, and no lag behind the paint. Position it once against
     *  `dom.rowLayerBounds`.
     *
     *  Use `overlay` instead for content that must escape the pane box, a tooltip or a menu. This
     *  layer is clipped to the pane. A popup dismisses on a scroll rather than following it. Live
     *  for the plugin's whole lifetime, the same posture as `overlay`. */
    rowLayer: RowLayer;
    /** Review N1/A3: this Gantt's own rendered DOM, as three questions — `owns(node)`,
     *  `targetUnder(node)`, and `barFor(id)`/`cellFor(id, field)`. It is the whole plugin-to-DOM
     *  contract. `extensions/` may not import `render/` (D-S5-5), so before this seam every plugin
     *  retyped `.fg-bar`, `.fg-row`, `data-item-id` and five more by hand. Nothing versioned them
     *  and nothing tested them. Renaming a class broke every plugin with a green build.
     *
     *  `targetUnder` returns `{ kind, element, entry?, field? }`. `kind` is `TargetKind`, the same
     *  five words `CommandTarget` uses, so one vocabulary covers a resolved right-click and a
     *  command's own `when`. Live for the plugin's whole lifetime, not gated by `RegistrationGate`. */
    dom: GanttDom;
    /** Review A4: one scoped `document` listener. It filters to this Gantt (I2). It hands the
     *  handler the resolved `DomTarget` instead of a raw node. It registers its own removal in
     *  `ctx.disposables`, capture flag included, which a hand-written `removeEventListener` has to
     *  match by hand. Call: `ctx.view.onDomEvent('dblclick', (event, target) => { … })`. The
     *  returned `Disposer` removes it sooner, for a listener a plugin attaches per open popup.
     *
     *  Two Gantts on one page never answer each other's events, which is what a hand-written guard
     *  kept getting wrong (bug hunt B1). One case is wrong for this seam: a listener that must hear
     *  events *outside* this Gantt, a dismiss-on-outside-pointer, say. `extensions/popup.ts` keeps
     *  its own unscoped listener for exactly that. */
    onDomEvent<K extends keyof DocumentEventMap>(
      type: K,
      handler: DomEventHandler<K>,
      options?: DomEventOptions,
    ): Disposer;
    /** S5.4, D-S5-11: claims one of the four renderer points — `bar`, `cell`, `header`, `tooltip`.
     *  A consumer's own `GanttOptions.*Renderer` always wins over this. A consumer that wants a
     *  plugin's renderer to win removes its own instead.
     *
     *  `cell`, `header` and `tooltip` hold one slot each. A cell belongs to a column and a header
     *  to a band, so neither has a key to merge on. The `bar` point's per-kind map form (D-S5-12)
     *  holds one slot **per kind**. So a plugin that defines one kind and a plugin that defines
     *  another both install (review P2). The whole-point form — a function, not a map — stays
     *  exclusive. It answers every kind, so it refuses, and is refused by, any per-kind claim.
     *
     *  Two plugins claiming one slot throws `RendererAlreadyRegisteredError`, naming the slot and
     *  both plugin ids. Legal only while `setup` runs (D-S5-4). Disposing the plugin frees every
     *  slot this call claimed. So uninstalling and re-installing one plugin is a legal sequence,
     *  and not a collision with its own earlier registration (#155). The returned
     *  `Disposer` frees them sooner. */
    registerRenderer<P extends RendererPoint>(point: P, renderer: RendererFor<P>): Disposer;
    /** S5.5 (API gap found while building `tooltips()`): resolves what should paint `entryId`'s
     *  tooltip body right now. It is the same precedence `registerRenderer('tooltip', …)`'s slot
     *  resolves at paint time. D-S5-11: the consumer's own `GanttOptions.tooltipRenderer` always
     *  wins over a plugin's.
     *
     *  `undefined` means "paint the library's own default content instead". Three cases answer that
     *  way. First, no renderer is registered at either level. Second, the entry has no bar in the
     *  current frame, so there is no `FrameBar` to build a `TooltipRendererContext` from. A hover
     *  plugin works from the DOM after the fact, unlike `bar`/`cell`'s render-pass callers. Third,
     *  the resolved renderer threw, and this method catches it and logs it in dev mode. That third
     *  answer is the same fallback `render/dom/index.ts`'s own `callRenderer` gives `bar`/`cell`
     *  (issue #137 F14).
     *
     *  `tooltips()` is this method's first caller. A feature that owns a renderer point reads the
     *  same resolution the render backend would, without reaching `view/renderer-registry.ts`
     *  directly (D-S5-5). */
    resolveTooltipContent(entryId: EntryId): ElementDescription | undefined;
    /** D-S5-13: every Grid column marked `tooltip: true`, resolved against this Gantt's current
     *  `gridColumns`/`fields` — header text and `entry`'s formatted value for each. `tooltips()`'s
     *  default body appends these after name/dates. A consumer that builds its own tooltip content
     *  reads the same list, instead of re-resolving columns itself (D-S5-5: `view/grid-columns.ts`
     *  stays out of reach). Empty when no column is marked `tooltip: true`. */
    resolveTooltipColumns(entry: Entry): readonly TooltipColumn[];
    /** S5.8, D-S5-19: whether the currently resolved Grid column for `field` allows inline editing.
     *  That is `GridColumn.editable` merged with the Field's own `column.editable` default. It is
     *  the same resolution the grid pane itself paints from (`ColumnChrome`). `undefined` when
     *  `field` names no column in the Gantt's current `gridColumns` (not shown right now). */
    isColumnEditable(field: FieldKey): boolean | undefined;
    /** S5.6, D-S5-15: registers a pure decoration provider into `layer` (`underBars` below the bar
     *  layer, `overBars` above). Legal only while `setup` runs (D-S5-4). Disposing this plugin
     *  removes the provider automatically. A provider has no `close()`/`unregister()` of its own, so
     *  the plugin's own lifetime is its lifetime. Call: `ctx.view.registerDecoration('underBars', (ctx) =>
     *  ctx.time.eachDay(ctx.span).filter((day) => ctx.time.dayOfWeek(day) >= 6).map((day) => ({
     *  kind: 'rangeBand', start: day, end: ctx.time.addDays(day, 1) })))`. The returned `Disposer`
     *  removes the provider sooner (#155). */
    registerDecoration(layer: DecorationLayer, provider: DecorationProvider): Disposer;
    /** S5.9, D-S5-21: registers `column` on this Gantt's grid, appended after the consumer's own
     *  `gridColumns` in registration order. A duplicate `field` the consumer's own list already
     *  names is dropped (config beats a plugin). The Field it names still resolves through the
     *  ordinary Field registry (`UnknownFieldError`/`FieldNotColumnableError` apply unchanged). Legal
     *  only while `setup` runs (D-S5-4); removed automatically when this plugin is disposed. When two
     *  plugins register the same field, the newest registration wins, and disposing one plugin never
     *  disturbs the other plugin's registration. The returned `Disposer` removes the column sooner —
     *  what a plugin showing its column in one mode only calls (#155). */
    registerGridColumn(column: GridColumnInput): Disposer;
  };
  /** S5.9, D-S5-22: the pure layout side of the four-seam kind contract — what shape a
   *  consumer-defined kind draws. `interaction`/`view` above answer what you can do to it and how it
   *  looks; `commands` (top of this interface) answers what actions it offers. */
  layout: {
    /** Claims the item-shaping producer for `kind`, replacing whichever one `kind` resolved to
     *  before (the shipped `'span'`/`'group'`/`'milestone'` producers included). The common producer
     *  is `(entry) => [wholeEntryItem(entry)]`. That is one Item over the entry's whole span, built
     *  by the library's own exported helper. A plugin never restates the Item id convention
     *  (review P3). `producer` is pure: it runs in `layout/`, the same DOM-free pass every other
     *  item producer runs in. Legal only while `setup` runs (D-S5-4). Disposal removes it
     *  automatically, and restores whichever registration is newest among the rest. Disposing one
     *  plugin never disturbs another plugin's registration on the same Kind. The returned
     *  `Disposer` removes it sooner (#155). */
    registerItemProducer(kind: EntryKind, producer: ItemProducer): Disposer;
  };
}

export interface GanttPluginOf<TGantt = unknown, TDataset = Dataset> {
  id: PluginId;
  /** Called once, after the Gantt mounts. Returns a `Disposer` for the plugin's own resources, or
   *  nothing at all (review P4). Every `register*` and every `onDomEvent` files its own removal in
   *  `ctx.disposables`. A plugin that owns no timer, socket or subscription of its own has nothing
   *  left to return. */
  setup(ctx: PluginContextOf<TGantt, TDataset>): Disposer | void;
}
