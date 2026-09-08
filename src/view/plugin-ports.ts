// view/ — one plugin's ports: everything a `PluginContext` carries that `GanttShell` owns (S5.1,
// D-S5-1). Split out of `GanttShell` so a plugin seam is reviewable and testable on its own, with no
// mounted Gantt. `GanttShell` is the only caller. It closes over its own private state through
// `GanttShellPorts`, the same way `column-chrome.ts` closes over `ColumnChromePorts` and
// `core-commands.ts` over `CoreCommandPorts`.
//
// The ports are declared in the groups a plugin reads them in. `api/gantt.ts` therefore spreads this
// object straight into a `PluginContext` and adds only `dataset` and `gantt` — the two api-level
// members `view/` may not name (D-S5-5). A member that lands in the wrong group no longer compiles.
//
// #191: `PluginContextParts` below carries `TGantt`/`TDataset`, so the two members that bind them
// are declared once, here, with the rest. `api/plugin.ts` then binds both and adds `dataset`/`gantt`.
// `view/` still names neither type: they arrive as type arguments and stay unbound in this file.

import type {
  Disposer,
  ElementDescription,
  Entry,
  EntryId,
  EntryKind,
  FieldKey,
  GridColumn,
  GridColumnInput,
  PluginErrorReport,
  PluginId,
  RaiseError,
  TooltipColumn,
} from '../model/index.js';
import type {
  DecorationLayer,
  DecorationProvider,
  FrameBar,
  ItemProducer,
  RendererFor,
  RendererPoint,
  ResolvedColumn,
  ResolvedRenderer,
  TooltipRenderer,
} from '../layout/index.js';
import { DisposableStore } from '../extensions/disposables.js';
import { RegistrationGate } from '../extensions/plugin-runtime.js';
import type { CommandRegistryOf } from '../extensions/commands.js';
import type {
  KeyBinding,
  KeyBindingOf,
  KeyHandlerRegistrar,
  RegisterKeyHandler,
} from '../extensions/keymap.js';
import type { PluginRegistrar } from './plugin-registrations.js';
import type { KindDefaults, WriteVerdict } from './capability.js';
import type { GanttEvents, EntryFieldEdit } from './event-bus.js';
import { buildElement } from '../render/dom/element-description.js';
import type { MountLayer } from './mount-layer.js';
import type { DomTarget, GanttDom } from './gantt-dom.js';
import { toGridColumn } from './grid-columns.js';

/** What `ctx.view.onDomEvent` hands a plugin: the browser event, plus what the node it landed on
 *  stands for (review A4). `target` is `undefined` when the event landed inside this Gantt, but on
 *  none of the five things `targetUnder` names. A pane's own padding and an empty stretch of
 *  timeline are two such places. An event outside this Gantt never reaches the handler at all. */
export type DomEventHandler<K extends keyof DocumentEventMap> = (
  event: DocumentEventMap[K],
  target: DomTarget | undefined,
) => void;

/** `capture: true` listens on the capture phase. Use it for an event that does not bubble
 *  (`scroll`). Use it also for a handler that must run before the page's own (`keydown`). The
 *  removal uses the same flag, which is the pairing every hand-written listener had to remember for
 *  itself. */
export interface DomEventOptions {
  capture?: boolean;
}

/** What `buildPluginPorts` borrows from `GanttShell` — the registries, the frame loop and the event
 *  bus a plugin seam writes into. `GanttShell` builds one of these per Gantt, closing over its own
 *  private fields, and every installed plugin's `buildPluginPorts` call reads that same object
 *  (#179). Nothing else may implement it. This is the same named-ports idiom `CoreCommandPorts` and
 *  `ColumnChromePorts` already set. */
