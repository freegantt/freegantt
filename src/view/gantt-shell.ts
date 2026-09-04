// view/ — Gantt shell, the composition root that wires the grid pane, splitter, timeline pane and
// viewport binding together (plans/01 §8.2-8.3, S1.8).

import {
  barSpan,
  FrameLayout,
  ScrollModel,
  TimeScaleModel,
  Viewport,
  DEFAULT_TICK_BOX_FLOOR_PX,
  DEFAULT_DIAMOND_SIZE_PX,
  DEFAULT_LANE_GAP_PX,
  DEFAULT_ROW_SOURCE,
  createItemProducerRegistry,
  createRegistrationTable,
  isPlannedHeaderRow,
  gridContentWidth,
} from '../layout/index.js';
import type {
  DateLineSpec,
  Overscan,
  PresetRef,
  RowSource,
  TimeScaleFit,
  ViewportHandle,
  ViewPreset,
  ItemProducer,
  ItemProducerRegistry,
  FieldCompare,
  BarRenderer,
  CellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  RendererByKind,
  RendererPoint,
  RendererFor,
  FrameBar,
  DecorationLayer,
  DecorationProvider,
  RegisteredDecorationProvider,
} from '../layout/index.js';
import type { ElementDescription, TooltipColumn } from '../model/index.js';
import { RendererRegistry } from './renderer-registry.js';

import { createDomBackend } from '../render/dom/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { PaneLayout } from './pane-layout.js';
import type { Panes } from './pane-layout.js';
import { DomOverlay } from './overlay.js';
import type { Overlay } from './overlay.js';
import { attachSplitter } from './splitter.js';
import type { SplitterAttachment } from './splitter.js';
import { EventBus } from './event-bus.js';
import type {
  AsyncCancelableEvent,
  EntryFieldEdit,
  GanttEventHandler,
  GanttEventMap,
  GanttEvents,
} from './event-bus.js';
import { PluginRuntime, RegistrationGate } from '../extensions/plugin-runtime.js';
import type { ShellPlugin } from '../extensions/plugin-runtime.js';
import { DisposableStore } from '../extensions/disposables.js';
import { CommandRegistry } from '../extensions/commands.js';
import type { CommandContext, CommandRegistryOf } from '../extensions/commands.js';
import { registerCoreCommands } from './core-commands.js';
import type { CoreCommandPorts } from './core-commands.js';
import { Keymap } from '../extensions/keymap.js';
import type { KeyBinding, KeyEventLike } from '../extensions/keymap.js';
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
  Disposer,
  Entry,
  EntryEdits,
  EntryId,
  EntryKind,
  FieldContext,
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
import type { Capabilities, Interactions, KindDefaults } from './capability.js';
import { subscribeToDatasetChanges } from './dataset-change-subscription.js';
import type { DatasetChangeSubscription } from './dataset-change-subscription.js';
import { FrameScheduler } from './frame-scheduler.js';
import { projectAffordances } from './affordance-projection.js';
import { GesturePipeline } from './gesture-pipeline.js';
import type { EntryGestureContext } from './entry-gesture-context.js';
import type { ColumnGestureContext } from './column-gesture-context.js';
import { DEFAULT_GRID_COLUMNS, resolveGanttFields } from './grid-columns.js';
import type { ResolveColumnsBind } from './grid-columns.js';
import { ColumnChrome } from './column-chrome.js';
import type { ColumnChromePorts } from './column-chrome.js';
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
  gridPane: HTMLElement,
  container: HTMLElement,
  ctx: EntryGestureContext,
) => Detachable;

/** S3.5, D-S3-13: same DI shape as `AttachEntryGestures` just above, and the same `ctx` instance —
 *  `interaction/keyboard-editing.ts`'s `attachKeyboardEditing` needs `session()`/`selection`/
 *  `selectableEntriesInRowOrder`/`entryFor`/`can` only, not `hitTest`/`setHovered`, but there is no value in a second,
 *  narrower context type for one caller. */
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

const DIAMOND_SIZE_PROPERTY = '--fg-diamond-size';
/** A zero size would re-open a zero-width milestone bar (bug hunt). */
const DIAMOND_SIZE_POLICY = { fallback: DEFAULT_DIAMOND_SIZE_PX, accepts: 'positive' } as const;

const LANE_GAP_PROPERTY = '--fg-lane-gap';
/** Zero gap is authored: packed bars may sit flush. */
const LANE_GAP_POLICY = { fallback: DEFAULT_LANE_GAP_PX, accepts: 'zeroOrMore' } as const;

