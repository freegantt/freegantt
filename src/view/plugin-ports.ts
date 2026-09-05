// view/ — one plugin's ports: everything a `PluginContext` carries that `GanttShell` owns (S5.1,
// D-S5-1). Split out of `GanttShell` so a plugin seam is reviewable and testable on its own, with no
// mounted Gantt. `GanttShell` is the only caller. It closes over its own private state through
// `GanttShellPorts`, the same way `column-chrome.ts` closes over `ColumnChromePorts` and
// `core-commands.ts` over `CoreCommandPorts`.
//
// The ports are declared in the groups a plugin reads them in. `api/gantt.ts` therefore spreads this
// object straight into a `PluginContext` and adds only `dataset` and `gantt` — the two api-level
// members `view/` may not name (D-S5-5). A member that lands in the wrong group no longer compiles.

import type {
  Disposer,
  ElementDescription,
  Entry,
  EntryId,
  EntryKind,
  FieldKey,
  GridColumnInput,
  PluginId,
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
import type { KeyBinding, KeyEventLike, KeyHandlerRegistrar } from '../extensions/keymap.js';
import { isDevMode } from '../data/dev-mode.js';
import type { PluginRegistrar } from './plugin-registrations.js';
import type { KindDefaults } from './capability.js';
import type { GanttEvents, EntryFieldEdit } from './event-bus.js';
import type { Overlay } from './overlay.js';
import type { RowLayer } from './row-layer.js';
import type { DomTarget, GanttDom } from './gantt-dom.js';

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
  overlay: Overlay;
  /** #158. The grid's own row layer, alive as long as the plugin is. */
  rowLayer: RowLayer;
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
  /** I14's one capability resolution, asked for the `edit` gesture. */
  canEdit(entry: Entry): boolean;
  /** Raises `beforeEntryEdit` on this Gantt's own bus and hands back what the handlers answered. */
  proposeEntryEdit(payload: EntryFieldEdit): boolean | Promise<boolean>;
  /** Raises `entryEdit` on this Gantt's own bus. */
  announceEntryEdit(payload: EntryFieldEdit): void;
}

/** What `GanttShell` hands to `options.buildPluginContext` so it can build one plugin's
 *  `PluginContext` (S5.1, D-S5-1). Declared in the groups a plugin reads, so `api/gantt.ts` adds the
 *  two api-level members and nothing else (#150).
 *
 *  #155: every `register*` here returns a `Disposer` that removes exactly its own registration. The
 *  plugin's own `DisposableStore` already holds a copy, so a plugin that never calls it still
 *  disposes cleanly on uninstall. The return value is what lets a plugin retract a registration
 *  while it is still installed — a column it shows in one mode only. Calling it twice is safe. */
