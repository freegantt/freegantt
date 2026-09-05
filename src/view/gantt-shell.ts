// view/ — Gantt shell, the composition root that wires the grid pane, splitter, timeline pane and
// viewport binding together (plans/01 §8.2-8.3, S1.8).

import {
  barSpan,
  FrameLayout,
  ScrollModel,
  TimeScaleModel,
  Viewport,
  createItemProducerRegistry,
  isPlannedHeaderRow,
  gridContentWidth,
  totalColumnWidth,
} from '../layout/index.js';
import type {
  DateLineSpec,
  Overscan,
  PresetRef,
  RowSource,
  TimeScaleFit,
  ViewportHandle,
  ViewPreset,
  ItemProducerRegistry,
  BarRenderer,
  CellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  RendererByKind,
  FrameBar,
} from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { PaneLayout } from './pane-layout.js';
import type { Panes } from './pane-layout.js';
import { DomOverlay } from './overlay.js';
import { DomRowLayer } from './row-layer.js';
import { ContainerDom } from './gantt-dom.js';
import { attachSplitter } from './splitter.js';
import type { SplitterAttachment } from './splitter.js';
import { EventBus } from './event-bus.js';
import type { AsyncCancelableEvent, GanttEventHandler, GanttEventMap, GanttEvents } from './event-bus.js';
import { PluginRuntime } from '../extensions/plugin-runtime.js';
import type { ShellPlugin } from '../extensions/plugin-runtime.js';
import { CommandRegistry } from '../extensions/commands.js';
import type { CommandContext } from '../extensions/commands.js';
import { registerCoreCommands } from './core-commands.js';
import type { CoreCommandPorts } from './core-commands.js';
import { Keymap } from '../extensions/keymap.js';
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
  FieldKey,
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
import { PluginRegistrations } from './plugin-registrations.js';
import type { PluginRegistrationPorts } from './plugin-registrations.js';
import { FrameSettings } from './frame-settings.js';
import type { FrameSettingsPatch, FrameSettingsPorts } from './frame-settings.js';
import { projectAffordances } from './affordance-projection.js';
import { GesturePipeline } from './gesture-pipeline.js';
import type { EntryGestureContext } from './entry-gesture-context.js';
import type { ColumnGestureContext } from './column-gesture-context.js';
import { DEFAULT_GRID_COLUMNS, resolveGanttFields } from './grid-columns.js';
import type { ResolveColumnsBind } from './grid-columns.js';
import { ColumnChrome } from './column-chrome.js';
import type { ColumnChromePorts } from './column-chrome.js';
import { buildPluginPorts } from './plugin-ports.js';
import type { GanttShellPorts, PluginContextPorts } from './plugin-ports.js';
import { TreeCollapse } from './tree-collapse.js';
import { createFieldContext } from '../data/fields/field-access.js';
import { isDevMode } from '../data/dev-mode.js';

/** One `{ detach() }` for every inject slot. `view/` may not import `interaction/` (plans/01 §1:
 *  `INT --> VIEW`, not the reverse). So the shell takes pointer and keyboard attachments by
 *  injection. That is the same DI shape `GanttShellOptions.backend` already uses. `api/gantt.ts` (which
 *  does import `interaction/`, `API --> INT`) supplies `attachEntryGestures` /
 *  `attachKeyboardEditing`. `interaction/` returns this type; there is no per-slot mirror.
 *  `EntryGestureContext` itself lives in `./entry-gesture-context.js` (D-GH-1, C5). */
export interface Detachable {
  detach(): void;
}
export type AttachEntryGestures = (
  pane: HTMLElement,
  rowLayer: HTMLElement,
  container: HTMLElement,
  ctx: EntryGestureContext,
) => Detachable;

/** S3.5, D-S3-13: same DI shape as `AttachEntryGestures` just above, and the same `ctx` instance.
 *  `interaction/keyboard-editing.ts`'s `attachKeyboardEditing` needs `session()`/`selection`/
 *  `selectableEntriesInRowOrder`/`entryFor`/`can` only, not `hitTest`/`setHovered`. But a second,
 *  narrower context type for one caller has no value. */
export type AttachKeyboardEditing = (container: HTMLElement, ctx: EntryGestureContext) => Detachable;

/** S5.7, D-S5-18: same DI shape again — `interaction/column-gestures.ts`'s `attachColumnGestures`
 *  drives the grid header pane's resize/reorder pointer stream over `ColumnGestureContext`
 *  (`./column-gesture-context.js`). */
export type AttachColumnGestures = (
  headerPane: HTMLElement,
  container: HTMLElement,
  ctx: ColumnGestureContext,
) => Detachable;

/** S1.10, D-S1.10-4: theming's only preset axis for this step — `'auto'` follows
 * `prefers-color-scheme` (no `data-fg-theme` attribute written), `'light'`/`'dark'` pin it. */
export type Theme = 'auto' | 'light' | 'dark';

/** #157: how wide the grid pane sits. A number is px. `'fitColumns'` is a standing instruction.
 *  The pane sits exactly on its columns' own right edge (`totalColumnWidth`, `layout/column.ts`),
 *  and re-measures every time the columns change. A consumer never restates a width the library
 *  already computes. It is not a value a consumer reads back: `gridWidth`'s getter answers in px,
 *  because "how wide is the pane" is a question about pixels. */
export type GridWidth = number | 'fitColumns';
const DEFAULT_THEME: Theme = 'auto';
const DEFAULT_A11Y_LABEL = 'Gantt';

/** The four `--fg-*` pixel properties, their policies and the today-line margin default all live in
 *  `frame-settings.ts` now (#167). They are that module's own knowledge, not this shell's. The read
 *  cadence stays here, because only this shell knows when the pane changed: on construction, and
 *  again on every pane-size measurement (#8, #49). `getComputedStyle` is a synchronous style read
 *  that can force a style recalculation. So it is never an unconditional read per render(). */

/** Every `before*` → `*` pair `#proposeChange` runs (D-S5-6). One entry per pair, not one overload
 *  per pair. A future cancelable change adds a line here, instead of a new `#proposeChange`
 *  overload. Names only: each name's payload is `GanttEventMap`'s own, never restated here. A
 *  `GanttEventMap` edit that this map does not match fails to compile at the call site (#144). */
interface ProposableChange {
  beforeCollapseChange: 'collapseChange';
  beforeSelectionChange: 'selectionChange';
  beforeGridWidthChange: 'gridWidthChange';
  beforeGridColumnsChange: 'gridColumnsChange';
}

/** The `before*` names `#proposeChange` accepts — every key of `ProposableChange` is a
 *  `GanttEventMap` key too, which is what lets the payload come from `GanttEventMap` alone. */
type ProposableBefore = keyof ProposableChange & keyof GanttEventMap;

/** What `api/gantt.ts` hands the shell across the layer boundary (review P5). Every seam here is a
 *  collaborator `view/` may not construct for itself. `interaction/` sits above `view/`, and so do
 *  the api `Dataset` and the public `Gantt` façade (D-S5-5). `api/gantt.ts` supplies all seven on
 *  every real Gantt.
 *
 *  Each member stays optional, and one member alone says why. A test drives the shell with no
 *  wiring at all, and says so once by writing `wiring: {}`. It never has to omit seven separate keys
 *  and hope a reader sees the pattern. A shell built with an empty wiring runs with no pointer
 *  gestures and no keyboard editing. It runs with no column gestures, no data write, no plugins and
 *  no clock either. */