export interface GanttShellPorts {
  /** The plain `{ on, off }` pair a plugin sees instead of the whole shell. */
  events: GanttEvents;
  /** S5.3, D-S5-8. One layer per Gantt, alive as long as the plugin is. */
  overlay: MountLayer;
  /** #158. The grid's own row layer, alive as long as the plugin is. */
  rowLayer: MountLayer;
  /** S5.12, D-S5-40: this Gantt's raise seam, over its own `error` bus. `buildPluginPorts` binds
   *  each plugin's `by` onto it below, so a plugin never names itself. */
  raiseError: RaiseError;
  /** Review N1/A3. One resolver per Gantt. It owns every `.fg-*` class and `data-*` key a plugin
   *  used to retype, and it scopes `onDomEvent` to this Gantt (I2). */
  dom: GanttDom;
  /** D-S5-6. The one registry per Gantt. `register` takes the gate here; `run`/`available` do not. */
  commands: CommandRegistryOf<unknown>;
  /** D-S5-7. The one keymap per Gantt. */
  keymap: KeyHandlerRegistrar & {
    register(binding: KeyBinding<unknown>): Disposer;
  };
  /** The five seams a plugin registers into, each already carrying the refresh it owes (#170). */
  registrations: PluginRegistrar;
  /** D-S5-11's precedence, already merged with the consumer's own live `tooltipRenderer`. */
  resolveTooltipRenderer(): ResolvedRenderer<TooltipRenderer> | undefined;
  /** The entry's bar in the last painted frame. A hover plugin works from the DOM after the render
   *  pass, so it has no `FrameBar` of its own to build a `TooltipRendererContext` from. */
  lastPaintedBar(id: EntryId): FrameBar | undefined;
  entry(id: EntryId): Entry | undefined;
  /** The columns the grid pane actually paints — Field defaults already merged (S5.7). */
  resolvedColumns(): readonly ResolvedColumn[];
  /** One of those columns, by Field key. `ColumnChrome` answers from its own index, so this never
   *  scans the list (review A6). */
  resolvedColumn(field: FieldKey): ResolvedColumn | undefined;
  /** I14's one capability resolution, asked for one cell (#256). */
  canWrite(entry: Entry, field: FieldKey): WriteVerdict;
  /** Raises `beforeEntryEdit` on this Gantt's own bus and hands back what the handlers answered. */
  proposeEntryEdit(payload: EntryFieldEdit): boolean | Promise<boolean>;
  /** Raises `entryEdit` on this Gantt's own bus. */
  announceEntryEdit(payload: EntryFieldEdit): void;
  /** S5.11, D-S5-39: the entry id and Field key of the cell real keyboard focus sits on right now.
   *  `undefined` when focus is not on a cell (a row, a bar, a header cell, the splitter, or nothing).
   *  `view/roving-focus.ts` owns the fact; this asks it the same way `#buildCommandContext` does. */
  focusedCell(): { entryId: EntryId; field: FieldKey } | undefined;
}

/** The parts of one plugin's `PluginContext` that `view/` owns — what `GanttShell` hands to
 *  `options.buildPluginContext` so it can build the whole thing (S5.1, D-S5-1). Declared in the
 *  groups a plugin reads, so `api/gantt.ts` adds the two api-level members and nothing else (#150).
 *
 *  #183: `Parts`, not `Ports`. Every other `*Ports` in this repo is one collaborator's seam back
 *  into its owner (`ColumnChromePorts`, `GanttShellPorts` below). This is not that. It is the plugin's
 *  own world, minus the two members `view/` may not name. It is also the one name here a consumer
 *  reads, because `api/index.ts` exports it to keep the plugin surface member-by-member in
 *  `etc/freegantt.api.md` (#166, I11). `PlainParts` sets the suffix: the pieces a composite is
 *  made of.
 *
 *  #166: this is **the** member list for the plugin surface. `api/plugin.ts`'s public
 *  `PluginContextOf` is `PluginContextParts<TGantt, TDataset>` plus `dataset` and `gantt`, and
 *  nothing else. It used to be a hand-typed copy of all twenty-five, doc comments included, with
 *  nothing checking the copy. So the doc a plugin author reads lives here now, beside the one
 *  declaration.
 *
 *  #191: `TGantt`/`TDataset` are what `commands` and `registerKeybinding` bind. `api/plugin.ts`
 *  bound them instead. So this interface published two members that were wrong for every consumer,
 *  and `PluginContextOf` had to `Omit` both back out. Both arguments default to `unknown`. A caller
 *  that binds neither — `buildPluginPorts` below is the only one — reads the two members unbound.
 *
 *  #155: every `register*` here returns a `Disposer` that removes exactly its own registration. The
 *  plugin's own `DisposableStore` already holds a copy, so a plugin that never calls it still
 *  disposes cleanly on uninstall. The return value is what lets a plugin retract a registration
 *  while it is still installed — a column it shows in one mode only. Calling it twice is safe. */
