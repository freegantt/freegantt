// view/ — Gantt shell, the composition root that wires the grid pane, splitter, timeline pane and
// viewport binding together (plans/01 §8.2-8.3, S1.8).

import {
  barSpan,
  FrameLayout,
  ScrollModel,
  TimeScaleModel,
  Viewport,
  createVariantRegistry,
  gridContentWidth,
  totalColumnWidth,
  isTimeUnit,
  nestsRows,
} from '../layout/index.js';
import type {
  DateLine,
  DateLineLabelPlacement,
  Overscan,
  PresetRef,
  RowSource,
  SnapSetting,
  TimeScaleFit,
  ViewportHandle,
  ViewPreset,
  EntryVariant,
  ResolvedVariant,
  VariantClaimant,
  VariantRegistry,
  ReportDoubleClaim,
  ReportUnknownFieldMatch,
  ResolvedRenderer,
  BarLabels,
  BarRenderer,
  CellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  FrameBar,
  Item,
  TimeScale,
} from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { PaneLayout } from './pane-layout.js';
import type { Panes } from './pane-layout.js';
import { resolveTheme } from './theme.js';
import type { ResolvedTheme } from './theme.js';
import { ContainerResize, DomMountLayer } from './mount-layer.js';
import { ContainerDom } from './gantt-dom.js';
import type { DomTarget } from './gantt-dom.js';
import { attachSplitter } from './splitter.js';
import type { SplitterAttachment } from './splitter.js';
import { GridPaneWidth } from './grid-pane-width.js';
import type { GridPaneWidthPorts, GridWidth } from './grid-pane-width.js';
import { EventBus } from './event-bus.js';
import { createErrorRaiser } from '../data/error-reporting.js';
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
import { attachVariantStyles } from './variant-styles.js';
import type { VariantStyles } from './variant-styles.js';
import { LiveRegion } from './live-region.js';
import type { InteractionState, RenderBackend } from '../render/backend.js';
import {
  RevealTargetNotFoundError,
  ContainerNotFoundError,
  PluginNotInstalledError,
  UnsupportedUnitError,
  InvalidSnapIncrementError,
  entryIdOfItem,
  itemId,
  segmentId,
  spansTime,
} from '../model/index.js';
import type {
  Dataset,
  Disposer,
  Entry,
  EntryId,
  FieldKey,
  GridColumnInput,
  ItemId,
  Instant,
  PluginId,
  RaiseError,
  RowId,
  SegmentId,
  Size,
  ProposedEdits,
  TimeSpan,
} from '../model/index.js';
import type { EditRequest } from '../data/edit-extension.js';
import { resolveCapabilities } from './capability.js';
import type { Capabilities, GestureCapability, Interactions } from './capability.js';
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
import type { GanttShellPorts, PluginContextParts } from './plugin-ports.js';
import { TreeCollapse } from './tree-collapse.js';
import { SegmentSelection } from './segment-selection.js';
import type { SegmentSelectionPorts } from './segment-selection.js';

import { RovingFocus } from './roving-focus.js';
import type { RovingFocusPorts } from './roving-focus.js';

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

const DEFAULT_THEME: Theme = 'auto';
const DEFAULT_A11Y_LABEL = 'Gantt';

