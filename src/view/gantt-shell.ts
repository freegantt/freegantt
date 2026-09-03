// view/ — Gantt shell, the composition root that wires the grid pane, splitter, timeline pane and
// viewport binding together (plans/01 §8.2-8.3, S1.8).

import {
  barSpan,
  FrameLayout,
  ScrollModel,
  TimeScaleModel,
  Viewport,
  DEFAULT_TICK_BOX_FLOOR_PX,
  DEFAULT_LANE_GAP_PX,
  DEFAULT_ROW_SOURCE,
  createItemProducerRegistry,
  isPlannedHeaderRow,
  gridContentWidth,
} from '../layout/index.js';
import type {
  DateLineSpec,
  Overscan,
  PresetRef,
  ResolvedColumn,
  RowSource,
  TimeScaleFit,
  ViewportHandle,
  ViewPreset,
  ItemProducerRegistry,
  FieldCompare,
} from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { PaneLayout } from './pane-layout.js';
import type { Panes } from './pane-layout.js';
import { DomOverlay } from './overlay.js';
import type { Overlay } from './overlay.js';
import { attachSplitter } from './splitter.js';
import type { SplitterAttachment } from './splitter.js';
import { EventBus } from './event-bus.js';
import type { AsyncCancelableEvent, GanttEventHandler, GanttEventMap, GanttEvents } from './event-bus.js';
import { PluginRuntime, RegistrationGate } from '../extensions/plugin-runtime.js';
import type { ShellPlugin } from '../extensions/plugin-runtime.js';
import { DisposableStore } from '../extensions/disposables.js';
import { CommandRegistry } from '../extensions/commands.js';
import type { Command, CommandContext } from '../extensions/commands.js';
import { Keymap } from '../extensions/keymap.js';
import type { KeyBinding, KeyEventLike } from '../extensions/keymap.js';
import type { GridWidthChange, SelectionChange } from './event-bus.js';
import type { CollapseChange } from './collapse-state.js';
import { attachScroll } from './scroll-attachment.js';
import type { ScrollAttachment } from './scroll-attachment.js';
import { attachPaneSize } from './pane-size-attachment.js';
import type { PaneSizeAttachment } from './pane-size-attachment.js';
import { attachWheelNavigation } from './wheel-navigation.js';
import type { WheelNavigationAttachment, WheelNavigationContext } from './wheel-navigation.js';
import { attachRowTwisty } from './attach-row-twisty.js';
import type { RowTwistyAttachment } from './attach-row-twisty.js';
import { panToTodayLine } from './today-landing.js';
import { resolveViewportGestures } from './viewport-gestures.js';
import type { ViewportGestures } from './viewport-gestures.js';
import { ensureBaseStyles } from './styles.js';
import type { InteractionState, RenderBackend } from '../render/backend.js';
import {
  EntryNotFoundError,
  ContainerNotFoundError,
  entryId,
  entryIdOfItem,
  itemId,
} from '../model/index.js';
import type {
  Dataset,
  Entry,
  EntryEdits,
  EntryId,
  FieldContext,
  GridColumnInput,
  ItemId,
  Instant,
  RowId,
  Size,
  TimeSpan,
} from '../model/index.js';
import type { EditExtender } from '../data/edit-extension.js';
import { resolveCapabilities } from './capability.js';
import type { Capabilities, Interactions } from './capability.js';
import { subscribeToDatasetChanges } from './dataset-change-subscription.js';
import type { DatasetChangeSubscription } from './dataset-change-subscription.js';
import { FrameScheduler } from './frame-scheduler.js';
import { projectAffordances } from './affordance-projection.js';
import { GesturePipeline } from './gesture-pipeline.js';
import type { EntryGestureContext } from './entry-gesture-context.js';
import { DEFAULT_GRID_COLUMNS, resolveGanttFields } from './grid-columns.js';
import { TreeCollapse } from './tree-collapse.js';
import { createFieldContext } from '../data/fields/field-access.js';
import { isDevMode } from '../data/dev-mode.js';

/** One `{ detach() }` for every inject slot. `view/` may not import `interaction/` (plans/01 §1:
 *  `INT --> VIEW`, not the reverse), so the shell takes pointer and keyboard attachments by
 *  injection — the same DI shape `GanttShellOptions.backend` already uses. `api/gantt.ts` (which
 *  does import `interaction/`, `API --> INT`) supplies `attachEntryGestures` /
 *  `attachKeyboardEditing`. `interaction/` returns this type; there is no per-slot mirror.
 *  `EntryGestureContext` itself lives in `./entry-gesture-context.js` (D-GH-1, C5). */
export interface Detachable {
  detach(): void;
}
export type AttachEntryGestures = (
  pane: HTMLElement,
  container: HTMLElement,
  ctx: EntryGestureContext,
) => Detachable;

/** S3.5, D-S3-13: same DI shape as `AttachEntryGestures` just above, and the same `ctx` instance —
 *  `interaction/keyboard-editing.ts`'s `attachKeyboardEditing` needs `session()`/`selection`/
 *  `selectableEntriesInRowOrder`/`entryFor`/`can` only, not `hitTest`/`setHovered`, but there is no value in a second,
 *  narrower context type for one caller. */
export type AttachKeyboardEditing = (container: HTMLElement, ctx: EntryGestureContext) => Detachable;

/** S1.10, D-S1.10-4: theming's only preset axis for this step — `'auto'` follows
 * `prefers-color-scheme` (no `data-fg-theme` attribute written), `'light'`/`'dark'` pin it. */
export type Theme = 'auto' | 'light' | 'dark';
const DEFAULT_THEME: Theme = 'auto';
const DEFAULT_A11Y_LABEL = 'Gantt';

/** CSS custom property that owns row height (plans/02 §4, level 1 of the customization ladder) —
 * not a constructor option (#39). Read on construction and again whenever the pane-size attachment
 * fires (#49, #8): getComputedStyle is a synchronous style read that can force a style
 * recalculation, and `--fg-row-height` essentially never changes between renders in normal use, so a
 * resize is as good a signal as any to catch the rare case it does — never an unconditional read on
 * every render(). */
const ROW_HEIGHT_PROPERTY = '--fg-row-height';
const DEFAULT_ROW_HEIGHT = 32;
/** A zero-height row is not a row: only a positive value is an authored row height. */
const ROW_HEIGHT_POLICY = { fallback: DEFAULT_ROW_HEIGHT, accepts: 'positive' } as const;

const TICK_BOX_FLOOR_PROPERTY = '--fg-tick-box-floor';
/** A zero floor would re-open thin straddles painting at the CSS box minimum. */
const TICK_BOX_FLOOR_POLICY = { fallback: DEFAULT_TICK_BOX_FLOOR_PX, accepts: 'positive' } as const;

const LANE_GAP_PROPERTY = '--fg-lane-gap';
/** Zero gap is authored: packed bars may sit flush. */
const LANE_GAP_POLICY = { fallback: DEFAULT_LANE_GAP_PX, accepts: 'zeroOrMore' } as const;

/** Default for `todayLineMarginTicks` below: how many of the current preset's own ticks sit between
 *  the pane's left edge and `panToToday`'s landing (S1.13 follow-up) — enough that the today line
 *  reads as "near the start" without sitting flush on the edge, leaving a sliver of the timeline
 *  visible to its left. */
const DEFAULT_TODAY_LINE_MARGIN_TICKS = 2;