export interface GanttShellWiring {
  /** Injected, not defaulted here — see the `AttachEntryGestures` comment above. `view/` cannot
   *  import `interaction/` to supply its own default. */
  entryGestures?: AttachEntryGestures;
  /** Injected, same reason as `entryGestures`. */
  keyboardEditing?: AttachKeyboardEditing;
  /** Injected, same reason as `entryGestures`. */
  columnGestures?: AttachColumnGestures;
  /** S3.3, D-S3-16: how a committed gesture draft reaches the store. `model/dataset.ts`'s `Dataset`
   *  (this shell's own `dataset` option) has no `transaction()` — "a view never opens a
   *  transaction". So `api/gantt.ts`, which holds the full `api/Dataset` the model interface narrows
   *  away, supplies this instead. It answers `false` for a sync veto and for a
   *  `MutationCancelledError` from `beforeChange`. The shell never sees the exception either way. */
  commitEntryEdits?: (edits: EntryEdits) => boolean;
  /** S5.1, D-S5-1: fills the api-level pieces of a plugin's `PluginContext`. `view/` cannot type
   *  those without reaching past its own boundary (D-S5-5). They are the full api `Dataset` and the
   *  public `Gantt` façade. `model/dataset.ts`'s narrow interface hides `.transaction()`, the same
   *  reason `commitEntryEdits` exists. The `Gantt` façade does not exist yet when this constructor
   *  runs. It returns `unknown` because `api/gantt.ts` binds the concrete
   *  `PluginContext` type. That file alone may import both `Gantt` and this generic contract without
   *  closing an import cycle (`api/plugin.ts`'s file header). */
  buildPluginContext?: (parts: PluginContextPorts) => unknown;
  /** S5.2, D-S5-6: fills the api-level pieces of a `CommandContext`, for the same reason
   *  `buildPluginContext` fills `PluginContext`'s. The full api `Dataset` (with `undo`/`redo`) and
   *  the public `Gantt` façade are both api-level. `view/` may name neither type (D-S5-5's mirror on
   *  the `view/` side). The shell calls it fresh on every command invocation, never
   *  cached, so a command always reads the invocation's current selection. `target`'s shape (S5.7,
   *  D-S5-26) is a structural subtype of api-level `CommandTarget`. `view/` may not name that type
   *  either, but a narrower object literal reaches it fine, because `api/gantt.ts` only widens. */
  buildCommandContext?: (parts: {
    entry?: Entry;
    target?: { kind: 'header'; columnKey: FieldKey };
  }) => unknown;
  /** S5.2: `freegantt.panToToday`'s own clock read. `view/` may not call `time/`'s `now()` itself
   *  (I10). `api/gantt.ts` supplies `now` from `time/index.js`, the same function
   *  `Gantt.panToToday` already reads for the identical reason. */
  now?: () => Instant;
}

export interface GanttShellOptions {
  /** Element or CSS selector (plans/02 §2); a selector that matches nothing throws (#38). */
  container: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9) — pass the same instance to two Gantt instances to x-sync them.
   * Constructs a private default when omitted (plans/01 §8.2: "single-Gantt usage never sees the
   * concept"). The default resolves its zone, span and fit from this shell's binding, so it needs
   * no arguments. */
  scale?: TimeScaleModel;
  /** Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
   * Constructs a private default when omitted; sharing one instance links both axes (S1.5 README
   * D-S1.5-3). */
  scroll?: ScrollModel;
  /** Initial grid pane width (S1.8, D-S1.8-3). A number is px; `'fitColumns'` (#157) sits the pane
   *  on its columns' own edge and keeps it there. Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: GridWidth;
  /** Live (#127). The floor a splitter drag clamps `gridWidth` to. Default `40` — wide enough for
   *  one narrow column, so a drag cannot take the pane to nothing by accident. It bounds the drag
   *  only: an explicit `gridWidth = 0` still collapses the grid pane on purpose. */
  minGridWidth?: number;
  /** Build the private default `TimeScaleModel` only (D-S1.9-9). It is a no-op, with a dev-mode
   * warning, when `scale` is also supplied. The shared model already carries its own options. */
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
  /** Live (S5.4, D-S5-11). A function, or a per-kind map (D-S5-12) — undefined and "no per-kind
   *  entry" both keep the library's own bar output. Always loses to a plugin's own `registerRenderer`
   *  only when this is itself undefined; wins over a plugin's the rest of the time. */
  barRenderer?: BarRenderer | RendererByKind;
  /** Live (S5.4, D-S5-11). Gantt-wide; a per-column `GridColumn.cellRenderer` (S5.7) wins over this
   *  for its own column. */
  cellRenderer?: CellRenderer;
  /** Live (S5.4, D-S5-11). Not painted until a later step consumes it (S5.7's grid header chrome).
   *  The resolution slot exists now, so a plugin's `registerRenderer('header', …)` has somewhere to
   *  register into. It also keeps this option honest about not being a no-op forever. */
  headerRenderer?: HeaderRenderer;
  /** Live (S5.4, D-S5-11). Replaces a tooltip's body (S5.5's `tooltips()` feature reads this). */
  tooltipRenderer?: TooltipRenderer;
  /** Expert knob, not on `GanttOptions` (plans/02 "two callers, two surfaces"). A test names its
   * own `RenderBackend<HTMLElement>` in place of the DOM one. §9-I: the seam had two implementations
   * and one hardcoded call site. Nothing could reach the other short of mocking the module.
   * Still `RenderBackend<HTMLElement>`, not the null backend's `RenderBackend<void>`. `PaneLayout`
   * mounts real elements regardless of which backend paints them. So this closes the hardcoding,
   * not DOM-free `view/`. Defaults to `createDomBackend()`. */
  backend?: RenderBackend<HTMLElement>;
  /** S3.6, D-S3-18, P1: an installed extension hook, read for **preview only** — ghosts its extras in
   *  the rAF-coalesced drag preview. `api/gantt.ts` passes the bound Dataset's own occupant here
   *  (S5.10). That occupant is the identity function until a Dataset plugin composes onto it
   *  (D-S5-23). A test that constructs `GanttShell` directly passes its own, the same shape
   *  `commitEntryEdits` already uses. The real hook still runs again, for real, inside
   *  `data/transaction.ts`'s own commit. This option never writes anything itself. */
  editExtender?: EditExtender;
  /** Internal (D-S4-24). One registry per Gantt, seeded with span/group/milestone. Tests inject a
   *  replacement; `GanttOptions` has no such field (public registration is S5). */
  itemProducerRegistry?: ItemProducerRegistry;
  /** The layer boundary, as one member (review P5). `api/gantt.ts` supplies every seam in it. */
  wiring: GanttShellWiring;
}