/** Default for `todayLineMarginTicks` below: how many of the current preset's own ticks sit between
 *  the pane's left edge and `panToToday`'s landing (S1.13 follow-up) — enough that the today line
 *  reads as "near the start" without sitting flush on the edge, leaving a sliver of the timeline
 *  visible to its left. */
const DEFAULT_TODAY_LINE_MARGIN_TICKS = 2;

/** Every `before*` → `*` pair `#proposeChange` runs (D-S5-6): one entry per pair, not one overload
 *  per pair — a future cancelable change adds a line here instead of a new `#proposeChange`
 *  overload. Names only: each name's payload is `GanttEventMap`'s own, never restated here, so a
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

/** What `GanttShell` hands to `options.buildPluginContext` so it can build one plugin's
 *  `PluginContext` (S5.1, D-S5-1) — one closure or value per capability the shell owns. `view/`
 *  types every member here once; `api/gantt.ts` nests them into `PluginContext`'s `interaction`/
 *  `view`/`layout` groups instead of retyping each one itself (#150). The same named-ports pattern as
 *  `ColumnChromePorts` (`column-chrome.ts`), with the definer flipped: there the callee
 *  (`ColumnChrome`) names what it needs from `GanttShell`; here `GanttShell` itself names what it
 *  hands to `options.buildPluginContext`'s callback. */