export interface PluginContextPorts {
  events: GanttEvents;
  disposables: DisposableStore;
  commands: CommandRegistryOf<unknown>;
  interaction: {
    registerKeybinding(binding: KeyBinding<unknown>): Disposer;
    /** Not gated: a popup opens and closes for as long as the plugin runs, not only during `setup`.
     *  Returns the keymap's own disposer instead of adding it to `disposables`, so a `Popup` controls
     *  its own add/remove cycle per `open()`/`close()`. */
    registerKeyHandler(
      chord: string,
      handler: (event: KeyEventLike) => void,
      options?: { captureInEditable?: boolean },
    ): () => void;
    /** S5.8, D-S5-19. */
    canEdit(entry: Entry): boolean;
    /** S5.8, D-S5-19. Asks, and takes a veto — sync `false`, or an unsettled `Promise` (D-S3-17). */
    proposeEntryEdit(payload: EntryFieldEdit): boolean | Promise<boolean>;
    /** S5.8, D-S5-19. Tells, after the commit. Nothing comes back. */
    announceEntryEdit(payload: EntryFieldEdit): void;
    /** S5.9, D-S5-22: the middle precedence layer between the consumer's own `interactions` and the
     *  library table (`capability.ts`). Disposal removes this registration, never another
     *  plugin's (#154). */
    registerKindDefaults(kind: EntryKind, defaults: KindDefaults): Disposer;
  };
  view: {
    overlay: Overlay;
    /** #158. The layer for content that must stay glued to a row or a cell while the pane scrolls.
     *  An open cell editor is the case.
     *
     *  The Grid pane has no vertical scrollbar of its own. This layer follows the Timeline pane's
     *  scroll by one transform per frame (D-S1.8-1). The pane scrolls horizontally around it
     *  (D-S1.8-13). Content mounted here therefore travels with the rows on both axes, in the same
     *  frame — no scroll listener, no lag. Position it once against `dom.rowLayerBounds`.
     *
     *  Use `overlay` instead for content that must escape the pane box. This layer is clipped to
     *  it, and a popup dismisses on a scroll rather than following it. */
    rowLayer: RowLayer;
    /** Review N1/A3. This Gantt's own rendered DOM, as questions. */
    dom: GanttDom;
    /** Review A4. Listens on `document`, keeps only what this Gantt owns, and hands the handler the
     *  resolved target. Registers its own removal in `disposables`, capture flag included. Not
     *  gated: a plugin opens and closes a listener for as long as it runs. */
    onDomEvent<K extends keyof DocumentEventMap>(
      type: K,
      handler: DomEventHandler<K>,
      options?: DomEventOptions,
    ): Disposer;
    /** S5.4, D-S5-11. */
    registerRenderer<P extends RendererPoint>(point: P, renderer: RendererFor<P>): Disposer;
    /** S5.5 (API gap, `s5.5-tooltips-and-context-menu.md` §5). Not gated by `RegistrationGate`: a
     *  plugin reads this for as long as it runs, not only during `setup`. */
    resolveTooltipContent(id: EntryId): ElementDescription | undefined;
    /** D-S5-13: every resolved Grid column marked `tooltip: true`, with this entry's formatted
     *  value. Not gated, same posture as `resolveTooltipContent`. */
    resolveTooltipColumns(entry: Entry): readonly TooltipColumn[];
    /** S5.6, D-S5-15. A provider is removed automatically when this plugin disposes. */
    registerDecoration(layer: DecorationLayer, provider: DecorationProvider): Disposer;
    /** S5.8, D-S5-19. */
    isColumnEditable(field: FieldKey): boolean | undefined;
    /** S5.9, D-S5-21: appended after the consumer's own `gridColumns`, in registration order.
     *  Disposal removes this registration, never another plugin's (#154). */
    registerGridColumn(column: GridColumnInput): Disposer;
  };
  layout: {
    /** S5.9, D-S5-22. Disposal removes this registration through `ItemProducerRegistry.register`'s
     *  own `Disposer`. The newest registration left then wins (#154). */
    registerItemProducer(kind: EntryKind, producer: ItemProducer): Disposer;
  };
}

/** Builds one plugin's ports, plus the `RegistrationGate` that closes them (D-S5-4). `PluginRuntime`
 *  calls this once per installed plugin, then closes the gate the moment that plugin's `setup()`
 *  returns. The plugin's own `DisposableStore` is `ports.disposables`. */
export function buildPluginPorts(
  shell: GanttShellPorts,
  pluginId: PluginId,
): { ports: PluginContextPorts; gate: RegistrationGate } {
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
      if (isDevMode()) {
        const plugin = resolved.pluginId !== undefined ? ` from plugin "${resolved.pluginId}"` : '';
        console.error(
          `FreeGantt: tooltipRenderer${plugin} threw — falling back to the default content`,
          error,
        );
      }
      return undefined;
    }
  };

  const ports: PluginContextPorts = {
    events: shell.events,
    disposables,
    commands,
    interaction: {
      registerKeybinding: (binding) => registerWhileOpen(() => shell.keymap.register(binding)),
      registerKeyHandler: (chord, handler, options) => shell.keymap.registerHandler(chord, handler, options),
      canEdit: (entry) => shell.canEdit(entry),
      proposeEntryEdit: (payload) => shell.proposeEntryEdit(payload),
      announceEntryEdit: (payload) => shell.announceEntryEdit(payload),
      registerKindDefaults: (kind, defaults) =>
        registerWhileOpen(() => shell.registrations.registerKindDefaults(kind, defaults)),
    },
    view: {
      overlay: shell.overlay,
      rowLayer: shell.rowLayer,
      dom: shell.dom,
      onDomEvent: listenWhileInstalled,
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
      // S5.8, D-S5-19: `field` names the currently *resolved* column, not the raw `GridColumnInput[]`
      // a consumer's own `gridColumns` getter returns.
      isColumnEditable: (field) => shell.resolvedColumn(field)?.editable,
      registerGridColumn: (column) => registerWhileOpen(() => shell.registrations.registerGridColumn(column)),
    },
    layout: {
      registerItemProducer: (kind, producer) =>
        registerWhileOpen(() => shell.registrations.registerItemProducer(kind, producer)),
    },
  };

  return { ports, gate };
}