export interface GanttShellOptions {
  /** Element or CSS selector (plans/02 §2); a selector that matches nothing throws (#38). */
  container: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9) — pass the same instance to two Gantt instances to x-sync them.
   * Constructs a private default when omitted (plans/01 §8.2: "single-Gantt usage never sees the
   * concept"); the default resolves its zone, span and fit from this shell's binding, so it needs
   * no arguments. */
  scale?: TimeScaleModel;
  /** Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
   * Constructs a private default when omitted; sharing one instance links both axes (S1.5 README
   * D-S1.5-3). */
  scroll?: ScrollModel;
  /** Initial grid pane width in px (S1.8, D-S1.8-3). Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
  /** Live (#127). The floor a splitter drag clamps `gridWidth` to. Default `40` — wide enough for
   *  one narrow column, so a drag cannot take the pane to nothing by accident. It bounds the drag
   *  only: an explicit `gridWidth = 0` still collapses the grid pane on purpose. */
  minGridWidth?: number;
  /** Build the private default `TimeScaleModel` only (D-S1.9-9) — a no-op, with a dev-mode warning,
   * when `scale` is also supplied: the shared model already carries its own options. */
  preset?: PresetRef;
  range?: 'fitDataset' | TimeSpan;
  fit?: TimeScaleFit;
  /** `Viewport` is never shared (D-S1.7-10), so this always applies to this shell's own viewport. */
  overscan?: Overscan;
  /** Live (S1.10, D-S1.10-4). Default `'auto'`: follows `prefers-color-scheme`. */
  theme?: Theme;
  /** Live (S1.10, D-S1.10-4). Default `'Gantt'`; sets `aria-label` on the container. */
  a11yLabel?: string;
  /** Live (S1.12, D-S1.12-12). `undefined` = the runtime default. Feeds header labels and
   *  `a11yLabel` alike. */
  locale?: Intl.LocalesArgument;
  /** Live (S1.12/S1.13, D-S1.12-14, D-S1.13-4). Default `true`. */
  todayLine?: boolean | Instant;
  /** Live (S1.13, D-S1.13-4). Default `[]`. */
  dateLines?: readonly DateLineSpec[];
  /** Live. See `GanttOptions.todayLineMarginTicks`. Default `DEFAULT_TODAY_LINE_MARGIN_TICKS`. */
  todayLineMarginTicks?: number;
  /** Live (S3, D-S3-9). Per-gesture, boolean or per-entry predicate, over the per-kind default table
   *  (`view/capability.ts`). Default `{}`: every gesture resolves off the default table alone. */
  interactions?: Interactions;
  /** Live (S3.7, D-S3-14). Wheel zoom/pan and keyboard pan. Default `{}`: every viewport gesture
   *  is on. `false` turns them all off. The imperative `zoomBy`/`panToDate` surface does not
   *  consult this. */
  viewportGestures?: ViewportGestures;
  /** Live (S4.3, D-S4-12). Field keys in display order, plus per-Gantt overrides. Default `['name']`. */
  gridColumns?: readonly GridColumnInput[];
  /** Live (S4.6, D-S4-21). Default `{ source: 'entries', tree: false }`. */
  rowSource?: RowSource;
  /** Live (S4.6, D-S4-22). Collapsed `RowId`s, loose on the way in. Default `[]`. */
  collapsed?: readonly (RowId | string)[];
  /** Expert knob, not on `GanttOptions` (plans/02 "two callers, two surfaces") — a test naming its
   * own `RenderBackend<HTMLElement>` in place of the DOM one (§9-I: the seam had two implementations
   * and one hardcoded call site, so nothing could reach the other short of mocking the module).
   * Still `RenderBackend<HTMLElement>`, not the null backend's `RenderBackend<void>` — `PaneLayout`
   * mounts real elements regardless of which backend paints them, so this closes the hardcoding, not
   * DOM-free `view/`. Defaults to `createDomBackend()`. */
  backend?: RenderBackend<HTMLElement>;
  /** Injected, not defaulted here — see the `AttachEntryGestures` comment above: `view/` cannot
   * import `interaction/` to supply its own default. `api/gantt.ts` always passes
   * `attachEntryGestures`; omitted only by tests exercising the shell with no pointer wiring. */
  entryGestures?: AttachEntryGestures;
  /** Injected, same reason as `entryGestures` above. `api/gantt.ts` always passes
   * `attachKeyboardEditing`; omitted only by tests exercising the shell with no keyboard wiring. */
  keyboardEditing?: AttachKeyboardEditing;
  /** S3.3, D-S3-16: how a committed gesture draft actually reaches the store. `model/dataset.ts`'s
   *  `Dataset` (this shell's own `dataset` option) deliberately has no `transaction()` — "a view
   *  never opens a transaction" — so `api/gantt.ts`, which holds the full `api/Dataset` the model
   *  interface narrows away, supplies this instead. Returns `false` for both a sync veto and a
   *  `MutationCancelledError` from `beforeChange`; the shell never sees the exception either way.
   *  Omitted only by tests exercising the shell with no data-write wiring. */
  commitEntryEdits?: (edits: EntryEdits) => boolean;
  /** S3.6, D-S3-18, P1: an installed extension hook, read for **preview only** — ghosts its extras in
   *  the rAF-coalesced drag preview. There is no public way to install one in S3 (`GanttOptions` has
   *  no such field, `api/gantt.ts` never passes this); only a test constructing `GanttShell` directly
   *  (the same shape `commitEntryEdits` already uses) can. The real hook — same `EditExtender`
   *  function, if a caller passes the identical reference to both — still runs again, for real, inside
   *  `data/transaction.ts`'s own commit; this option never writes anything itself. */
  editExtender?: EditExtender;
  /** Internal (D-S4-24). One registry per Gantt, seeded with span/group/milestone. Tests inject a
   *  replacement; `GanttOptions` has no such field (public registration is S5). */
  itemProducerRegistry?: ItemProducerRegistry;
  /** S5.1, D-S5-1: fills the api-level pieces of a plugin's `PluginContext` that `view/` cannot type
   *  without reaching past its own boundary (D-S5-5) — the full api `Dataset` (`model/dataset.ts`'s
   *  narrow interface hides `.transaction()`, same reason `commitEntryEdits` above exists) and the
   *  public `Gantt` façade, which does not exist yet when this constructor runs. Returns `unknown`
   *  because the concrete `PluginContext` type is bound in `api/gantt.ts`, which alone may import
   *  both `Gantt` and this generic contract without closing an import cycle (`api/plugin.ts`'s file
   *  header). `api/gantt.ts` always supplies this; omitted only by tests exercising the shell with no
   *  plugins. */
  buildPluginContext?: (parts: {
    events: GanttEvents;
    disposables: DisposableStore;
    commands: CommandRegistry<unknown>;
    registerKeybinding: (binding: KeyBinding<unknown>) => void;
    registerKeyHandler: (
      chord: string,
      handler: (event: KeyEventLike) => void,
      options?: { captureInEditable?: boolean },
    ) => () => void;
    overlay: Overlay;
  }) => unknown;
  /** S5.2, D-S5-6: fills the api-level pieces of a `CommandContext` for the same reason
   *  `buildPluginContext` above fills `PluginContext`'s — the full api `Dataset` (with `undo`/`redo`)
   *  and the public `Gantt` façade are both api-level, and `view/` may not name either type
   *  (D-S5-5's mirror on the `view/` side). Called fresh on every command invocation, never cached,
   *  so a command always reads the invocation's current selection. `api/gantt.ts` always supplies
   *  this; omitted only by tests exercising the shell with no commands. */
  buildCommandContext?: (parts: { entry?: Entry }) => unknown;
  /** S5.2: `freegantt.panToToday`'s own clock read. `view/` may not call `time/`'s `now()` itself
   *  (I10) — `api/gantt.ts` supplies `now` from `time/index.js`, the same function `Gantt.panToToday`
   *  already reads for the identical reason. Omitted only by tests exercising the shell with no
   *  commands. */
  now?: () => Instant;
}