/** The five `--fg-*` pixel properties, their policies and the today-line margin default all live in
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
  commitEntryEdits?: (edits: ProposedEdits) => boolean;
  /** S5.1, D-S5-1: fills the api-level pieces of a plugin's `PluginContext`. `view/` cannot type
   *  those without reaching past its own boundary (D-S5-5). They are the full api `Dataset` and the
   *  public `Gantt` façade. `model/dataset.ts`'s narrow interface hides `.transaction()`, the same
   *  reason `commitEntryEdits` exists. The `Gantt` façade does not exist yet when this constructor
   *  runs. It returns `unknown` because `api/gantt.ts` binds the concrete
   *  `PluginContext` type. That file alone may import both `Gantt` and this generic contract without
   *  closing an import cycle (`api/plugin-context.ts`'s file header). */
  buildPluginContext?: (parts: PluginContextParts) => unknown;
  /** S5.2, D-S5-6: fills the api-level pieces of a `CommandContext`, for the same reason
   *  `buildPluginContext` fills `PluginContext`'s. The full api `Dataset` (with `undo`/`redo`) and
   *  the public `Gantt` façade are both api-level. `view/` may name neither type (D-S5-5's mirror on
   *  the `view/` side). The shell calls it fresh on every command invocation, never
   *  cached, so a command always reads the invocation's current selection. `target`'s shape (S5.7,
   *  D-S5-26) is a structural subtype of api-level `CommandTarget`. `view/` may not name that type
   *  either, but a narrower object literal reaches it fine, because `api/gantt.ts` only widens. */
  buildCommandContext?: (parts: {
    entry?: Entry;
    /** ADR 0018: the variant this Gantt resolved for `entry`. Filled beside `entry`, from the same
     *  resolution the layout pass uses. */
    variant?: string;
    target?:
      | {
          kind: 'header';
          field: FieldKey;
          entryIds: readonly EntryId[];
          segmentIds: readonly SegmentId[];
        }
      | { kind: 'bar'; entryIds: readonly EntryId[]; segmentIds: readonly SegmentId[] }
      // S5.11, D-S5-26/D-S5-39: the roving-focus grid pane fills two `CommandTarget` kinds a
      // right-click never reaches on its own. `'row'` names a focused Row. `'cell'` names a
      // focused Grid cell, and `field` names its column. The splitter also gains its own kind,
      // for parity with the panes either side of it.
      | { kind: 'row'; entryIds: readonly EntryId[]; segmentIds: readonly SegmentId[] }
      | { kind: 'cell'; field?: FieldKey; entryIds: readonly EntryId[]; segmentIds: readonly SegmentId[] }
      | { kind: 'splitter'; entryIds: readonly EntryId[]; segmentIds: readonly SegmentId[] };
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
  dateLines?: readonly DateLine[];
  /** Live. See `GanttOptions.dateLineLabelPlacement`. Default `DEFAULT_DATE_LINE_LABEL_PLACEMENT`
   *  (`'belowHeader'`). */
  dateLineLabelPlacement?: DateLineLabelPlacement;
  /** Live. See `GanttOptions.todayLineMarginTicks`. Default `DEFAULT_TODAY_LINE_MARGIN_TICKS`. */
  todayLineMarginTicks?: number;
  /** Live (S3, D-S3-9). Per-gesture, boolean or per-entry predicate, over the per-kind default table
   *  (`view/capability.ts`). Default `{}`: every gesture resolves off the default table alone. */
  interactions?: Interactions;
  /** Live (D-S3-24). What a drag snaps to on this Gantt, over the showing preset's own `snap`.
   *  Omitted, the preset decides. */
  snap?: SnapSetting;
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
  /** Live (J1). Where the default bar label paints — ignored once `barRenderer`'s output takes over
   *  a bar's content. Default `'fitBar'`. */
  barLabels?: BarLabels;
  /** Live (S5.4, D-S5-11). A function, or a per-kind map (D-S5-12) — undefined and "no per-kind
   *  entry" both keep the library's own bar output. Always loses to a plugin's own `registerRenderer`
   *  only when this is itself undefined; wins over a plugin's the rest of the time. */
  barRenderer?: BarRenderer;
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
  /** S3.6, D-S3-18, P1: the door onto the installed extension hook, called for **preview only** —
   *  ghosts its extras in the rAF-coalesced drag preview. `api/gantt.ts` passes the bound Dataset's
   *  own `extraEditsFor` here (S5.10, #209 Q5). That occupant is the identity function until a
   *  Dataset plugin composes onto it (D-S5-23). A test that constructs `GanttShell` directly passes
   *  its own, the same shape `commitEntryEdits` already uses. The real hook still runs again, for
   *  real, inside `data/transaction.ts`'s own commit. This option never writes anything itself. */
  extraEditsFor?: (request: EditRequest) => ProposedEdits;
  /** Internal (D-S4-24, ADR 0018). One registry per Gantt, seeded with core's two variants. Tests
   *  inject a replacement. */
  variantRegistry?: VariantRegistry;
  /** The consumer's own variants — `GanttOptions.variants`, already erased to the untyped shape
   *  (ADR 0018). They outrank every plugin's, whatever order the plugins install in. */
  variants?: readonly EntryVariant[];
  /** Installed before this shell's first paint (N7). A plugin-defined variant, keybinding or command
   *  reaches frame 1, the same as every other constructor option. Before N7, `Gantt.plugins`'s live
   *  setter ran after this constructor returned, so frame 1 missed them.
   *
   *  ADR 0019: this Gantt's own chrome plugins, the live-reconfigurable set. */
  plugins?: readonly ShellPlugin<unknown>[];
  /** ADR 0019: the Dataset's own plugins. Their `view` halves install here too, ahead of this
   *  shell's chrome. They stay installed for this shell's whole life, because this Gantt did not
   *  install them and cannot drop them. A plugin with no `view` half joins the `requires` graph and
   *  runs nothing. */
  datasetPlugins?: readonly ShellPlugin<unknown>[];
  /** Applied before this shell's first paint (N7), same reasoning as `plugins` above. */
  zoomPresets?: readonly PresetRef[];
  /** Applied before this shell's first paint (N7), same reasoning as `plugins` above. Loose
   *  (`SegmentId | string`), same asymmetry the live `selection` setter already has. */
  selectedSegmentIds?: readonly (SegmentId | string)[];
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

/** The union `[min x, max(x + width))` of every Item's own `barSpan` (#295). It is
 *  `GanttShell.reveal`'s target when an entry draws several Items — one bar per Segment. Revealing
 *  the entry then shows every one of them, not only the first its row packed. Takes at least one
 *  Item: `#revealEntrySpan`, its one caller, checks `items.length > 0` first. A Segment names one
 *  bar, so `#revealSegmentSpan` never unions — it would pan to a sibling. */
function unionSpan(
  items: readonly Item[],
  scale: TimeScale,
  minBarWidthPx: number,
): { x: number; width: number } {
  let minX = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    const { x, width } = barSpan(item, scale, minBarWidthPx);
    minX = Math.min(minX, x);
    maxEnd = Math.max(maxEnd, x + width);
  }
  return { x: minX, width: maxEnd - minX };
}

/** A stand-in Item for `barSpan`, for the case where nothing paints the target (#295). A variant
 *  produced no Item, or no Item draws the named Segment. The dates it is handed become the target, so
 *  reveal never becomes a no-op. It is a stand-in, not a second formula: `barSpan` still answers
 *  the geometry, and it carries no box, so it takes the ordinary span-and-floor path. */
function fallbackSpanItem(ownerId: EntryId, start: Instant, end: Instant): Item {
  return { id: itemId(ownerId), entryId: ownerId, variant: '', label: '', start, end };
}

export class GanttShell {
  #container: HTMLElement;
  #paneLayout: PaneLayout;
  /** The #127 floor, the #139 ceiling, and the #157 `'fitColumns'` standing instruction —
   *  `grid-pane-width.ts`'s own file header. `PaneLayout` holds the px it resolves to; this module
   *  knows nothing about the DOM. */
  #gridPaneWidth!: GridPaneWidth;
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
  /** The Selection (#212, ADR 0010, #230 R4): what is selected, and what a pointer hit would select.
   *  Built once, right after `#capabilities` in the constructor below. */
  #segmentSelection!: SegmentSelection;
  /** S3.2, D-S3-9: resolved once, re-resolved only when `interactions` is reassigned — never per
   *  hover step. `#refreshAffordances` reads it, it never calls `resolveCapabilities` itself. */
  #interactions: Interactions = {};
  /** The consumer's own variants, and the disposers that retract them. Reassigning `variants`
   *  retracts the whole list and installs the new one (ADR 0018).
   *
   *  A plain array, not a `DisposableStore` (`J38`). A store latches on its first `disposeAll()`
   *  and disposes anything added after it. That is right for a lifetime that ends once, and wrong
   *  for a list that is replaced live. */
  #variants: readonly EntryVariant[] = [];
  #consumerVariantDisposers: Disposer[] = [];
  /** D-S3-24: this Gantt's own snap, or `undefined` while the showing preset decides. It changes no
   *  paint, so it is a plain field and not a frame setting. */
  #snap: SnapSetting | undefined;
  #viewportGestures: ViewportGestures = {};
  #resolvedViewportGestures = resolveViewportGestures(undefined);
  #capabilities: Capabilities;
  /** The raw hit under the pointer, reported by `EntrySelectionContext.setHovered` — undefined on
   *  pointerleave or when nothing is wired (no `entryGestures` attachment). */
  #hoveredItemId: ItemId | undefined;
  /** The grid row under the pointer, reported by `EntryGestureContext.setHoveredRow` — undefined
   *  once the pointer leaves the grid pane. `#hoveredRow()` falls back to the hovered bar's own row,
   *  so this holds only the half the timeline pane cannot answer. */
  #hoveredRowId: RowId | undefined;
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
  /** ADR 0022 §5: the second stylesheet a Gantt writes, one node for its own installed variants'
   *  `css`. Built right after `#registrations`, and refreshed on every edge that changes what a
   *  variant registers — construction, `gantt.variants = […]`, a plugin install or dispose. */
  #variantStyles!: VariantStyles;
  /** The single rAF owner (B10, D-S2-15): every render request past construction goes through
   *  this, so N mutations in one tick become one frame. */
  #frames = new FrameScheduler(() => this.render());
  #events = new EventBus<GanttEventMap, AsyncCancelableEvent>();
  /** S5.12, D-S5-40: this Gantt's own raise seam, over the bus above. Every collaborator that
   *  observes a refusal or a recovered fault takes it. That is the gesture pipeline, the render
   *  backend, the plugin runtime, and each plugin's own `ctx.raiseError`. */
  #raiseError: RaiseError = createErrorRaiser(this.#events);
  /** S5.1, D-S5-1: the plain `{ on, off }` a plugin's `ctx.events` actually is. Built once, from
   *  this shell's own `on`/`off` below. A plugin never sees the rest of this class's public surface
   *  the way handing it `this` directly would. */
  #pluginEvents: GanttEvents = {
    on: (name, handler) => this.on(name, handler),
    off: (name, handler) => this.off(name, handler),
  };
  #pluginRuntime!: PluginRuntime<unknown>;
  /** ADR 0019: the two lists `#pluginRuntime` installs together, kept apart so `plugins` reports
   *  what this Gantt owns and `uninstallPlugin` refuses what the Dataset owns. */
  #datasetPlugins: readonly ShellPlugin<unknown>[] = [];
  #chromePlugins: readonly ShellPlugin<unknown>[] = [];
  /** S5.2, D-S5-6/D-S5-7: one registry and one keymap per Gantt (I2). Core commands and core
   *  bindings register here first, so a plugin's own registration always wins (D-S5-7). */
  #commandRegistry!: CommandRegistry<unknown>;
  #keymap!: Keymap<unknown>;
  #keymapListener!: (event: KeyboardEvent) => void;
  #documentKeymapListener!: (event: KeyboardEvent) => void;
  #destroyed = false;
  /** #376: flipped true on this constructor's last line. A constructor-supplied plugin has already
   *  subscribed by the time the rest of the constructor runs. `#emit` reads this flag. Construction
   *  itself — an initial `theme`/`selection` write, the first frame's own preset settling — never
   *  reaches a subscriber as a reported change. A plugin that wants the starting state reads it
   *  straight off `ctx.gantt` in `setup()` instead. */
  #constructed = false;
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
  /** #375. The value `themeChange` last reported — and so the next emit's `from`. `resolvedTheme`
   *  itself is never cached (see the getter): this field exists only so `#syncResolvedTheme` can
   *  tell whether the computed answer actually moved. Set for real once the constructor knows
   *  `#container` and `#theme` (both required to resolve anything), never read before then. */
  #reportedTheme: ResolvedTheme;
  /** #330. `window.matchMedia('(prefers-color-scheme: dark)')`, held so its `'change'` listener can
   *  detach in `destroy()`. Queried once, at construction. A `MediaQueryList` stays live and keeps
   *  firing `'change'` for its own query, so nothing here ever re-queries it. Every `resolveTheme`
   *  call below reuses this same instance instead of calling `matchMedia` again. `resolvedTheme` is
   *  read often, and a fresh `MediaQueryList` per read is pure waste. */
  #darkSchemeQuery: MediaQueryList;
  #darkSchemeQueryListener: () => void;
  /** Bound once, passed to every `resolveTheme` call. `resolveTheme` always passes the same query,
   *  `'(prefers-color-scheme: dark)'` — the one `#darkSchemeQuery` was built for. So this answers
   *  that live `MediaQueryList` instead of building a fresh one. */
  #matchMedia = (): Pick<MediaQueryList, 'matches'> => this.#darkSchemeQuery;
  /** #375. An ancestor's own `data-fg-theme` pin is a supported way to resolve this Gantt's theme
   *  (#271). A wrapping app can change that pin with no write of this Gantt's own — a whole-chrome
   *  dark-mode switch, say. `attributeFilter` keeps this cheap: it wakes only on a `data-fg-theme`
   *  write, anywhere under the root node, never on unrelated DOM churn. */
  #themePinObserver: MutationObserver;
  #a11yLabel: string = DEFAULT_A11Y_LABEL;
  #treeCollapse!: TreeCollapse;
  /** S5.11, D-S5-25/D-S5-26: one tab stop per pane (`view/roving-focus.ts`'s own file header). Built
   *  once `#treeCollapse`/`#segmentSelection`/`#columnChrome` exist, since its ports read all three. */
  #rovingFocus!: RovingFocus;
  /** S5.11, D-S5-26: the one polite live region for this Gantt (`view/live-region.ts`'s own file
   *  header). Constructed and attached alongside `#rovingFocus`, once `#container` exists. */
  #liveRegion!: LiveRegion;
  /** Issue #137 F9: the one `ResizeObserver` per Gantt, which both mount layers below share. */
  #containerResize: ContainerResize;
  /** S5.3, D-S5-8: constructed once panes exist — see the plugin runtime's own comment just below for
   *  why. This is the layer that escapes the pane box. */
  #overlay: DomMountLayer;
  /** #158: the grid's own row layer, where a plugin mounts content that must scroll with the rows.
   *  Constructed beside the overlay, and for the same reason. */
  #rowLayer: DomMountLayer;
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
    this.#paneLayout = new PaneLayout({
      container: this.#container,
      ...(typeof options.gridWidth === 'number' ? { gridWidth: options.gridWidth } : {}),
      ...(options.minGridWidth !== undefined ? { minGridWidth: options.minGridWidth } : {}),
    });
    this.#panes = this.#paneLayout.panes;
    this.#gridPaneWidth = new GridPaneWidth(this.#gridPaneWidthPorts(), options.gridWidth === 'fitColumns');
    // S5.3, D-S5-8: constructed right after the panes it measures, so it is ready by the time the
    // plugin runtime (just below) builds its first `PluginContext`.
    this.#containerResize = new ContainerResize(this.#container);
    this.#overlay = new DomMountLayer(
      this.#panes.overlay,
      () => this.#paneLayout.overlayBounds(),
      this.#containerResize,
    );
    this.#rowLayer = new DomMountLayer(
      this.#panes.rows,
      () => this.#paneLayout.rowLayerBounds(),
      this.#containerResize,
    );
    this.#dom = new ContainerDom({
      container: this.#container,
      paneLayout: this.#paneLayout,
      entryById: (id) => this.#options.dataset.entries.get(id),
      layout: this.#layout,
    });

    const hasOwnOptions =
      options.preset !== undefined || options.range !== undefined || options.fit !== undefined;
    if (options.scale && hasOwnOptions) {
      // S5.12, D-S5-41: no longer behind `isDevMode()`, which resolved to `false` in every consumer's
      // build and deleted this line from the shipped library. The `console.warn` is now the fallback
      // for an unsubscribed consumer. Nobody can subscribe this early: the shell is still in its own
      // constructor. So this always prints in practice, which is the behaviour a misconfigured
      // `scale` deserves.
      const message =
        "GanttOptions.preset/range/fit are ignored when 'scale' is also supplied. " +
        'The shared TimeScaleModel already carries its own options — set preset/range/fit on it directly.';
      this.#raiseError({ code: 'scale-options-ignored', message, severity: 'warning', by: 'core' }, () =>
        console.warn(`FreeGantt: ${message}`),
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
      options.variantRegistry ??
        createVariantRegistry({
          fieldFor: (key) => this.#options.dataset.field(key),
          reportDoubleClaim: this.#reportDoubleClaim(),
          reportUnknownFieldMatch: this.#reportUnknownFieldMatch(),
        }),
    );
    // ADR 0022 §5: right after the registry it reads, and after `ensureBaseStyles` (above). A
    // variant's own rule must land after the base sheet. Only then can it cancel `.fg-bar`'s
    // background and state ring at equal specificity. Starts empty; `#installConsumerVariants` fills it.
    this.#variantStyles = attachVariantStyles(this.#container.ownerDocument, this.#registrations.variants);
    // Before the first frame, not after it (`J38`). `bind()` below fires its own `onChange`
    // synchronously, and that onChange IS this shell's first render. A consumer variant installed
    // after it would paint nothing until something else invalidated the frame.
    this.#installConsumerVariants(options.variants ?? []);
    this.#bindColumns();

    // Mount before binding (#22). The render target exists by the time the binding's own onChange
    // fires, and that onChange IS this shell's first render. So there is no construction-order
    // exception to document, and no separate explicit render() call after bind().
    this.#backend =
      options.backend ??
      createDomBackend({
        entryById: (id) => this.#options.dataset.entries.get(id),
        raiseError: this.#raiseError,
        readBarLabels: () => this.#frameSettings.barLabels,
        readDateLineLabelPlacement: () => this.#frameSettings.dateLineLabelPlacement,
        // ADR 0018, `J40`: a variant's own `paint` first, because it names the rows it covers. Then
        // `barRenderer`, the catch-all for every bar no variant paints — which is what the retired
        // map's `'*'` entry meant. D-S5-11 still orders that catch-all: the consumer's own
        // `barRenderer` beats a plugin's whole-point `bar` renderer.
        //
        // **Core's own `parent` paint is a rule too, so it also answers before the catch-all**
        // (`J61`). A consumer who wants to paint a summary row writes a variant that claims it.
        // Their rule then beats core's by rank, which is what D-S5-11 asks for.
        resolveBarRenderer: (entry) => this.#paintFor(entry),
        // S5.4, D-S5-11: `render/dom` never receives `ResolvedColumn` (`column.format` "never
        // reaches a backend", `layout/column.ts`). So this binds it in here instead. render/dom
        // only ever calls an already-column-bound function, keyed by the same `FrameColumn.field`
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
                  fieldValue: this.#fieldValueForCell(ctx.entry, column.field),
                }),
            };
          }
          const resolved = this.#registrations.renderers.resolve('cell', this.#frameSettings.cellRenderer);
          if (resolved === undefined) return undefined;
          const cellRenderer = resolved.renderer;
          return {
            renderer: (ctx) =>
              cellRenderer({ ...ctx, column, fieldValue: this.#fieldValueForCell(ctx.entry, column.field) }),
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
    // #179: one ports object for this Gantt's whole life, which is what `GanttShellPorts`' own doc
    // has always said. Every member is either a field already assigned above, or a closure that
    // reads live state at call time. So nothing in it goes stale between two installs, and a page
    // that installs six plugins no longer allocates six copies of it.
    const shellPorts = this.#shellPorts();
    this.#pluginRuntime = new PluginRuntime<unknown>((pluginId) => {
      const { parts, gate } = buildPluginPorts(shellPorts, pluginId);
      const context = (options.wiring.buildPluginContext ?? (() => ({})))(parts);
      return { context, disposables: parts.disposables, registrationGate: gate };
    }, this.#raiseError);

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
      this.#segmentSelection.forgetSegmentsTheDatasetDropped(changeSet);
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
    // #127/#139: the splitter proposes a raw px delta, and `GridPaneWidth` applies both bounds on
    // the way in. So a drag can reach neither below `minGridWidth` nor past the last column's edge.
    this.#splitterAttachment = attachSplitter(this.#panes.splitter, {
      readGridWidth: () => this.#gridPaneWidth.width,
      readMinWidth: () => this.#gridPaneWidth.floor,
      // S5.11: `aria-valuemax` and `End` both want a concrete number. The #139 ceiling already
      // names one whenever the columns do. A `flex` column names none, so this falls back to the
      // container's own outer bound (`PaneLayout.bounds()`, D-S5-8's same clamp). The pane
      // physically cannot outgrow the Gantt it sits in, ceiling or not.
      readMaxWidth: () => this.#gridPaneWidth.ceiling ?? this.#paneLayout.bounds().width,
      previewGridWidth: (px) => {
        this.#paneLayout.gridWidth = this.#gridPaneWidth.previewDrag(px);
      },
      commitGridWidth: (px) => this.#gridPaneWidth.commitDrag(px),
    });
    this.#interactions = options.interactions ?? {};
    this.#snap = options.snap;
    this.#viewportGestures = options.viewportGestures ?? {};
    this.#resolvedViewportGestures = resolveViewportGestures(this.#viewportGestures);
    this.#capabilities = this.#resolveCapabilities();
    this.#segmentSelection = new SegmentSelection(this.#segmentSelectionPorts());
    this.#treeCollapse = new TreeCollapse({
      plannedRows: () => this.#layout.plannedRows(),
      entries: () => this.#options.dataset.entries.all,
      entry: (id) => this.#options.dataset.entries.get(id),
      canSelect: (id) => this.#canGesture('select', id),
      selected: () => this.selectedEntryIds[0],
      proposeSelection: (ids) =>
        this.#segmentSelection.propose(this.#options.dataset.entries.segmentIdsOfEntries(ids)),
      confirm: (change) =>
        this.#proposeChange('beforeCollapseChange', 'collapseChange', change, () => {
          this.#layout.invalidateFrom(0);
          this.#frames.request();
        }),
      rowIdForEntry: (id) => this.#layout.rowIdForEntry(id),
      ancestorRowIds: (id) => this.#layout.ancestorRowIds(id),
    });
    this.#rovingFocus = new RovingFocus(this.#panes, this.#rovingFocusPorts());
    this.#liveRegion = new LiveRegion(this.#container, this);
    this.#liveRegion.attach();
    this.#gesturePipeline = new GesturePipeline({
      timeZone: () => this.#options.dataset.timeZone,
      timeScale: () => this.#viewport.timeScale,
      preset: () => this.#viewport.preset,
      snap: () => this.snap,
      selectedSegmentIds: () => this.#segmentSelection.segmentIds,
      selectedEntryIds: () => this.selectedEntryIds,
      entryById: (id) => this.#options.dataset.entries.get(id),
      canGesture: (capability, id, edge) => this.#canGesture(capability, id, edge),
      entriesMovedBy: (entry) => this.#capabilities.entriesMovedBy(entry),
      commitEntryEdits: (edits) => this.#options.wiring.commitEntryEdits?.(edits) ?? false,
      emit: (name, payload) => this.#emit(name, payload),
      raiseError: this.#raiseError,
      ...(options.extraEditsFor ? { extraEditsFor: options.extraEditsFor } : {}),
      committedEntriesById: () => this.#options.dataset.entries.storedValues,
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
      hitTest: (at) => this.#backend.hitTest(at) ?? undefined,
      entryFor: (item) => this.#entryFor(item),
      can: (capability, entry, edge) => this.#capabilities.can(capability, entry, edge),
      // #230 R4: `interaction/` asks one collaborator, not eight. `SegmentSelection` answers all of
      // it but the two projections that are not its own — the Dataset's and the frame's.
      selection: {
        segmentIds: () => this.#segmentSelection.segmentIds,
        entryIds: () => this.#segmentSelection.entryIds,
        propose: (next) => this.#segmentSelection.propose(next),
        selectableEntriesInRowOrder: () => this.#segmentSelection.selectableEntriesInRowOrder(),
        selectableSegmentsInRowOrder: () => this.#segmentSelection.selectableSegmentsInRowOrder(),
        selectableSegmentsOf: (hit) => this.#segmentSelection.selectableSegmentsOf(hit),
        segmentIdsOfEntries: (ids) => this.#options.dataset.entries.segmentIdsOfEntries(ids),
        segmentIdsForItem: (item) => this.#layout.segmentIdsForItem(item),
      },
      setHovered: (item) => this.#setHovered(item),
      setHoveredRow: (rowId) => this.#setHoveredRow(rowId),
      contentXAtPaneOffset: (offsetX) => offsetX + this.#viewport.scroll.state.position.x,
      session: (grabbed, gesture) => this.#gesturePipeline.session(grabbed, gesture),
      discardHeldGesture: () => this.#gesturePipeline.discardHeldGesture(),
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
    // S5.11, D-S5-39: scoped to the timeline pane, not the whole container. A bar's nudge/resize
    // is that pane's own job now. The grid pane's arrows belong to `#rovingFocus` instead.
    this.#keyboardEditing = options.wiring.keyboardEditing?.(this.#panes.timeline, gestureContext);
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
    // N7: applied through the same live setters `api/gantt.ts` used to call *after* this
    // constructor returned. They moved here, ahead of the first flush below. A constructor-supplied
    // plugin's variant, keybinding or command now reaches frame 1, and so does a zoom or a selection.
    // Every collaborator these setters touch (`#registrations`, `#commandRegistry`, `#keymap`,
    // `#segmentSelection`, `#viewport`) is already built above. So `setup()` sees the same shell a
    // post-construction assignment would have. `variantFor`/`Capabilities` read these registries
    // live at render time, never a cached snapshot. So applying them a few lines earlier changes
    // only which frame the result first appears in.
    // ADR 0019: the Dataset's plugins are held first, so the one assignment below installs both
    // sets under one `requires` order. It runs even for an empty chrome list, because the Dataset's
    // own `view` halves still have to reach frame 1.
    this.#datasetPlugins = options.datasetPlugins ?? [];
    this.plugins = options.plugins ?? [];
    if (options.zoomPresets !== undefined) this.zoomPresets = options.zoomPresets;
    if (options.selectedSegmentIds !== undefined) this.selection = options.selectedSegmentIds;
    this.#phase = 'live';
    this.#frames.flush();

    this.#darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.#darkSchemeQueryListener = () => this.#syncResolvedTheme();
    this.#darkSchemeQuery.addEventListener('change', this.#darkSchemeQueryListener);
    // #330/#376: the true baseline, resolved before this Gantt writes its own `data-fg-theme` (if
    // any). The write below then diffs `#syncResolvedTheme` against a real prior answer, never
    // `undefined`. `#emit` (below) is what keeps construction's own write silent now. This ordering
    // is a correctness question for the field, not a leak-prevention trick for the event.
    this.#reportedTheme = resolveTheme(this.#container, this.#matchMedia);
    if (options.theme !== undefined) this.theme = options.theme;
    else this.#applyTheme();
    // #375: an ancestor's own pin (#271) can move this Gantt's resolved theme with no write of its
    // own. `attributeFilter` wakes this only on a `data-fg-theme` write, anywhere under the watched
    // root. That includes the library's own write in `#applyTheme`, which re-enters here and emits
    // nothing, because the computed answer didn't move.
    // The root to watch: `getRootNode()` answers whatever root `#container` has right now. A
    // container built inside a detached tree keeps an `Element`/`Document` root today, before the
    // app ever mounts it. Any ancestor it gains on mount is still an ancestor of that same root.
    // Watching `ownerDocument` covers both the mounted and the not-yet-mounted case. A `ShadowRoot`
    // is the one exception: it stays its own boundary (a `DOCUMENT_FRAGMENT_NODE`), matching
    // `resolveTheme`'s own `closest()` walk, which never crosses it either.
    const themePinRoot = this.#container.getRootNode();
    const themePinTarget =
      themePinRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? themePinRoot : this.#container.ownerDocument;
    this.#themePinObserver = new MutationObserver(() => this.#syncResolvedTheme());
    this.#themePinObserver.observe(themePinTarget, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-fg-theme'],
    });
    this.a11yLabel = options.a11yLabel ?? DEFAULT_A11Y_LABEL;
    // #376: last line, on purpose — a constructor-supplied plugin's own subscription, installed by
    // `plugins=` above, starts hearing real changes only from here. Everything above it was wiring.
    this.#constructed = true;
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

  /** The columns the consumer authored, and only those (D-S5-33, #181). A plugin's registered column
   *  renders. It stays out of this list, because it is the plugin's declaration and not this Gantt's
   *  configuration. A resize or a reorder does not change that. So the documented save round-trip
   *  (`gantt.on('gridColumnsChange', ({ to }) => save(to.map((c) => c.field)))`) never persists a
   *  column whose plugin the next load leaves out. */
  get gridColumns(): readonly GridColumnInput[] {
    return this.#columnChrome.authoredColumns;
  }

  /** A plain reconfiguration still runs the same cancelable commit sequence a resize drag or a
   *  reorder drop runs (S5.7, D-S5-18). One write path, one place the veto lives. `set gridWidth`
   *  above already takes the same posture for the splitter. */
  set gridColumns(columns: readonly GridColumnInput[]) {
    this.#columnChrome.commit(columns);
  }

  /** S5.7, D-S5-34: which of this Gantt's own columns are hidden, by field key. Read it to label a
   *  column chooser. A plugin's column is the plugin's declaration, so this getter reports the
   *  consumer's hidden columns only — the same rule `gridColumns` above follows. */
  get hiddenGridColumns(): readonly FieldKey[] {
    return this.#columnChrome.hiddenColumns;
  }

  /** S5.7, D-S5-34: takes one column off the screen and leaves the other columns alone. The hidden
   *  column keeps its width and its position, so `showGridColumn` puts it back where it was. Runs
   *  the cancelable commit sequence a resize drag runs, so it raises
   *  `beforeGridColumnsChange`/`gridColumnsChange` and a handler can refuse it. Throws
   *  `UnknownGridColumnError` when no declared column names the field. */
  hideGridColumn(field: FieldKey): void {
    this.#columnChrome.commitHidden(field, true);
  }

  /** S5.7, D-S5-34: the twin of `hideGridColumn`. Puts a hidden column back at its own place in the
   *  order, with the width it had. */
  showGridColumn(field: FieldKey): void {
    this.#columnChrome.commitHidden(field, false);
  }

  /** Live (J1). Reassigning repaints every bar with no remount (I8) — same posture as `barRenderer`
   *  just below. */
  get barLabels(): BarLabels {
    return this.#frameSettings.barLabels;
  }

  set barLabels(barLabels: BarLabels) {
    this.#frameSettings.set({ barLabels });
  }

  /** Live (S5.4, D-S5-11). Reassigning repaints every bar with no remount (I8). */
  get barRenderer(): BarRenderer | undefined {
    return this.#frameSettings.barRenderer;
  }

  set barRenderer(renderer: BarRenderer | undefined) {
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
    if (this.#emit(before, change) === false) {
      rollback?.();
      return false;
    }
    apply();
    this.#emit(after, change);
    return true;
  }

  /** #376: the one door every emit in this class goes through. "No event fires before construction
   *  ends" is one `if` here, not a copy of it at each call site a future event adds. Short-circuits
   *  to the answer an `EventBus` with no handlers gives — `true`, never vetoed. A plugin's
   *  subscription exists by now, but construction itself reports no change for it to hear. */
  #emit<K extends keyof GanttEventMap>(
    name: K,
    payload: GanttEventMap[K],
  ): K extends AsyncCancelableEvent ? boolean | Promise<boolean> : boolean {
    if (!this.#constructed) return true;
    return this.#events.emit(name, payload);
  }

  get todayLine(): boolean | Instant {
    return this.#frameSettings.todayLine;
  }

  set todayLine(on: boolean | Instant) {
    this.#frameSettings.set({ todayLine: on });
  }

  get dateLines(): readonly DateLine[] {
    return this.#frameSettings.dateLines;
  }

  set dateLines(lines: readonly DateLine[]) {
    this.#frameSettings.set({ dateLines: lines });
  }

  get dateLineLabelPlacement(): DateLineLabelPlacement {
    return this.#frameSettings.dateLineLabelPlacement;
  }

  set dateLineLabelPlacement(placement: DateLineLabelPlacement) {
    this.#frameSettings.set({ dateLineLabelPlacement: placement });
  }

  get todayLineMarginTicks(): number {
    return this.#frameSettings.todayLineMarginTicks;
  }

  /** Live — takes effect on the next `panToToday()` call; does not itself move the scroll position. */
  set todayLineMarginTicks(ticks: number) {
    this.#frameSettings.set({ todayLineMarginTicks: ticks });
  }

  /** The Selection itself (#212, ADR 0010) — Segment ids. */
  get selection(): readonly SegmentId[] {
    return this.#segmentSelection.segmentIds;
  }

  /** Live; runs the same cancelable sequence a click runs (D-S3-10). Loose in (`SegmentId | string`),
   *  branded out — the same asymmetry `dataset.entries.get/update/remove` already ship. */
  set selection(ids: readonly (SegmentId | string)[]) {
    this.#segmentSelection.propose(ids.map((id) => segmentId(id)));
  }

  /** The Entries the Selection's Segments belong to, deduped, in row order (#212, ADR 0010). It is
   *  one projection. The public getter, the affordance ids, the gesture pipeline and every command
   *  context read it. So no two of them can disagree about what is selected. */
  get selectedEntryIds(): readonly EntryId[] {
    return this.#segmentSelection.entryIds;
  }

  get variants(): readonly EntryVariant[] {
    return this.#variants;
  }

  /** Live (ADR 0018): replaces the consumer's own variant list. Every row resolves its variant again,
   *  every row produces its Items again, and every capability re-resolves — one registration changes
   *  all three. A plugin's variants are untouched, and they still lose to these. */
  set variants(next: readonly EntryVariant[]) {
    this.#installConsumerVariants(next);
    this.#layout.invalidateFrom(0);
    this.#refreshCapabilities();
    this.#frames.request();
  }

  /** The whole variant this Gantt resolved for one row (ADR 0018, ADR 0022 §3). One door answers
   *  `items`/`paint`/`can`/`css` together. No caller looks a name up again (F3,
   *  `plans/row-redesign/BUILD-LOG.md`). `render/` and `interaction/` read the same answer.
   *  `CommandContext.variant` and the two callers that want the name alone read `.name`.
   *
   *  Not `entry.variant`. An Entry belongs to a Dataset. A variant resolves per Gantt. I2 lets two
   *  Gantts on one Dataset paint the same row differently. `entry.variant` would have to pick one
   *  answer, and would be wrong on the other Gantt (ADR 0017 is about the row, not this door). */
  variantFor(entry: Entry): ResolvedVariant {
    return this.#registrations.variants.resolveFor(entry);
  }

  /** Drops whatever the consumer's list held before, then adds the new one. Registration order
   *  inside the list is the author's own, and the newest of two overlapping rules wins.
   *
   *  ADR 0022 §5: also rewrites `#variantStyles`. That is the other thing a variant registration
   *  changes, so a consumer's own `css` reaches the document on the same edge every other seam does. */
  #installConsumerVariants(next: readonly EntryVariant[]): void {
    for (const retract of this.#consumerVariantDisposers) retract();
    this.#variants = next;
    this.#consumerVariantDisposers = next.map((variant) =>
      this.#registrations.variants.addConsumerVariant(variant),
    );
    this.#variantStyles.refresh();
  }

  /** Who paints this bar: the resolved variant's own `paint`, or the catch-all renderers when it
   *  has none. One ladder, and `resolveBarRenderer` is its only caller.
   *
   *  It reads the row, never the variant's name. Two registrations may share one name. A lookup by
   *  name can then answer with the paint of a rule that did not claim this row (`F3`). No
   *  `pluginId` on the answer: a variant's paint is named by the variant, and the double-claim
   *  diagnostic is what names a plugin. */
  #paintFor(entry: Entry): ResolvedRenderer<BarRenderer> | undefined {
    const paint = this.#registrations.variants.resolveFor(entry).paint;
    if (paint !== undefined) return { renderer: paint };
    return this.#registrations.renderers.resolve('bar', this.#frameSettings.barRenderer);
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

  /** D-S5-35: writes one gesture's rule and leaves every other rule standing. It replaces the value
   *  it holds with a copy, so the object a consumer assigned is never mutated (`plans/02` §2). */
  setCapabilityRule<K extends keyof Interactions>(capability: K, rule: NonNullable<Interactions[K]>): void {
    this.#interactions = { ...this.#interactions, [capability]: rule };
    this.#refreshCapabilities();
  }

  /** D-S5-35: drops this Gantt's own rule for one gesture. A variant's own `can` and the library
   *  table answer that gesture again. Clearing a gesture that carries no rule changes nothing. */
  clearCapabilityRule(capability: keyof Interactions): void {
    if (this.#interactions[capability] === undefined) return;
    const next = { ...this.#interactions };
    delete next[capability];
    this.#interactions = next;
    this.#refreshCapabilities();
  }

  /** `SegmentSelection`'s one ports object (#230 R4) — the shell's own state, behind the closures
   *  `SegmentSelectionPorts` names. `confirm`/`announce` reuse the shell's own `#proposeChange`/
   *  `#events`, so a Selection change is one more line in `ProposableChange`, not a second veto path.
   *  `paint` writes the backend's own state and re-derives hover/gesture affordances from it — the
   *  same pair every direct `#selection` write used to make by hand. */
  #segmentSelectionPorts(): SegmentSelectionPorts {
    return {
      entries: () => this.#options.dataset.entries,
      plannedRows: () => this.#layout.plannedRows(),
      rowIdForEntry: (id) => this.#layout.rowIdForEntry(id),
      segmentIdsForItem: (id) => this.#layout.segmentIdsForItem(id),
      canGesture: (capability, id) => this.#canGesture(capability, id),
      confirm: (change, apply) =>
        this.#proposeChange('beforeSelectionChange', 'selectionChange', change, apply),
      announce: (change) => this.#emit('selectionChange', change),
      paint: (segmentIds) => {
        this.#interactionState.selectedSegmentIds = segmentIds;
        this.#refreshAffordances();
      },
    };
  }

  /** S5.9, D-S5-22: the one place `resolveCapabilities` is called. The constructor, `set
   *  interactions` and `set variants` all re-derive from here, rather than repeating the call. */
  #resolveCapabilities(): Capabilities {
    return resolveCapabilities({
      interactions: this.#interactions,
      fieldFor: (key) => this.#options.dataset.field(key),
      variantInteractionsFor: (entry) => this.#registrations.variants.resolveFor(entry).can,
    });
  }

  /** `set interactions` and a variant registration's register/dispose pair both change an input
   *  `#resolveCapabilities` reads. So both re-resolve the capability table and re-derive the
   *  affordance ids the same way (#154). This method writes that once, instead of three times. The
   *  constructor's own first resolve (above) runs before `#refreshAffordances` has anything to
   *  refresh, so it calls `#resolveCapabilities()` directly and skips this. */
  #refreshCapabilities(): void {
    this.#capabilities = this.#resolveCapabilities();
    this.#refreshAffordances();
  }

  /** D-S3-24: what a drag snaps to right now — this Gantt's own setting when it states one, else
   *  the showing preset's, else `'tick'`. A gesture resolves `'tick'` against the preset it is
   *  measuring. */
  get snap(): SnapSetting {
    return this.#snap ?? this.#viewport.preset.snap ?? 'tick';
  }

  /** Live (D-S3-24). The next drag reads it; nothing repaints. `undefined` hands the answer back to
   *  the showing preset. A concrete `{ unit, increment }` is checked here. A bad unit or a
   *  non-advancing increment throws on assignment. Otherwise it would surface two gestures later,
   *  inside a drag (#201). `isTimeUnit` lets a caller check the unit before it reaches this setter. */
  set snap(next: SnapSetting | undefined) {
    if (next !== undefined && next !== 'tick' && next !== 'none') {
      if (!isTimeUnit(next.unit)) {
        throw new UnsupportedUnitError(String(next.unit), 'gantt.snap');
      }
      if (!Number.isInteger(next.increment) || next.increment <= 0) {
        throw new InvalidSnapIncrementError(next.unit, next.increment);
      }
    }
    this.#snap = next;
  }

  get viewportGestures(): ViewportGestures {
    return this.#viewportGestures;
  }

  /** Live (S3.7, D-S3-14): the next wheel or key reads the new flags; no remount. */
  set viewportGestures(next: ViewportGestures) {
    this.#viewportGestures = next;
    this.#resolvedViewportGestures = resolveViewportGestures(next);
  }

  /** S5.2, D-S5-6: the live `CommandContext` builder.
   *
   *  `entry` is the first selected entry, or `undefined` when nothing is selected. `target` names
   *  what real keyboard focus sits on right now (S5.11, D-S5-39), one of the five `TargetKind`s.
   *
   *  A keyboard chord has no right-clicked node to reconcile against the Selection. So `target`'s
   *  `entryIds`/`segmentIds` name the Selection directly, for every kind but `'header'` and
   *  `'splitter'` (#212). `when`/`run` then read `ctx.target.entryIds` exactly as a mouse invocation
   *  does. `api/gantt.ts`'s injected `buildCommandContext` fills `dataset`/`gantt` — `view/` may not
   *  name either type (D-S5-5's mirror).
   *
   *  A `wiring` with no `buildCommandContext` makes every command's context an empty object, for a
   *  test that drives the shell alone. That is fine. No core command reads `ctx.dataset`/`ctx.gantt`
   *  without first checking `ctx.entry`/`ctx.target`, and no such test runs a command that needs
   *  them. */
  #buildCommandContext(): CommandContext<unknown> {
    const segmentIds = this.#segmentSelection.segmentIds;
    const entryIds = this.#segmentSelection.entryIds;
    const id = entryIds[0];
    const entry = id !== undefined ? this.#options.dataset.entries.get(id) : undefined;
    // S5.11, D-S5-39: real DOM focus is the single source of truth for "what is the target of
    // this chord". `view/roving-focus.ts` moves focus onto the exact node a chord acts on —
    // a row, a cell, a bar, a header cell, or the splitter.
    const focused = this.#rovingFocus.focusedElement();
    const domTarget = focused !== undefined ? this.#dom.targetUnder(focused) : undefined;
    // #199/#212: no node holds focus (an empty pane) — fall back to the Selection alone.
    const target =
      domTarget === undefined
        ? segmentIds.length > 0
          ? { kind: 'bar' as const, entryIds, segmentIds }
          : undefined
        : this.#targetFromDom(domTarget, entryIds, segmentIds);
    // `view/` may not name `CommandContextOf`'s api-level fields (`dataset: Dataset`, `gantt`),
    // D-S5-5's mirror. So this cast trusts `api/gantt.ts`'s injected `buildCommandContext` to fill
    // them. `buildPluginContext` above already gets the same trust for `PluginContext`.
    return (this.#options.wiring.buildCommandContext ?? (() => ({})))({
      ...(entry !== undefined ? { entry, variant: this.variantFor(entry).name } : {}),
      ...(target !== undefined ? { target } : {}),
    }) as CommandContext<unknown>;
  }

  /** The `CommandTarget` a resolved `DomTarget` names (S5.11, D-S5-39). `'header'` and `'splitter'`
   *  stand for no Entry and no Segment, so both name empty sets, matching `DomTarget`'s own contract.
   *  Every other kind names the current Selection. A keyboard chord has no separate "clicked" thing
   *  to reconcile the Selection against (this file's own doc comment above). */
  #targetFromDom(domTarget: DomTarget, entryIds: readonly EntryId[], segmentIds: readonly SegmentId[]) {
    // Each arm returns an object literal with its own `kind` literal, never `domTarget.kind` read
    // straight through. That keeps the inferred return type the exact union `CommandTarget` names.
    // Widening `kind` to plain `TargetKind` would lose that precision.
    switch (domTarget.kind) {
      case 'header': {
        const field = domTarget.field;
        return field !== undefined
          ? { kind: 'header' as const, field, entryIds: [], segmentIds: [] }
          : { kind: 'bar' as const, entryIds, segmentIds };
      }
      case 'splitter':
        return { kind: 'splitter' as const, entryIds: [], segmentIds: [] };
      case 'row':
        return { kind: 'row' as const, entryIds, segmentIds };
      case 'cell':
        return domTarget.field !== undefined
          ? { kind: 'cell' as const, field: domTarget.field, entryIds, segmentIds }
          : { kind: 'cell' as const, entryIds, segmentIds };
      case 'bar':
        return { kind: 'bar' as const, entryIds, segmentIds };
    }
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
      selectAll: () => this.#segmentSelection.propose(this.#segmentSelection.selectableSegmentsInRowOrder()),
      clearSelection: () => this.#segmentSelection.propose([]),
      hasSelection: () => this.#segmentSelection.segmentIds.length > 0,
      keyboardPanEnabled: () => this.#resolvedViewportGestures.keyboardPan,
      nothingSelected: () => this.#segmentSelection.segmentIds.length === 0,
      selectNextSegment: () => this.#segmentSelection.step(1),
      selectPreviousSegment: () => this.#segmentSelection.step(-1),
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

  /** `view/roving-focus.ts`'s one seam back into this shell (S5.11). `revealRow`/`revealEntry` force
   *  a synchronous `#frames.flush()` after adjusting the viewport. `RovingFocus` needs the new row
   *  or bar node in the DOM the instant the call returns, so it can call `.focus()` on it. That
   *  differs from the public `reveal()` method above, whose own flush only runs on the
   *  collapsed-ancestor branch. */
  #rovingFocusPorts(): RovingFocusPorts {
    return {
      plannedRows: () => this.#layout.plannedRows(),
      columnKeys: () => this.#columnChrome.resolvedColumns.map((column) => column.field),
      rowIdForEntry: (id) => this.#layout.rowIdForEntry(id),
      rowsPerPage: () =>
        Math.max(1, Math.floor(this.#viewport.visible.height / this.#frameSettings.rowHeight)),
      collapseRow: (id) => this.#treeCollapse.collapse(id),
      expandRow: (id) => this.#treeCollapse.expand(id),
      selectOnFocus: (hit) =>
        this.#segmentSelection.propose(this.#segmentSelection.selectableSegmentsOf(hit)),
      setFocusedColumn: (field) => this.#columnChrome.setFocusedColumn(field),
      revealRow: (index) => {
        const y = this.#layout.rowTop(index);
        this.#viewport.reveal({
          x: this.#viewport.scroll.state.position.x,
          y,
          width: 0,
          height: this.#frameSettings.rowHeight,
        });
        this.#frames.flush();
      },
      revealEntry: (id) => {
        this.reveal(id);
        this.#frames.flush();
      },
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
      ...(options.dateLineLabelPlacement !== undefined
        ? { dateLineLabelPlacement: options.dateLineLabelPlacement }
        : {}),
      ...(options.rowSource !== undefined ? { rowSource: options.rowSource } : {}),
      ...(options.barLabels !== undefined ? { barLabels: options.barLabels } : {}),
      ...(options.todayLineMarginTicks !== undefined
        ? { todayLineMarginTicks: options.todayLineMarginTicks }
        : {}),
    };
  }

  /** `plugin-ports.ts`'s one seam back into this shell's own registries, frame loop and event bus
   *  (that file's doc explains why it needs each of these). `buildPluginPorts` never touches a shell
   *  field directly. Called once, in the constructor (#179). Every member that is not a field is a
   *  closure, so each one reads live state at call time. A reassigned `#capabilities` or a fresh
   *  `#lastBarById` reaches every plugin that holds the port. */
  #shellPorts(): GanttShellPorts {
    return {
      events: this.#pluginEvents,
      raiseError: this.#raiseError,
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
      canWrite: (entry, field) => this.#capabilities.canWrite(entry, field),
      variantFor: (entry) => this.variantFor(entry),
      proposeEntryEdit: (payload) => this.#emit('beforeEntryEdit', payload),
      announceEntryEdit: (payload) => {
        this.#emit('entryEdit', payload);
      },
      focusedCell: () => this.#focusedCell(),
    };
  }

  /** S5.11, D-S5-39: which cell real keyboard focus sits on, if any. This runs the same `DomTarget`
   *  resolution `#buildCommandContext` runs for a chord, read here for `ctx.view.focusedCell()`
   *  instead. `Enter` is `inline-editing.ts`'s first caller: it retired the "open the first editable
   *  column" stand-in the day roving focus shipped a real per-cell answer. */
  #focusedCell(): { entryId: EntryId; field: FieldKey } | undefined {
    const focused = this.#rovingFocus.focusedElement();
    const target = focused !== undefined ? this.#dom.targetUnder(focused) : undefined;
    if (target?.kind !== 'cell' || target.entry === undefined || target.field === undefined) {
      return undefined;
    }
    return { entryId: target.entry.id, field: target.field };
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
      refreshVariantStyles: () => this.#variantStyles.refresh(),
      registerGridColumn: (column, pluginId) => this.#columnChrome.registerPluginColumn(column, pluginId),
    };
  }

  /** Where a `DoubleVariantClaim` is reported (Q10, ADR 0018). Two plugins' rules both claimed one
   *  Entry. The newest paints and the older draws nothing. This names both, so the consumer sees
   *  which two plugins overlap. The library never arbitrates — the consumer chose the plugins.
   *
   *  One report per pair of variants, not one per hover. `variantFor` runs on every hover change,
   *  and the same two plugins collide on every Entry they both own. The first collision is the news.
   *
   *  Not behind `isDevMode()`, for the reason D-S5-41 already found on `'scale-options-ignored'`.
   *  That flag resolves when the *library* is built. A dev-mode gate would therefore delete this
   *  line from every consumer's build, and the warning would never fire for anybody. The
   *  `console.warn` fallback runs only when nothing is subscribed to `error`. */
  #reportDoubleClaim(): ReportDoubleClaim {
    const reported = new Set<string>();
    return ({ entryId, painted, ignored }) => {
      const pair = `${painted.variant}|${ignored.variant}`;
      if (reported.has(pair)) return;
      reported.add(pair);
      const by = (claimant: VariantClaimant): string =>
        claimant.pluginId === undefined
          ? `'${claimant.variant}'`
          : `'${claimant.variant}' (${claimant.pluginId})`;
      const message =
        `Two variant rules both cover entry '${entryId}': ${by(painted)} and ${by(ignored)}. ` +
        `The newest registered rule paints; ${by(ignored)} draws nothing on the entries they share.`;
      this.#raiseError(
        { code: 'variant-claimed-twice', message, severity: 'warning', by: 'core', entryId },
        () => console.warn(`FreeGantt: ${message}`),
      );
    };
  }

  /** Where an `UnknownFieldMatch` is reported (`J59`). A `when` names a key no Field declares, so
   *  the rule claims no row — a typo, or a plugin key the Dataset never declared. The frame keeps
   *  drawing; this says what stopped matching.
   *
   *  One report per rule and key, not one per row. A rule that names a missing key names it on
   *  every row of every pass, and the first row is the news. The rule itself holds that set —
   *  `compileRule` — so nothing allocates on the hover path after the first report. */
  #reportUnknownFieldMatch(): ReportUnknownFieldMatch {
    return ({ rule, key }) => {
      const owner = rule.pluginId === undefined ? '' : ` (${rule.pluginId})`;
      const message =
        `The variant rule '${rule.variant}'${owner} matches on field '${key}', and no Field declares it. ` +
        `It claims no row. Declare the field on the Dataset, or correct the key.`;
      this.#raiseError(
        { code: 'unknown-variant-field', message, severity: 'warning', by: 'core', field: key },
        () => console.warn(`FreeGantt: ${message}`),
      );
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
    // S5.11, D-S5-26: roving focus (`view/roving-focus.ts`) now owns the plain arrows, Home/End
    // and Page Up/Down in both panes. A grid-pane arrow moves focus between rows and cells. A
    // timeline-pane arrow nudges the focused bar instead (`interaction/keyboard-editing.ts`).
    // Panning gets no plain chord at all, because moving focus already scrolls the target into
    // view. Horizontal panning survives as an explicit, Gantt-wide fallback on
    // `Alt+ArrowLeft`/`Alt+ArrowRight`. Vertical panning gets none, since a focused row is always
    // already visible. `Mod+Home`/`Mod+End` are the same fallback for the whole time axis. That
    // differs from the grid pane's own `Home`/`End`, which jump to the first and last row.
    bind('Alt+ArrowRight', 'freegantt.panRight');
    bind('Alt+ArrowLeft', 'freegantt.panLeft');
    bind('Mod+Home', 'freegantt.panToStart');
    bind('Mod+End', 'freegantt.panToEnd');
    // S5.11, D-S5-26: keyboard zoom did not exist before this slice (S3.7 shipped only the
    // ctrl/⌘+wheel pointer gesture). `Mod+=`/`Mod+-` mirror the browser's own page-zoom chords;
    // `Mod+0` mirrors the browser's own reset-zoom chord, repurposed here for "pan to today".
    bind('Mod+=', 'freegantt.zoomIn');
    bind('Mod+-', 'freegantt.zoomOut');
    bind('Mod+0', 'freegantt.panToToday');
    bind('Mod+A', 'freegantt.selectAll');
    bind('Escape', 'freegantt.clearSelection');
    // #119: the whole-Gantt undo/redo chord. `captureInEditable` stays at its default `false`
    // (same gate `Delete` below relies on), so an `<input>`'s own native undo keeps this chord.
    bind('Mod+Z', 'freegantt.undo');
    bind('Mod+Shift+Z', 'freegantt.redo');
    // S5.7, D-S5-18/D-S5-26: `resizeColumnWider`/`moveColumnRight` and their pair share a chord
    // with `panRight`/`panLeft` above. `Keymap.resolve()`'s newest-first order (D-S5-7) checks
    // these two first. Their own `when` refuses unless a header cell is focused, so an unfocused
    // header falls through to the plain pan bound above it.
    bind('Shift+ArrowRight', 'freegantt.resizeColumnWider');
    bind('Shift+ArrowLeft', 'freegantt.resizeColumnNarrower');
    bind('Alt+ArrowRight', 'freegantt.moveColumnRight');
    bind('Alt+ArrowLeft', 'freegantt.moveColumnLeft');
    // #212, ADR 0010: the Selection holds Segments. So a keyboard user needs a way to move it from
    // one bar of a row to the next. `interaction/keyboard-editing.ts` leaves a modified arrow alone,
    // so this chord never also nudges the entry it just reselected.
    bind('Mod+ArrowRight', 'freegantt.selectNextSegment');
    bind('Mod+ArrowLeft', 'freegantt.selectPreviousSegment');
    // #212, ADR 0010: the same command the right-click menu offers. `captureInEditable` stays at
    // its default `false` — Keymap's own gate. So a cell editor's `<input>` and mid-IME composition
    // both refuse the chord, the same way every other core binding already does.
    bind('Delete', 'freegantt.deleteSelection');
  }

  #panBy(dx: number, dy: number): void {
    const { x, y } = this.#viewport.scroll.state.position;
    this.#viewport.scroll.panTo({ x: x + dx, y: y + dy });
  }

  /** D-S3-9's one resolution, shared by the pointer path (`canSelect` above), the keyboard path
   *  (S3.5) and the affordance ids below. Never asked twice for the same gesture (I14). `edge`
   *  (#142) narrows a `'resize'` question to one handle; every other capability ignores it. */
  #canGesture(capability: GestureCapability, id: EntryId, edge?: 'start' | 'end'): boolean {
    const entry = this.#options.dataset.entries.get(id);
    return entry !== undefined && this.#capabilities.can(capability, entry, edge);
  }

  #setHovered(next: ItemId | undefined): void {
    if (this.#hoveredItemId === next) return;
    this.#hoveredItemId = next;
    this.#refreshAffordances();
  }

  #setHoveredRow(next: RowId | undefined): void {
    if (this.#hoveredRowId === next) return;
    this.#hoveredRowId = next;
    this.#refreshAffordances();
  }

  /** Which row reads as hovered. The grid pane names one directly. Over the timeline pane only a bar
   *  is under the pointer, so the row comes off the frame that drew it. Asked once per affordance
   *  refresh, never per pointer move beyond that (I5). */
  #hoveredRow(): RowId | undefined {
    if (this.#hoveredRowId !== undefined) return this.#hoveredRowId;
    if (this.#hoveredItemId === undefined) return undefined;
    return this.#layout.rowIdForEntry(entryIdOfItem(this.#hoveredItemId));
  }

  /** D-S3-6: resolves `hoveredItemId`/`movableItemId`/`resizableEntryId` from the current hover and
   *  selection, writes them into the one long-lived `InteractionState`, and applies. Called whenever
   *  any of the three inputs change — never per pointer move beyond that (I5). `exactOptionalPropertyTypes`
   *  makes "clear" a `delete`, not an `= undefined` assignment (`#setOptional` below; finding 7). */
  #refreshAffordances(): void {
    const sole = this.#segmentSelection.soleEntry();
    const ids = projectAffordances({
      hoveredItemId: this.#hoveredItemId,
      soleSelectedEntryId: sole?.id,
      selectedSegmentCountOfSoleEntry: sole?.segmentCount ?? 0,
      itemIdsForEntry: (id) => this.#layout.itemIdsForEntry(id),
      canGesture: (capability, id, edge) => this.#canGesture(capability, id, edge),
    });
    setOptional(this.#interactionState, 'hoveredItemId', ids.hoveredItemId);
    setOptional(this.#interactionState, 'hoveredRowId', this.#hoveredRow());
    setOptional(this.#interactionState, 'movableItemId', ids.movableItemId);
    setOptional(this.#interactionState, 'resizableEntryId', ids.resizableEntryId);
    setOptional(this.#interactionState, 'resizableEdges', ids.resizableEdges);
    this.#backend.applyState(this.#interactionState);
  }

  #entryFor(item: ItemId): Entry | undefined {
    return this.#options.dataset.entries.get(entryIdOfItem(item));
  }

  /** Review H3: `CellRendererContext.fieldValue`. `entry.read(key)` is the one read that answers a
   *  core, `props`-addressed or `compute` Field alike (ADR 0011, ADR 0017). It shares the memo
   *  `column.format` already uses, so a renderer branching on a number never parses `value` back.
   *  A row with no Entry (a grouping header, a custom row) has no Field value to read. */
  #fieldValueForCell(entry: Entry | undefined, key: FieldKey): unknown {
    return entry?.read(key);
  }

  get theme(): Theme {
    return this.#theme;
  }

  /** Live (S1.10, D-S1.10-4). `'auto'` writes no attribute, letting `prefers-color-scheme` (or an
   *  ancestor's own pin, #271) decide. `'light'`/`'dark'` pin `data-fg-theme` on this container
   *  instead, which wins over both. `.fg-container` declares no colour tokens of its own to contest
   *  it. (#271 fixed the opposite bug: it used to, and always won even under an ancestor's pin.) */
  set theme(value: Theme) {
    this.#theme = value;
    this.#applyTheme();
    this.#syncResolvedTheme();
  }

  #applyTheme(): void {
    if (this.#theme === 'auto') this.#container.removeAttribute('data-fg-theme');
    else this.#container.setAttribute('data-fg-theme', this.#theme);
  }

  /** #330/#375. `'auto'` answers the nearest explicit pin up the tree, else the OS. `'light'`/`'dark'`
   *  answer themselves straight back — this container's own pin is that nearest pin. Computed on
   *  every read, never cached. An ancestor's own pin (#271) can move this answer with no write of
   *  this Gantt's own. A cached copy would go stale under exactly that case (#375). The read
   *  itself is always synchronously correct. Only `themeChange`'s timing differs by cause — see
   *  `#syncResolvedTheme`. */
  get resolvedTheme(): ResolvedTheme {
    return resolveTheme(this.#container, this.#matchMedia);
  }

  /** #330/#375. Re-resolves and fires `themeChange` exactly when the answer actually moved, against
   *  `#reportedTheme` — the value the last emit reported. Called after every `theme` write, every OS
   *  `'change'` (`#darkSchemeQuery`), and every `data-fg-theme` mutation anywhere under the root node
   *  (`#themePinObserver`, #375). A write that keeps the same resolved answer fires nothing. That
   *  covers an already-`'light'` Gantt pinned to `'light'` again, or an OS flip an ancestor's pin
   *  shadows. A `theme` write reaches here synchronously. An ancestor's pin reaches here on the
   *  `MutationObserver`'s own later task, so that cause's event lands one task after the DOM write
   *  that caused it. `resolvedTheme` itself has already answered correctly by then, either way. */
  #syncResolvedTheme(): void {
    const next = resolveTheme(this.#container, this.#matchMedia);
    if (next === this.#reportedTheme) return;
    const from = this.#reportedTheme;
    this.#reportedTheme = next;
    this.#emit('themeChange', { from, to: next });
  }

  get a11yLabel(): string {
    return this.#a11yLabel;
  }

  /** Live (S1.10, D-S1.10-4): the one name a screen reader reads for this Gantt. `PaneLayout` owns
   *  where it lands — the container names the widget, the timeline pane names its region (D-S5-25). */
  set a11yLabel(value: string) {
    this.#a11yLabel = value;
    this.#paneLayout.accessibleName = value;
  }

  /** Always px: the consumer asked how wide the pane is, so the getter answers in the unit the
   *  question is about. `'fitColumns'` reads back as the width it resolved to (#157). Rules live in
   *  `grid-pane-width.ts`; this shell only wires them to the container and its DOM. */
  get gridWidth(): number {
    return this.#gridPaneWidth.width;
  }

  /** A plain reconfiguration (`plans/02` "Reconfiguration is just assignment") still runs the same
   *  cancelable commit sequence a splitter drag runs — `GridPaneWidth.resize`'s own rule. */
  set gridWidth(width: GridWidth) {
    this.#gridPaneWidth.resize(width);
  }

  get minGridWidth(): number {
    return this.#gridPaneWidth.floor;
  }

  /** Live (#127). `GridPaneWidth.setFloor`'s own rule: raising the floor above the current
   *  `gridWidth` lifts it through the same cancelable commit sequence a splitter drag runs. So a
   *  veto leaves `gridWidth` exactly where it was. */
  set minGridWidth(px: number) {
    this.#gridPaneWidth.setFloor(px);
    // S5.11: this runs on the common branch too, not only when the floor lifts `gridWidth`.
    // A lowered floor still changes what `Home` and a screen reader read as the splitter's own
    // minimum. That cannot wait for `commitWidth`'s own sync alone.
    this.#splitterAttachment?.syncAria();
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

  /** An id that names an Entry reveals the union of every Item that Entry draws. An id that instead
   *  names one of its Segments reveals the one Item that draws that Segment. When an id could be
   *  read either way, the Entry reading wins (ADR 0010, #212).
   *  Both readings share one geometry path. It asks `FrameLayout` for the row's Items, and
   *  `barSpan` for each Item's own x/width off the bound `TimeScale`. The box is included (#295),
   *  so a `diamond()` row reveals its true glyph width. That is the same formula `computeFrame`
   *  paints bars from, so the two can never drift apart. It then hands the resulting `Rect` to
   *  `Viewport.reveal` (S1.9, D-S1.9-6). When nothing paints the named target, its own dates are
   *  the target instead (`fallbackSpanItem`), so reveal never becomes a no-op.
   *  Throws `RevealTargetNotFoundError` for an id the dataset reads as neither an Entry nor a
   *  Segment (#227). `id`'s own type stays a union here: once neither reading resolves, nothing
   *  says which one the caller meant. A collapsed ancestor expands before any Item is read.
   *  `FrameLayout` answers Items from the post-collapse plan, so a row collapse hid answers empty.
   *  A still-hidden row (filter) keeps the current y — it does not jump to 0.
   *  A plain `string` is a legal id here. Both readings resolve by asking the store, never by
   *  reading the brand. */
  reveal(id: EntryId | SegmentId | string): void {
    const entries = this.#options.dataset.entries;
    const entry = entries.get(id);
    if (entry !== undefined) {
      // A non-spanning Entry draws no bar (`spansTime`, ADR 0012), so there is no x/width to
      // reveal. Only the row still shows (#232-adjacent gap surfaced by Build 1, no existing rule
      // covered it).
      if (!spansTime(entry)) return this.#revealRow(entry.id);
      return this.#revealEntrySpan(entry.id, entry.start, entry.end);
    }
    const ownerId = entries.entryIdOfSegment(id);
    const owner = ownerId === undefined ? undefined : entries.get(ownerId);
    const segment = owner?.segments.find((candidate) => candidate.id === id);
    if (owner === undefined || segment === undefined) throw new RevealTargetNotFoundError(id, 'reveal');
    return this.#revealSegmentSpan(owner.id, segment.id, segment.start, segment.end);
  }

  /** Reveals a row with no bar to target — the vertical position only. The horizontal scroll
   *  stays exactly where it was (#232-adjacent gap, ADR 0012, Build 1). */
  #revealRow(ownerId: EntryId): void {
    const rowIndex = this.#expandAndFindRow(ownerId);
    const position = this.#viewport.scroll.state.position;
    const y = rowIndex >= 0 ? this.#layout.rowTop(rowIndex) : position.y;
    // `width: 0` at the current x reads as "already visible" to `Viewport.reveal`. This moves
    // only y — the same no-op-on-x idiom `#rovingFocusPorts`'s own `revealRow` above already uses.
    this.#viewport.reveal({ x: position.x, y, width: 0, height: this.#frameSettings.rowHeight });
  }

  /** Reveals the whole Entry: the union of the painted extents of every Item it draws (#295). An
   *  ordinary bar draws one Item over the entry's own span, so this reduces to today's behaviour.
   *  A `diamond()` row's fixed box is read the same way, box included. An entry that draws no Item
   *  at all falls back to the entry's own span, so reveal never becomes a no-op. */
  #revealEntrySpan(ownerId: EntryId, start: Instant, end: Instant): void {
    const rowIndex = this.#expandAndFindRow(ownerId);
    const items = this.#layout.itemsForEntry(ownerId);
    const scale = this.#viewport.timeScale;
    const minBarWidthPx = this.#frameSettings.minBarWidthPx;
    const { x, width } =
      items.length > 0
        ? unionSpan(items, scale, minBarWidthPx)
        : barSpan(fallbackSpanItem(ownerId, start, end), scale, minBarWidthPx);
    this.#revealRect(rowIndex, x, width);
  }

  /** Reveals one Segment: the Item that draws it, box included (#295). A summary draws one bar over
   *  the whole span, and that one bar stands for every Segment — so it is the target here too.
   *  When no Item draws this Segment at all, the Segment's own dates are the target. A sibling bar
   *  never is: the caller named this Segment, and panning to another one would show the wrong
   *  Segment. That is the rule `RovingFocus` relies on — a split Entry's other Segments must not
   *  widen the pan past the bar that has focus. */
  #revealSegmentSpan(ownerId: EntryId, targetSegmentId: SegmentId, start: Instant, end: Instant): void {
    const rowIndex = this.#expandAndFindRow(ownerId);
    const items = this.#layout.itemsForEntry(ownerId);
    const target = items.find((item) => this.#layout.segmentIdsForItem(item.id).includes(targetSegmentId));
    const drawn = target ?? fallbackSpanItem(ownerId, start, end);
    const { x, width } = barSpan(drawn, this.#viewport.timeScale, this.#frameSettings.minBarWidthPx);
    this.#revealRect(rowIndex, x, width);
  }

  /** Expands this entry's collapsed ancestors, and flushes the pending frame. Every caller does
   *  this before it reads `FrameLayout` about the entry (#295). `itemsForEntry` answers from the
   *  post-collapse plan, so a row collapse hid answers empty until the frame catches up. Returns
   *  the row's index, or `-1` for a still-hidden row (a filter, not a collapse). */
  #expandAndFindRow(ownerId: EntryId): number {
    let rowIndex = this.#layout.rowIndexForEntry(ownerId);
    if (rowIndex < 0 && this.#treeCollapse.expandAncestorsOf(ownerId)) {
      this.#frames.flush();
      rowIndex = this.#layout.rowIndexForEntry(ownerId);
    }
    return rowIndex;
  }

  #revealRect(rowIndex: number, x: number, width: number): void {
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
   *  caller with a `Gantt` façade to hand `view()`, so it alone writes here.
   *
   *  ADR 0019: this Gantt's own chrome plugins, and only those. The Dataset's plugins install
   *  beside them and stay off this list — this Gantt cannot drop what it did not install. */
  get plugins(): readonly ShellPlugin<unknown>[] {
    return this.#chromePlugins;
  }

  set plugins(next: readonly ShellPlugin<unknown>[]) {
    this.#pluginRuntime.install([...this.#datasetPlugins, ...next]);
    this.#chromePlugins = next;
  }

  /** D-S5-36: adds one plugin to the installed set. It sets up that plugin alone and leaves every
   *  other one untouched. An id that is already installed throws `DuplicatePluginIdError`. */
  installPlugin(plugin: ShellPlugin<unknown>): void {
    this.plugins = [...this.#chromePlugins, plugin];
  }

  /** D-S5-36: disposes one installed plugin, by id, and leaves every other one running. An id
   *  nothing installs throws `PluginNotInstalledError` — a Dataset plugin's id included, because
   *  the Dataset owns that one (ADR 0019). */
  uninstallPlugin(id: PluginId): void {
    const next = this.#chromePlugins.filter((plugin) => plugin.id !== id);
    if (next.length === this.#chromePlugins.length) throw new PluginNotInstalledError(id);
    this.plugins = next;
  }

  /** S5.2, D-S5-6: `Gantt.commands`'s own backing registry — read-only, the registry object itself
   *  is mutated in place by `register`. */
  get commands(): CommandRegistry<unknown> {
    return this.#commandRegistry;
  }

  #emitNavigationChange(): void {
    this.#emit('navigationChange', {
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
      fieldContext: { timeZone: this.#options.dataset.timeZone },
    });
    // #139/#157: the columns just changed, so the width they dictate changed with them.
    this.#gridPaneWidth.resizeToColumns();
    // S5.11: the #139 ceiling `aria-valuemax` reads can move even when the pane's own width does
    // not. The columns grew, but the pane was already narrower than either edge — the one branch
    // `resizeToColumns`'s own commit would otherwise never touch.
    this.#splitterAttachment?.syncAria();
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

  /** What `GridPaneWidth` calls back into: the pane's own stored width and floor, plus the
   *  resolved columns' own edge. `grid-pane-width.ts`'s own file header explains the rules these
   *  five calls build. */
  #gridPaneWidthPorts(): GridPaneWidthPorts {
    return {
      readWidth: () => this.#paneLayout.gridWidth,
      readMinWidth: () => this.#paneLayout.minGridWidth,
      writeMinWidth: (px) => {
        this.#paneLayout.minGridWidth = px;
      },
      columnsEdge: () => totalColumnWidth(this.#columnChrome.resolvedColumns),
      commitWidth: (px) => {
        const from = this.#paneLayout.gridWidth;
        const to = px;
        // S5.11: every width change lands here, whichever door it came in — a drag, a keyboard
        // step, or a plain `gantt.gridWidth = …`. So this is the one place that has to keep the
        // separator's `aria-value*` trio true, on both the apply and the veto-rollback branch.
        return this.#proposeChange(
          'beforeGridWidthChange',
          'gridWidthChange',
          { from, to },
          () => {
            this.#paneLayout.gridWidth = to;
            this.#splitterAttachment?.syncAria();
          },
          () => {
            this.#paneLayout.gridWidth = from;
            this.#splitterAttachment?.syncAria();
          },
        );
      },
    };
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
        variants: this.#registrations.variants,
        decorationProviders: this.#registrations.decorationProviders(),
        datasetRevision: this.#options.dataset.datasetRevision,
      }),
    );
    // S5.11, D-S5-25: which pattern the grid pane announces, and how big it says it is. Both are
    // facts about the whole row set, so they are read here rather than per row. Only the windowed
    // rows reach `render/dom` at all (I3).
    this.#paneLayout.gridPattern = nestsRows(this.#frameSettings.rowSource) ? 'treegrid' : 'grid';
    this.#paneLayout.setGridSize(frame.rowCount, frame.columns.length);
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
    // S5.11, D-S5-25: this runs after the backend syncs the DOM to this frame, not before. A row
    // or bar the sweep wants to focus must already exist as a node.
    this.#rovingFocus.syncAfterRender();
  }

  destroy(): void {
    if (this.#destroyed) return;
    // #272/#273: a held gesture's Promise can otherwise outlive this Gantt, settling into a shell
    // with nothing left to paint or write through. First, before anything else.
    this.#gesturePipeline.discardHeldGesture();
    // S5.1, D-S5-3: plugins first. A disposer may still need its overlay node or another pane-owned
    // resource, so it must run before any pane below is torn down.
    this.#pluginRuntime.disposeAll();
    this.#rovingFocus.detach();
    this.#liveRegion.detach();
    this.#containerResize.destroy();
    this.#container.removeEventListener('keydown', this.#keymapListener);
    this.#container.ownerDocument.removeEventListener('keydown', this.#documentKeymapListener, true);
    this.#darkSchemeQuery.removeEventListener('change', this.#darkSchemeQueryListener);
    this.#themePinObserver.disconnect();
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
    this.#variantStyles.destroy();
    this.#destroyed = true;
  }
}