export interface PluginContextParts<TGantt = unknown, TDataset = unknown> {
  /** `on`/`off` over `GanttEventMap`, including the cancelable `before*` pairs. */
  events: GanttEvents;
  /** S5.12, D-S5-40: raises one Error report on this Gantt's `error` event. `by` is filled with this
   *  plugin's own id, so a subscriber can always tell which plugin spoke. Use `severity: 'info'` for
   *  a Refusal the plugin made on purpose, `'warning'` for something it recovered from, `'error'` for
   *  something it did not. */
  raiseError(report: PluginErrorReport): void;
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
    registerKeybinding(binding: KeyBindingOf<TGantt, TDataset>): Disposer;
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
    registerKeyHandler: RegisterKeyHandler;
    /** S5.8, D-S5-19: the `edit` capability's one resolution (I14). It is the same answer
     *  `move`/`resize` already read through `interaction/entry-gestures.ts`'s `ctx.can`. This
     *  surface exposes it because `inlineEditing()` is the first *plugin* that needs to ask it.
     *  Every other capability check lives inside core's own gesture wiring, which a plugin cannot
     *  reach (D-S5-5).
     *
     *  #256: the question names a cell — one Entry, one Field — because that is what a write names.
     *  The same answer gates the bar's resize handles and its move. So a plugin that asks it here
     *  cannot disagree with the gesture that writes the same value. A refusal that carries a
     *  `reason` is one the user must be told about. A refusal with none is already visible, because
     *  nothing offered the write at all. */
    canWrite(entry: Entry, field: FieldKey): WriteVerdict;
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
    /** S5.3, D-S5-8: the layer a plugin's own popup, tooltip or menu mounts into — the same
     *  primitive `extensions/popup.ts`'s `Popup` is built on. It escapes the pane box, so content
     *  here may spill past a pane edge.
     *
     *  Live for the plugin's whole lifetime, not gated by `RegistrationGate`. D-S5-4 only gates
     *  one-shot `register*` calls, and a plugin presents and dismisses content for as long as it
     *  runs. */
    overlay: MountLayer;
    /** #158: the grid's own row layer. It is for content that must stay glued to a row or a cell
     *  while the pane scrolls. An open cell editor is the case.
     *
     *  The Grid pane has no vertical scrollbar of its own. This layer follows the Timeline pane's
     *  scroll by one transform per frame (D-S1.8-1). The pane scrolls horizontally around it
     *  (D-S1.8-13). Content mounted here therefore travels with the rows on both axes, in the same
     *  frame — no scroll listener, and no lag behind the paint. Position it once against
     *  `rowLayer.bounds`.
     *
     *  Use `overlay` instead for content that must escape the pane box. This layer is clipped to
     *  the pane. A popup dismisses on a scroll rather than following it. Live for the plugin's
     *  whole lifetime, the same posture as `overlay`. */
    rowLayer: MountLayer;
    /** S5.3/S5.4, D-S5-10: builds a live node from an `ElementDescription` — the one seam
     *  `extensions/` has to the reconciler. `extensions/` may not import `render/` itself (D-S5-5).
     *  Never `innerHTML`d except the description's own explicit `html` opt-in (I13).
     *
     *  Call: `ctx.view.renderElement(description)`, then mount the node in either layer above. */
    renderElement(description: ElementDescription): HTMLElement;
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
    /** S5.11, D-S5-39: which cell real keyboard focus sits on right now — an entry id and a Field
     *  key. `undefined` when focus is not on a cell (a row, a bar, a header cell, the splitter, or
     *  nothing focused at all). This is a *fact*, not a node: focus is a view concern. This port is
     *  how a plugin reads it without touching view state or re-deriving it from the DOM itself.
     *  (`inline-editing.ts`'s `Enter` handler is the first caller — `ctx.view.focusedCell()`.) */
    focusedCell(): { entryId: EntryId; field: FieldKey } | undefined;
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
    /** Every Grid column this Gantt paints right now, in paint order. The consumer's own columns and
     *  every plugin's are both here, each with its Field defaults already merged. `gantt.gridColumns` answers a
     *  different question: what the *consumer* authored (D-S5-33). A plugin that walks the grid wants
     *  this one. Call: `for (const column of ctx.view.resolvedColumns())`. */
    resolvedColumns(): readonly GridColumn[];
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
     *  what a plugin showing its column in one mode only calls (#155).
     *
     *  The column is this plugin's declaration, and it stays that way (D-S5-33, #181). It never joins
     *  `gantt.gridColumns`, and it never joins a `gridColumnsChange` payload. A resize or a reorder
     *  of it commits and repaints, and still changes neither. So a consumer who saves `gridColumns`
     *  saves their own columns only. Declare the column again on the next install: a Document carries
     *  no plugin declaration to restore it from.
     *
     *  **This plugin owns this column's width and its place (D-S5-38, #189).** The library reports
     *  column geometry; it stores it for nobody, the consumer included. A user resize of this column
     *  lives in session state and reaches no Document. To carry it across a reload, do what a
     *  consumer does with `gridColumnsChange`. Listen for that same event. Read your own column back
     *  from `ctx.view.resolvedColumns()`, by `field` — never from the payload, which reports the
     *  consumer's columns alone. Save the `width` wherever this plugin's own options say. Then pass
     *  it here on the next install. A plugin that skips this ships a column that resizes for the
     *  session only, which is a legitimate choice to make on purpose. */
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

/** Builds one plugin's context parts, plus the `RegistrationGate` that closes them (D-S5-4).
 *  `PluginRuntime` calls this once per installed plugin, then closes the gate the moment that
 *  plugin's `setup()` returns. The plugin's own `DisposableStore` is `parts.disposables`. */
export function buildPluginPorts(
  shell: GanttShellPorts,
  pluginId: PluginId,
): { parts: PluginContextParts; gate: RegistrationGate } {
  const disposables = new DisposableStore();
  // D-S5-4: one gate per plugin, closed the moment its own setup() returns. A `register*` reached
  // afterward throws `RegistrationClosedError`.
  const gate = new RegistrationGate(pluginId);

  /** The one shape every gated `register*` takes. It refuses the call once `setup()` has returned.
   *  It then holds the disposer, so uninstalling the plugin retracts the registration even when the
   *  plugin never calls it. What a registration invalidates is `plugin-registrations.ts`'s answer,
   *  given with the disposer it returns (#170). This function no longer knows a frame exists. */
  const registerWhileOpen = (register: () => Disposer): Disposer => {
    gate.assertOpen();
    const dispose = register();
    disposables.add(dispose);
    return dispose;
  };

  /** Review A4: the one shape every document-level plugin listener takes. It answers "is this
   *  mine?" once, from `shell.dom.owns`, so no plugin writes that guard again. One of the twelve
   *  hand-written listeners forgot to. It remembers the capture flag on both edges, which is the
   *  other half a hand-written pair got wrong. Not gated by `RegistrationGate`: `contextMenu()`
   *  attaches and detaches per open menu, the same lifetime `registerKeyHandler` already has. */
  const listenWhileInstalled = <K extends keyof DocumentEventMap>(
    type: K,
    handler: DomEventHandler<K>,
    options?: DomEventOptions,
  ): Disposer => {
    const capture = options?.capture ?? false;
    const listener = (event: Event): void => {
      const node = event.target;
      if (!(node instanceof Node) || !shell.dom.owns(node)) return;
      handler(event as DocumentEventMap[K], shell.dom.targetUnder(node));
    };
    document.addEventListener(type, listener, capture);
    const remove = (): void => document.removeEventListener(type, listener, capture);
    disposables.add(remove);
    return remove;
  };

  const commands: CommandRegistryOf<unknown> = {
    // #155: a plugin's command lives exactly as long as the plugin. Uninstalling restores whatever
    // the id held before — the core catalog's own command, where the plugin overrode one (D-S5-7).
    register: (command) => registerWhileOpen(() => shell.commands.register(command)),
    run: (id) => shell.commands.run(id),
    available: (ctx) => shell.commands.available(ctx),
  };

  // S5.5: the same resolve-then-call-with-fallback shape `render/dom/index.ts`'s `callRenderer` gives
  // `bar`/`cell` (#137 F14). A throwing tooltip renderer degrades to the library's default content,
  // never to a broken popup. No bar in the current frame resolves the same as "no renderer".
  const resolveTooltipContent = (id: EntryId): ElementDescription | undefined => {
    const resolved = shell.resolveTooltipRenderer();
    if (resolved === undefined) return undefined;
    const bar = shell.lastPaintedBar(id);
    if (bar === undefined) return undefined;
    const entry = shell.entry(id);
    if (entry === undefined) return undefined;
    try {
      return resolved.renderer({ entry, item: bar });
    } catch (error) {
      // S5.12, D-S5-41: report first; the `console.error` behind it is the fallback for a consumer
      // with nothing subscribed to `error`. It left `isDevMode()` for the reason that guard's own
      // audit gives — the branch was dead-code-eliminated out of every consumer's build.
      const plugin = resolved.pluginId !== undefined ? ` from plugin "${resolved.pluginId}"` : '';
      const message = `tooltipRenderer${plugin} threw — falling back to the default content`;
      shell.raiseError(
        {
          code: 'renderer-failed',
          message,
          severity: 'warning',
          by: resolved.pluginId ?? 'core',
          cause: error,
        },
        () => console.error(`FreeGantt: ${message}`, error),
      );
      return undefined;
    }
  };

  const parts: PluginContextParts = {
    events: shell.events,
    raiseError: (report) => shell.raiseError({ ...report, by: pluginId }),
    disposables,
    commands,
    interaction: {
      registerKeybinding: (binding) => registerWhileOpen(() => shell.keymap.register(binding)),
      registerKeyHandler: (chord, handler, options) => shell.keymap.registerHandler(chord, handler, options),
      canWrite: (entry, field) => shell.canWrite(entry, field),
      proposeEntryEdit: (payload) => shell.proposeEntryEdit(payload),
      announceEntryEdit: (payload) => shell.announceEntryEdit(payload),
      registerKindDefaults: (kind, defaults) =>
        registerWhileOpen(() => shell.registrations.registerKindDefaults(kind, defaults)),
    },
    view: {
      overlay: shell.overlay,
      rowLayer: shell.rowLayer,
      renderElement: (description) => buildElement(description),
      dom: shell.dom,
      onDomEvent: listenWhileInstalled,
      focusedCell: () => shell.focusedCell(),
      registerRenderer: (point, renderer) =>
        registerWhileOpen(() => shell.registrations.registerRenderer(point, renderer, pluginId)),
      resolveTooltipContent,
      // D-S5-13: `tooltips()`'s default body appends every column marked `tooltip: true`. That is
      // the same resolved list the grid itself paints from, so a column's header and format stay in
      // one place.
      resolveTooltipColumns: (entry) =>
        shell
          .resolvedColumns()
          .filter((column) => column.tooltip === true)
          .map((column) => ({ header: column.header, value: column.format(entry) })),
      registerDecoration: (layer, provider) =>
        registerWhileOpen(() => shell.registrations.registerDecoration(layer, provider)),
      resolvedColumns: () => shell.resolvedColumns().map(toGridColumn),
      registerGridColumn: (column) =>
        registerWhileOpen(() => shell.registrations.registerGridColumn(column, pluginId)),
    },
    layout: {
      registerItemProducer: (kind, producer) =>
        registerWhileOpen(() => shell.registrations.registerItemProducer(kind, producer)),
    },
  };

  return { parts, gate };
}
