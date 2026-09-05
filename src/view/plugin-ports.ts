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
import type { KindDefaults } from './capability.js';
import type { GanttEvents, EntryFieldEdit } from './event-bus.js';
import type { Overlay } from './overlay.js';

/** What `buildPluginPorts` borrows from `GanttShell` — the registries, the frame loop and the event
 *  bus a plugin seam writes into. `GanttShell` builds one of these per Gantt, closing over its own
 *  private fields. Nothing else may implement it. This is the same named-ports idiom
 *  `CoreCommandPorts` and `ColumnChromePorts` already set. */
export interface GanttShellPorts {
  /** The plain `{ on, off }` pair a plugin sees instead of the whole shell. */
  events: GanttEvents;
  /** S5.3, D-S5-8. One layer per Gantt, alive as long as the plugin is. */
  overlay: Overlay;
  /** D-S5-6. The one registry per Gantt. `register` takes the gate here; `run`/`available` do not. */
  commands: CommandRegistryOf<unknown>;
  /** D-S5-7. The one keymap per Gantt. */
  keymap: KeyHandlerRegistrar & {
    register(binding: KeyBinding<unknown>): Disposer;
  };
  /** D-S5-11. `pluginId` is what frees the point again when this plugin goes (#155). */
  registerRenderer<P extends RendererPoint>(point: P, renderer: RendererFor<P>, pluginId: PluginId): Disposer;
  /** D-S5-11's precedence, already merged with the consumer's own live `tooltipRenderer`. */
  resolveTooltipRenderer(): ResolvedRenderer<TooltipRenderer> | undefined;
  /** The entry's bar in the last painted frame. A hover plugin works from the DOM after the render
   *  pass, so it has no `FrameBar` of its own to build a `TooltipRendererContext` from. */
  lastPaintedBar(id: EntryId): FrameBar | undefined;
  entry(id: EntryId): Entry | undefined;
  /** The columns the grid pane actually paints — Field defaults already merged (S5.7). */
  resolvedColumns(): readonly ResolvedColumn[];
  /** S5.6, D-S5-15. The returned `Disposer` removes exactly this provider. */
  addDecorationProvider(layer: DecorationLayer, provider: DecorationProvider): Disposer;
  /** D-S4-24. One registry per Gantt, seeded with span/group/milestone. */
  itemProducers: { register(kind: EntryKind, producer: ItemProducer): Disposer };
  /** S5.9, D-S5-22. The middle precedence layer `resolveCapabilities` reads. */
  kindDefaults: { register(kind: EntryKind, defaults: KindDefaults): Disposer };
  /** S5.9, D-S5-21. `ColumnChrome` owns the rebind and the repaint on both edges of this one. */
  registerGridColumn(column: GridColumnInput): Disposer;
  /** I14's one capability resolution, asked for the `edit` gesture. */
  canEdit(entry: Entry): boolean;
  /** Raises `beforeEntryEdit` on this Gantt's own bus and hands back what the handlers answered. */
  proposeEntryEdit(payload: EntryFieldEdit): boolean | Promise<boolean>;
  /** Raises `entryEdit` on this Gantt's own bus. */
  announceEntryEdit(payload: EntryFieldEdit): void;
  /** Queues one frame (B10, D-S2-15). */
  requestFrame(): void;
  /** Drops the per-row item cache, so every row produces its items again on the next render. */
  invalidateItems(): void;
  /** Re-resolves every entry's capabilities after a `KindDefaults` registration changes. */
  refreshCapabilities(): void;
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

  /** The one shape every gated `register*` takes. A new seam is a declaration, not a transcription:
   *  name what registers, and name what must run again because the registration changed. `refresh`
   *  runs on both edges — on the way in, and on the way out — because the registration that wins
   *  after disposal must paint too (#155). */
  const registerWhileOpen = (register: () => Disposer, refresh?: () => void): Disposer => {
    gate.assertOpen();
    const remove = register();
    refresh?.();
    const dispose = (): void => {
      remove();
      refresh?.();
    };
    disposables.add(dispose);
    return dispose;
  };

  /** A renderer or a decoration claim changes what every painted cell, bar or header shows. Nothing
   *  else marks the frame dirty for it (#155). */
  const repaint = (): void => shell.requestFrame();
  /** `FrameLayout`'s per-row item cache forgets a row on a dataset, row-count or metrics change
   *  only. A producer registration is none of those, so ask every row to produce its items again. */
  const reproduceItems = (): void => {
    shell.invalidateItems();
    shell.requestFrame();
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
        registerWhileOpen(
          () => shell.kindDefaults.register(kind, defaults),
          () => shell.refreshCapabilities(),
        ),
    },
    view: {
      overlay: shell.overlay,
      registerRenderer: (point, renderer) =>
        registerWhileOpen(() => shell.registerRenderer(point, renderer, pluginId), repaint),
      resolveTooltipContent,
      // D-S5-13: `tooltips()`'s default body appends every column marked `tooltip: true` — the same
      // resolved list the grid itself paints from, so a column's header and format stay in one place.
      resolveTooltipColumns: (entry) =>
        shell
          .resolvedColumns()
          .filter((column) => column.tooltip === true)
          .map((column) => ({ header: column.header, value: column.format(entry) })),
      registerDecoration: (layer, provider) =>
        registerWhileOpen(() => shell.addDecorationProvider(layer, provider), repaint),
      // S5.8, D-S5-19: `field` names the currently *resolved* column, not the raw `GridColumnInput[]`
      // a consumer's own `gridColumns` getter returns.
      isColumnEditable: (field) => shell.resolvedColumns().find((column) => column.key === field)?.editable,
      registerGridColumn: (column) => registerWhileOpen(() => shell.registerGridColumn(column)),
    },
    layout: {
      registerItemProducer: (kind, producer) =>
        registerWhileOpen(() => shell.itemProducers.register(kind, producer), reproduceItems),
    },
  };

  return { ports, gate };
}