export interface PluginContextPorts {
  events: GanttEvents;
  disposables: DisposableStore;
  commands: CommandRegistryOf<unknown>;
  /** #155: every `register*` below returns a `Disposer` that removes exactly its own registration.
   *  The plugin's own `DisposableStore` already holds a copy, so a plugin that never calls it still
   *  disposes cleanly on uninstall; the return value is what lets a plugin retract a registration
   *  while it is still installed (a column it shows only in one mode). Calling it twice is safe. */
  registerKeybinding: (binding: KeyBinding<unknown>) => Disposer;
  registerKeyHandler: (
    chord: string,
    handler: (event: KeyEventLike) => void,
    options?: { captureInEditable?: boolean },
  ) => () => void;
  overlay: Overlay;
  /** S5.4, D-S5-11: `ctx.view.registerRenderer`. Legal only while `setup` runs (D-S5-4), the same
   *  gate `registerKeybinding` above already takes. */
  registerRenderer: <P extends RendererPoint>(point: P, renderer: RendererFor<P>) => Disposer;
  /** S5.5 (API gap, `s5.5-tooltips-and-context-menu.md` §5): `ctx.view.resolveTooltip`. Not gated
   *  by `RegistrationGate` — like `overlay` above, a plugin reads this for as long as it runs, not
   *  only during `setup`. */
  resolveTooltip: (id: EntryId) => ElementDescription | undefined;
  /** D-S5-13: `ctx.view.resolveTooltipColumns`. Every currently resolved Grid column marked
   *  `tooltip: true`, header and this entry's formatted value — the default tooltip body's own
   *  extra-columns clause. Not gated by `RegistrationGate`, same posture as `resolveTooltip`. */
  resolveTooltipColumns: (entry: Entry) => readonly TooltipColumn[];
  /** S5.6, D-S5-15: `ctx.view.registerDecoration`. Legal only while `setup` runs (D-S5-4), the
   *  same gate `registerKeybinding`/`registerRenderer` above already take — but unlike those, a
   *  provider is removed automatically when this plugin disposes (its own `disposables.add`
   *  entry), not by the plugin itself. */
  registerDecoration: (layer: DecorationLayer, provider: DecorationProvider) => Disposer;
  /** S5.8, D-S5-19: `ctx.view.isColumnEditable`. */
  isColumnEditable: (field: FieldKey) => boolean | undefined;
  /** S5.8, D-S5-19: `ctx.interaction.canEdit`. */
  canEdit: (entry: Entry) => boolean;
  /** S5.8, D-S5-19: `ctx.interaction.emitBeforeEntryEdit`. */
  emitBeforeEntryEdit: (payload: EntryFieldEdit) => boolean | Promise<boolean>;
  /** S5.8, D-S5-19: `ctx.interaction.emitEntryEdit`. */
  emitEntryEdit: (payload: EntryFieldEdit) => void;
  /** S5.9, D-S5-22: `ctx.layout.registerItemProducer`. Legal only while `setup` runs (D-S5-4).
   *  Disposal removes this registration through `ItemProducerRegistry.register`'s own `Disposer`.
   *  The newest registration left then wins (#154). */
  registerItemProducer: (kind: EntryKind, producer: ItemProducer) => Disposer;
  /** S5.9, D-S5-22: `ctx.interaction.registerKindDefaults` — the middle precedence layer between
   *  the consumer's own `interactions` and the library table (`capability.ts`). Legal only while
   *  `setup` runs. Disposal removes this registration, and never another plugin's (#154). */
  registerKindDefaults: (kind: EntryKind, defaults: KindDefaults) => Disposer;
  /** S5.9, D-S5-21: `ctx.view.registerGridColumn` — appended after the consumer's own
   *  `gridColumns`, in registration order. Legal only while `setup` runs. Disposal removes this
   *  registration, and never another plugin's (#154). */
  registerGridColumn: (column: GridColumnInput) => Disposer;
}

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
  /** Live (S5.4, D-S5-11). A function, or a per-kind map (D-S5-12) — undefined and "no per-kind
   *  entry" both keep the library's own bar output. Always loses to a plugin's own `registerRenderer`
   *  only when this is itself undefined; wins over a plugin's the rest of the time. */
  barRenderer?: BarRenderer | RendererByKind;
  /** Live (S5.4, D-S5-11). Gantt-wide; a per-column `GridColumn.cellRenderer` (S5.7) wins over this
   *  for its own column. */
  cellRenderer?: CellRenderer;
  /** Live (S5.4, D-S5-11). Not painted until a later step consumes it (S5.7's grid header chrome) —
   *  the resolution slot exists now so a plugin's `registerRenderer('header', …)` has somewhere to
   *  register into and this option is honest about not being a no-op forever. */
  headerRenderer?: HeaderRenderer;
  /** Live (S5.4, D-S5-11). Replaces a tooltip's body (S5.5's `tooltips()` feature reads this). */
  tooltipRenderer?: TooltipRenderer;
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
  /** Injected, same reason as `entryGestures` above. `api/gantt.ts` always passes
   * `attachColumnGestures`; omitted only by tests exercising the shell with no column-chrome wiring. */
  columnGestures?: AttachColumnGestures;
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
  buildPluginContext?: (parts: PluginContextPorts) => unknown;
  /** S5.2, D-S5-6: fills the api-level pieces of a `CommandContext` for the same reason
   *  `buildPluginContext` above fills `PluginContext`'s — the full api `Dataset` (with `undo`/`redo`)
   *  and the public `Gantt` façade are both api-level, and `view/` may not name either type
   *  (D-S5-5's mirror on the `view/` side). Called fresh on every command invocation, never cached,
   *  so a command always reads the invocation's current selection. `api/gantt.ts` always supplies
   *  this; omitted only by tests exercising the shell with no commands. `target`'s shape (S5.7,
   *  D-S5-26) is a structural subtype of api-level `CommandTarget` — `view/` may not name that type
   *  either, but a narrower object literal reaches it fine since `api/gantt.ts` only widens. */
  buildCommandContext?: (parts: {
    entry?: Entry;
    target?: { kind: 'header'; columnKey: FieldKey };
  }) => unknown;
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
  /** The timeline pane's last measured box, kept raw: the header height it has to be reduced by
   *  changes on its own signal (a preset with a different band count), not on a pane resize. */
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
  /** S5.9, D-S5-22: `ctx.interaction.registerKindDefaults` — the middle precedence layer
   *  `resolveCapabilities` reads between the consumer's own `interactions` and the library table.
   *  A second plugin registering the same kind overrides the first while both stay installed;
   *  disposing one registration never disturbs another plugin's live registration on the same
   *  kind, in any disposal order (#146). */
  #kindDefaults = createRegistrationTable<EntryKind, KindDefaults>();
  /** The raw hit under the pointer, reported by `EntrySelectionContext.setHovered` — undefined on
   *  pointerleave or when nothing is wired (no `entryGestures` attachment). */
  #hoveredItemId: ItemId | undefined;
  /** S5.5 (API gap, `s5.5-tooltips-and-context-menu.md` §5): the last-rendered frame's bars, indexed
   *  by item id — `resolveTooltip`'s only reader, so a hover plugin working from the DOM after the
   *  fact can still build a real `TooltipRendererContext` (a bar's `x`/`y`/`width`/`height`/`flags`
   *  are not reachable from a DOM element alone). Rebuilt once per `render()`, not on the hover path
   *  itself — same cost `#backend.sync(frame)` already pays iterating `frame.bars`. */
  #lastBarById = new Map<ItemId, FrameBar>();
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
  #documentKeymapListener!: (event: KeyboardEvent) => void;
  #destroyed = false;
  /** This Gantt's layout pass. It keeps the row-height index alive across renders (#47) — the shell
   * states what to draw and holds no layout bookkeeping of its own. */
  #layout = new FrameLayout();
  #rowHeight: number = DEFAULT_ROW_HEIGHT;
  #laneGapPx: number = DEFAULT_LANE_GAP_PX;
  #tickBoxFloorPx: number = DEFAULT_TICK_BOX_FLOOR_PX;
  #diamondSizePx: number = DEFAULT_DIAMOND_SIZE_PX;
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
  #fieldCompares: readonly FieldCompare[] = [];
  #fieldContext: FieldContext | undefined;
  #rowSource: RowSource = DEFAULT_ROW_SOURCE;
  #treeCollapse!: TreeCollapse;
  /** S5.4, D-S5-11: plugin-side renderer registrations. The consumer's own `#barRenderer`/etc. below
   *  are read live at resolve time, never stored here — see `renderer-registry.ts`'s file header. */
  #rendererRegistry = new RendererRegistry();
  /** S5.6, D-S5-15: `ctx.view.registerDecoration`'s own record — every plugin's provider, in
   *  registration order, threaded into `#layout.computeFrame` as `LayoutInput.decorationProviders`. */
  #decorationProviders: RegisteredDecorationProvider[] = [];
  #barRenderer: BarRenderer | RendererByKind | undefined;
  #cellRenderer: CellRenderer | undefined;
  #headerRenderer: HeaderRenderer | undefined;
  #tooltipRenderer: TooltipRenderer | undefined;
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
    this.#columnChrome = new ColumnChrome(
      this.#container,
      this.#columnChromePorts(),
      options.gridColumns ?? DEFAULT_GRID_COLUMNS,
    );
    this.#rowSource = options.rowSource ?? DEFAULT_ROW_SOURCE;
    this.#barRenderer = options.barRenderer;
    this.#cellRenderer = options.cellRenderer;
    this.#headerRenderer = options.headerRenderer;
    this.#tooltipRenderer = options.tooltipRenderer;
    this.#itemProducerRegistry = options.itemProducerRegistry ?? createItemProducerRegistry();
    this.#bindColumns();

    // Mount before binding (#22): the render target exists by the time the binding's own onChange
    // — which IS this shell's first render — fires, so there is no construction-order exception to
    // document and no separate explicit render() call after bind().
    this.#backend =
      options.backend ??
      createDomBackend({
        entryById: (id) => this.#options.dataset.entries.get(id),
        resolveBarRenderer: (kind) => this.#rendererRegistry.resolveBar(kind, this.#barRenderer),
        // S5.4, D-S5-11: `render/dom` never receives `ResolvedColumn` (`column.format` "never
        // reaches a backend", `layout/column.ts`) — bind it in here instead, so render/dom only
        // ever calls an already-column-bound function keyed by the same `FrameColumn.key` string
        // it already threads through `CellItem.key`.
        resolveCellRenderer: (columnKey) => {
          const column = this.#columnChrome.resolvedColumns.find((c) => String(c.key) === columnKey);
          if (column === undefined) return undefined;
          // S5.7, D-S5-17: a per-column `cellRenderer` (this Gantt's own `gridColumns`) beats the
          // Gantt-wide one for that column — no `pluginId`, since a `GridColumn` only ever arrives
          // from the consumer's own config until S5.9's `registerGridColumn` exists.
          if (column.cellRenderer !== undefined) {
            const columnCellRenderer = column.cellRenderer;
            return {
              renderer: (ctx) =>
                columnCellRenderer({
                  ...(ctx.entry !== undefined ? { entry: ctx.entry } : {}),
                  value: ctx.value,
                }),
            };
          }
          const resolved = this.#rendererRegistry.resolveCell(this.#cellRenderer);
          if (resolved === undefined) return undefined;
          const cellRenderer = resolved.renderer;
          return {
            renderer: (ctx) => cellRenderer({ ...ctx, column }),
            ...(resolved.pluginId !== undefined ? { pluginId: resolved.pluginId } : {}),
          };
        },
        // S5.4, D-S5-11: same bind-in-here posture as `resolveCellRenderer` just above — a
        // `GridColumn` has no per-column `headerRenderer` slot (`layout/column.ts`), so this only
        // ever resolves the Gantt-wide/plugin one, bound to its column.
        resolveHeaderRenderer: (columnKey) => {
          const column = this.#columnChrome.resolvedColumns.find((c) => String(c.key) === columnKey);
          if (column === undefined) return undefined;
          const resolved = this.#rendererRegistry.resolveHeader(this.#headerRenderer);
          if (resolved === undefined) return undefined;
          const headerRenderer = resolved.renderer;
          return {
            renderer: () => headerRenderer({ column }),
            ...(resolved.pluginId !== undefined ? { pluginId: resolved.pluginId } : {}),
          };
        },
      });
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
      // does the closing) — a `registerKeybinding` or `ctx.commands.register` reached afterward
      // throws RegistrationClosedError. Both wrap through `gate.guard` (C2) so a future registration
      // surface (S5.4's `registerRenderer`, `registerDecoration`, `registerGridColumn`) inherits the
      // same check instead of re-deriving it at its own call site.
      const gate = new RegistrationGate(pluginId);
      const registerKeybinding = gate.guard((binding: KeyBinding<unknown>): Disposer => {
        const remove = this.#keymap.register(binding);
        disposables.add(remove);
        return remove;
      });
      const commandRegistry = this.#commandRegistry;
      const commands: CommandRegistryOf<unknown> = {
        // #155: a plugin's command lives exactly as long as the plugin. Its registration goes into
        // `disposables`, so uninstalling restores whatever the id held before — the core catalog's
        // own command, where the plugin had overridden one (D-S5-7).
        register: gate.guard((command) => {
          const remove = commandRegistry.register(command);
          disposables.add(remove);
          return remove;
        }),
        run: (id) => commandRegistry.run(id),
        available: (ctx) => commandRegistry.available(ctx),
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
      // Not wrapped through `gate.guard` (which erases the point<->renderer type link a generic
      // signature needs) — `gate.assertOpen()` called directly instead, same check, same D-S5-4 gate.
      const registerRenderer = <P extends RendererPoint>(point: P, renderer: RendererFor<P>): Disposer => {
        gate.assertOpen();
        // #155: the point is freed again when this plugin goes. Without that, uninstalling and
        // re-installing one plugin made it collide with its own dead registration.
        const remove = this.#rendererRegistry.register(point, renderer, pluginId);
        // A renderer claim changes what every painted cell/bar/header shows, and nothing else marks
        // the frame dirty for it — the first install only repainted because the shell's own first
        // render came after `setup()`. Ask on the way in and on the way out alike (#155).
        this.#frames.request();
        const dispose = (): void => {
          remove();
          this.#frames.request();
        };
        disposables.add(dispose);
        return dispose;
      };
      // S5.5 (API gap, `s5.5-tooltips-and-context-menu.md` §5): same resolve-then-call-with-fallback
      // shape `render/dom/index.ts`'s own `callRenderer` gives `bar`/`cell` (issue #137 F14) — a
      // throwing tooltip renderer degrades to the library's default content, never to a broken popup.
      // `#lastBarById` supplies the `FrameBar` a hover plugin has no other way to reach (it works
      // from the DOM after the fact, not from inside the render pass) — no bar in the current frame
      // (scrolled out, or no such entry) resolves the same as "no renderer": undefined.
      const resolveTooltip = (id: EntryId): ElementDescription | undefined => {
        const resolved = this.#rendererRegistry.resolveTooltip(this.#tooltipRenderer);
        if (resolved === undefined) return undefined;
        const bar = this.#lastBarById.get(itemId(id));
        if (bar === undefined) return undefined;
        const entry = this.#options.dataset.entries.get(id);
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
      // D-S5-13: `tooltips()`'s default body reads this to append every column marked `tooltip: true`
      // — the same resolved list the grid itself paints from (`ColumnChrome`), so a column's header/
      // format stays in one place.
      const resolveTooltipColumns = (entry: Entry): readonly TooltipColumn[] =>
        this.#columnChrome.resolvedColumns
          .filter((column) => column.tooltip === true)
          .map((column) => ({ header: column.header, value: column.format(entry) }));
      // S5.6, D-S5-15: same one-shot-registration gate `registerRenderer` above already takes, but
      // removal is automatic — a decoration provider has no "run once at setup" analogue to a
      // renderer slot; it lives for as long as the plugin does, so `disposables.add` (not the
      // plugin itself) is what takes it back out of `#decorationProviders`.
      const registerDecoration = (layer: DecorationLayer, provider: DecorationProvider): Disposer => {
        gate.assertOpen();
        const registered: RegisteredDecorationProvider = { layer, provider };
        this.#decorationProviders.push(registered);
        this.#frames.request();
        const dispose = (): void => {
          const index = this.#decorationProviders.indexOf(registered);
          if (index >= 0) this.#decorationProviders.splice(index, 1);
          this.#frames.request();
        };
        disposables.add(dispose);
        return dispose;
      };
      // S5.8, D-S5-19: `field` names the currently *resolved* column (Field default merged), the
      // same list `resolveTooltipColumns` above reads — not the raw `GridColumnInput[]` a consumer's
      // own `gridColumns` getter would return.
      const isColumnEditable = (field: FieldKey): boolean | undefined =>
        this.#columnChrome.resolvedColumns.find((column) => column.key === field)?.editable;
      // S5.8, D-S5-19: the same `#capabilities` resolution `#canGesture` reads for `move`/`resize`
      // (I14) — a plugin has no other way to ask it, since `interaction/`'s own `EntryGestureContext`
      // is not reachable past `view/` (D-S5-5).
      const canEdit = (entry: Entry): boolean => this.#capabilities.can('edit', entry);
      const emitBeforeEntryEdit = (payload: EntryFieldEdit): boolean | Promise<boolean> =>
        this.#events.emit('beforeEntryEdit', payload);
      const emitEntryEdit = (payload: EntryFieldEdit): void => {
        this.#events.emit('entryEdit', payload);
      };
      // S5.9, D-S5-22: same one-shot gate as `registerRenderer`/`registerDecoration`. Disposal
      // removes this registration through the registry's own `Disposer`
      // (`ItemProducerRegistry.register`), not a bespoke undo kept here.
      const registerItemProducer = (kind: EntryKind, producer: ItemProducer): Disposer => {
        gate.assertOpen();
        const remove = this.#itemProducerRegistry.register(kind, producer);
        // `#layout`'s own per-row item cache (`FrameMemory#packed`) only forgets a row on a dataset
        // change, row-count change, or metrics change — none of which a producer registration is.
        // Force every row to re-produce on the next render, the same invalidation a collapse change
        // or a gridColumns commit already asks for. Do the same on the way out, so the producer
        // that wins after disposal actually repaints too.
        this.#layout.invalidateFrom(0);
        this.#frames.request();
        const dispose = (): void => {
          remove();
          this.#layout.invalidateFrom(0);
          this.#frames.request();
        };
        disposables.add(dispose);
        return dispose;
      };
      // S5.9, D-S5-22: same gate. This registers through the shared table (#154). A second plugin
      // registering the same kind overrides the first while both stay installed. Disposing one
      // registration never disturbs another plugin's live registration on the same kind, in any
      // disposal order (#146).
      const registerKindDefaults = (kind: EntryKind, defaults: KindDefaults): Disposer => {
        gate.assertOpen();
        const remove = this.#kindDefaults.register(kind, defaults);
        this.#refreshCapabilities();
        const dispose = (): void => {
          remove();
          this.#refreshCapabilities();
        };
        disposables.add(dispose);
        return dispose;
      };
      // S5.9, D-S5-21: same gate; disposal removes `column` from `ColumnChrome`'s own plugin list
      // via its `registerPluginColumn`'s `Disposer`.
      const registerGridColumn = (column: GridColumnInput): Disposer => {
        gate.assertOpen();
        const remove = this.#columnChrome.registerPluginColumn(column);
        disposables.add(remove);
        return remove;
      };
      const context = (options.buildPluginContext ?? (() => ({})))({
        events: this.#pluginEvents,
        disposables,
        commands,
        registerKeybinding,
        registerKeyHandler,
        overlay: this.#overlay,
        registerRenderer,
        resolveTooltip,
        resolveTooltipColumns,
        registerDecoration,
        isColumnEditable,
        canEdit,
        emitBeforeEntryEdit,
        emitEntryEdit,
        registerItemProducer,
        registerKindDefaults,
        registerGridColumn,
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
    this.#keymapListener = (event: KeyboardEvent) => {
      if (this.#keymap.resolve(event)) {
        event.preventDefault();
      }
    };
    this.#container.addEventListener('keydown', this.#keymapListener);
    // Document-level capture-phase fallback (issue #137 F1,
    // `plans/reviews/2026-09-03-s5-start-fixes-qc.md`): the bubble listener above only ever sees a
    // key event whose target sits inside `#container`. A popup opened from an outside trigger (a
    // toolbar button in the consumer's own page, say) has no path into that listener at all, so its Escape
    // dismissal would never fire. Routing through the same `#keymap.resolve()` — not a second,
    // independent listener — keeps one newest-first resolution order instead of reintroducing the
    // bespoke document-capture stack C3 removed. Skipped whenever the target is already inside
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
    // `entryGestures`: both listen for `keydown` on this same `#container`, and an Escape that
    // cancels a column drag must reach `column-gestures.ts`'s own handler — which swallows it via
    // `stopImmediatePropagation()` — ahead of `entry-gestures.ts`'s handler, or the column drag's
    // Escape would also clear the entry selection as an unrelated side effect.
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
    this.#columnGestures = options.columnGestures?.(
      this.#panes.gridHeader,
      this.#container,
      columnGestureContext,
    );
    this.#entryGestures = options.entryGestures?.(
      this.#panes.timeline,
      this.#panes.grid,
      this.#container,
      gestureContext,
    );
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
    return this.#columnChrome.gridColumnInput;
  }

  /** A plain reconfiguration still runs the same cancelable commit sequence a resize drag or a
   *  reorder drop runs (S5.7, D-S5-18) — one write path, one place the veto lives, same posture
   *  `set gridWidth` above already takes for the splitter. */
  set gridColumns(columns: readonly GridColumnInput[]) {
    this.#columnChrome.commit(columns);
  }

  /** Live (S5.4, D-S5-11). Reassigning repaints every bar with no remount (I8) — the same
   *  `#frames.request()` every other live paint-only property already uses. */
  get barRenderer(): BarRenderer | RendererByKind | undefined {
    return this.#barRenderer;
  }

  set barRenderer(renderer: BarRenderer | RendererByKind | undefined) {
    this.#barRenderer = renderer;
    this.#frames.request();
  }

  get cellRenderer(): CellRenderer | undefined {
    return this.#cellRenderer;
  }

  set cellRenderer(renderer: CellRenderer | undefined) {
    this.#cellRenderer = renderer;
    this.#frames.request();
  }

  get headerRenderer(): HeaderRenderer | undefined {
    return this.#headerRenderer;
  }

  set headerRenderer(renderer: HeaderRenderer | undefined) {
    this.#headerRenderer = renderer;
    this.#frames.request();
  }

  get tooltipRenderer(): TooltipRenderer | undefined {
    return this.#tooltipRenderer;
  }

  set tooltipRenderer(renderer: TooltipRenderer | undefined) {
    this.#tooltipRenderer = renderer;
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

  /** One `before*` → apply → `*` sequence, for every cancelable Gantt-state change (D-S5-6):
   *  collapse, selection, grid width, grid columns. `ProposableChange` pairs each `before*` name with
   *  its `*` counterpart — adding a new pair (a future S5.8 event, say) is one line there, not a new
   *  overload here. `change` is the intersection of both events' payloads, so both `emit` calls
   *  typecheck with no cast: a mismatched pair stops compiling instead of drifting silently (#144). */
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
    this.#refreshCapabilities();
  }

  /** S5.9, D-S5-22: the one place `resolveCapabilities` is called — the constructor, `set
   *  interactions`, and `registerKindDefaults`'s own gate all re-derive from here rather than
   *  repeating the three-argument call. */
  #resolveCapabilities(): Capabilities {
    return resolveCapabilities(
      this.#interactions,
      (kind) => this.#options.dataset.isRollUpKind(kind),
      (kind) => this.#kindDefaults.get(kind),
    );
  }

  /** `set interactions` and `registerKindDefaults`'s register/dispose pair both change an input
   *  `#resolveCapabilities` reads, so both re-resolve the capability table and re-derive the
   *  affordance ids the same way (#154) — written once here instead of three times. The
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

  /** S5.2, D-S5-6: the live `CommandContext` builder — `entry` is the first selected entry, or
   *  `undefined` when nothing is selected (the doc's "the focused row, or none"). `target` fills in
   *  for a focused header cell (S5.7, D-S5-26, issue #137 F6) — the rest of `CommandTarget`'s kinds
   *  are still S5.11's own job. `api/gantt.ts`'s injected `buildCommandContext` fills `dataset`/`gantt`
   *  — `view/` may not name either type (D-S5-5's mirror). Omitted `buildCommandContext` (a test with
   *  no commands wiring) makes every command's context an empty object; fine, since no core command
   *  reads `ctx.dataset`/`ctx.gantt` without first checking `ctx.entry`/`ctx.target`, and no such test
   *  runs a command that needs them. */
  #buildCommandContext(): CommandContext<unknown> {
    const id = this.#selection[0];
    const entry = id !== undefined ? this.#options.dataset.entries.get(id) : undefined;
    const columnKey = this.#columnChrome.focusedHeaderColumnKey;
    // `view/` may not name `CommandContextOf`'s api-level fields (`dataset: Dataset`, `gantt`) —
    // D-S5-5's mirror — so this cast trusts `api/gantt.ts`'s injected `buildCommandContext` to fill
    // them, the same trust `buildPluginContext` above already gets for `PluginContext`.
    return (this.#options.buildCommandContext ?? (() => ({})))({
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
        const now = this.#options.now;
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
      panDown: () => this.#panBy(0, this.#rowHeight),
      panUp: () => this.#panBy(0, -this.#rowHeight),
      isColumnResizable: (key) => this.#columnChrome.isResizable(key),
      isColumnMovable: (key) => this.#columnChrome.isMovable(key),
      resizeColumnStep: (key, direction) => this.#columnChrome.resizeStep(key, direction),
      moveColumnStep: (key, direction) => this.#columnChrome.moveStep(key, direction),
    };
  }

  /** `ColumnChrome`'s one seam back into this shell's shared machinery (`column-chrome.ts`'s own doc
   *  explains why it needs each of these): the same `#proposeChange`/`#interactionState`/`#frames`
   *  every other cancelable Gantt-state change already goes through. Built once, in the constructor,
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
    // S5.7, D-S5-18/D-S5-26: scoped to a focused header cell by the command's own `when` above — a
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
    const { x, width } = barSpan(entry, this.#viewport.timeScale, this.#diamondSizePx);
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
    const bound = resolveGanttFields(
      this.#options.dataset,
      // S5.9, D-S5-21: the consumer's own columns plus every plugin-registered one it does not
      // already name — `ctx.view.registerGridColumn`'s own effect reaches rendering here.
      this.#columnChrome.effectiveInput(),
      this.#columnBind(),
    );
    this.#columnChrome.setResolvedColumns(bound.columns);
    this.#fieldCompares = bound.fieldCompares;
    this.#fieldContext = createFieldContext(
      { get: (key) => this.#options.dataset.field(key) },
      this.#options.dataset.timeZone,
    );
  }

  #columnBind(): ResolveColumnsBind {
    return this.#locale !== undefined
      ? { timeZone: this.#options.dataset.timeZone, locale: this.#locale }
      : { timeZone: this.#options.dataset.timeZone };
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
    this.#paneBox = size;
    this.#rowHeight = readPixelProperty(this.#container, ROW_HEIGHT_PROPERTY, ROW_HEIGHT_POLICY);
    this.#laneGapPx = readPixelProperty(this.#container, LANE_GAP_PROPERTY, LANE_GAP_POLICY);
    this.#tickBoxFloorPx = readPixelProperty(this.#container, TICK_BOX_FLOOR_PROPERTY, TICK_BOX_FLOOR_POLICY);
    this.#diamondSizePx = readPixelProperty(this.#container, DIAMOND_SIZE_PROPERTY, DIAMOND_SIZE_POLICY);
    this.#applyRowsViewportSize();
  }

  /** The rows' own viewport is the pane box minus the header: the timeline pane's header sticks to
   *  the pane's top and covers that band of rows for the whole scroll, and the grid pane's rows clip
   *  below its spacer for the same reason. Reporting the full pane box left the scroll model one
   *  header short of the true extent, so the last row could never scroll fully into view. */
  #applyRowsViewportSize(): void {
    const headerHeight = this.#paneLayout.measureHeaderHeight();
    this.#viewportHandle.setPaneSize({
      width: this.#paneBox.width,
      height: Math.max(0, this.#paneBox.height - headerHeight),
    });
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
      diamondSizePx: this.#diamondSizePx,
      revision: this.#revision++,
      locale: this.#locale,
      todayLine: this.#todayLine,
      dateLines: this.#dateLines,
      columns: this.#columnChrome.resolvedColumns,
      fieldCompares: this.#fieldCompares,
      ...(this.#fieldContext !== undefined ? { fieldContext: this.#fieldContext } : {}),
      rows: this.#rowSource,
      collapsed: this.#treeCollapse.ids,
      itemProducerRegistry: this.#itemProducerRegistry,
      decorationProviders: this.#decorationProviders,
      ...(typeof datasetRevision === 'number' ? { datasetRevision } : {}),
    });
    this.#backend.sync(frame);
    this.#lastBarById.clear();
    for (const bar of frame.bars) this.#lastBarById.set(bar.id, bar);
    // D-S1.12-9: the grid pane's spacer mirrors the header's own band count, so both panes resolve
    // their header height from the same `--fg-band-height` expression and cannot drift.
    // A changed band stack is a changed header height, and the rows' viewport is the pane box minus
    // that — so the viewport is re-derived here rather than waiting for the next pane resize.
    if (this.#paneLayout.setHeaderBandCount(frame.header.bands.length)) this.#applyRowsViewportSize();
    this.#contentSize = { width: frame.contentWidth, height: frame.contentHeight };
    this.#viewportHandle.setContentSize(this.#contentSize);
    this.#scrollAttachment.writePosition();
    // #126: independent of the timeline's content width above — the grid pane's own horizontal
    // scroller reaches fixed-width columns that overflow `gridWidth`, unrelated to the time axis.
    this.#paneLayout.contentWidth = gridContentWidth(
      this.#columnChrome.resolvedColumns,
      this.#paneLayout.gridWidth,
    );
  }

  destroy(): void {
    if (this.#destroyed) return;
    // S5.1, D-S5-3: plugins first — a disposer may still need its overlay node or another pane-owned
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