/** `exactOptionalPropertyTypes` treats `obj.key = undefined` as a type error when `key` is declared
 *  `T | undefined` rather than `T?` on the read side (`InteractionState`'s own shape) — the honest
 *  "unset" is `delete`, not an assignment. One helper rather than an `if`/`delete` pair at each of
 *  `#refreshAffordances`'s three call sites. */
function setOptional<T, K extends keyof T>(target: T, key: K, value: T[K] | undefined): void {
  if (value === undefined) delete target[key];
  else target[key] = value;
}

function resolveContainer(container: HTMLElement | string): HTMLElement {
  if (typeof container !== 'string') return container;
  const el = document.querySelector(container);
  if (!(el instanceof HTMLElement)) {
    throw new ContainerNotFoundError(container);
  }
  return el;
}

export class GanttShell {
  #container: HTMLElement;
  #paneLayout: PaneLayout;
  #panes: Panes;
  #backend: RenderBackend<HTMLElement>;
  #revision = 0;
  #viewport: Viewport;
  #viewportHandle: ViewportHandle;
  #scrollAttachment: ScrollAttachment;
  #paneSizeAttachment: PaneSizeAttachment;
  #splitterAttachment: SplitterAttachment;
  #datasetChanges: DatasetChangeSubscription;
  #entryGestures: Detachable | undefined;
  #keyboardEditing: Detachable | undefined;
  #wheelNavigation: WheelNavigationAttachment | undefined;
  #wheelNavigationGrid: WheelNavigationAttachment | undefined;
  #rowTwistyAttachment: RowTwistyAttachment;
  /** D-S3-6: one long-lived, mutable per-Gantt object — `applyState` diffs against what it painted
   *  last, so writing into this and calling `#backend.applyState` allocates nothing per hover/select
   *  step (I5). Never rebuilt per call. */
  #interactionState: InteractionState = {};
  #selection: readonly EntryId[] = [];
  /** S3.2, D-S3-9: resolved once, re-resolved only when `interactions` is reassigned — never per
   *  hover step. `#refreshAffordances` reads it, it never calls `resolveCapabilities` itself. */
  #interactions: Interactions = {};
  #viewportGestures: ViewportGestures = {};
  #resolvedViewportGestures = resolveViewportGestures(undefined);
  #capabilities: Capabilities;
  /** The raw hit under the pointer, reported by `EntrySelectionContext.setHovered` — undefined on
   *  pointerleave or when nothing is wired (no `entryGestures` attachment). */
  #hoveredItemId: ItemId | undefined;
  /** D-GH-2: owns draft math, preview rAF coalescing and the commit pipeline for a move/resize
   *  gesture — built once, from this shell's own primitives, right after `#capabilities` below. */
  #gesturePipeline!: GesturePipeline;
  #itemProducerRegistry!: ItemProducerRegistry;
  /** The single rAF owner (B10, D-S2-15): every render request past construction goes through
   *  this, so N mutations in one tick become one frame. */
  #frames = new FrameScheduler(() => this.render());
  #events = new EventBus<GanttEventMap, AsyncCancelableEvent>();
  /** S5.1, D-S5-1: the plain `{ on, off }` a plugin's `ctx.events` actually is — built once, from
   *  this shell's own `on`/`off` below, so a plugin never sees the rest of this class's public
   *  surface the way handing it `this` directly would. */
  #pluginEvents: GanttEvents = {
    on: (name, handler) => this.on(name, handler),
    off: (name, handler) => this.off(name, handler),
  };
  #pluginRuntime!: PluginRuntime<unknown>;
  /** S5.2, D-S5-6/D-S5-7: one registry and one keymap per Gantt (I2) — core commands and core
   *  bindings register here first, so a plugin's own registration always wins (D-S5-7). */
  #commandRegistry!: CommandRegistry<unknown>;
  #keymap!: Keymap<unknown>;
  #keymapListener!: (event: KeyboardEvent) => void;
  #destroyed = false;
  /** This Gantt's layout pass. It keeps the row-height index alive across renders (#47) — the shell
   * states what to draw and holds no layout bookkeeping of its own. */
  #layout = new FrameLayout();
  #rowHeight: number = DEFAULT_ROW_HEIGHT;
  #laneGapPx: number = DEFAULT_LANE_GAP_PX;
  #tickBoxFloorPx: number = DEFAULT_TICK_BOX_FLOOR_PX;
  #options: GanttShellOptions;
  /** Construction phase (issue #91 §9-B): bind() notifies synchronously before pane size is wired, so
   *  those calls are not real renders yet. Becomes `'live'` after the first measurement. */
  #phase: 'constructing' | 'live' = 'constructing';
  /** Set by the most recent `render()` — `frame.contentWidth`/`contentHeight` (S1.5 README §3.2,
   * D-S1.5-9). No gutter added (S1.8, D-S1.8-2): the grid pane's own width is the gutter now, and the
   * timeline pane's content is `contentWidth` wide, full stop. */
  #contentSize = { width: 0, height: 0 };
  #theme: Theme = DEFAULT_THEME;
  #a11yLabel: string = DEFAULT_A11Y_LABEL;
  #locale: Intl.LocalesArgument | undefined;
  #todayLine: boolean | Instant = true;
  #dateLines: readonly DateLineSpec[] = [];
  #todayLineMarginTicks: number = DEFAULT_TODAY_LINE_MARGIN_TICKS;
  #gridColumnInput: readonly GridColumnInput[] = DEFAULT_GRID_COLUMNS;
  #resolvedColumns: readonly ResolvedColumn[] = [];
  #fieldCompares: readonly FieldCompare[] = [];
  #fieldContext: FieldContext | undefined;
  #rowSource: RowSource = DEFAULT_ROW_SOURCE;
  #treeCollapse!: TreeCollapse;
  /** S5.3, D-S5-8: constructed once panes exist — see the plugin runtime's own comment just below for
   *  why. */
  #overlay: DomOverlay;

  constructor(options: GanttShellOptions) {
    this.#options = options;
    this.#container = resolveContainer(options.container);
    // S1.10, D-S1.10-8: must exist before PaneLayout builds the classed elements the stylesheet
    // targets, or there's a one-frame flash of unstyled content.
    ensureBaseStyles(this.#container.ownerDocument);
    this.#paneLayout = new PaneLayout({
      container: this.#container,
      ...(options.gridWidth !== undefined ? { gridWidth: options.gridWidth } : {}),
      ...(options.minGridWidth !== undefined ? { minGridWidth: options.minGridWidth } : {}),
    });
    this.#panes = this.#paneLayout.panes;
    // S5.3, D-S5-8: constructed right after the panes it measures, so it is ready by the time the
    // plugin runtime (just below) builds its first `PluginContext`.
    this.#overlay = new DomOverlay(this.#container, this.#panes.overlay, this.#paneLayout);

    const hasOwnOptions =
      options.preset !== undefined || options.range !== undefined || options.fit !== undefined;
    if (options.scale && hasOwnOptions && isDevMode()) {
      console.warn(
        "FreeGantt: GanttOptions.preset/range/fit are ignored when 'scale' is also supplied. " +
          'The shared TimeScaleModel already carries its own options — set preset/range/fit on it directly.',
      );
    }
    this.#viewport = new Viewport({
      scale:
        options.scale ??
        new TimeScaleModel({
          ...(options.preset !== undefined ? { preset: options.preset } : {}),
          ...(options.range !== undefined ? { range: options.range } : {}),
          ...(options.fit !== undefined ? { fit: options.fit } : {}),
        }),
      ...(options.scroll ? { scroll: options.scroll } : {}),
      ...(options.overscan !== undefined ? { overscan: options.overscan } : {}),
    });

    // Set before the deliberate first render below (`#frames.flush()`) — plain field writes, not
    // the live setters, so this first paint sees the constructor's own options instead of the
    // field initializers' defaults (a bug caught by S1.13's `dateLines` constructor option:
    // rendering it required this to move ahead of the flush it used to follow).
    this.#locale = options.locale;
    this.#todayLine = options.todayLine ?? true;
    this.#dateLines = options.dateLines ?? [];
    this.#gridColumnInput = options.gridColumns ?? DEFAULT_GRID_COLUMNS;
    this.#rowSource = options.rowSource ?? DEFAULT_ROW_SOURCE;
    this.#itemProducerRegistry = options.itemProducerRegistry ?? createItemProducerRegistry();
    this.#bindColumns();

    // Mount before binding (#22): the render target exists by the time the binding's own onChange
    // — which IS this shell's first render — fires, so there is no construction-order exception to
    // document and no separate explicit render() call after bind().
    this.#backend = options.backend ?? createDomBackend();
    this.#backend.mount({
      grid: this.#panes.grid,
      timeline: this.#panes.timeline,
      gridHeader: this.#panes.gridHeader,
    });

    // S5.2, D-S5-6: built before the plugin runtime — core commands register into this during this
    // same constructor, and a plugin's own `ctx.commands`/`ctx.interaction.registerKeybinding` (below)
    // close over it too. `#buildCommandContext` is called fresh per invocation (never cached), so a
    // command always reads the current selection.
    this.#commandRegistry = new CommandRegistry<unknown>(() => this.#buildCommandContext());
    this.#keymap = new Keymap<unknown>(this.#commandRegistry, () => this.#buildCommandContext());

    // S5.1, D-S5-1: constructed once panes exist — a plugin's disposer may still need its overlay
    // node (a later step's `ctx.view.overlay`), so this must outlive them either way. `destroy()`
    // disposes it first, before any pane teardown, for the same reason. No plugin is actually set up
    // yet: `Gantt.plugins`'s live setter runs `#pluginRuntime.install(...)` only once `api/gantt.ts` has
    // finished assigning its own `#shell` field, so `buildPluginContext`'s `gantt` value is real by
    // the time any `setup()` reads it.
    this.#pluginRuntime = new PluginRuntime<unknown>((pluginId) => {
      const disposables = new DisposableStore();
      // D-S5-4: one gate per plugin, closed the moment its own setup() returns (PluginRuntime.install
      // does the closing) — a `registerKeybinding` reached afterward throws RegistrationClosedError.
      const gate = new RegistrationGate(pluginId);
      const registerKeybinding = (binding: KeyBinding<unknown>): void => {
        gate.assertOpen();
        disposables.add(this.#keymap.register(binding));
      };
      // Not gated: unlike `registerKeybinding` above (one-shot, setup()-only, D-S5-4), a popup opens
      // and closes for as long as the plugin itself is installed — see `PluginContextOf.interaction
      // .registerKeyHandler`'s own doc (api/plugin.ts) for why. Returns the keymap's own disposer
      // directly rather than auto-adding it to `disposables`, so the caller (a `Popup`) controls its
      // own add/remove cycle per `open()`/`close()`.
      const registerKeyHandler = (
        chord: string,
        handler: (event: KeyEventLike) => void,
        keyOptions?: { captureInEditable?: boolean },
      ): (() => void) => this.#keymap.registerHandler(chord, handler, keyOptions);
      const context = (options.buildPluginContext ?? (() => ({})))({
        events: this.#pluginEvents,
        disposables,
        commands: this.#commandRegistry,
        registerKeybinding,
        registerKeyHandler,
        overlay: this.#overlay,
      });
      return { context, disposables, registrationGate: gate };
    });

    // The timeline pane is the single native scroller (D-D, D-S1.8-1); the grid pane follows it by
    // transform, in render/dom's sync(). Constructed before either bind (Viewport's fan-in,
    // D-S1.7-1), so this field is never undefined during a render.
    this.#scrollAttachment = attachScroll(this.#panes.timeline, this.#viewport);

    // bind() fires its own onChange synchronously, once per sub-model (D-S1.5-4: bind always
    // notifies the newcomer) — before this call returns and #viewportHandle is assigned. Those
    // premature calls are dropped while `#phase === 'constructing'`; the deliberate first render
    // below runs once everything, including the initial pane-size measurement, is wired.
    this.#viewportHandle = this.#viewport.bind(
      { entries: options.dataset.entries.all, timeZone: options.dataset.timeZone },
      () => {
        if (this.#phase === 'constructing') return;
        this.#frames.request();
        this.#emitNavigationChange();
      },
    );
    // The whole of this shell's dependency on data change (D-S2-20): push the fresh snapshot into
    // the bound viewport and request a frame — the changeset mechanism's own fan-out, not a second
    // reactivity path (#33's `setEntries()` warning is against a *public* one; see dataset-change-
    // subscription.ts).
    this.#datasetChanges = subscribeToDatasetChanges(options.dataset, (changeSet) => {
      this.#layout.invalidateForChange(changeSet);
      this.#bindColumns();
      this.#viewportHandle.setEntries(options.dataset.entries.all);
      this.#frames.request();
    });
    // Synchronous first measurement: a real ResizeObserver's own first callback is queued, not
    // immediate, so the first paint cannot wait for it. attachPaneSize below takes over from here —
    // every measurement after this one, live, for as long as the shell lives (S1.7b, #8).
    this.#applyPaneMeasurement(this.#paneLayout.measureTimelinePane());
    this.#paneSizeAttachment = attachPaneSize(this.#panes.timeline, (size) =>
      this.#applyPaneMeasurement(size),
    );
    // #127: the splitter proposes a raw px delta; the floor applies here, on the way in, so a drag
    // cannot reach below `minGridWidth` while a direct `gridWidth` write still says what it means.
    this.#splitterAttachment = attachSplitter(this.#panes.splitter, {
      readGridWidth: () => this.#paneLayout.gridWidth,
      previewGridWidth: (px) => {
        this.#paneLayout.gridWidth = this.#aboveMinGridWidth(px);
      },
      commitGridWidth: (px) => this.#commitGridWidth(this.#aboveMinGridWidth(px)),
    });
    this.#interactions = options.interactions ?? {};
    this.#viewportGestures = options.viewportGestures ?? {};
    this.#resolvedViewportGestures = resolveViewportGestures(this.#viewportGestures);
    this.#capabilities = resolveCapabilities(this.#interactions, (kind) =>
      this.#options.dataset.isRollUpKind(kind),
    );
    this.#treeCollapse = new TreeCollapse({
      plannedRows: () => this.#layout.plannedRows(),
      entries: () => this.#options.dataset.entries.all,
      entry: (id) => this.#options.dataset.entries.get(id),
      canSelect: (id) => this.#canGesture('select', id),
      selected: () => this.#selection[0],
      proposeSelection: (ids) => this.#proposeSelection(ids),
      confirm: (change) =>
        this.#proposeChange('beforeCollapseChange', 'collapseChange', change, () => {
          this.#layout.invalidateFrom(0);
          this.#frames.request();
        }),
      rowIdForEntry: (id) => this.#layout.rowIdForEntry(id),
      ancestorRowIds: (id) => this.#layout.ancestorRowIds(id),
    });
    this.#gesturePipeline = new GesturePipeline({
      timeZone: () => this.#options.dataset.timeZone,
      timeScale: () => this.#viewport.timeScale,
      preset: () => this.#viewport.preset,
      selection: () => this.#selection,
      entryById: (id) => this.#options.dataset.entries.get(id),
      canGesture: (capability, id) => this.#canGesture(capability, id),
      commitEntryEdits: (edits) => this.#options.commitEntryEdits?.(edits) ?? false,
      emit: (name, payload) => this.#events.emit(name, payload),
      ...(options.editExtender ? { extend: options.editExtender } : {}),
      allEntries: () => new Map(this.#options.dataset.entries.all.map((e) => [e.id, e])),
      locale: () => this.#locale,
      applyGestureState: (preview, pendingItemIds, cursor) => {
        setOptional(this.#interactionState, 'preview', preview);
        setOptional(this.#interactionState, 'pendingItemIds', pendingItemIds);
        setOptional(this.#interactionState, 'cursorX', cursor?.x);
        setOptional(this.#interactionState, 'cursorLabel', cursor?.label);
        this.#backend.applyState(this.#interactionState);
      },
    });
    // D-S3-13: one `EntryGestureContext`, shared by the pointer attachment and the keyboard one —
    // both drive the same `#gesturePipeline.session()`, so there is no value in building two.
    const gestureContext: EntryGestureContext = {
      hitTest: (at) => {
        const hit = this.#backend.hitTest(at);
        if (!hit) return undefined;
        return hit.edge !== undefined ? { itemId: hit.itemId, edge: hit.edge } : { itemId: hit.itemId };
      },
      entryFor: (item) => this.#entryFor(item),
      can: (capability, entry) => this.#capabilities.can(capability, entry),
      selectableEntriesInRowOrder: () => this.#selectableEntriesInRowOrder(),
      selection: {
        get: () => this.#selection,
        propose: (next, itemIds) => this.#proposeSelection(next, itemIds),
      },
      setHovered: (item) => this.#setHovered(item),
      contentXAtPaneOffset: (offsetX) => offsetX + this.#viewport.scroll.state.position.x,
      session: (grabbed, gesture, grabbedItemId) =>
        this.#gesturePipeline.session(grabbed, gesture, grabbedItemId),
      tryTreeArrow: (direction) => this.#treeCollapse.handleArrow(direction),
      expandAllRows: () => this.expandAll(),
    };
    // S5.2, D-S5-6/D-S5-7: core commands, then the keymap listener — attached ahead of
    // `entryGestures`/`keyboardEditing`/`keyboardNavigation` below, so every plugin binding and every
    // core command gets first refusal on a key event before this shell's own pointer-editing and
    // pan/page/home/end handling ever sees it (an unmatched chord is left untouched either way — the
    // resolver never calls `preventDefault()` on a miss).
    this.#registerCoreCommands();
    this.#registerNavigationCommands();
    this.#keymapListener = (event: KeyboardEvent) => {
      if (this.#keymap.resolve(event)) {
        event.preventDefault();
      }
    };
    this.#container.addEventListener('keydown', this.#keymapListener);

    this.#entryGestures = options.entryGestures?.(this.#panes.timeline, this.#container, gestureContext);
    this.#keyboardEditing = options.keyboardEditing?.(this.#container, gestureContext);
    const wheelNavigationCtx: WheelNavigationContext = {
      wheelZoomEnabled: () => this.#resolvedViewportGestures.wheelZoom,
      wheelPanEnabled: () => this.#resolvedViewportGestures.wheelPan,
      zoomIn: (offsetX) => this.zoomIn(offsetX),
      zoomOut: (offsetX) => this.zoomOut(offsetX),
      panBy: (dx, dy) => this.#panBy(dx, dy),
    };
    this.#wheelNavigation = attachWheelNavigation(this.#panes.timeline, wheelNavigationCtx);
    // #126: the grid pane has no scroll of its own (D-S1.8-1) — forward its wheel input into the
    // same shared scroll the timeline pane already writes into. `anchorPane` keeps ctrl/⌘+wheel
    // zoom anchored on the timeline's time axis, since the grid pane's own x-axis isn't time.
    this.#wheelNavigationGrid = attachWheelNavigation(this.#panes.grid, wheelNavigationCtx, {
      anchorPane: this.#panes.timeline,
      forwardPlainWheel: true,
    });
    this.#rowTwistyAttachment = attachRowTwisty(this.#panes.grid, {
      toggleCollapse: (id) => this.toggleCollapse(id),
    });
    if (options.collapsed !== undefined) {
      this.#treeCollapse.hydrate(options.collapsed);
    }
    this.#phase = 'live';
    this.#frames.flush();

    this.#todayLineMarginTicks = options.todayLineMarginTicks ?? DEFAULT_TODAY_LINE_MARGIN_TICKS;

    if (options.theme !== undefined) this.theme = options.theme;
    else this.#applyTheme();
    this.a11yLabel = options.a11yLabel ?? DEFAULT_A11Y_LABEL;
  }

  get locale(): Intl.LocalesArgument | undefined {
    return this.#locale;
  }

  /** Live (S1.12, D-S1.12-12): re-labels every header band and every screen-reader date with no bar
   *  remount — it flows straight through `LayoutInput.locale` on the next render. */
  set locale(l: Intl.LocalesArgument | undefined) {
    this.#locale = l;
    this.#bindColumns();
    this.#frames.request();
  }

  get gridColumns(): readonly GridColumnInput[] {
    return this.#gridColumnInput;
  }

  set gridColumns(columns: readonly GridColumnInput[]) {
    this.#gridColumnInput = columns;
    this.#bindColumns();
    this.#frames.request();
  }

  get rowSource(): RowSource {
    return this.#rowSource;
  }

  set rowSource(next: RowSource) {
    this.#rowSource = next;
    this.#layout.invalidateFrom(0);
    this.#frames.request();
  }

  get collapsed(): readonly RowId[] {
    return this.#treeCollapse.ids;
  }

  set collapsed(ids: readonly (RowId | string)[]) {
    this.#treeCollapse.replace(ids);
  }

  collapse(id: RowId | string): void {
    this.#treeCollapse.collapse(id);
  }

  expand(id: RowId | string): void {
    this.#treeCollapse.expand(id);
  }

  toggleCollapse(id: RowId | string): void {
    this.#treeCollapse.toggleCollapse(id);
  }

  collapseAll(): void {
    this.#treeCollapse.collapseAll();
  }

  expandAll(): void {
    this.#treeCollapse.expandAll();
  }

  #proposeChange(
    before: 'beforeCollapseChange',
    after: 'collapseChange',
    change: CollapseChange,
    apply: () => void,
    rollback?: () => void,
  ): boolean;
  #proposeChange(
    before: 'beforeSelectionChange',
    after: 'selectionChange',
    change: SelectionChange,
    apply: () => void,
    rollback?: () => void,
  ): boolean;
  #proposeChange(
    before: 'beforeGridWidthChange',
    after: 'gridWidthChange',
    change: GridWidthChange,
    apply: () => void,
    rollback?: () => void,
  ): boolean;
  #proposeChange(
    before: 'beforeCollapseChange' | 'beforeSelectionChange' | 'beforeGridWidthChange',
    after: 'collapseChange' | 'selectionChange' | 'gridWidthChange',
    change: CollapseChange | SelectionChange | GridWidthChange,
    apply: () => void,
    rollback?: () => void,
  ): boolean {
    if (this.#events.emit(before, change) === false) {
      rollback?.();
      return false;
    }
    apply();
    this.#events.emit(after, change);
    return true;
  }

  #selectableEntriesInRowOrder(): readonly EntryId[] {
    const out: EntryId[] = [];
    for (const row of this.#layout.plannedRows()) {
      if (isPlannedHeaderRow(row)) continue;
      for (const id of row.entryIds) {
        const entry = this.#options.dataset.entries.get(id);
        if (entry !== undefined && this.#capabilities.can('select', entry)) out.push(id);
      }
    }
    return out;
  }

  get todayLine(): boolean | Instant {
    return this.#todayLine;
  }

  set todayLine(on: boolean | Instant) {
    if (this.#todayLine === on) return;
    this.#todayLine = on;
    this.#frames.request();
  }

  get dateLines(): readonly DateLineSpec[] {
    return this.#dateLines;
  }

  set dateLines(lines: readonly DateLineSpec[]) {
    if (lines === this.#dateLines) return;
    this.#dateLines = lines;
    this.#frames.request();
  }

  get todayLineMarginTicks(): number {
    return this.#todayLineMarginTicks;
  }

  /** Live — takes effect on the next `panToToday()` call; does not itself move the scroll position. */
  set todayLineMarginTicks(ticks: number) {
    this.#todayLineMarginTicks = ticks;
  }

  get selection(): readonly EntryId[] {
    return this.#selection;
  }

  /** Live; runs the same cancelable sequence a click runs (D-S3-10). Loose in (`EntryId | string`),
   *  branded out — the same asymmetry `dataset.entries.get/update/remove` already ship. */
  set selection(ids: readonly (EntryId | string)[]) {
    this.#proposeSelection(ids.map((id) => entryId(id)));
  }

  #proposeSelection(next: readonly EntryId[], selectedItemIds?: readonly ItemId[]): void {
    const from = this.#selection;
    const entriesEqual = from.length === next.length && from.every((id, i) => id === next[i]);
    if (entriesEqual && selectedItemIds !== undefined) {
      const current = this.#interactionState.selectedItemIds;
      const itemsEqual =
        current !== undefined &&
        current.length === selectedItemIds.length &&
        current.every((id, i) => id === selectedItemIds[i]!);
      if (itemsEqual) return;
      this.#interactionState.selectedItemIds = selectedItemIds;
      this.#refreshAffordances();
      return;
    }
    if (entriesEqual) return;
    this.#proposeChange('beforeSelectionChange', 'selectionChange', { from, to: next }, () => {
      this.#selection = next;
      this.#interactionState.selectedItemIds = selectedItemIds ?? next.map((id) => itemId(id));
      this.#refreshAffordances();
    });
  }

  get interactions(): Interactions {
    return this.#interactions;
  }

  /** Live (S3, D-S3-9): re-resolves the capability table immediately, then re-derives the two
   *  resolved affordance ids off the current hover/selection so a stricter rule takes effect without
   *  waiting for the next pointer move. */
  set interactions(next: Interactions) {
    this.#interactions = next;
    this.#capabilities = resolveCapabilities(this.#interactions, (kind) =>
      this.#options.dataset.isRollUpKind(kind),
    );
    this.#refreshAffordances();
  }

  get viewportGestures(): ViewportGestures {
    return this.#viewportGestures;
  }

  /** Live (S3.7, D-S3-14): the next wheel or key reads the new flags; no remount. */
  set viewportGestures(next: ViewportGestures) {
    this.#viewportGestures = next;
    this.#resolvedViewportGestures = resolveViewportGestures(next);
  }

  /** S5.2, D-S5-6: the live `CommandContext` builder — `entry` is the first selected entry, or
   *  `undefined` when nothing is selected (the doc's "the focused row, or none"; `target`'s richer
   *  focus tracking is S5.7/S5.11's own job, left `undefined` here). `api/gantt.ts`'s injected
   *  `buildCommandContext` fills `dataset`/`gantt` — `view/` may not name either type (D-S5-5's
   *  mirror). Omitted `buildCommandContext` (a test with no commands wiring) makes every command's
   *  context an empty object; fine, since no core command reads `ctx.dataset`/`ctx.gantt` without
   *  first checking `ctx.entry`, and no such test runs a command that needs them. */
  #buildCommandContext(): CommandContext<unknown> {
    const id = this.#selection[0];
    const entry = id !== undefined ? this.#options.dataset.entries.get(id) : undefined;
    // `view/` may not name `CommandContextOf`'s api-level fields (`dataset: Dataset`, `gantt`) —
    // D-S5-5's mirror — so this cast trusts `api/gantt.ts`'s injected `buildCommandContext` to fill
    // them, the same trust `buildPluginContext` above already gets for `PluginContext`.
    return (this.#options.buildCommandContext ?? (() => ({})))(
      entry !== undefined ? { entry } : {},
    ) as CommandContext<unknown>;
  }

  /** D-S5-6: the eleven commands every consumer already has as a public method, named. Registered
   *  before any plugin, so a plugin can override any of them (D-S5-7). */
  #registerCoreCommands(): void {
    const asCtx = (ctx: unknown): CommandContext<unknown> => ctx as CommandContext<unknown>;
    const register = (command: Command<unknown>): void => this.#commandRegistry.register(command);

    register({ id: 'freegantt.collapseAll', label: 'Collapse all', run: () => this.collapseAll() });
    register({ id: 'freegantt.expandAll', label: 'Expand all', run: () => this.expandAll() });
    register({
      id: 'freegantt.collapseRow',
      label: 'Collapse row',
      when: (ctx) => asCtx(ctx).entry !== undefined,
      run: (ctx) => {
        const entry = asCtx(ctx).entry;
        if (entry !== undefined) this.collapse(entry.id);
      },
    });
    register({
      id: 'freegantt.expandRow',
      label: 'Expand row',
      when: (ctx) => asCtx(ctx).entry !== undefined,
      run: (ctx) => {
        const entry = asCtx(ctx).entry;
        if (entry !== undefined) this.expand(entry.id);
      },
    });
    register({
      id: 'freegantt.zoomIn',
      label: 'Zoom in',
      when: () => this.canZoomIn,
      run: () => this.zoomIn(),
    });
    register({
      id: 'freegantt.zoomOut',
      label: 'Zoom out',
      when: () => this.canZoomOut,
      run: () => this.zoomOut(),
    });
    register({
      id: 'freegantt.panToToday',
      label: 'Pan to today',
      run: () => {
        const now = this.#options.now;
        if (now !== undefined) this.panToToday(now());
      },
    });
    register({
      id: 'freegantt.selectAll',
      label: 'Select all',
      run: () => this.#proposeSelection(this.#selectableEntriesInRowOrder()),
    });
    register({
      id: 'freegantt.clearSelection',
      label: 'Clear selection',
      when: () => this.#selection.length > 0,
      run: () => this.#proposeSelection([]),
    });
    register({
      id: 'freegantt.undo',
      label: 'Undo',
      when: (ctx) => asCtx(ctx).dataset?.canUndo === true,
      run: (ctx) => asCtx(ctx).dataset?.undo(),
    });
    register({
      id: 'freegantt.redo',
      label: 'Redo',
      when: (ctx) => asCtx(ctx).dataset?.canRedo === true,
      run: (ctx) => asCtx(ctx).dataset?.redo(),
    });
  }

  /** S3.7's Page/Home/End/arrow pan (D-S3-14), reshaped as core commands + default bindings
   *  (S5.2, D-S5-6/D-S5-7) — `view/keyboard-navigation.ts`'s own standalone `attachKeyboardNavigation`
   *  is superseded here; this shell no longer calls it, so a plugin can override any of these chords
   *  the same way it overrides `freegantt.collapseAll`. No behaviour change (D-S3-13's "nothing
   *  selected" column, and the un-pannable-while-editing guard, both carry over as `when`). */
  #registerNavigationCommands(): void {
    const register = (command: Command<unknown>): void => this.#commandRegistry.register(command);
    const bind = (chord: string, command: string): void => {
      this.#keymap.register({ chord, command });
    };
    const panEnabled = (): boolean => this.#resolvedViewportGestures.keyboardPan;
    const nothingSelected = (): boolean => this.#selection.length === 0;

    register({
      id: 'freegantt.pageDown',
      label: 'Page down',
      when: panEnabled,
      run: () => this.#panBy(0, this.#viewport.visible.height),
    });
    register({
      id: 'freegantt.pageUp',
      label: 'Page up',
      when: panEnabled,
      run: () => this.#panBy(0, -this.#viewport.visible.height),
    });
    register({
      id: 'freegantt.panToStart',
      label: 'Pan to start',
      when: panEnabled,
      run: () => this.#viewport.scroll.panTo({ x: 0 }),
    });
    register({
      id: 'freegantt.panToEnd',
      label: 'Pan to end',
      when: panEnabled,
      run: () => this.#viewport.scroll.panTo({ x: this.#viewport.scroll.state.max.x }),
    });
    register({
      id: 'freegantt.panRight',
      label: 'Pan right',
      when: () => panEnabled() && nothingSelected(),
      run: () => this.#panBy(this.#viewport.preset.preferredTickWidthPx, 0),
    });
    register({
      id: 'freegantt.panLeft',
      label: 'Pan left',
      when: () => panEnabled() && nothingSelected(),
      run: () => this.#panBy(-this.#viewport.preset.preferredTickWidthPx, 0),
    });
    register({
      id: 'freegantt.panDown',
      label: 'Pan down',
      when: () => panEnabled() && nothingSelected(),
      run: () => this.#panBy(0, this.#rowHeight),
    });
    register({
      id: 'freegantt.panUp',
      label: 'Pan up',
      when: () => panEnabled() && nothingSelected(),
      run: () => this.#panBy(0, -this.#rowHeight),
    });

    bind('PageDown', 'freegantt.pageDown');
    bind('PageUp', 'freegantt.pageUp');
    bind('Home', 'freegantt.panToStart');
    bind('End', 'freegantt.panToEnd');
    bind('ArrowRight', 'freegantt.panRight');
    bind('ArrowLeft', 'freegantt.panLeft');
    bind('ArrowDown', 'freegantt.panDown');
    bind('ArrowUp', 'freegantt.panUp');
  }

  #panBy(dx: number, dy: number): void {
    const { x, y } = this.#viewport.scroll.state.position;
    this.#viewport.scroll.panTo({ x: x + dx, y: y + dy });
  }

  /** D-S3-9's one resolution, shared by the pointer path (`canSelect` above), the keyboard path
   *  (S3.5) and the affordance ids below — never asked twice for the same gesture (I14). */
  #canGesture(capability: keyof Interactions, id: EntryId): boolean {
    const entry = this.#options.dataset.entries.get(id);
    return entry !== undefined && this.#capabilities.can(capability, entry);
  }

  #setHovered(next: ItemId | undefined): void {
    if (this.#hoveredItemId === next) return;
    this.#hoveredItemId = next;
    this.#refreshAffordances();
  }

  /** D-S3-6: resolves `hoveredItemId`/`movableItemId`/`resizableItemId` from the current hover and
   *  selection, writes them into the one long-lived `InteractionState`, and applies. Called whenever
   *  any of the three inputs change — never per pointer move beyond that (I5). `exactOptionalPropertyTypes`
   *  makes "clear" a `delete`, not an `= undefined` assignment (`#setOptional` below). */
  #refreshAffordances(): void {
    const ids = projectAffordances({
      hoveredItemId: this.#hoveredItemId,
      selection: this.#selection,
      selectedItemIds: this.#interactionState.selectedItemIds,
      canGesture: (capability, id) => this.#canGesture(capability, id),
    });
    setOptional(this.#interactionState, 'hoveredItemId', ids.hoveredItemId);
    setOptional(this.#interactionState, 'movableItemId', ids.movableItemId);
    setOptional(this.#interactionState, 'resizableItemId', ids.resizableItemId);
    this.#backend.applyState(this.#interactionState);
  }

  #entryFor(item: ItemId): Entry | undefined {
    return this.#options.dataset.entries.get(entryIdOfItem(item));
  }

  get theme(): Theme {
    return this.#theme;
  }

  /** Live (S1.10, D-S1.10-4): `'auto'` writes no attribute, letting `prefers-color-scheme` decide;
   *  `'light'`/`'dark'` pin `data-fg-theme` on this container. Colour tokens are scoped to
   *  `.fg-container`, so the pin wins over the media query even when `:root` has no attribute. */
  set theme(value: Theme) {
    this.#theme = value;
    this.#applyTheme();
  }

  #applyTheme(): void {
    if (this.#theme === 'auto') this.#container.removeAttribute('data-fg-theme');
    else this.#container.setAttribute('data-fg-theme', this.#theme);
  }

  get a11yLabel(): string {
    return this.#a11yLabel;
  }

  /** Live (S1.10, D-S1.10-4/5): sets `aria-label` on the container — the one honest tab stop this step
   *  defines (`view/pane-layout.ts`'s `role="group"`/`tabindex="0"`). */
  set a11yLabel(value: string) {
    this.#a11yLabel = value;
    this.#container.setAttribute('aria-label', value);
  }

  get gridWidth(): number {
    return this.#paneLayout.gridWidth;
  }

  /** A plain reconfiguration (`plans/02` "Reconfiguration is just assignment") still runs the same
   *  cancelable commit sequence a splitter drag runs — one write path, one place the veto lives. */
  set gridWidth(px: number) {
    this.#commitGridWidth(px);
  }

  get minGridWidth(): number {
    return this.#paneLayout.minGridWidth;
  }

  /** Live (#127). Raising the floor above the current `gridWidth` lifts it through
   *  `#commitGridWidth` — the same cancelable commit sequence a splitter drag runs, so a veto
   *  leaves `gridWidth` exactly where it was. */
  set minGridWidth(px: number) {
    this.#paneLayout.minGridWidth = px;
    const lifted = this.#aboveMinGridWidth(this.#paneLayout.gridWidth);
    if (lifted !== this.#paneLayout.gridWidth) this.#commitGridWidth(lifted);
  }

  get preset(): ViewPreset {
    return this.#viewport.preset;
  }

  set preset(ref: PresetRef) {
    this.#viewport.preset = ref;
  }

  get range(): 'fitDataset' | TimeSpan {
    return this.#viewport.range;
  }

  set range(r: 'fitDataset' | TimeSpan) {
    this.#viewport.range = r;
  }

  get fit(): TimeScaleFit {
    return this.#viewport.fit;
  }

  set fit(f: TimeScaleFit) {
    this.#viewport.fit = f;
  }

  get overscan(): Overscan {
    return this.#viewport.overscan;
  }

  set overscan(o: Overscan) {
    this.#viewport.overscan = o;
  }

  zoomTo(pxPerMs: number, anchorX?: number): void {
    this.#viewport.zoomTo(pxPerMs, anchorX);
  }

  zoomBy(factor: number, anchorX?: number): void {
    this.#viewport.zoomBy(factor, anchorX);
  }

  get zoomPresets(): readonly ViewPreset[] {
    return this.#viewport.zoomPresets;
  }

  set zoomPresets(refs: readonly PresetRef[]) {
    this.#viewport.zoomPresets = refs;
    if (this.#phase === 'live') this.#emitNavigationChange();
  }

  get canZoomIn(): boolean {
    return this.#viewport.canZoomIn;
  }

  get canZoomOut(): boolean {
    return this.#viewport.canZoomOut;
  }

  zoomIn(anchorX?: number): void {
    this.#viewport.zoomIn(anchorX);
  }

  zoomOut(anchorX?: number): void {
    this.#viewport.zoomOut(anchorX);
  }

  zoomToSpan(span: TimeSpan): void {
    this.#viewport.zoomToSpan(span);
  }

  panToInstant(i: Instant, align: 'start' | 'center'): void {
    this.#viewport.panToInstant(i, align);
  }

  /** `panToInstant(at, align)`, plus `todayLineMarginTicks`' worth of left margin at
   *  `align: 'start'` — the one place this shell decides where "today" lands, so every caller
   *  (`Gantt.panToToday()`, a consumer's own load-time call) resolves it the same way. `at` is
   *  `now()`, read by the caller — `view/` may not import `time/` (I1) and has no clock read of its
   *  own to make. The margin is today-landing policy, not a general `Viewport` pan option, so it is
   *  applied here rather than threaded through `panToInstant` (S1.13 follow-up, candidate 2). */
  panToToday(at: Instant, align: 'start' | 'center' = 'start'): void {
    panToTodayLine(this.#viewport, at, align, this.#todayLineMarginTicks);
  }

  /** Finds the entry's row via the bound dataset, asks `FrameLayout` for its top and `barSpan` for
   * its x/width off the bound `TimeScale` — the same formula `computeFrame` builds bars from, so the
   * two can never drift apart — and hands the resulting `Rect` to `Viewport.reveal` (S1.9, D-S1.9-6).
   * Throws `EntryNotFoundError` for an id the dataset has no entry for. A collapsed ancestor expands
   * so the row exists. A still-hidden row (filter) keeps the current y — it does not jump to 0. */
  reveal(entryId: EntryId): void {
    const entry = this.#options.dataset.entries.get(entryId);
    if (entry === undefined) throw new EntryNotFoundError(entryId, 'reveal');
    const { x, width } = barSpan(entry, this.#viewport.timeScale);
    let rowIndex = this.#layout.rowIndexForEntry(entryId);
    if (rowIndex < 0 && this.#treeCollapse.expandAncestorsOf(entryId)) {
      this.#frames.flush();
      rowIndex = this.#layout.rowIndexForEntry(entryId);
    }
    const y = rowIndex >= 0 ? this.#layout.rowTop(rowIndex) : this.#viewport.scroll.state.position.y;
    this.#viewport.reveal({ x, y, width, height: this.#rowHeight });
  }

  on<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#events.on(name, handler);
  }

  off<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#events.off(name, handler);
  }

  /** Live (D-S5-3): assignment diffs by `id` against what is already installed — a plugin present in
   *  both lists is left alone, only the difference is set up or disposed. `api/gantt.ts` is the only
   *  caller with a `Gantt` façade to hand `setup()`, so it alone writes here. */
  get plugins(): readonly ShellPlugin<unknown>[] {
    return this.#pluginRuntime.plugins;
  }

  set plugins(next: readonly ShellPlugin<unknown>[]) {
    this.#pluginRuntime.install(next);
  }

  /** S5.2, D-S5-6: `Gantt.commands`'s own backing registry — read-only, the registry object itself
   *  is mutated in place by `register`. */
  get commands(): CommandRegistry<unknown> {
    return this.#commandRegistry;
  }

  #emitNavigationChange(): void {
    this.#events.emit('navigationChange', {
      presetId: this.#viewport.preset.id,
      fit: this.#viewport.fit,
      canZoomIn: this.#viewport.canZoomIn,
      canZoomOut: this.#viewport.canZoomOut,
    });
  }

  #bindColumns(): void {
    const bind =
      this.#locale !== undefined
        ? { timeZone: this.#options.dataset.timeZone, locale: this.#locale }
        : { timeZone: this.#options.dataset.timeZone };
    const bound = resolveGanttFields(this.#options.dataset, this.#gridColumnInput, bind);
    this.#resolvedColumns = bound.columns;
    this.#fieldCompares = bound.fieldCompares;
    this.#fieldContext = createFieldContext(
      { get: (key) => this.#options.dataset.field(key) },
      this.#options.dataset.timeZone,
    );
  }

  /** The one place `minGridWidth` is applied (#127). The floor bounds what a splitter drag can
   *  reach, and lifts the width when the floor itself rises — nothing else consults it, so an
   *  explicit `gridWidth = 0` collapses the pane and a vetoed change rolls back to its own width. */
  #aboveMinGridWidth(px: number): number {
    return Math.max(this.#paneLayout.minGridWidth, px);
  }

  #commitGridWidth(px: number): void {
    const from = this.#paneLayout.gridWidth;
    const to = px;
    this.#proposeChange(
      'beforeGridWidthChange',
      'gridWidthChange',
      { from, to },
      () => {
        this.#paneLayout.gridWidth = to;
      },
      () => {
        this.#paneLayout.gridWidth = from;
      },
    );
  }

  /** One measurement, pushed to everything it feeds (#8, #49): `--fg-row-height`, `--fg-tick-box-floor`,
   *  and the pane size all change for the same reason — the timeline pane was just resized — so they
   *  are re-read on the same signal instead of going stale. `size` is the timeline pane's own client
   *  box; no gutter to subtract (S1.8, D-S1.8-2) — the grid pane's width never overlapped it in the
   *  first place. */
  #applyPaneMeasurement(size: Size): void {
    this.#rowHeight = readPixelProperty(this.#container, ROW_HEIGHT_PROPERTY, ROW_HEIGHT_POLICY);
    this.#laneGapPx = readPixelProperty(this.#container, LANE_GAP_PROPERTY, LANE_GAP_POLICY);
    this.#tickBoxFloorPx = readPixelProperty(this.#container, TICK_BOX_FLOOR_PROPERTY, TICK_BOX_FLOOR_POLICY);
    this.#viewportHandle.setPaneSize(size);
  }

  render(): void {
    const datasetRevision = this.#options.dataset.datasetRevision;
    const frame = this.#layout.computeFrame({
      entries: this.#options.dataset.entries.all,
      scale: this.#viewport.timeScale,
      preset: this.#viewport.preset,
      visible: this.#viewport.visible,
      overscan: this.#viewport.overscan,
      rowHeight: this.#rowHeight,
      laneGapPx: this.#laneGapPx,
      tickBoxFloorPx: this.#tickBoxFloorPx,
      revision: this.#revision++,
      locale: this.#locale,
      todayLine: this.#todayLine,
      dateLines: this.#dateLines,
      columns: this.#resolvedColumns,
      fieldCompares: this.#fieldCompares,
      ...(this.#fieldContext !== undefined ? { fieldContext: this.#fieldContext } : {}),
      rows: this.#rowSource,
      collapsed: this.#treeCollapse.ids,
      itemProducerRegistry: this.#itemProducerRegistry,
      ...(typeof datasetRevision === 'number' ? { datasetRevision } : {}),
    });
    this.#backend.sync(frame);
    // D-S1.12-9: the grid pane's spacer mirrors the header's own band count, so both panes resolve
    // their header height from the same `--fg-band-height` expression and cannot drift.
    this.#paneLayout.setHeaderBandCount(frame.header.bands.length);
    this.#contentSize = { width: frame.contentWidth, height: frame.contentHeight };
    this.#viewportHandle.setContentSize(this.#contentSize);
    this.#scrollAttachment.writePosition();
    // #126: independent of the timeline's content width above — the grid pane's own horizontal
    // scroller reaches fixed-width columns that overflow `gridWidth`, unrelated to the time axis.
    this.#paneLayout.contentWidth = gridContentWidth(this.#resolvedColumns, this.#paneLayout.gridWidth);
  }

  destroy(): void {
    if (this.#destroyed) return;
    // S5.1, D-S5-3: plugins first — a disposer may still need its overlay node or another pane-owned
    // resource, so it must run before any pane below is torn down.
    this.#pluginRuntime.disposeAll();
    this.#overlay.destroy();
    this.#container.removeEventListener('keydown', this.#keymapListener);
    this.#frames.cancel();
    this.#entryGestures?.detach();
    this.#keyboardEditing?.detach();
    this.#wheelNavigation?.detach();
    this.#wheelNavigationGrid?.detach();
    this.#rowTwistyAttachment.detach();
    this.#datasetChanges.unsubscribe();
    this.#scrollAttachment.detach();
    this.#paneSizeAttachment.detach();
    this.#splitterAttachment.detach();
    this.#viewportHandle.unbind();
    this.#backend.destroy();
    this.#paneLayout.destroy();
    this.#destroyed = true;
  }
}