/** `exactOptionalPropertyTypes` treats `obj.key = undefined` as a type error when `key` is declared
 *  `T | undefined` rather than `T?` on the read side (`InteractionState`'s own shape). The honest
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
  /** #157: `gridWidth = 'fitColumns'` is a standing instruction, not a one-off width, so the shell
   *  remembers it and re-measures on every rebind. `PaneLayout` holds the px it resolves to — it
   *  knows nothing about columns (its file header: structure and one number only). */
  #fitsColumns: boolean;
  #panes: Panes;
  #backend: RenderBackend<HTMLElement>;
  #revision = 0;
  #viewport: Viewport;
  #viewportHandle: ViewportHandle;
  #scrollAttachment: ScrollAttachment;
  #paneSizeAttachment: PaneSizeAttachment;
  /** The timeline pane's last measured box, kept raw. The header height it has to be reduced by
   *  changes on its own signal. That signal is a preset with a different band count, not a pane
   *  resize. */
  #paneBox: Size = { width: 0, height: 0 };
  #splitterAttachment: SplitterAttachment;
  #datasetChanges: DatasetChangeSubscription;
  #entryGestures: Detachable | undefined;
  #keyboardEditing: Detachable | undefined;
  #columnGestures: Detachable | undefined;
  /** Grid-column resolution, live resize/reorder preview, and the `gridColumns` commit sequence
   *  (S5.7, D-S5-18) — `column-chrome.ts`'s own module doc explains the split. Constructed in the
   *  constructor body (needs `#container`, not yet assigned at field-init time). */
  #columnChrome!: ColumnChrome;
  #wheelNavigation: WheelNavigationAttachment | undefined;
  #wheelNavigationGrid: WheelNavigationAttachment | undefined;
  #rowTwistyAttachment: RowTwistyAttachment;
  /** D-S3-6: one long-lived, mutable per-Gantt object. `applyState` diffs against what it painted
   *  last. So writing into this and calling `#backend.applyState` allocates nothing per hover or
   *  select step (I5). Never rebuilt per call. */
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
  /** S5.5 (API gap, `s5.5-tooltips-and-context-menu.md` §5): the last-rendered frame's bars, indexed
   *  by item id. `resolveTooltip` is its only reader. So a hover plugin working from the DOM after
   *  the fact can still build a real `TooltipRendererContext`. A bar's `x`/`y`/`width`/`height`/
   *  `flags` are not reachable from a DOM element alone. Rebuilt once per `render()`, not on the hover path
   *  itself — same cost `#backend.sync(frame)` already pays iterating `frame.bars`. */
  #lastBarById = new Map<ItemId, FrameBar>();
  /** D-GH-2: owns draft math, preview rAF coalescing and the commit pipeline for a move/resize
   *  gesture. Built once, from this shell's own primitives, right after `#capabilities` below. */
  #gesturePipeline!: GesturePipeline;
  /** #170: the five seams a plugin registers into, each carrying the refresh it owes. Renderers,
   *  decorations, Item producers, per-kind capability defaults and Grid columns. */
  #registrations!: PluginRegistrations;
  /** The single rAF owner (B10, D-S2-15): every render request past construction goes through
   *  this, so N mutations in one tick become one frame. */
  #frames = new FrameScheduler(() => this.render());
  #events = new EventBus<GanttEventMap, AsyncCancelableEvent>();
  /** S5.1, D-S5-1: the plain `{ on, off }` a plugin's `ctx.events` actually is. Built once, from
   *  this shell's own `on`/`off` below. A plugin never sees the rest of this class's public surface
   *  the way handing it `this` directly would. */
  #pluginEvents: GanttEvents = {
    on: (name, handler) => this.on(name, handler),
    off: (name, handler) => this.off(name, handler),
  };
  #pluginRuntime!: PluginRuntime<unknown>;
  /** S5.2, D-S5-6/D-S5-7: one registry and one keymap per Gantt (I2). Core commands and core
   *  bindings register here first, so a plugin's own registration always wins (D-S5-7). */
  #commandRegistry!: CommandRegistry<unknown>;
  #keymap!: Keymap<unknown>;
  #keymapListener!: (event: KeyboardEvent) => void;
  #documentKeymapListener!: (event: KeyboardEvent) => void;
  #destroyed = false;
  /** This Gantt's layout pass. It keeps the row-height index alive across renders (#47) — the shell
   * states what to draw and holds no layout bookkeeping of its own. */
  #layout = new FrameLayout();
  /** #167: every live setting that says what the next frame draws, and the one table saying what
   *  each change invalidates. This shell's twelve setters below are each one call into it. */
  #frameSettings: FrameSettings;
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
  #treeCollapse!: TreeCollapse;
  /** S5.3, D-S5-8: constructed once panes exist — see the plugin runtime's own comment just below for
   *  why. */
  #overlay: DomOverlay;
  /** #158: the grid's own row layer, where a plugin mounts content that must scroll with the rows.
   *  Constructed beside the overlay, and for the same reason. */
  #rowLayer: DomRowLayer;
  /** Review N1/A3: this Gantt's own rendered DOM, as questions a plugin asks through `ctx.view.dom`.
   *  Constructed beside the overlay, and for the same reason. */
  #dom: ContainerDom;

  constructor(options: GanttShellOptions) {
    this.#options = options;
    this.#container = resolveContainer(options.container);
    // S1.10, D-S1.10-8: must exist before PaneLayout builds the classed elements the stylesheet
    // targets, or there's a one-frame flash of unstyled content.
    ensureBaseStyles(this.#container.ownerDocument);
    // #157: `'fitColumns'` names no px of its own. So the pane opens at its authored width
    // (`--fg-grid-pane-width`). `#bindColumns` below then sizes it to the columns, the moment there
    // are resolved columns to measure.
    this.#fitsColumns = options.gridWidth === 'fitColumns';
    this.#paneLayout = new PaneLayout({
      container: this.#container,
      ...(typeof options.gridWidth === 'number' ? { gridWidth: options.gridWidth } : {}),
      ...(options.minGridWidth !== undefined ? { minGridWidth: options.minGridWidth } : {}),
    });
    this.#panes = this.#paneLayout.panes;
    // S5.3, D-S5-8: constructed right after the panes it measures, so it is ready by the time the
    // plugin runtime (just below) builds its first `PluginContext`.
    this.#overlay = new DomOverlay(this.#container, this.#panes.overlay);
    this.#rowLayer = new DomRowLayer(this.#panes.rows);
    this.#dom = new ContainerDom(this.#container, this.#paneLayout, (id) =>
      this.#options.dataset.entries.get(id),
    );

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

    // Constructed with the options, not assigned through the live setters. So the first paint below
    // (`#frames.flush()`) sees what the consumer asked for, and no port fires while half this shell
    // is still undefined. S1.13's `dateLines` constructor option caught that bug: rendering it
    // required this to move ahead of the flush it used to follow. Built before `ColumnChrome`,
    // because `#columnBind()` reads the locale from here.
    this.#frameSettings = new FrameSettings(this.#frameSettingsPorts(), this.#initialFrameSettings(options));
    this.#columnChrome = new ColumnChrome(
      this.#container,
      this.#columnChromePorts(),
      options.gridColumns ?? DEFAULT_GRID_COLUMNS,
    );
    this.#registrations = new PluginRegistrations(
      this.#pluginRegistrationPorts(),
      options.itemProducerRegistry ?? createItemProducerRegistry(),
    );
    this.#bindColumns();

    // Mount before binding (#22). The render target exists by the time the binding's own onChange
    // fires, and that onChange IS this shell's first render. So there is no construction-order
    // exception to document, and no separate explicit render() call after bind().
    this.#backend =
      options.backend ??
      createDomBackend({
        entryById: (id) => this.#options.dataset.entries.get(id),
        resolveBarRenderer: (kind) =>
          this.#registrations.renderers.resolveBar(kind, this.#frameSettings.barRenderer),
        // S5.4, D-S5-11: `render/dom` never receives `ResolvedColumn` (`column.format` "never
        // reaches a backend", `layout/column.ts`). So this binds it in here instead. render/dom
        // only ever calls an already-column-bound function, keyed by the same `FrameColumn.key`
        // string it already threads through `CellItem.key`.
        resolveCellRenderer: (columnKey) => {
          const column = this.#columnChrome.resolvedColumn(columnKey);
          if (column === undefined) return undefined;
          // S5.7, D-S5-17: a per-column `cellRenderer` (this Gantt's own `gridColumns`) beats the
          // Gantt-wide one for that column. No `pluginId`, since a `GridColumn` only ever arrives
          // from the consumer's own config until S5.9's `registerGridColumn` exists.
          if (column.cellRenderer !== undefined) {
            const columnCellRenderer = column.cellRenderer;
            return {
              renderer: (ctx) =>
                columnCellRenderer({
                  ...(ctx.entry !== undefined ? { entry: ctx.entry } : {}),
                  value: ctx.value,
                  fieldValue: this.#fieldValueForCell(ctx.entry, column.key),
                }),
            };
          }
          const resolved = this.#registrations.renderers.resolve('cell', this.#frameSettings.cellRenderer);
          if (resolved === undefined) return undefined;
          const cellRenderer = resolved.renderer;
          return {
            renderer: (ctx) =>
              cellRenderer({ ...ctx, column, fieldValue: this.#fieldValueForCell(ctx.entry, column.key) }),
            ...(resolved.pluginId !== undefined ? { pluginId: resolved.pluginId } : {}),
          };
        },
        // S5.4, D-S5-11: same bind-in-here posture as `resolveCellRenderer` just above. A
        // `GridColumn` has no per-column `headerRenderer` slot (`layout/column.ts`). So this only
        // ever resolves the Gantt-wide/plugin one, bound to its column.
        resolveHeaderRenderer: (columnKey) => {
          const column = this.#columnChrome.resolvedColumn(columnKey);
          if (column === undefined) return undefined;
          const resolved = this.#registrations.renderers.resolve(
            'header',
            this.#frameSettings.headerRenderer,
          );
          if (resolved === undefined) return undefined;
          const headerRenderer = resolved.renderer;
          return {
            renderer: () => headerRenderer({ column }),
            ...(resolved.pluginId !== undefined ? { pluginId: resolved.pluginId } : {}),
          };
        },
      });
    this.#backend.mount({
      grid: this.#panes.rows,
      timeline: this.#panes.timeline,
      gridHeader: this.#panes.gridHeader,
    });

    // S5.2, D-S5-6: built before the plugin runtime. Core commands register into this during this
    // same constructor. A plugin's own `ctx.commands`/`ctx.interaction.registerKeybinding` (below)
    // close over it too. `#buildCommandContext` is called fresh per invocation (never cached), so a
    // command always reads the current selection.
    this.#commandRegistry = new CommandRegistry<unknown>(() => this.#buildCommandContext());
    this.#keymap = new Keymap<unknown>(this.#commandRegistry, () => this.#buildCommandContext());

    // S5.1, D-S5-1: constructed once panes exist. A plugin's disposer may still need its overlay
    // node (a later step's `ctx.view.overlay`), so this must outlive them either way. `destroy()`
    // disposes it first, before any pane teardown, for the same reason. No plugin is actually set up
    // yet. `Gantt.plugins`'s live setter runs `#pluginRuntime.install(...)` only once `api/gantt.ts`
    // has finished assigning its own `#shell` field. So `buildPluginContext`'s `gantt` value is real
    // by the time any `setup()` reads it.
    this.#pluginRuntime = new PluginRuntime<unknown>((pluginId) => {
      const { ports, gate } = buildPluginPorts(this.#shellPorts(), pluginId);
      const context = (options.wiring.buildPluginContext ?? (() => ({})))(ports);
      return { context, disposables: ports.disposables, registrationGate: gate };
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
    // the bound viewport, and request a frame. That is the changeset mechanism's own fan-out, not a
    // second reactivity path. #33's `setEntries()` warning is against a *public* one (see
    // dataset-change-subscription.ts).
    this.#datasetChanges = subscribeToDatasetChanges(options.dataset, (changeSet) => {
      this.#layout.invalidateForChange(changeSet);
      this.#bindColumns();
      this.#viewportHandle.setEntries(options.dataset.entries.all);
      this.#frames.request();
    });
    // Synchronous first measurement: a real ResizeObserver's own first callback is queued, not
    // immediate, so the first paint cannot wait for it. The `attachPaneSize` call below takes over
    // from here. It takes every measurement after this one, live, for as long as the shell lives
    // (S1.7b, #8).
    this.#applyPaneMeasurement(this.#paneLayout.measureTimelinePane());
    this.#paneSizeAttachment = attachPaneSize(this.#panes.timeline, (size) =>
      this.#applyPaneMeasurement(size),
    );
    // #127/#139: the splitter proposes a raw px delta, and both bounds apply here, on the way in.
    // So a drag can reach neither below `minGridWidth` nor past the last column's edge. A direct
    // `gridWidth` write still says what it means.
    this.#splitterAttachment = attachSplitter(this.#panes.splitter, {
      readGridWidth: () => this.#paneLayout.gridWidth,
      previewGridWidth: (px) => {
        this.#paneLayout.gridWidth = this.#withinSplitterBounds(px);
      },
      // #157: a completed drag is the consumer changing their mind, so the pane keeps the width it
      // was dragged to and stops following the columns. A vetoed drag changes neither.
      commitGridWidth: (px) => {
        if (this.#commitGridWidth(this.#withinSplitterBounds(px))) {
          this.#fitsColumns = false;
        }
      },
    });
    this.#interactions = options.interactions ?? {};
    this.#viewportGestures = options.viewportGestures ?? {};
    this.#resolvedViewportGestures = resolveViewportGestures(this.#viewportGestures);
    this.#capabilities = this.#resolveCapabilities();
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
      commitEntryEdits: (edits) => this.#options.wiring.commitEntryEdits?.(edits) ?? false,
      emit: (name, payload) => this.#events.emit(name, payload),
      ...(options.editExtender ? { extend: options.editExtender } : {}),
      allEntries: () => new Map(this.#options.dataset.entries.all.map((e) => [e.id, e])),
      locale: () => this.#frameSettings.locale,
      applyGestureState: (preview, pendingItemIds, cursor) => {
        setOptional(this.#interactionState, 'preview', preview);
        setOptional(this.#interactionState, 'pendingItemIds', pendingItemIds);
        setOptional(this.#interactionState, 'cursorX', cursor?.x);
        setOptional(this.#interactionState, 'cursorLabel', cursor?.label);
        this.#backend.applyState(this.#interactionState);
      },
    });
    // D-S3-13: one `EntryGestureContext`, shared by the pointer attachment and the keyboard one.
    // Both drive the same `#gesturePipeline.session()`, so there is no value in building two.
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
    // S5.2, D-S5-6/D-S5-7: core commands first, then the keymap listener. Both attach ahead of
    // `entryGestures`/`keyboardEditing`/`keyboardNavigation` below. So every plugin binding and
    // every core command gets first refusal on a key event. This shell's own pointer-editing and
    // pan/page/home/end handling only sees it after that. An unmatched chord is left untouched
    // either way: the resolver never calls `preventDefault()` on a miss.
    this.#registerCoreCommands();
    this.#keymapListener = (event: KeyboardEvent) => {
      if (this.#keymap.resolve(event)) {
        event.preventDefault();
      }
    };
    this.#container.addEventListener('keydown', this.#keymapListener);
    // Document-level capture-phase fallback (issue #137 F1,
    // `plans/reviews/2026-09-03-s5-start-fixes-qc.md`): the bubble listener above only ever sees a
    // key event whose target sits inside `#container`. A popup opened from an outside trigger has
    // no path into that listener at all — a toolbar button in the consumer's own page, say. So its
    // Escape dismissal would never fire. So this routes through the same `#keymap.resolve()`, not a
    // second, independent listener. That keeps one newest-first resolution order, instead of
    // reintroducing the bespoke document-capture stack C3 removed. Skipped whenever the target is inside
    // `#container`, so an in-container key event is resolved exactly once, by the bubble listener.
    this.#documentKeymapListener = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Node && this.#container.contains(target)) return;
      if (this.#keymap.resolve(event)) {
        event.preventDefault();
      }
    };
    this.#container.ownerDocument.addEventListener('keydown', this.#documentKeymapListener, true);

    // S5.7, D-S5-18: same DI shape as `entryGestures`/`keyboardEditing` below — `view/` cannot import
    // `interaction/`, so `api/gantt.ts` supplies `attachColumnGestures`. Attached *before*
    // `entryGestures`. Both listen for `keydown` on this same `#container`. An Escape that cancels a
    // column drag must reach `column-gestures.ts`'s own handler ahead of `entry-gestures.ts`'s
    // handler. That handler swallows it, through `stopImmediatePropagation()`. In the other order,
    // the column drag's Escape would also clear the entry selection as an unrelated side effect.
    const columnGestureContext: ColumnGestureContext = {
      isResizable: (columnKey) => this.#columnChrome.isResizable(columnKey),
      isMovable: (columnKey) => this.#columnChrome.isMovable(columnKey),
      minColumnWidthPx: () => this.#columnChrome.minWidthPx(),
      previewColumnWidth: (columnKey, widthPx) => this.#columnChrome.previewWidth(columnKey, widthPx),
      commitColumnWidth: (columnKey, widthPx) => this.#columnChrome.commitWidth(columnKey, widthPx),
      cancelColumnResize: () => this.#columnChrome.cancelResize(),
      previewColumnReorder: (preview) => this.#columnChrome.previewReorder(preview),
      commitColumnReorder: (columnKey, beforeColumnKey) =>
        this.#columnChrome.commitReorder(columnKey, beforeColumnKey),
      cancelColumnReorder: () => this.#columnChrome.cancelReorder(),
      setFocusedColumn: (columnKey) => this.#columnChrome.setFocusedColumn(columnKey),
    };
    this.#columnGestures = options.wiring.columnGestures?.(
      this.#panes.gridHeader,
      this.#container,
      columnGestureContext,
    );
    this.#entryGestures = options.wiring.entryGestures?.(
      this.#panes.timeline,
      this.#panes.rows,
      this.#container,
      gestureContext,
    );
    this.#keyboardEditing = options.wiring.keyboardEditing?.(this.#container, gestureContext);
    const wheelNavigationCtx: WheelNavigationContext = {
      wheelZoomEnabled: () => this.#resolvedViewportGestures.wheelZoom,
      wheelPanEnabled: () => this.#resolvedViewportGestures.wheelPan,
      zoomIn: (offsetX) => this.zoomIn(offsetX),
      zoomOut: (offsetX) => this.zoomOut(offsetX),
      panBy: (dx, dy) => this.#panBy(dx, dy),
    };
    this.#wheelNavigation = attachWheelNavigation(this.#panes.timeline, wheelNavigationCtx);
    // #126: the grid pane has no scroll of its own (D-S1.8-1). So this forwards its wheel input
    // into the same shared scroll the timeline pane already writes into. `anchorPane` keeps ctrl/⌘+wheel
    // zoom anchored on the timeline's time axis, since the grid pane's own x-axis isn't time.
    this.#wheelNavigationGrid = attachWheelNavigation(this.#panes.rows, wheelNavigationCtx, {
      anchorPane: this.#panes.timeline,
      forwardPlainWheel: true,
    });
    this.#rowTwistyAttachment = attachRowTwisty(this.#panes.rows, {
      toggleCollapse: (id) => this.toggleCollapse(id),
    });
    if (options.collapsed !== undefined) {
      this.#treeCollapse.hydrate(options.collapsed);
    }
    this.#phase = 'live';
    this.#frames.flush();

    if (options.theme !== undefined) this.theme = options.theme;
    else this.#applyTheme();
    this.a11yLabel = options.a11yLabel ?? DEFAULT_A11Y_LABEL;
  }

  get locale(): Intl.LocalesArgument | undefined {
    return this.#frameSettings.locale;
  }

  /** Live (S1.12, D-S1.12-12): re-labels every header band and every screen-reader date with no bar
   *  remount — it flows straight through `LayoutInput.locale` on the next render. What that costs
   *  is `frame-settings.ts`'s own table to state, not this setter's. Every live setting below reads
   *  the same way, which is the whole point of #167. */
  set locale(l: Intl.LocalesArgument | undefined) {
    this.#frameSettings.set({ locale: l });
  }

  get gridColumns(): readonly GridColumnInput[] {
    return this.#columnChrome.gridColumnInput;
  }

  /** A plain reconfiguration still runs the same cancelable commit sequence a resize drag or a
   *  reorder drop runs (S5.7, D-S5-18). One write path, one place the veto lives. `set gridWidth`
   *  above already takes the same posture for the splitter. */
  set gridColumns(columns: readonly GridColumnInput[]) {
    this.#columnChrome.commit(columns);
  }

  /** Live (S5.4, D-S5-11). Reassigning repaints every bar with no remount (I8). */
  get barRenderer(): BarRenderer | RendererByKind | undefined {
    return this.#frameSettings.barRenderer;
  }

  set barRenderer(renderer: BarRenderer | RendererByKind | undefined) {
    this.#frameSettings.set({ barRenderer: renderer });
  }

  get cellRenderer(): CellRenderer | undefined {
    return this.#frameSettings.cellRenderer;
  }

  set cellRenderer(renderer: CellRenderer | undefined) {
    this.#frameSettings.set({ cellRenderer: renderer });
  }

  get headerRenderer(): HeaderRenderer | undefined {
    return this.#frameSettings.headerRenderer;
  }

  set headerRenderer(renderer: HeaderRenderer | undefined) {
    this.#frameSettings.set({ headerRenderer: renderer });
  }

  get tooltipRenderer(): TooltipRenderer | undefined {
    return this.#frameSettings.tooltipRenderer;
  }

  set tooltipRenderer(renderer: TooltipRenderer | undefined) {
    this.#frameSettings.set({ tooltipRenderer: renderer });
  }

  get rowSource(): RowSource {
    return this.#frameSettings.rowSource;
  }

  set rowSource(next: RowSource) {
    this.#frameSettings.set({ rowSource: next });
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

  /** One `before*` → apply → `*` sequence, for every cancelable Gantt-state change (D-S5-6):
   *  collapse, selection, grid width, grid columns. `ProposableChange` pairs each `before*` name
   *  with its `*` counterpart. A new pair is one line there, not a new overload here — a future
   *  S5.8 event, say. `change` is the intersection of both events' payloads, so both `emit` calls
   *  typecheck with no cast. A mismatched pair stops compiling instead of drifting silently (#144). */
  #proposeChange<B extends ProposableBefore, A extends ProposableChange[B] & keyof GanttEventMap>(
    before: B,
    after: A,
    change: GanttEventMap[B] & GanttEventMap[A],
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
    return this.#frameSettings.todayLine;
  }

  set todayLine(on: boolean | Instant) {
    this.#frameSettings.set({ todayLine: on });
  }

  get dateLines(): readonly DateLineSpec[] {
    return this.#frameSettings.dateLines;
  }

  set dateLines(lines: readonly DateLineSpec[]) {
    this.#frameSettings.set({ dateLines: lines });
  }

  get todayLineMarginTicks(): number {
    return this.#frameSettings.todayLineMarginTicks;
  }

  /** Live — takes effect on the next `panToToday()` call; does not itself move the scroll position. */
  set todayLineMarginTicks(ticks: number) {
    this.#frameSettings.set({ todayLineMarginTicks: ticks });
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

  /** Live (S3, D-S3-9): re-resolves the capability table immediately. It then re-derives the two
   *  resolved affordance ids off the current hover and selection. A stricter rule takes effect
   *  without waiting for the next pointer move. */
  set interactions(next: Interactions) {
    this.#interactions = next;
    this.#refreshCapabilities();
  }

  /** S5.9, D-S5-22: the one place `resolveCapabilities` is called. The constructor, `set
   *  interactions`, and `registerKindDefaults`'s own gate all re-derive from here, rather than
   *  repeating the three-argument call. */
  #resolveCapabilities(): Capabilities {
    return resolveCapabilities(
      this.#interactions,
      (kind) => this.#options.dataset.isRollUpKind(kind),
      (kind) => this.#registrations.kindDefaultsFor(kind),
    );
  }

  /** `set interactions` and `registerKindDefaults`'s register/dispose pair both change an input
   *  `#resolveCapabilities` reads. So both re-resolve the capability table and re-derive the
   *  affordance ids the same way (#154). This method writes that once, instead of three times. The
   *  constructor's own first resolve (above) runs before `#refreshAffordances` has anything to
   *  refresh, so it calls `#resolveCapabilities()` directly and skips this. */
  #refreshCapabilities(): void {
    this.#capabilities = this.#resolveCapabilities();
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

  /** S5.2, D-S5-6: the live `CommandContext` builder. `entry` is the first selected entry, or
   *  `undefined` when nothing is selected (the doc's "the focused row, or none"). `target` fills in
   *  for a focused header cell (S5.7, D-S5-26, issue #137 F6) — the rest of `CommandTarget`'s kinds
   *  are still S5.11's own job. `api/gantt.ts`'s injected `buildCommandContext` fills `dataset`/`gantt`
   *  — `view/` may not name either type (D-S5-5's mirror). A `wiring` with no `buildCommandContext`
   *  makes every command's context an empty object — a test that drives the shell alone. That is
   *  fine. No core command reads `ctx.dataset`/`ctx.gantt` without first checking
   *  `ctx.entry`/`ctx.target`, and no such test runs a command that needs them. */
  #buildCommandContext(): CommandContext<unknown> {
    const id = this.#selection[0];
    const entry = id !== undefined ? this.#options.dataset.entries.get(id) : undefined;
    const columnKey = this.#columnChrome.focusedHeaderColumnKey;
    // `view/` may not name `CommandContextOf`'s api-level fields (`dataset: Dataset`, `gantt`),
    // D-S5-5's mirror. So this cast trusts `api/gantt.ts`'s injected `buildCommandContext` to fill
    // them. `buildPluginContext` above already gets the same trust for `PluginContext`.
    return (this.#options.wiring.buildCommandContext ?? (() => ({})))({
      ...(entry !== undefined ? { entry } : {}),
      ...(columnKey !== undefined ? { target: { kind: 'header' as const, columnKey } } : {}),
    }) as CommandContext<unknown>;
  }

  /** D-S5-6: the shell verbs `core-commands.ts`'s catalog calls, closing over this shell's own
   *  private state. `registerCoreCommands` never touches a shell field directly — this is the one
   *  seam between the two. */
  #coreCommandPorts(): CoreCommandPorts {
    return {
      collapseAll: () => this.collapseAll(),
      expandAll: () => this.expandAll(),
      collapseRow: (id) => this.collapse(id),
      expandRow: (id) => this.expand(id),
      canZoomIn: () => this.canZoomIn,
      canZoomOut: () => this.canZoomOut,
      zoomIn: () => this.zoomIn(),
      zoomOut: () => this.zoomOut(),
      panToToday: () => {
        const now = this.#options.wiring.now;
        if (now !== undefined) this.panToToday(now());
      },
      selectAll: () => this.#proposeSelection(this.#selectableEntriesInRowOrder()),
      clearSelection: () => this.#proposeSelection([]),
      hasSelection: () => this.#selection.length > 0,
      keyboardPanEnabled: () => this.#resolvedViewportGestures.keyboardPan,
      nothingSelected: () => this.#selection.length === 0,
      pageDown: () => this.#panBy(0, this.#viewport.visible.height),
      pageUp: () => this.#panBy(0, -this.#viewport.visible.height),
      panToStart: () => this.#viewport.scroll.panTo({ x: 0 }),
      panToEnd: () => this.#viewport.scroll.panTo({ x: this.#viewport.scroll.state.max.x }),
      panRight: () => this.#panBy(this.#viewport.preset.preferredTickWidthPx, 0),
      panLeft: () => this.#panBy(-this.#viewport.preset.preferredTickWidthPx, 0),
      panDown: () => this.#panBy(0, this.#frameSettings.rowHeight),
      panUp: () => this.#panBy(0, -this.#frameSettings.rowHeight),
      isColumnResizable: (key) => this.#columnChrome.isResizable(key),
      isColumnMovable: (key) => this.#columnChrome.isMovable(key),
      resizeColumnStep: (key, direction) => this.#columnChrome.resizeStep(key, direction),
      moveColumnStep: (key, direction) => this.#columnChrome.moveStep(key, direction),
    };
  }

  /** `ColumnChrome`'s one seam back into this shell's shared machinery. `column-chrome.ts`'s own
   *  doc explains why it needs each of these. They are the same
   *  `#proposeChange`/`#interactionState`/`#frames` every other cancelable Gantt-state change
   *  already goes through. Built once, in the constructor,
   *  before `#backend`/`#frames` exist — every method here is a closure, called only later. */
  #columnChromePorts(): ColumnChromePorts {
    return {
      dataset: () => this.#options.dataset,
      columnBind: () => this.#columnBind(),
      paintColumnResizePreview: (preview) => {
        setOptional(this.#interactionState, 'columnResizePreview', preview);
        this.#backend.applyState(this.#interactionState);
      },
      paintColumnReorderPreview: (preview) => {
        setOptional(this.#interactionState, 'columnReorderPreview', preview);
        this.#backend.applyState(this.#interactionState);
      },
      requestFrame: () => this.#frames.request(),
      rebindFields: () => this.#bindColumns(),
      proposeColumnsChange: (from, to, apply) =>
        this.#proposeChange('beforeGridColumnsChange', 'gridColumnsChange', { from, to }, apply),
    };
  }

  /** `frame-settings.ts`'s one seam back into this shell's frame loop, Field bind and layout pass
   *  (#167). Every member is a closure, so the settings never hold a stale collaborator. None of
   *  them runs while this shell is still under construction: `new FrameSettings(...)` writes its
   *  initial values without touching a port. */
  #frameSettingsPorts(): FrameSettingsPorts {
    return {
      requestFrame: () => this.#frames.request(),
      rebindFields: () => this.#bindColumns(),
      invalidateItems: () => this.#layout.invalidateFrom(0),
      readPixelProperty: (property, policy) => readPixelProperty(this.#container, property, policy),
    };
  }

  /** What the constructor's own options say about the next frame. An unset option is spread away
   *  rather than assigned, because a key present with `undefined` means "clear this setting". That
   *  is not what an omitted option asks for. */
  #initialFrameSettings(options: GanttShellOptions): FrameSettingsPatch {
    return {
      locale: options.locale,
      barRenderer: options.barRenderer,
      cellRenderer: options.cellRenderer,
      headerRenderer: options.headerRenderer,
      tooltipRenderer: options.tooltipRenderer,
      ...(options.todayLine !== undefined ? { todayLine: options.todayLine } : {}),
      ...(options.dateLines !== undefined ? { dateLines: options.dateLines } : {}),
      ...(options.rowSource !== undefined ? { rowSource: options.rowSource } : {}),
      ...(options.todayLineMarginTicks !== undefined
        ? { todayLineMarginTicks: options.todayLineMarginTicks }
        : {}),
    };
  }

  /** `plugin-ports.ts`'s one seam back into this shell's own registries, frame loop and event bus
   *  (that file's doc explains why it needs each of these). `buildPluginPorts` never touches a shell
   *  field directly. Every member is a closure, so each one reads live state at call time. A
   *  reassigned `#capabilities` or a fresh `#lastBarById` reaches the plugin that holds the port. */
  #shellPorts(): GanttShellPorts {
    return {
      events: this.#pluginEvents,
      overlay: this.#overlay,
      rowLayer: this.#rowLayer,
      dom: this.#dom,
      commands: this.#commandRegistry,
      keymap: this.#keymap,
      registrations: this.#registrations,
      resolveTooltipRenderer: () =>
        this.#registrations.renderers.resolve('tooltip', this.#frameSettings.tooltipRenderer),
      lastPaintedBar: (id) => this.#lastBarById.get(itemId(id)),
      entry: (id) => this.#options.dataset.entries.get(id),
      resolvedColumns: () => this.#columnChrome.resolvedColumns,
      resolvedColumn: (field) => this.#columnChrome.resolvedColumn(field),
      canEdit: (entry) => this.#capabilities.can('edit', entry),
      proposeEntryEdit: (payload) => this.#events.emit('beforeEntryEdit', payload),
      announceEntryEdit: (payload) => {
        this.#events.emit('entryEdit', payload);
      },
    };
  }

  /** `plugin-registrations.ts`'s one seam back into this shell (#170). Every member is a pass that
   *  has to run again once a registration changes what the Gantt shows. `registerGridColumn` is the
   *  one delegation: `ColumnChrome` keeps that seam's own refresh, for the reason its own method
   *  states. */
  #pluginRegistrationPorts(): PluginRegistrationPorts {
    return {
      requestFrame: () => this.#frames.request(),
      invalidateItems: () => this.#layout.invalidateFrom(0),
      refreshCapabilities: () => this.#refreshCapabilities(),
      registerGridColumn: (column) => this.#columnChrome.registerPluginColumn(column),
    };
  }

  /** S3.7's Page/Home/End/arrow pan (D-S3-14) binds here, alongside the eleven other core commands
   *  registered through `core-commands.ts` — a plugin can override any of them (D-S5-7). The old
   *  standalone `attachKeyboardNavigation` (`view/keyboard-navigation.ts`) is superseded by this;
   *  this shell no longer calls it. */
  #registerCoreCommands(): void {
    registerCoreCommands(this.#commandRegistry, this.#coreCommandPorts());

    const bind = (chord: string, command: string): void => {
      this.#keymap.register({ chord, command });
    };
    bind('PageDown', 'freegantt.pageDown');
    bind('PageUp', 'freegantt.pageUp');
    bind('Home', 'freegantt.panToStart');
    bind('End', 'freegantt.panToEnd');
    bind('ArrowRight', 'freegantt.panRight');
    bind('ArrowLeft', 'freegantt.panLeft');
    bind('ArrowDown', 'freegantt.panDown');
    bind('ArrowUp', 'freegantt.panUp');
    // S5.7, D-S5-18/D-S5-26: scoped to a focused header cell by the command's own `when` above. A
    // plain `ArrowLeft`/`ArrowRight` (pan, bound above) never conflicts with the modified chords here.
    bind('Shift+ArrowRight', 'freegantt.resizeColumnWider');
    bind('Shift+ArrowLeft', 'freegantt.resizeColumnNarrower');
    bind('Alt+ArrowRight', 'freegantt.moveColumnRight');
    bind('Alt+ArrowLeft', 'freegantt.moveColumnLeft');
  }

  #panBy(dx: number, dy: number): void {
    const { x, y } = this.#viewport.scroll.state.position;
    this.#viewport.scroll.panTo({ x: x + dx, y: y + dy });
  }

  /** D-S3-9's one resolution, shared by the pointer path (`canSelect` above), the keyboard path
   *  (S3.5) and the affordance ids below. Never asked twice for the same gesture (I14). */
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

  /** Review H3: `CellRendererContext.fieldValue`. `entries.fieldValue` is the one read that answers
   *  an `entry`-, `meta`- or `compute`-sourced Field alike (ADR 0005). It shares the memo
   *  `column.format` already uses, so a renderer branching on a number never parses `value` back.
   *  A row with no Entry (a grouping header, a custom row) has no Field value to read. */
  #fieldValueForCell(entry: Entry | undefined, key: FieldKey): unknown {
    if (entry === undefined) return undefined;
    return this.#options.dataset.entries.fieldValue(entry.id, key);
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

  /** Always px: the consumer asked how wide the pane is, so the getter answers in the unit the
   *  question is about. `'fitColumns'` reads back as the width it resolved to (#157). */
  get gridWidth(): number {
    return this.#paneLayout.gridWidth;
  }

  /** A plain reconfiguration (`plans/02` "Reconfiguration is just assignment") still runs the same
   *  cancelable commit sequence a splitter drag runs. One write path, one place the veto lives.
   *  #139 caps a px width at the columns' own edge. A width past the last column would only be dead
   *  space. So the change that fires carries the width the pane can actually use. `'fitColumns'`
   *  (#157) puts the pane exactly on that edge and keeps it there through every later rebind.
   *  Nothing floors either form — an explicit `gridWidth = 0` still collapses the pane on purpose
   *  (#127). */
  set gridWidth(width: GridWidth) {
    this.#fitsColumns = width === 'fitColumns';
    this.#commitGridWidth(
      width === 'fitColumns'
        ? (this.#columnsWidth() ?? this.#paneLayout.gridWidth)
        : this.#noWiderThanColumns(width),
    );
  }

  get minGridWidth(): number {
    return this.#paneLayout.minGridWidth;
  }

  /** Live (#127). Raising the floor above the current `gridWidth` lifts it through
   *  `#commitGridWidth`, the same cancelable commit sequence a splitter drag runs. So a veto leaves
   *  `gridWidth` exactly where it was. */
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
   *  `align: 'start'`. This is the one place this shell decides where "today" lands. So every
   *  caller resolves it the same way — `Gantt.panToToday()`, a consumer's own load-time call. `at` is
   *  `now()`, read by the caller — `view/` may not import `time/` (I1) and has no clock read of its
   *  own to make. The margin is today-landing policy, not a general `Viewport` pan option, so it is
   *  applied here rather than threaded through `panToInstant` (S1.13 follow-up, candidate 2). */
  panToToday(at: Instant, align: 'start' | 'center' = 'start'): void {
    panToTodayLine(this.#viewport, at, align, this.#frameSettings.todayLineMarginTicks);
  }

  /** Finds the entry's row via the bound dataset. It asks `FrameLayout` for the row's top, and
   * `barSpan` for its x/width off the bound `TimeScale`. That is the same formula `computeFrame`
   * builds bars from, so the two can never drift apart. It then hands the resulting `Rect` to
   * `Viewport.reveal` (S1.9, D-S1.9-6).
   * Throws `EntryNotFoundError` for an id the dataset has no entry for. A collapsed ancestor expands
   * so the row exists. A still-hidden row (filter) keeps the current y — it does not jump to 0. */
  reveal(entryId: EntryId): void {
    const entry = this.#options.dataset.entries.get(entryId);
    if (entry === undefined) throw new EntryNotFoundError(entryId, 'reveal');
    const { x, width } = barSpan(entry, this.#viewport.timeScale, this.#frameSettings.diamondSizePx);
    let rowIndex = this.#layout.rowIndexForEntry(entryId);
    if (rowIndex < 0 && this.#treeCollapse.expandAncestorsOf(entryId)) {
      this.#frames.flush();
      rowIndex = this.#layout.rowIndexForEntry(entryId);
    }
    const y = rowIndex >= 0 ? this.#layout.rowTop(rowIndex) : this.#viewport.scroll.state.position.y;
    this.#viewport.reveal({ x, y, width, height: this.#frameSettings.rowHeight });
  }

  on<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#events.on(name, handler);
  }

  off<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#events.off(name, handler);
  }

  /** Live (D-S5-3): assignment diffs by `id` against what is already installed. A plugin present in
   *  both lists is left alone. Only the difference is set up or disposed. `api/gantt.ts` is the only
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
    const bound = resolveGanttFields(
      this.#options.dataset,
      // S5.9, D-S5-21: the consumer's own columns plus every plugin-registered one it does not
      // already name — `ctx.view.registerGridColumn`'s own effect reaches rendering here.
      this.#columnChrome.effectiveInput(),
      this.#columnBind(),
    );
    this.#columnChrome.setResolvedColumns(bound.columns);
    // The bind's own two outputs. They invalidate nothing on the way in (`frame-settings.ts`'s
    // table). This bind already belongs to whatever asked for it. A repaint here would make every
    // rebind paint twice.
    this.#frameSettings.set({
      fieldCompares: bound.fieldCompares,
      fieldContext: createFieldContext(
        { get: (key) => this.#options.dataset.field(key) },
        this.#options.dataset.timeZone,
      ),
    });
    // #139/#157: the columns just changed, so the width they dictate changed with them.
    this.#sizeGridPaneToColumns();
  }

  #columnBind(): ResolveColumnsBind {
    // #139: `defaultColumnWidth` makes a column fixed-width unless it names a `flex` of its own.
    // `ColumnChrome` owns both column-width knobs, so both are read off the container the same way.
    const bind: ResolveColumnsBind = {
      timeZone: this.#options.dataset.timeZone,
      defaultColumnWidth: this.#columnChrome.defaultWidthPx(),
    };
    const locale = this.#frameSettings.locale;
    if (locale !== undefined) bind.locale = locale;
    return bind;
  }

  /** The one place `minGridWidth` is applied (#127). The floor bounds what a splitter drag can
   *  reach, and lifts the width when the floor itself rises. Nothing else consults it. So an
   *  explicit `gridWidth = 0` collapses the pane, and a vetoed change rolls back to its own
   *  width. */
  #aboveMinGridWidth(px: number): number {
    return Math.max(this.#paneLayout.minGridWidth, px);
  }

  /** #139: the grid pane never sits wider than its own columns, whoever asked — a constructor
   *  option, a live `gantt.gridWidth = px`, or a splitter drag. There is nothing to show past the
   *  last column's right edge, so a wider pane is dead space, not a wider view. Narrower is always
   *  legal: the columns then overflow and the pane scrolls to reach them (#126). A flex column
   *  names no edge. It fills whatever room it is given, which is the point of asking to flex. So a
   *  column set holding one has no ceiling at all. */
  #noWiderThanColumns(px: number): number {
    const lastColumnEdge = this.#columnsWidth();
    return lastColumnEdge === undefined ? px : Math.min(lastColumnEdge, px);
  }

  /** Where the last column's right edge falls, in px. It is the width `'fitColumns'` asks for, and
   *  the ceiling `#noWiderThanColumns` applies. Those are the same fact read for two purposes.
   *  `undefined` when a `flex` column is in the set. That column has no width until the pane lays it
   *  out, so the columns name no edge at all (#139). */
  #columnsWidth(): number | undefined {
    return totalColumnWidth(this.#columnChrome.resolvedColumns);
  }

  /** What a splitter drag is allowed to reach: the #127 floor under the #139 ceiling. The floor
   *  wins when the two disagree — a pane narrower than `minGridWidth` is a collapsed pane, which is
   *  the accident #127 closed. */
  #withinSplitterBounds(px: number): number {
    return this.#aboveMinGridWidth(this.#noWiderThanColumns(px));
  }

  /** The columns just moved — one is resized, one is hidden, a plugin registered one. So the pane
   *  answers to them again, through the same cancelable commit sequence a splitter drag runs. A
   *  pane already the right width is left alone, which is most rebinds.
   *
   *  `'fitColumns'` (#157) sits the pane *on* the columns' edge, in both directions. It widens with
   *  a widened set as readily as it comes in with a narrowed one. Any other width only gets #139's
   *  ceiling — never wider than the columns, narrower whenever the consumer said so. A set holding
   *  a `flex` column names no edge, so neither form has anything to follow and the pane keeps the
   *  width it has. */
  #sizeGridPaneToColumns(): void {
    const current = this.#paneLayout.gridWidth;
    const target = this.#fitsColumns ? (this.#columnsWidth() ?? current) : this.#noWiderThanColumns(current);
    if (target !== current) this.#commitGridWidth(target);
  }

  /** Returns whether the change survived `beforeGridWidthChange` — a vetoed width leaves both the
   *  pane and the caller's own bookkeeping (#157's `#fitsColumns`) untouched. */
  #commitGridWidth(px: number): boolean {
    const from = this.#paneLayout.gridWidth;
    const to = px;
    return this.#proposeChange(
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

  /** One measurement, pushed to everything it feeds (#8, #49). `--fg-row-height`,
   *  `--fg-tick-box-floor` and the pane size all change for one reason: a resize of the timeline
   *  pane. So one signal re-reads them all, and none of them goes stale. `size` is the timeline
   *  pane's own client box, with no gutter to subtract (S1.8, D-S1.8-2). The grid pane's width never
   *  overlapped it in the first place. */
  #applyPaneMeasurement(size: Size): void {
    this.#paneBox = size;
    this.#frameSettings.refreshPixelProperties();
    this.#applyRowsViewportSize();
  }

  /** The rows' own viewport is the pane box minus the header. The timeline pane's header sticks to
   *  the pane's top, and covers that band of rows for the whole scroll. The grid pane's rows clip
   *  below its spacer for the same reason. Reporting the full pane box left the scroll model one
   *  header short of the true extent. The last row could then never scroll fully into view. */
  #applyRowsViewportSize(): void {
    const headerHeight = this.#paneLayout.measureHeaderHeight();
    this.#viewportHandle.setPaneSize({
      width: this.#paneBox.width,
      height: Math.max(0, this.#paneBox.height - headerHeight),
    });
  }

  render(): void {
    const datasetRevision = this.#options.dataset.datasetRevision;
    const frame = this.#layout.computeFrame(
      // #167: the settings half of a `LayoutInput` stands between frames and answers for itself.
      // What this shell contributes is what changed since the last frame — the viewport's geometry,
      // the dataset's entries, and the registries a plugin writes into.
      this.#frameSettings.toLayoutInput({
        entries: this.#options.dataset.entries.all,
        scale: this.#viewport.timeScale,
        preset: this.#viewport.preset,
        visible: this.#viewport.visible,
        overscan: this.#viewport.overscan,
        revision: this.#revision++,
        columns: this.#columnChrome.resolvedColumns,
        collapsed: this.#treeCollapse.ids,
        itemProducerRegistry: this.#registrations.itemProducers,
        decorationProviders: this.#registrations.decorationProviders(),
        ...(typeof datasetRevision === 'number' ? { datasetRevision } : {}),
      }),
    );
    this.#backend.sync(frame);
    this.#lastBarById.clear();
    for (const bar of frame.bars) this.#lastBarById.set(bar.id, bar);
    // D-S1.12-9: the grid pane's spacer mirrors the header's own band count. So both panes resolve
    // their header height from the same `--fg-band-height` expression, and cannot drift.
    // A changed band stack is a changed header height, and the rows' viewport is the pane box minus
    // that. So this re-derives the viewport here, rather than waiting for the next pane resize.
    if (this.#paneLayout.setHeaderBandCount(frame.header.bands.length)) this.#applyRowsViewportSize();
    this.#contentSize = { width: frame.contentWidth, height: frame.contentHeight };
    this.#viewportHandle.setContentSize(this.#contentSize);
    this.#scrollAttachment.writePosition();
    // #126: independent of the timeline's content width above. The grid pane's own horizontal
    // scroller reaches fixed-width columns that overflow `gridWidth`, unrelated to the time axis.
    this.#paneLayout.contentWidth = gridContentWidth(
      this.#columnChrome.resolvedColumns,
      this.#paneLayout.gridWidth,
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    // S5.1, D-S5-3: plugins first. A disposer may still need its overlay node or another pane-owned
    // resource, so it must run before any pane below is torn down.
    this.#pluginRuntime.disposeAll();
    this.#overlay.destroy();
    this.#container.removeEventListener('keydown', this.#keymapListener);
    this.#container.ownerDocument.removeEventListener('keydown', this.#documentKeymapListener, true);
    this.#frames.cancel();
    this.#entryGestures?.detach();
    this.#keyboardEditing?.detach();
    this.#columnGestures?.detach();
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
