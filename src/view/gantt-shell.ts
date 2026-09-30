// view/ — Gantt shell, the composition root that wires the grid pane, splitter, timeline pane and
// viewport binding together (plans/01 §8.2-8.3, S1.8).

import {
  barSpan,
  FrameLayout,
  TimeScaleModel,
  Viewport,
  createVariantRegistry,
  gridContentWidth,
  totalColumnWidth,
  isTimeUnit,
  nestsRows,
  resolveRowSource,
  rowDropZoneAt,
} from '../layout/index.js';
import type {
  DateLine,
  DateLineLabelPlacement,
  Overscan,
  PresetRef,
  RowSource,
  ScrollAxes,
  SnapSetting,
  TimeScaleFit,
  ViewportHandle,
  ViewPreset,
  EntryVariant,
  ResolvedVariant,
  RegisteredVariant,
  VariantRegistry,
  ReportDoubleMatch,
  ReportUnknownFieldMatch,
  ResolvedRenderer,
  BarLabels,
  BarRenderer,
  GridCellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  FrameBar,
  Bar,
  TimeScale,
  ResolvedColumn,
  RowPlanInput,
} from '../layout/index.js';
import type { EntryRulePorts } from '../layout/entry-rule.js';

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
import { createFormatContext } from '../data/fields/format-field-value.js';
import type {
  AsyncCancelableEvent,
  EntryActivate,
  GanttEventHandler,
  GanttEventMap,
  GanttEvents,
} from './event-bus.js';
import { PluginRuntime } from '../extensions/plugin-runtime.js';
import type { ShellPlugin } from '../extensions/plugin-runtime.js';
import { CommandRegistry } from '../extensions/commands.js';
import type { CommandContext } from '../extensions/commands.js';
import { registerCoreCommands } from './core-commands.js';
import type { CoreCommandPorts } from './core-commands.js';
import { Keymap } from '../extensions/keymap.js';
import { DisposableStore } from '../extensions/disposables.js';
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
import { resolveConvenienceChords } from './convenience-chords.js';
import type { ConvenienceChords } from './convenience-chords.js';
import type { ConvenienceCommandId } from '../extensions/commands.js';
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
  entryIdOfBar,
  entryId,
  barId,
  spansTime,
} from '../model/index.js';
import type {
  Dataset,
  Disposer,
  Entry,
  EntryId,
  FieldEditable,
  FieldKey,
  FormatContext,
  GridColumnInput,
  BarId,
  Instant,
  PluginId,
  RaiseError,
  RowId,
  Size,
  ProposedEdits,
  TargetKind,
  TimeSpan,
} from '../model/index.js';
import { resolveCapabilities } from './capability.js';
import type { Capabilities, GestureCapability, ResolvedCapabilities } from './capability.js';
import { subscribeToDatasetChanges } from './dataset-change-subscription.js';
import type { DatasetChangeSubscription } from './dataset-change-subscription.js';
import { FrameScheduler } from './frame-scheduler.js';
import { createRowEdgeScroll } from './row-edge-scroll.js';
import type { RowEdgeScroll } from './row-edge-scroll.js';
import { PluginRegistrations } from './plugin-registrations.js';
import type { PluginRegistrationPorts } from './plugin-registrations.js';
import { FrameSettings } from './frame-settings.js';
import type { FrameSettingsPatch, FrameSettingsPorts } from './frame-settings.js';
import { projectAffordances } from './affordance-projection.js';
import type { EntryGestureContext, EntryHit } from './entry-gesture-context.js';
import type { ColumnGestureContext } from './column-gesture-context.js';
import { DEFAULT_GRID_COLUMNS, resolveGanttFields } from './grid-columns.js';
import type { ResolveColumnsBind } from './grid-columns.js';
import { resolveBarLabelPolicy, resolveBarLabelText } from './bar-labels.js';
import type { ResolveBarLabelPorts } from './bar-labels.js';

import { ColumnChrome } from './column-chrome.js';
import type { ColumnChromePorts } from './column-chrome.js';
import { buildPluginPorts } from './plugin-ports.js';
import type { GanttShellPorts, PluginContextParts } from './plugin-ports.js';
import { TreeCollapse } from './tree-collapse.js';
import type { TreeCollapseContext } from './tree-collapse.js';
import type { CollapseState } from './collapse-state.js';
import { EntrySelection } from './entry-selection.js';
import type { EntrySelectionPorts } from './entry-selection.js';
import { GesturePipeline } from './gesture-pipeline.js';
import type { GesturePipelineDeps } from './gesture-pipeline.js';

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

/** Same DI shape as `AttachEntryGestures` just above, and the same `ctx` instance.
 *  `interaction/keyboard-editing.ts`'s `attachKeyboardEditing` needs `session()`/`selection`/
 *  `selectableEntriesInRowOrder`/`entryFor`/`can` only, not `hitTest`/`setHovered`. But a second,
 *  narrower context type for one caller has no value. */
export type AttachKeyboardEditing = (container: HTMLElement, ctx: EntryGestureContext) => Detachable;

/** Same DI shape again — `interaction/column-gestures.ts`'s `attachColumnGestures`
 *  drives the grid header pane's resize/reorder pointer stream over `ColumnGestureContext`
 *  (`./column-gesture-context.js`). */
export type AttachColumnGestures = (
  headerPane: HTMLElement,
  container: HTMLElement,
  ctx: ColumnGestureContext,
) => Detachable;

/** Theming's only preset axis — `'auto'` follows `prefers-color-scheme` (no
 * `data-fg-theme` attribute written), `'light'`/`'dark'` pin it. ADR 0029: the app pushes the
 * answer; it writes `gantt.theme` or pins `data-fg-theme` on an ancestor. The library never calls
 * back into the app to ask. */
export type Theme = 'auto' | 'light' | 'dark';

const DEFAULT_THEME: Theme = 'auto';
const DEFAULT_A11Y_LABEL = 'Gantt';

/** The five `--fg-*` pixel properties, their policies and the today-line margin default all live in
 *  `frame-settings.ts` now (#167). They are that module's own knowledge, not this shell's. The read
 *  cadence stays here, because only this shell knows when the pane changed: on construction, and
 *  again on every pane-size measurement (#8, #49). `getComputedStyle` is a synchronous style read
 *  that can force a style recalculation. So it is never an unconditional read per render(). */

/** Every `before*` → `*` pair `#proposeChange` runs. One entry per pair, not one overload
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
 *  the api `Dataset` and the public `Gantt` façade. `api/gantt.ts` supplies all seven on
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
  /** How a committed gesture draft reaches the store. `model/dataset.ts`'s `Dataset`
   *  (this shell's own `dataset` option) has no `transaction()` — "a view never opens a
   *  transaction". So `api/gantt.ts`, which holds the full `api/Dataset` the model interface narrows
   *  away, supplies this instead. It answers `false` for a sync veto and for a
   *  `MutationCancelledError` from `beforeChange`. The shell never sees the exception either way. */
  commitEntryEdits?: (edits: ProposedEdits) => boolean;
  /** Fills the api-level pieces of a plugin's `PluginContext`. `view/` cannot type
   *  those without reaching past its own boundary. They are the full api `Dataset` and the
   *  public `Gantt` façade. `model/dataset.ts`'s narrow interface hides `.transaction()`, the same
   *  reason `commitEntryEdits` exists. The `Gantt` façade does not exist yet when this constructor
   *  runs. It returns `unknown` because `api/gantt.ts` binds the concrete
   *  `PluginContext` type. That file alone may import both `Gantt` and this generic contract without
   *  closing an import cycle (`api/plugin-context.ts`'s file header). */
  buildPluginContext?: (parts: PluginContextParts) => unknown;
  /** Fills the api-level pieces of a `CommandContext`, for the same reason
   *  `buildPluginContext` fills `PluginContext`'s. The full api `Dataset` (with `undo`/`redo`) and
   *  the public `Gantt` façade are both api-level. `view/` may name neither type. The shell calls it
   *  fresh on every command invocation, never
   *  cached, so a command always reads the invocation's current selection. `target`'s shape is a
   *  structural subtype of api-level `CommandTarget`. `view/` may not name that type
   *  either, but a narrower object literal reaches it fine, because `api/gantt.ts` only widens. */
  buildCommandContext?: (parts: {
    entry?: Entry;
    /** ADR 0018: the variant this Gantt resolved for `entry`. Filled beside `entry`, from the same
     *  resolution the layout pass uses. */
    variant?: string;
    target?:
      | { kind: 'header'; field: FieldKey; entryIds: readonly EntryId[] }
      | { kind: 'bar'; entryIds: readonly EntryId[] }
      // The roving-focus grid pane fills two `CommandTarget` kinds a
      // right-click never reaches on its own. `'row'` names a focused Row. `'gridCell'` names a
      // focused Grid cell, and `field` names its column. The splitter also gains its own kind,
      // for parity with the panes either side of it.
      | { kind: 'row'; entryIds: readonly EntryId[] }
      | { kind: 'gridCell'; field?: FieldKey; entryIds: readonly EntryId[] }
      | { kind: 'splitter'; entryIds: readonly EntryId[] };
  }) => unknown;
  /** S5.2: `freegantt.panToToday`'s own clock read. `view/` may not call `time/`'s `now()` itself
   *  (I10). `api/gantt.ts` supplies `now` from `time/index.js`, the same function
   *  `Gantt.panToToday` already reads for the identical reason. */
  now?: () => Instant;
}

/** #434: which pointer gesture fires `entryActivate`. `'click'` (the default) activates on a plain
 *  click, once per physical click — a double-click's second click does not activate again.
 *  `'dblclick'` replaces click as the trigger: a single click only selects, and a double-click
 *  activates once. The two never both fire — this chooses the trigger, it does not add a second
 *  one. */
export type PointerActivation = 'click' | 'dblclick';

export interface GanttShellOptions {
  /** Element or CSS selector (plans/02 §2); a selector that matches nothing throws (#38). */
  container: HTMLElement | string;
  dataset: Dataset;
  /** Bound viewport object (D9) — pass the same instance to two Gantt instances to x-sync them.
   * Constructs a private default when omitted (plans/01 §8.2: "single-Gantt usage never sees the
   * concept"). The default resolves its zone, span and fit from this shell's binding, so it needs
   * no arguments. */
  scale?: TimeScaleModel;
  /** Bound scroll axes (D9) — pass the same `ScrollAxis` as `x` (or `y`) to two Gantt
   * instances to sync that direction. Each omitted direction builds a private default. */
  scroll?: ScrollAxes;
  /** Initial grid pane width. A number is px; `'fitColumns'` (#157) sits the pane
   *  on its columns' own edge and keeps it there. Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: GridWidth;
  /** Live (#127). The floor a splitter drag clamps `gridWidth` to. Default `40` — wide enough for
   *  one narrow column, so a drag cannot take the pane to nothing by accident. It bounds the drag
   *  only: an explicit `gridWidth = 0` still collapses the grid pane on purpose. */
  minGridWidth?: number;
  /** Live (#432). See `GanttOptions.gridResizable`. Default `true`. */
  gridResizable?: boolean;
  /** Build the private default `TimeScaleModel` only. It is a no-op, with a dev-mode
   * warning, when `scale` is also supplied. The shared model already carries its own options. */
  preset?: PresetRef;
  range?: 'fitDataset' | TimeSpan;
  fit?: TimeScaleFit;
  /** `Viewport` is never shared, so this always applies to this shell's own viewport. */
  overscan?: Overscan;
  /** Live. Default `'auto'`: follows `prefers-color-scheme`. */
  theme?: Theme;
  /** Live. Default `'Gantt'`; sets `aria-label` on the container. */
  a11yLabel?: string;
  /** Live. `undefined` = the runtime default. Feeds header labels and
   *  `a11yLabel` alike. */
  locale?: Intl.LocalesArgument;
  /** Live. Default `true`. */
  todayLine?: boolean | Instant;
  /** Live. Default `[]`. */
  dateLines?: readonly DateLine[];
  /** Live. See `GanttOptions.dateLineLabelPlacement`. Default `DEFAULT_DATE_LINE_LABEL_PLACEMENT`
   *  (`'belowHeader'`). */
  dateLineLabelPlacement?: DateLineLabelPlacement;
  /** Live. See `GanttOptions.todayLineMarginTicks`. Default `DEFAULT_TODAY_LINE_MARGIN_TICKS`. */
  todayLineMarginTicks?: number;
  /** Live. Per-gesture, boolean or per-entry predicate, over the per-kind default table
   *  (`view/capability.ts`). Default `{}`: every gesture resolves off the default table alone. */
  capabilities?: Capabilities;
  /** Live (#434). Default `'click'`: `entryActivate` fires on a plain click of a bar or a row's own
   *  background. `'dblclick'` replaces click as the pointer trigger: a single click only selects,
   *  and a double-click activates once. On a grid cell, `'dblclick'` activates only a cell
   *  `capabilities` refuses to write. A writable cell's double-click stays `inlineEditing()`'s own —
   *  the same editable-cell-wins precedence `Enter` already gives the editor. */
  pointerActivation?: PointerActivation;
  /** Live. What a drag snaps to on this Gantt, over the showing preset's own `snap`.
   *  Omitted, the preset decides. */
  snap?: SnapSetting;
  /** Live. Wheel zoom/pan and keyboard pan. Default `{}`: every viewport gesture
   *  is on. `false` turns them all off. The imperative `zoomBy`/`panToDate` surface does not
   *  consult this. */
  viewportGestures?: ViewportGestures;
  /** Live (#262). Default `{}`: every convenience chord is on. `false` turns them all off; a
   *  per-command map pins one at a time. An obligation chord (`Escape`, the column keys, `Mod+Arrow`
   *  reach, `Enter`) is never in the map's key type. It stays bound either way — `[S5-A4]`, WCAG
   *  2.1.1. The command itself stays reachable through `commands.run(id)` regardless. */
  convenienceChords?: ConvenienceChords;
  /** Live. Field keys in display order, plus per-Gantt overrides. Default `['name']`. */
  gridColumns?: readonly GridColumnInput[];
  /** Live. Default `{ source: 'entries', tree: true }`. */
  rowSource?: RowSource;
  /** Live. Collapsed `RowId`s, loose on the way in. Default `[]`. */
  collapsed?: readonly (RowId | string)[];
  /** Live. Where the default bar label paints — ignored once `barRenderer`'s output takes over
   *  a bar's content. Default `'fitBar'`. */
  barLabels?: BarLabels;
  /** Live. A function, or a per-kind map — undefined and "no per-kind
   *  entry" both keep the library's own bar output. Always loses to a plugin's own `registerRenderer`
   *  only when this is itself undefined; wins over a plugin's the rest of the time. */
  barRenderer?: BarRenderer;
  /** Live. Gantt-wide; a per-column `GridColumn.columnRenderer` (S5.7) wins over this
   *  for its own column. */
  gridCellRenderer?: GridCellRenderer;
  /** Live. Not painted until a later step consumes it (S5.7's grid header chrome).
   *  The resolution slot exists now, so a plugin's `registerRenderer('header', …)` has somewhere to
   *  register into. It also keeps this option honest about not being a no-op forever. */
  headerRenderer?: HeaderRenderer;
  /** Live. Replaces a tooltip's body (S5.5's `tooltips()` feature reads this). */
  tooltipRenderer?: TooltipRenderer;
  /** Expert knob, not on `GanttOptions` (plans/02 "two callers, two surfaces"). A test names its
   * own `RenderBackend<HTMLElement>` in place of the DOM one. §9-I: the seam had two implementations
   * and one hardcoded call site. Nothing could reach the other short of mocking the module.
   * Still `RenderBackend<HTMLElement>`, not the null backend's `RenderBackend<void>`. `PaneLayout`
   * mounts real elements regardless of which backend paints them. So this closes the hardcoding,
   * not DOM-free `view/`. Defaults to `createDomBackend()`. */
  backend?: RenderBackend<HTMLElement>;
  /** P1: the door onto the installed extension hook, called for **preview only** —
   *  ghosts its extras in the rAF-coalesced drag preview. `api/gantt.ts` passes the bound Dataset's
   *  own `extraEditsFor` here (S5.10, #209). That occupant is the identity function until a
   *  Dataset plugin composes onto it. A test that constructs `GanttShell` directly passes
   *  its own, the same shape `commitEntryEdits` already uses. The real hook still runs again, for
   *  real, inside `data/transaction.ts`'s own commit. This option never writes anything itself.
   *
   *  Takes the draft, not an `EditRequest` (#466): `GanttShell` binds to `model/`'s narrow `Dataset`,
   *  which carries no `hierarchySource`/`committedChildIds`/`fields`, so it cannot build the request
   *  itself. `api/dataset.ts`'s `extraEditsFor` builds it, through `data/edit-request.ts`'s
   *  `createEditRequest`, before this ever runs. */
  extraEditsFor?: (draft: ProposedEdits) => ProposedEdits;
  /** #425: the same door as `extraEditsFor` above, for the Rollup instead of the extension hook.
   *  It ghosts ruling 5's "into a leaf, its dates roll up" for a `place` drop's own preview.
   *  `api/gantt.ts` wires this to `api/dataset.ts`'s `rolledUpEditsFor`. `undefined` ghosts nothing,
   *  the same as an unwired `extraEditsFor`. */
  rolledUpEditsFor?: (draft: ProposedEdits) => ProposedEdits;
  /** #425: does this Dataset's tree still follow the stored `parentId` (`storedParentSource`), or
   *  does a plugin own the hierarchy (ADR 0020)? `undefined` (a test-built shell with no wiring)
   *  defaults to `true` — the common case. `api/gantt.ts` wires this to `api/dataset.ts`'s
   *  `hierarchyFollowsParentId`, the same friend-map pattern `extraEditsFor` already uses. Gates
   *  `verticalDropOffered`: row order assumes `siblingIndex` order only when the tree is core's own
   *  (a plugin-owned hierarchy offers no vertical drop, not "same parent only"). */
  hierarchyFollowsParentId?: () => boolean;
  /** ADR 0038: the friend function `api/dataset.ts`'s `placeableOf` — may this Entry land under this
   *  parent, past a plugin's own place rule. `resolveCapabilities`'s `canPlace` asks it for the bar
   *  drag and the grid row drag alike (one seam, I14). `api/gantt.ts` wires this the same
   *  friend-map way `hierarchyFollowsParentId` above does. `undefined` (a test-built shell with no
   *  wiring) keeps `canPlace`'s pre-ADR-0038 answer. */
  placeableOf?: (id: string, parentId: EntryId | undefined) => FieldEditable;
  /** ADR 0038: the friend function `api/dataset.ts`'s `onRulesChanged`. A plugin calls
   *  `ctx.edits.rulesChanged()` after a lock rule's or a place rule's outside state moves. This shell
   *  answers by re-resolving what it currently offers, then it requests a frame. An affordance a rule
   *  just closed clears with no Field write needed. `api/gantt.ts` wires this the same friend-map way
   *  `hierarchyFollowsParentId` above does. `undefined` (a test-built shell with no wiring) subscribes
   *  to nothing. A rule with outside state then needs its own Field write to be noticed — the
   *  pre-ADR-0038 behaviour. */
  onRulesChanged?: (listener: () => void) => Disposer;
  /** Internal (ADR 0018). One registry per Gantt, seeded with core's two variants. Tests
   *  inject a replacement. */
  variantRegistry?: VariantRegistry;
  /** The consumer's own variants — `GanttOptions.variants`, already erased to the untyped shape
   *  (ADR 0018). They outrank every plugin's, whatever order the plugins install in. */
  variants?: readonly EntryVariant[];
  /** ADR 0019, ADR 0032: the Dataset's own plugins. Held here, not installed: `set plugins` reads
   *  this field and combines it with this shell's own chrome once a caller assigns one. So this
   *  shell installs no plugin of its own, and nothing runs yet. They stay installed for this
   *  shell's whole life, because this Gantt did not install them and cannot drop them. A plugin
   *  with no `view` half joins the `requires` graph and runs nothing. */
  datasetPlugins?: readonly ShellPlugin<unknown>[];
  /** Applied before `paintFirstFrame()`, so a plugin's `view()` reads the real starting preset off
   *  `ctx.gantt` (ADR 0032). */
  zoomPresets?: readonly PresetRef[];
  /** Applied before `paintFirstFrame()`, same reasoning as `zoomPresets` above (ADR 0032). Loose
   *  (`EntryId | string`), same asymmetry the live `selection` setter already has. */
  selectedEntryIds?: readonly (EntryId | string)[];
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

/** Call: `paneLayoutFrom(this.#container, options.gridWidth, options.minGridWidth)`. Pane layout
 *  from the container and the two grid-width options — a number is px, `'fitColumns'` names none. */
function paneLayoutFrom(
  container: HTMLElement,
  gridWidth: GridWidth | undefined,
  minGridWidth: number | undefined,
): PaneLayout {
  return new PaneLayout({
    container,
    ...(typeof gridWidth === 'number' ? { gridWidth } : {}),
    ...(minGridWidth !== undefined ? { minGridWidth } : {}),
  });
}

/** Call: `defaultTimeScale(options.preset, options.range, options.fit)`. The private TimeScale
 *  this Gantt builds when the consumer named no shared `scale`. */
function defaultTimeScale(
  preset: PresetRef | undefined,
  range: GanttShellOptions['range'],
  fit: TimeScaleFit | undefined,
): TimeScaleModel {
  return new TimeScaleModel({
    ...(preset !== undefined ? { preset } : {}),
    ...(range !== undefined ? { range } : {}),
    ...(fit !== undefined ? { fit } : {}),
  });
}

/** Call: `viewportFrom(scale, options.scroll, options.overscan)`. Viewport from the scale the
 *  consumer shared or the private default, plus optional scroll and Overscan. */
function viewportFrom(
  scale: TimeScaleModel,
  scroll: ScrollAxes | undefined,
  overscan: Overscan | undefined,
): Viewport {
  return new Viewport({
    scale,
    ...(scroll ? { scroll } : {}),
    ...(overscan !== undefined ? { overscan } : {}),
  });
}

/** The union `[min x, max(x + width))` of every Bar's own `barSpan` (#295) — every *painted* one.
 *  It is `GanttShell.reveal`'s target when an entry draws several Bars. Revealing the entry then
 *  shows every one of them, not only the first bar. Takes at least one Bar: `#revealEntrySpan`,
 *  its one caller, checks `bars.length > 0` first.
 *
 *  A Bar `barSpan` drops reports `{x: 0, width: 0}` (#436) — a fabricated point, not a real box at
 *  the origin. Folding it into the union would drag `reveal` toward `0` for an entry with one
 *  dropped bar and one real one. It would send `reveal` to `0` outright when every bar is dropped
 *  (#436 branch review). Skipped here for that reason. Returns `undefined` when every bar was
 *  dropped, so the caller falls back to the entry's own dates (`fallbackSpanBar`) instead of
 *  reading a union of nothing. */
function unionSpan(
  bars: readonly Bar[],
  scale: TimeScale,
  minBarWidthPx: number,
): { x: number; width: number } | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const bar of bars) {
    const { x, width } = barSpan(bar, scale, minBarWidthPx);
    if (width === 0) continue;
    minX = Math.min(minX, x);
    maxEnd = Math.max(maxEnd, x + width);
  }
  if (minX === Number.POSITIVE_INFINITY) return undefined;
  return { x: minX, width: maxEnd - minX };
}

/** A stand-in Bar for `barSpan`, for the case where nothing paints the target (#295). A variant
 *  produced no Bar for the named Entry. The dates it is handed become the target, so reveal never
 *  becomes a no-op. It is a stand-in, not a second formula: `barSpan` still answers the geometry,
 *  and it carries no box, so it takes the ordinary span-and-floor path. */
function fallbackSpanBar(ownerId: EntryId, start: Instant, end: Instant): Bar {
  return { id: barId(ownerId), entryId: ownerId, variant: '', label: '', start, end };
}

export class GanttShell {
  #container: HTMLElement;
  #paneLayout: PaneLayout;
  /** The #127 floor, the #139 ceiling, and the #157 `'fitColumns'` standing instruction —
   *  `grid-pane-width.ts`'s own file header. `PaneLayout` holds the px it resolves to; this module
   *  knows nothing about the DOM. */
  #gridPaneWidth!: GridPaneWidth;
  /** #432: `false` locks the splitter and every column's resizer grip. `#applyGridResizable`
   *  disables the splitter's attachment and paints no resize cursor. The column half is a gate
   *  applied where resolved columns are *read*: render and the resize gesture, `#renderedColumns`
   *  and `#gridResizable`'s own check in `columnGestureContext`/`isColumnResizable`. It is never a
   *  rewrite stored on `ColumnChrome`'s own resolution. That stored override used to leak a
   *  `resizable` flip a consumer never made into `gridColumnsChange`'s `from`. A gesture that can
   *  no longer arm never fires a `before*` event. */
  #gridResizable = true;
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
  /** Attached once, in the constructor, and lives for the shell's own lifetime. `#applyGridResizable`
   *  is the only caller of `setEnabled` — see that method for what "locked" looks like (#432). `!` because the constructor creates `#panes` before it can attach this. */
  #splitterAttachment!: SplitterAttachment;
  #datasetChanges: DatasetChangeSubscription;
  #entryGestures: Detachable | undefined;
  #keyboardEditing: Detachable | undefined;
  #columnGestures: Detachable | undefined;
  /** Grid-column resolution, live resize/reorder preview, and the `gridColumns` commit sequence
   *  — `column-chrome.ts`'s own module doc explains the split. Constructed in the
   *  constructor body (needs `#container`, not yet assigned at field-init time). */
  #columnChrome!: ColumnChrome;
  #wheelNavigation: WheelNavigationAttachment | undefined;
  #wheelNavigationGrid: WheelNavigationAttachment | undefined;
  #rowTwistyAttachment: RowTwistyAttachment;
  /** One long-lived, mutable per-Gantt object. `applyState` diffs against what it painted
   *  last. So writing into this and calling `#backend.applyState` allocates nothing per hover or
   *  select step (I5). Never rebuilt per call. */
  #interactionState: InteractionState = {};
  /** The Selection (#212, ADR 0010, ADR 0025, #230 round 4): what is selected, and what a pointer hit
   *  would select. Built once, right after `#capabilities` in the constructor below. */
  #entrySelection!: EntrySelection;
  /** Resolved once, re-resolved only when `capabilities` is reassigned — never per
   *  hover step. `#refreshAffordances` reads it, it never calls `resolveCapabilities` itself. */
  #capabilityRules: Capabilities = {};
  /** The consumer's own variants, and the disposers that retract them. Reassigning `variants`
   *  retracts the whole list and installs the new one (ADR 0018).
   *
   *  A plain array, not a `DisposableStore`. A store latches on its first `disposeAll()`
   *  and disposes anything added after it. That is right for a lifetime that ends once, and wrong
   *  for a list that is replaced live. */
  #variants: readonly EntryVariant[] = [];
  #consumerVariantDisposers: Disposer[] = [];
  /** This Gantt's own snap, or `undefined` while the showing preset decides. It changes no
   *  paint, so it is a plain field and not a frame setting. */
  #snap: SnapSetting | undefined;
  #viewportGestures: ViewportGestures = {};
  #resolvedViewportGestures = resolveViewportGestures(undefined);
  /** #434: which pointer gesture fires `entryActivate` — see `PointerActivation`. `'click'`
   *  (default) gates a click's own activation to its first physical click (`selectFromHit` reads
   *  `e.detail`). `'dblclick'` gates the click path off entirely and gates the `dblclick` listener
   *  below on instead. */
  #pointerActivation: PointerActivation = 'click';
  #convenienceChords: ConvenienceChords = {};
  #resolvedConvenienceChords = resolveConvenienceChords(undefined);
  #capabilities!: ResolvedCapabilities;
  /** The raw hit under the pointer, reported by `EntrySelectionContext.setHovered` — undefined on
   *  pointerleave or when nothing is wired (no `entryGestures` attachment). */
  #hoveredBarId: BarId | undefined;
  /** The grid row under the pointer, reported by `EntryGestureContext.setHoveredRow` — undefined
   *  once the pointer leaves the grid pane. `#hoveredRow()` falls back to the hovered bar's own row,
   *  so this holds only the half the timeline pane cannot answer. */
  #hoveredRowId: RowId | undefined;
  /** S5.5 (API gap, `s5.5-tooltips-and-context-menu.md` §5): the last-rendered frame's bars, indexed
   *  by bar id. `resolveTooltip` is its only reader. So a hover plugin working from the DOM after
   *  the fact can still build a real `TooltipRendererContext`. A bar's `x`/`y`/`width`/`height`/
   *  `flags` are not reachable from a DOM element alone. Rebuilt once per `render()`, not on the hover path
   *  itself — same cost `#backend.sync(frame)` already pays iterating `frame.bars`. */
  #lastBarById = new Map<BarId, FrameBar>();
  /** D-GH-2: owns draft math, preview rAF coalescing and the commit pipeline for a move/resize
   *  gesture. Built once, from this shell's own primitives, right after `#capabilities` below. */
  #gesturePipeline!: GesturePipeline;
  /** #170: the five seams a plugin registers into, each carrying the refresh it owes. Renderers,
   *  decorations, Bar producers, per-kind capability defaults and Grid columns. */
  #registrations!: PluginRegistrations;
  /** What `childrenAsSegments` compiles through (`layout/entry-rule.ts`) — the Field registry read
   *  paired with this Gantt's own unknown-key report (#421 C1). Built once, right beside
   *  `#registrations`'s own `fieldFor`. It is handed to `computeFrame` on every `render()` — the
   *  same "built once, read every frame" shape `variants` already takes. */
  #entryRulePorts!: EntryRulePorts;
  /** What `resolveBarLabelText` reads outside itself (#421) — the Field registry, paired with
   *  this Gantt's own unknown-field report. Built once, right beside `#entryRulePorts`, and handed
   *  to `#labelFor` on every `render()`, the same "built once, read every frame" shape. */
  #barLabelPorts!: ResolveBarLabelPorts;
  /** ADR 0022 §5: the second stylesheet a Gantt writes, one node for its own installed variants'
   *  `css`. Built right after `#registrations`, and refreshed on every edge that changes what a
   *  variant registers — construction, `gantt.variants = […]`, a plugin install or dispose. */
  #variantStyles!: VariantStyles;
  /** The single rAF owner (B10): every render request past construction goes through
   *  this, so N mutations in one tick become one frame. */
  #frames = new FrameScheduler(() => this.render());
  /** A row drag near the rows' top or bottom edge scrolls them (#603). */
  #rowEdgeScroll: RowEdgeScroll;
  #events = new EventBus<GanttEventMap, AsyncCancelableEvent>();
  /** This Gantt's own raise seam, over the bus above. Every collaborator that
   *  observes a refusal or a recovered fault takes it. That is the gesture pipeline, the render
   *  backend, the plugin runtime, and each plugin's own `ctx.raiseError`. */
  #raiseError: RaiseError = createErrorRaiser(this.#events);
  /** #448: where a shadowed `barRenderer` is reported. Built once; `render()` is its only caller. */
  #reportBarRendererShadowed = this.#createBarRendererShadowedReport();
  /** The plain `{ on, off }` a plugin's `ctx.events` actually is. Built once, from
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
  /** One registry and one keymap per Gantt (I2). Core commands and core
   *  bindings register here first, so a plugin's own registration always wins. */
  #commandRegistry!: CommandRegistry<unknown>;
  #keymap!: Keymap<unknown>;
  #keymapListener!: (event: KeyboardEvent) => void;
  /** #434: opt-in double-click activation — declared here so the constructor's assignment below is
   *  typed, the same shape `#keymapListener` takes. */
  #dblClickListener!: (event: MouseEvent) => void;
  #documentKeymapListener!: (event: KeyboardEvent) => void;
  /** What does this shell have to let go of?
   *
   *  Every resource registers its own release here, on the line that builds it. So `destroy()` is
   *  one call, and no resource is built without a release. Releases run in reverse construction
   *  order. That order is what the two documented constraints ask for. A plugin disposer still
   *  finds its overlay node. A pane is torn down after everything that reads it.
   *
   *  A `DisposableStore`, not a plain array — `#consumerVariantDisposers` states the reason in
   *  reverse. A store latches on its first `disposeAll()`. That is right for a lifetime which ends
   *  exactly once, so a second `destroy()` costs nothing (#272). */
  readonly #teardown = new DisposableStore();
  #destroyed = false;
  /** #376, ADR 0032: flipped true on `paintFirstFrame()`'s last line, after every constructor-
   *  supplied plugin has already installed and subscribed. `#emit` reads this flag. Construction
   *  itself — an initial `theme`/`selection` write, the first frame's own preset settling — never
   *  reaches a subscriber as a reported change. A plugin that wants the starting state reads it
   *  straight off `ctx.gantt` in `view()` instead. */
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
  /** Set by the most recent `render()` — `frame.contentWidth`/`contentHeight` (S1.5 README §3.2).
   *  No gutter added: the grid pane's own width is the gutter now, and the
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
  /** One tab stop per pane (`view/roving-focus.ts`'s own file header). Built
   *  once `#treeCollapse`/`#entrySelection`/`#columnChrome` exist, since its ports read all three. */
  #rovingFocus!: RovingFocus;
  /** The one polite live region for this Gantt (`view/live-region.ts`'s own file
   *  header). Constructed and attached alongside `#rovingFocus`, once `#container` exists. */
  #liveRegion!: LiveRegion;
  /** Issue #137: the one `ResizeObserver` per Gantt, which both mount layers below share. */
  #containerResize: ContainerResize;
  /** Constructed once panes exist — see the plugin runtime's own comment just below for
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
    // Must exist before PaneLayout builds the classed elements the stylesheet
    // targets, or there's a one-frame flash of unstyled content.
    ensureBaseStyles(this.#container.ownerDocument);
    // #432: read before the first `#bindColumns()` call below, so a locked Gantt never resolves
    // even its first frame of columns as resizable.
    this.#gridResizable = options.gridResizable ?? true;
    // #157: `'fitColumns'` names no px of its own. So the pane opens at its authored width
    // (`--fg-grid-pane-width`). `#bindColumns` below then sizes it to the columns, the moment there
    // are resolved columns to measure.
    this.#paneLayout = paneLayoutFrom(this.#container, options.gridWidth, options.minGridWidth);
    this.#teardown.add(() => this.#paneLayout.destroy());
    // Registered first, released last: every resource below draws into these panes.
    this.#teardown.add(() => this.#frames.cancel());
    this.#panes = this.#paneLayout.panes;
    this.#gridPaneWidth = new GridPaneWidth(this.#gridPaneWidthPorts(), options.gridWidth === 'fitColumns');
    // Constructed right after the panes it measures, so it is ready by the time the
    // plugin runtime (just below) builds its first `PluginContext`.
    this.#containerResize = new ContainerResize(this.#container);
    this.#teardown.add(() => this.#containerResize.destroy());
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

    // Does a shared `scale` also name preset, range, or fit that this Gantt must ignore?
    this.#warnWhenSharedScaleIgnoresOwnOptions();
    this.#viewport = viewportFrom(
      options.scale ?? defaultTimeScale(options.preset, options.range, options.fit),
      options.scroll,
      options.overscan,
    );
    this.#rowEdgeScroll = createRowEdgeScroll({
      scrollY: this.#viewport.scroll.y,
      rowsTop: () => this.#paneLayout.timelineTop() + this.#paneLayout.measureHeaderHeight(),
      rowsHeight: () => this.#rowsViewportHeight(),
      now: () => performance.now(),
    });
    this.#teardown.add(() => this.#rowEdgeScroll.stop());

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
    this.#registrations = new PluginRegistrations(this.#pluginRegistrationPorts(), this.#variantRegistry());
    this.#entryRulePorts = {
      fieldFor: (key) => this.#options.dataset.field(key),
      reportUnknownKey: this.#reportUnknownRowSourceField(),
    };
    this.#barLabelPorts = {
      lookup: { get: (key) => this.#options.dataset.field(key) },
      reportUnknownField: this.#reportUnknownBarLabelField(),
    };
    // ADR 0022 §5: right after the registry it reads, and after `ensureBaseStyles` (above). A
    // variant's own rule must land after the base sheet. Only then can it cancel `.fg-bar`'s
    // background and state ring at equal specificity. Starts empty; `#installConsumerVariants` fills it.
    this.#variantStyles = attachVariantStyles(this.#container.ownerDocument, this.#registrations.variants);
    this.#teardown.add(() => this.#variantStyles.destroy());
    // Before the first frame, not after it. `bind()` below fires its own `onChange`
    // synchronously, and that onChange IS this shell's first render. A consumer variant installed
    // after it would paint nothing until something else invalidated the frame.
    this.#installConsumerVariants(options.variants ?? []);
    // #127/#139: the splitter proposes a raw px delta, and `GridPaneWidth` applies both bounds on
    // the way in. So a drag can reach neither below `minGridWidth` nor past the last column's edge.
    // #432: attached once, unconditionally. `#applyGridResizable` is the only thing that
    // decides whether it is enabled, live or at construction — so both paths land in the same DOM.
    // Wired before `#bindColumns()` below: that call's own `syncAria()` needs the attachment to
    // already exist.
    this.#attachSplitter();
    this.#applyGridResizable();
    this.#bindColumns();

    // Mount before binding (#22). The render target exists by the time the binding's own onChange
    // fires, and that onChange IS this shell's first render. So there is no construction-order
    // exception to document, and no separate explicit render() call after bind().
    this.#backend = options.backend ?? this.#defaultBackend();
    this.#teardown.add(() => this.#backend.destroy());
    this.#backend.mount({
      grid: this.#panes.rows,
      timeline: this.#panes.timeline,
      gridHeader: this.#panes.gridHeader,
    });

    // Built before the plugin runtime. Core commands register into this during this
    // same constructor. A plugin's own `ctx.commands`/`ctx.interaction.registerKeybinding` (below)
    // close over it too. `#buildCommandContext` is called fresh per invocation (never cached), so a
    // command always reads the current selection.
    this.#commandRegistry = new CommandRegistry<unknown>(() => this.#buildCommandContext());
    this.#keymap = new Keymap<unknown>(this.#commandRegistry, () => this.#buildCommandContext());

    // Constructed once panes exist. A plugin's disposer may still need its overlay node (a later
    // step's `ctx.view.overlay`), so this must outlive them either way. `destroy()` disposes it
    // first, before any pane teardown, for the same reason. No plugin runs yet: this constructor
    // takes no `plugins` option of its own (ADR 0032). `Gantt`'s own constructor calls the public
    // `plugins` setter only after it assigns its `#shell` field. So `buildPluginContext`'s `gantt`
    // value is a finished Gantt by the time any `view()` reads it.
    // #179: one ports object for this Gantt's whole life, which is what `GanttShellPorts`' own doc
    // has always said. Every member is either a field already assigned above, or a closure that
    // reads live state at call time. So nothing in it goes stale between two installs, and a page
    // that installs six plugins no longer allocates six copies of it.
    this.#pluginRuntime = this.#createPluginRuntime();
    // Registered after the panes and the backend, so it releases before them. A plugin
    // disposer may still reach for its overlay node.
    this.#teardown.add(() => this.#pluginRuntime.disposeAll());

    // The timeline pane is the single native scroller; the grid pane follows it by
    // transform, in render/dom's sync(). Constructed before either bind (Viewport's fan-in),
    // so this field is never undefined during a render.
    this.#scrollAttachment = attachScroll(this.#panes.timeline, this.#viewport);
    this.#teardown.add(() => this.#scrollAttachment.detach());

    // bind() fires its own onChange synchronously, once per sub-model (bind always
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
    // The shared-model case (#403): this binding is the whole of this Gantt's footprint on a
    // `TimeScaleModel` or a `ScrollModel` it shares with another Gantt. Unbinding is what lets a
    // shared model outlive this shell without accumulating a dead binding per mount.
    this.#teardown.add(() => this.#viewportHandle.unbind());
    // The whole of this shell's dependency on data change: push the fresh snapshot into
    // the bound viewport, and request a frame. That is the changeset mechanism's own fan-out, not a
    // second reactivity path. #33's `setEntries()` warning is against a *public* one (see
    // dataset-change-subscription.ts).
    this.#datasetChanges = subscribeToDatasetChanges(options.dataset, (changeSet) => {
      this.#layout.invalidateForChange(changeSet);
      this.#entrySelection.forgetEntriesTheDatasetDropped(changeSet);
      // #496 L2: a load is a new baseline, not an edit. Collapse state returns to where this Gantt
      // started — the same way the selection above already clears, since every old id sits in
      // `removed`. A sync (#517) is not a baseline: it keeps a kept id's collapse state and
      // selection, so only a load resets here.
      if (changeSet.origin === 'load') this.#treeCollapse.resetToStartState();
      this.#bindColumns();
      this.#viewportHandle.setEntries(options.dataset.entries.all);
      // A write can close a cell a painted affordance already sits on — a lock, for one (I14).
      // The affordance ids refresh only on hover, Selection, or a capability change otherwise.
      // A dataset write needs its own refresh here, once per commit, not once per pointer move.
      this.#refreshAffordances();
      this.#frames.request();
    });
    this.#teardown.add(() => this.#datasetChanges.unsubscribe());
    // ADR 0038: a lock rule or a place rule can close over outside state — a clock, a toggle. Its
    // answer can then move with no Field write for the subscription above to see. A plugin calls
    // `ctx.edits.rulesChanged()` when that happens. This shell re-resolves what it currently offers,
    // the same way a dataset write above does, so a now-closed affordance clears on the next frame.
    if (options.onRulesChanged) {
      this.#teardown.add(
        options.onRulesChanged(() => {
          this.#refreshCapabilities();
          this.#frames.request();
        }),
      );
    }
    // Synchronous first measurement: a real ResizeObserver's own first callback is queued, not
    // immediate, so the first paint cannot wait for it. The `attachPaneSize` call below takes over
    // from here. It takes every measurement after this one, live, for as long as the shell lives
    // (S1.7b, #8).
    this.#applyPaneMeasurement(this.#paneLayout.measureTimelinePane());
    this.#paneSizeAttachment = attachPaneSize(this.#panes.timeline, (size) =>
      this.#applyPaneMeasurement(size),
    );
    this.#teardown.add(() => this.#paneSizeAttachment.detach());
    this.#applyInteractionOptions();
    this.#entrySelection = new EntrySelection(this.#entrySelectionPorts());
    this.#treeCollapse = new TreeCollapse(this.#treeCollapseContext());
    this.#rovingFocus = new RovingFocus(this.#panes, this.#rovingFocusPorts());
    this.#teardown.add(() => this.#rovingFocus.detach());
    this.#liveRegion = new LiveRegion(this.#container, this);
    this.#liveRegion.attach();
    this.#teardown.add(() => this.#liveRegion.detach());
    this.#gesturePipeline = new GesturePipeline(this.#gesturePipelineDeps());
    // One `EntryGestureContext`, shared by the pointer attachment and the keyboard one.
    // Both drive the same `#gesturePipeline.session()`, so there is no value in building two.
    const gestureContext = this.#entryGestureContext();
    // Core commands first, then the keymap listener. Both attach ahead of
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
    this.#teardown.add(() => this.#container.removeEventListener('keydown', this.#keymapListener));
    // #434: opt-in (`pointerActivation: 'dblclick'`), always attached — the option gates inside the
    // handler, the same shape the wheel handlers gate on `#resolvedViewportGestures`. A grid cell's
    // double-click asks the one decision `Enter`'s own Keymap resolution already asks
    // (`#editorTakesFocusedCell`): does `freegantt.editFocusedCell` take this cell? A
    // writable cell's double-click stays the editor's own (`ctx.view.onDomEvent('dblclick', …)`)
    // and does not also activate here. This listener sits on `#container`, a bubble-phase ancestor
    // of `inlineEditing()`'s document-level one. So a `return` here always reaches that listener
    // next — no explicit ordering needed beyond where each one attaches.
    this.#attachDoubleClickActivation();
    // Document-level capture-phase fallback (issue #137,
    // `plans/reviews/2026-09-03-s5-start-fixes-qc.md`): the bubble listener above only ever sees a
    // key event whose target sits inside `#container`. A popup opened from an outside trigger has
    // no path into that listener at all — a toolbar button in the consumer's own page, say. So its
    // Escape dismissal would never fire. So this routes through the same `#keymap.resolve()`, not a
    // second, independent listener. That keeps one newest-first resolution order, instead of a
    // second document-capture stack. Skipped whenever the target is inside
    // `#container`, so an in-container key event is resolved exactly once, by the bubble listener.
    this.#documentKeymapListener = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof Node && this.#container.contains(target)) return;
      if (this.#keymap.resolve(event)) {
        event.preventDefault();
      }
    };
    this.#container.ownerDocument.addEventListener('keydown', this.#documentKeymapListener, true);
    // The one listener that outlives its container: it sits on the document, so nothing removes it
    // when the container is dropped from the page.
    this.#teardown.add(() =>
      this.#container.ownerDocument.removeEventListener('keydown', this.#documentKeymapListener, true),
    );

    // Same DI shape as `entryGestures`/`keyboardEditing` below — `view/` cannot import
    // `interaction/`, so `api/gantt.ts` supplies `attachColumnGestures`. Attached *before*
    // `entryGestures`. Both listen for `keydown` on this same `#container`. An Escape that cancels a
    // column drag must reach `column-gestures.ts`'s own handler ahead of `entry-gestures.ts`'s
    // handler. That handler swallows it, through `stopImmediatePropagation()`. In the other order,
    // the column drag's Escape would also clear the entry selection as an unrelated side effect.
    this.#columnGestures = options.wiring.columnGestures?.(
      this.#panes.gridHeader,
      this.#container,
      this.#columnGestureContext(),
    );
    this.#teardown.add(() => this.#columnGestures?.detach());
    this.#entryGestures = options.wiring.entryGestures?.(
      this.#panes.timeline,
      this.#panes.rows,
      this.#container,
      gestureContext,
    );
    this.#teardown.add(() => this.#entryGestures?.detach());
    // Scoped to the timeline pane, not the whole container. A bar's nudge/resize
    // is that pane's own job now. The grid pane's arrows belong to `#rovingFocus` instead.
    this.#keyboardEditing = options.wiring.keyboardEditing?.(this.#panes.timeline, gestureContext);
    this.#teardown.add(() => this.#keyboardEditing?.detach());
    this.#attachWheelNavigation();
    this.#rowTwistyAttachment = attachRowTwisty(this.#panes.rows, {
      toggleCollapse: (id) => this.toggleCollapse(id),
    });
    this.#teardown.add(() => this.#rowTwistyAttachment.detach());
    // ADR 0032: every option a plugin's `view()` could read back through `ctx.gantt` — selection,
    // zoom presets, theme, `a11yLabel` — is applied before this constructor returns. No plugin
    // installs yet. `paintFirstFrame()`, called once `api/gantt.ts` has installed this Gantt's
    // plugins, is what turns this finished-but-unpainted shell into the first live frame.
    //
    // The Dataset's own plugins are held here, not installed. `set plugins` reads this field and
    // combines it with this shell's own chrome the first time a caller assigns one. So both sets
    // resolve under one `requires` order together.
    if (options.collapsed !== undefined) {
      this.#treeCollapse.hydrate(options.collapsed);
    }
    this.#datasetPlugins = options.datasetPlugins ?? [];
    if (options.zoomPresets !== undefined) this.zoomPresets = options.zoomPresets;
    if (options.selectedEntryIds !== undefined) this.selection = options.selectedEntryIds;

    this.#darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    this.#darkSchemeQueryListener = () => this.#syncResolvedTheme();
    this.#darkSchemeQuery.addEventListener('change', this.#darkSchemeQueryListener);
    this.#teardown.add(() =>
      this.#darkSchemeQuery.removeEventListener('change', this.#darkSchemeQueryListener),
    );
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
    this.#themePinObserver = this.#observeThemePin();
    this.#teardown.add(() => this.#themePinObserver.disconnect());
    this.a11yLabel = options.a11yLabel ?? DEFAULT_A11Y_LABEL;
  }

  /** Does a shared `scale` also name preset, range, or fit — options the shared model already
   *  carries, so this Gantt must ignore them? */
  #warnWhenSharedScaleIgnoresOwnOptions(): void {
    const options = this.#options;
    const hasOwnOptions =
      options.preset !== undefined || options.range !== undefined || options.fit !== undefined;
    if (options.scale && hasOwnOptions) {
      // No longer behind `isDevMode()`, which resolved to `false` in every consumer's
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
  }

  /** Which Variant registry does this Gantt use — the consumer's, or core's seeded one? */
  #variantRegistry(): VariantRegistry {
    return (
      this.#options.variantRegistry ??
      createVariantRegistry({
        fieldFor: (key) => this.#options.dataset.field(key),
        reportDoubleMatch: this.#reportDoubleMatch(),
        reportUnknownFieldMatch: this.#reportUnknownFieldMatch(),
      })
    );
  }

  /** How does the splitter preview and commit a Grid width? */
  #attachSplitter(): void {
    this.#splitterAttachment = attachSplitter(this.#panes.splitter, {
      readGridWidth: () => this.#gridPaneWidth.width,
      readMinWidth: () => this.#gridPaneWidth.floor,
      // `aria-valuemax` and `End` both want a concrete number. The #139 ceiling already
      // names one whenever the columns do. A `flex` column names none, so this falls back to the
      // container's own outer bound (`PaneLayout.bounds()`, the same clamp). The pane
      // physically cannot outgrow the Gantt it sits in, ceiling or not.
      readMaxWidth: () => this.#gridPaneWidth.ceiling ?? this.#paneLayout.bounds().width,
      previewGridWidth: (px) => {
        this.#paneLayout.gridWidth = this.#gridPaneWidth.previewDrag(px);
      },
      commitGridWidth: (px) => this.#gridPaneWidth.commitDrag(px),
    });
    this.#teardown.add(() => this.#splitterAttachment.setEnabled(false));
  }

  /** What paints bars, cells, and headers when the consumer named no backend? */
  #defaultBackend(): RenderBackend<HTMLElement> {
    return createDomBackend({
      entryById: (id) => this.#options.dataset.entries.get(id),
      raiseError: this.#raiseError,
      // Per-entry, not per-frame. `EntryVariant.barLabels` merges key by key over this
      // Gantt's own `barLabels`. A merge needs the row's own variant, and only an Entry names one.
      resolveBarLabelPolicy: (entry) =>
        resolveBarLabelPolicy(this.#frameSettings.barLabels, this.variantFor(entry).barLabels),
      readDateLineLabelPlacement: () => this.#frameSettings.dateLineLabelPlacement,
      // ADR 0018: a variant's own `paint` first, because it names the rows it covers. Then
      // `barRenderer`, the catch-all for every bar no variant paints — which is what the retired
      // map's `'*'` entry meant. The consumer's own `barRenderer` beats a plugin's whole-point
      // `bar` renderer.
      //
      // **Core's own `parent` paint is a rule too, so it also answers before the catch-all**.
      // A consumer who wants to paint a summary row writes a variant that matches it.
      // Their rule then beats core's by rank, which is what the catch-all ordering asks for.
      resolveBarRenderer: (entry) => this.#paintFor(entry),
      // `render/dom` never receives `ResolvedColumn` (`column.format` "never
      // reaches a backend", `layout/column.ts`). So this binds it in here instead. render/dom
      // only ever calls an already-column-bound function, keyed by the same `FrameColumn.field`
      // string it already threads through `CellItem.key`.
      resolveGridCellRenderer: (columnKey) => {
        const column = this.#columnChrome.resolvedColumn(columnKey);
        if (column === undefined) return undefined;
        // A per-column `columnRenderer` (this Gantt's own `gridColumns`) beats the
        // Gantt-wide one for that column. No `pluginId`, since a `GridColumn` only ever arrives
        // from the consumer's own config until a plugin can `registerGridColumn`.
        if (column.columnRenderer !== undefined) {
          const perColumnRenderer = column.columnRenderer;
          return {
            renderer: (ctx) =>
              perColumnRenderer({
                ...(ctx.entry !== undefined ? { entry: ctx.entry } : {}),
                value: ctx.value,
                fieldValue: this.#fieldValueForCell(ctx.entry, column.field),
              }),
          };
        }
        const resolved = this.#registrations.renderers.resolve(
          'gridCell',
          this.#frameSettings.gridCellRenderer,
        );
        if (resolved === undefined) return undefined;
        const gridCellRenderer = resolved.renderer;
        return {
          renderer: (ctx) =>
            gridCellRenderer({
              ...ctx,
              column,
              fieldValue: this.#fieldValueForCell(ctx.entry, column.field),
            }),
          ...(resolved.pluginId !== undefined ? { pluginId: resolved.pluginId } : {}),
        };
      },
      // Same bind-in-here posture as `resolveGridCellRenderer` just above. A
      // `GridColumn` has no per-column `headerRenderer` slot (`layout/column.ts`). So this only
      // ever resolves the Gantt-wide/plugin one, bound to its column.
      resolveHeaderRenderer: (columnKey) => {
        const column = this.#columnChrome.resolvedColumn(columnKey);
        if (column === undefined) return undefined;
        const resolved = this.#registrations.renderers.resolve('header', this.#frameSettings.headerRenderer);
        if (resolved === undefined) return undefined;
        const headerRenderer = resolved.renderer;
        return {
          renderer: () => headerRenderer({ column }),
          ...(resolved.pluginId !== undefined ? { pluginId: resolved.pluginId } : {}),
        };
      },
    });
  }

  /** How does a plugin reach this Gantt's registries, overlay, and commands? */
  #createPluginRuntime(): PluginRuntime<unknown> {
    const shellPorts = this.#shellPorts();
    return new PluginRuntime<unknown>((pluginId) => {
      const { parts, gate } = buildPluginPorts(shellPorts, pluginId);
      const context = (this.#options.wiring.buildPluginContext ?? (() => ({})))(parts);
      return { context, disposables: parts.disposables, registrationGate: gate };
    }, this.#raiseError);
  }

  /** What pointer, keyboard, and snap options did the consumer name? */
  #applyInteractionOptions(): void {
    const options = this.#options;
    this.#capabilityRules = options.capabilities ?? {};
    this.#snap = options.snap;
    this.#viewportGestures = options.viewportGestures ?? {};
    this.#resolvedViewportGestures = resolveViewportGestures(this.#viewportGestures);
    this.#pointerActivation = options.pointerActivation ?? 'click';
    this.#convenienceChords = options.convenienceChords ?? {};
    this.#resolvedConvenienceChords = resolveConvenienceChords(this.#convenienceChords);
    this.#capabilities = this.#resolveCapabilities();
  }

  /** What does TreeCollapse ask this shell — planned rows, selection, and a replan on demand? */
  #treeCollapseContext(): TreeCollapseContext {
    return {
      plannedRows: () => this.#layout.plannedRows(),
      entries: () => this.#options.dataset.entries.all,
      entry: (id) => this.#options.dataset.entries.get(id),
      canSelect: (id) => this.#canGesture('select', id),
      selected: () => this.selectedEntryIds[0],
      proposeSelection: (ids) => this.#entrySelection.propose(ids),
      confirm: (change) =>
        this.#proposeChange('beforeCollapseChange', 'collapseChange', change, () => {
          this.#layout.invalidateFrom(0);
          this.#frames.request();
        }),
      announce: (change) => this.#emit('collapseChange', change),
      rowIdForEntry: (id) => this.#layout.rowIdForEntry(id),
      ancestorRowIds: (id) => this.#layout.ancestorRowIds(id),
      // #424: a row hidden under a collapsed ancestor still answers its own state. A write since the
      // last painted frame — a remove, an add, a reparent, a `rowSource` change — must answer before
      // the next frame draws. `ensureRowPlan` replans on demand, at the cost of an identity check
      // when nothing changed. It also keeps `#layout`'s frame caches in step with the replanned row
      // tree, at the same time (#424 review, point 1). So a `reveal` right after this read finds
      // `rowTop`/`barsForEntry` answering about the row `expandableOfRow` just found, not the last
      // painted frame's.
      expandableOfRow: (id) => {
        this.#layout.ensureRowPlan(this.#rowPlanInput(), {
          rowHeight: this.#frameSettings.rowHeight,
          registry: this.#registrations.variants,
        });
        return this.#layout.expandableOfRow(id);
      },
    };
  }

  /** What does the gesture pipeline borrow from this shell to preview and commit a move? */
  #gesturePipelineDeps(): GesturePipelineDeps {
    return {
      timeZone: () => this.#options.dataset.timeZone,
      timeScale: () => this.#viewport.timeScale,
      preset: () => this.#viewport.preset,
      snap: () => this.snap,
      selectedEntryIds: () => this.selectedEntryIds,
      entryById: (id) => this.#options.dataset.entries.get(id),
      // The bar a preview moves is part 0, the one `barId(entryId)` names and the one the pointer
      // and keyboard paths both address. `barsForEntry` answers from the frame that is on screen,
      // box and variant included, so the preview measures the same Bar the commit repaints.
      barForEntry: (id) => this.#layout.barsForEntry(id).find((bar) => bar.id === barId(id)),
      minBarWidthPx: () => this.#frameSettings.minBarWidthPx,
      canGesture: (capability, id, edge) => this.#canGesture(capability, id, edge),
      entriesMovedBy: (entry) => this.#capabilities.entriesMovedBy(entry),
      commitEntryEdits: (edits) => this.#options.wiring.commitEntryEdits?.(edits) ?? false,
      emit: (name, payload) => this.#emit(name, payload),
      raiseError: this.#raiseError,
      ...(this.#options.extraEditsFor ? { extraEditsFor: this.#options.extraEditsFor } : {}),
      ...(this.#options.rolledUpEditsFor ? { rolledUpEditsFor: this.#options.rolledUpEditsFor } : {}),
      committedEntriesById: () => this.#options.dataset.entries.storedValues,
      locale: () => this.#frameSettings.effectiveLocale,
      applyGestureState: (preview, pendingBarIds, cursor, rowDrop) => {
        setOptional(this.#interactionState, 'preview', preview);
        setOptional(this.#interactionState, 'pendingBarIds', pendingBarIds);
        setOptional(this.#interactionState, 'cursorX', cursor?.x);
        setOptional(this.#interactionState, 'cursorLabel', cursor?.label);
        setOptional(this.#interactionState, 'rowDrop', rowDrop);
        this.#backend.applyState(this.#interactionState);
      },
      rowDropZoneAt: (contentY, sourceRowIndex, previous) =>
        rowDropZoneAt(
          {
            y: contentY,
            sourceRowIndex,
            heights: {
              indexAtY: (y) => this.#layout.rowIndexAtY(y),
              topAt: (index) => this.#layout.rowTop(index),
              heightAt: (index) => this.#layout.rowHeightAt(index),
              totalHeight: this.#contentSize.height,
            },
            rowCount: this.#layout.rowCount,
            takesWholeRowInto: (index) => this.#layout.plannedRows()[index]?.childrenAsSegments === true,
          },
          previous,
        ),
      rowsForDrop: () => ({
        rows: this.#layout.plannedRows(),
        rowTop: (index) => this.#layout.rowTop(index),
        rowHeightAt: (index) => this.#layout.rowHeightAt(index),
        entryOf: (id) => this.#options.dataset.entries.get(id),
        rootEntries: () => this.#options.dataset.entries.all.filter((entry) => entry.depth === 0),
      }),
      rowIndexForEntry: (id) => this.#layout.rowIndexForEntry(id),
      canPlace: (entry, parentId) => this.#capabilities.canPlace(entry, parentId),
      verticalDropOffered: () => {
        const resolved = resolveRowSource(this.#frameSettings.rowSource);
        return (
          resolved.source === 'entries' &&
          resolved.tree === true &&
          resolved.sort === undefined &&
          (this.#options.hierarchyFollowsParentId?.() ?? true)
        );
      },
    };
  }

  /** What does a pointer or keyboard editing attachment ask this shell? */
  #entryGestureContext(): EntryGestureContext {
    return {
      hitTest: (at) => this.#backend.hitTest(at) ?? undefined,
      entryFor: (barId) => this.#entryFor(barId),
      can: (capability, entry, edge) => this.#capabilities.can(capability, entry, edge),
      // #230 round 4: `interaction/` asks one collaborator, not four. `EntrySelection` answers all of it
      // (ADR 0025: a former Segment is an ordinary Entry, so there is no second projection to ask).
      selection: {
        entryIds: () => this.#entrySelection.entryIds,
        propose: (next) => this.#entrySelection.propose(next),
        selectableEntriesInRowOrder: () => this.#entrySelection.selectableEntriesInRowOrder(),
        selectableEntriesOf: (hit) => this.#entrySelection.selectableEntriesOf(hit),
      },
      // #434: independent of `selection` above — a rollup row with `{ select: false, activate: true
      // }` names no selectable Entry there but still names an activation subject here.
      activation: {
        activateFromClick: (entry, detail, target) => this.#activateFromClick(entry, detail, target),
      },
      subjectEntryOf: (hit) => this.#subjectEntryOf(hit),
      setHovered: (barId) => this.#setHovered(barId),
      setHoveredRow: (rowId) => this.#setHoveredRow(rowId),
      contentXAtPaneOffset: (offsetX) => offsetX + this.#viewport.scroll.x.state.position,
      // The sticky header sits in flow ahead of the rows (`view/styles.ts`'s `.fg-header`), so a
      // pane-relative offset counts it. A row's own content-y (what `rowTop`/`rowIndexAtY` index)
      // does not — subtract it here, once, so a caller never re-derives the header's height by hand.
      // The timeline pane's top stands in for both panes'. The grid pane shares its top and its
      // header height (`measureHeaderHeight`). So one client-y reading needs no pane argument.
      contentYAtClientY: (clientY) =>
        clientY -
        this.#paneLayout.timelineTop() +
        this.#viewport.scroll.y.state.position -
        this.#paneLayout.measureHeaderHeight(),
      rowEdgeScroll: this.#rowEdgeScroll,
      session: (grabbed, gesture) => this.#gesturePipeline.session(grabbed, gesture),
      discardHeldGesture: () => this.#gesturePipeline.discardHeldGesture(),
    };
  }

  /** Which double-click on this container activates an Entry? */
  #attachDoubleClickActivation(): void {
    this.#dblClickListener = (event: MouseEvent) => {
      if (this.#pointerActivation !== 'dblclick' || !(event.target instanceof Node)) return;
      const domTarget = this.#dom.targetUnder(event.target);
      if (domTarget === undefined || domTarget.entry === undefined) return;
      if (!this.#isActivatableTargetKind(domTarget.kind)) return;
      if (domTarget.kind === 'gridCell' && this.#editorTakesFocusedCell()) return;
      if (!this.#canGesture('activate', domTarget.entry.id)) return;
      this.#activateEntry(domTarget.entry, 'dblclick', domTarget.kind);
    };
    this.#container.addEventListener('dblclick', this.#dblClickListener);
    this.#teardown.add(() => this.#container.removeEventListener('dblclick', this.#dblClickListener));
  }

  /** What does a column-gesture attachment ask this shell? */
  #columnGestureContext(): ColumnGestureContext {
    return {
      // The lock gates the read, not the stored resolution — see `#renderedColumns`.
      isResizable: (columnKey) => this.#gridResizable && this.#columnChrome.isResizable(columnKey),
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
  }

  /** How do wheel zoom and pan reach both the timeline pane and the grid pane? */
  #attachWheelNavigation(): void {
    const wheelNavigationCtx: WheelNavigationContext = {
      wheelZoomEnabled: () => this.#resolvedViewportGestures.wheelZoom,
      wheelPanEnabled: () => this.#resolvedViewportGestures.wheelPan,
      zoomIn: (offsetX) => this.zoomIn(offsetX),
      zoomOut: (offsetX) => this.zoomOut(offsetX),
      panBy: (dx, dy) => this.#panBy(dx, dy),
    };
    this.#wheelNavigation = attachWheelNavigation(this.#panes.timeline, wheelNavigationCtx);
    this.#teardown.add(() => this.#wheelNavigation?.detach());
    // #126: the grid pane has no scroll of its own. So this forwards its wheel input
    // into the same shared scroll the timeline pane already writes into. `anchorPane` keeps ctrl/⌘+wheel
    // zoom anchored on the timeline's time axis, since the grid pane's own x-axis isn't time.
    this.#wheelNavigationGrid = attachWheelNavigation(this.#panes.rows, wheelNavigationCtx, {
      anchorPane: this.#panes.timeline,
      forwardPlainWheel: true,
    });
    this.#teardown.add(() => this.#wheelNavigationGrid?.detach());
  }

  /** Which root does an ancestor's `data-fg-theme` pin live on? */
  #observeThemePin(): MutationObserver {
    const themePinRoot = this.#container.getRootNode();
    const themePinTarget =
      themePinRoot.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? themePinRoot : this.#container.ownerDocument;
    const observer = new MutationObserver(() => this.#syncResolvedTheme());
    observer.observe(themePinTarget, {
      attributes: true,
      subtree: true,
      attributeFilter: ['data-fg-theme'],
    });
    return observer;
  }

  /** ADR 0032: the shell's own first paint, run once `api/gantt.ts` has installed this Gantt's
   *  plugins. It runs through the public `plugins` setter — the same one a later
   *  `gantt.plugins = [...]` uses. So a plugin's registrations (a variant, a grid column, a decoration) shape frame 1
   *  instead of forcing a second render behind it. #376: `#constructed` flips last, on purpose — a
   *  constructor-supplied plugin's own subscription starts hearing real changes only once this
   *  returns. Everything before it, in the constructor and in this method, was wiring. */
  paintFirstFrame(): void {
    this.#phase = 'live';
    this.#frames.flush();
    this.#constructed = true;
  }

  get locale(): Intl.LocalesArgument | undefined {
    return this.#frameSettings.locale;
  }

  /** Live: re-labels every header band and every screen-reader date with no bar
   *  remount — it flows straight through `LayoutInput.locale` on the next render. What that costs
   *  is `frame-settings.ts`'s own table to state, not this setter's. Every live setting below reads
   *  the same way, which is the whole point of #167. */
  set locale(l: Intl.LocalesArgument | undefined) {
    this.#frameSettings.set({ locale: l });
  }

  /** This Gantt's own `locale` first, then the Dataset's, then the runtime's own (#583). The one
   *  read `api/gantt.ts`'s `formatFieldValue` takes, so it never drifts from what a Grid cell and a
   *  bar label already show. */
  get effectiveLocale(): Intl.LocalesArgument | undefined {
    return this.#frameSettings.effectiveLocale;
  }

  /** The columns the consumer authored, and only those (#181). A plugin's registered column
   *  renders. It stays out of this list, because it is the plugin's declaration and not this Gantt's
   *  configuration. A resize or a reorder does not change that. So the documented save round-trip
   *  (`gantt.on('gridColumnsChange', ({ to }) => save(to.map((c) => c.field)))`) never persists a
   *  column whose plugin the next load leaves out. */
  get gridColumns(): readonly GridColumnInput[] {
    return this.#columnChrome.authoredColumns;
  }

  /** A plain reconfiguration still runs the same cancelable commit sequence a resize drag or a
   *  reorder drop runs. One write path, one place the veto lives. `set gridWidth`
   *  above already takes the same posture for the splitter. */
  set gridColumns(columns: readonly GridColumnInput[]) {
    this.#columnChrome.commit(columns);
  }

  /** Which of this Gantt's own columns are hidden, by field key. Read it to label a
   *  column chooser. A plugin's column is the plugin's declaration, so this getter reports the
   *  consumer's hidden columns only — the same rule `gridColumns` above follows. */
  get hiddenGridColumns(): readonly FieldKey[] {
    return this.#columnChrome.hiddenColumns;
  }

  /** Takes one column off the screen and leaves the other columns alone. The hidden
   *  column keeps its width and its position, so `showGridColumn` puts it back where it was. Runs
   *  the cancelable commit sequence a resize drag runs, so it raises
   *  `beforeGridColumnsChange`/`gridColumnsChange` and a handler can refuse it. Throws
   *  `UnknownGridColumnError` when no declared column names the field. */
  hideGridColumn(field: FieldKey): void {
    this.#columnChrome.commitHidden(field, true);
  }

  /** The twin of `hideGridColumn`. Puts a hidden column back at its own place in the
   *  order, with the width it had. */
  showGridColumn(field: FieldKey): void {
    this.#columnChrome.commitHidden(field, false);
  }

  /** Live. Reassigning repaints every bar with no remount (I8) — same posture as `barRenderer`
   *  just below. */
  get barLabels(): BarLabels {
    return this.#frameSettings.barLabels;
  }

  set barLabels(barLabels: BarLabels) {
    this.#frameSettings.set({ barLabels });
  }

  /** Live. Reassigning repaints every bar with no remount (I8). */
  get barRenderer(): BarRenderer | undefined {
    return this.#frameSettings.barRenderer;
  }

  set barRenderer(renderer: BarRenderer | undefined) {
    this.#frameSettings.set({ barRenderer: renderer });
  }

  get gridCellRenderer(): GridCellRenderer | undefined {
    return this.#frameSettings.gridCellRenderer;
  }

  set gridCellRenderer(renderer: GridCellRenderer | undefined) {
    this.#frameSettings.set({ gridCellRenderer: renderer });
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

  collapseStateOf(id: RowId | string): CollapseState | undefined {
    return this.#treeCollapse.collapseStateOf(id);
  }

  collapseAll(): void {
    this.#treeCollapse.collapseAll();
  }

  expandAll(): void {
    this.#treeCollapse.expandAll();
  }

  /** One `before*` → apply → `*` sequence, for every cancelable Gantt-state change:
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

  /** The Selection itself (#212, ADR 0010, ADR 0025) — Entry ids. */
  get selection(): readonly EntryId[] {
    return this.#entrySelection.entryIds;
  }

  /** Live; runs the same cancelable sequence a click runs. Loose in (`EntryId | string`),
   *  branded out — the same asymmetry `dataset.entries.get/update/remove` already ship. */
  set selection(ids: readonly (EntryId | string)[]) {
    this.#entrySelection.propose(ids.map((id) => entryId(id)));
  }

  /** The Entries the Selection holds, in row order (#212, ADR 0010, ADR 0025). It is one projection.
   *  The public getter, the affordance ids, the gesture pipeline and every command context read it.
   *  So no two of them can disagree about what is selected. */
  get selectedEntryIds(): readonly EntryId[] {
    return this.#entrySelection.entryIds;
  }

  get variants(): readonly EntryVariant[] {
    return this.#variants;
  }

  /** Live (ADR 0018): replaces the consumer's own variant list. Every row resolves its variant again,
   *  every row produces its Bars again, and every capability re-resolves — one registration changes
   *  all three. A plugin's variants are untouched, and they still lose to these. */
  set variants(next: readonly EntryVariant[]) {
    this.#installConsumerVariants(next);
    this.#layout.invalidateFrom(0);
    this.#refreshCapabilities();
    this.#frames.request();
  }

  /** The whole variant this Gantt resolved for one row (ADR 0018, ADR 0022 §3). One door answers
   *  `bars`/`paint`/`can`/`css` together. No caller looks a name up again (ADR 0022 §3).
   *  `render/` and `interaction/` read the same answer.
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
   *  name can then answer with the paint of a rule that did not match this row. No
   *  `pluginId` on the answer: a variant's paint is named by the variant, and the double-match
   *  diagnostic is what names a plugin. */
  #paintFor(entry: Entry): ResolvedRenderer<BarRenderer> | undefined {
    const paint = this.#registrations.variants.resolveFor(entry).paint;
    if (paint !== undefined) return { renderer: paint };
    return this.#registrations.renderers.resolve('bar', this.#frameSettings.barRenderer);
  }

  /** What one bar's label prints (#421 C5): the merged Field's own `formatValue`, read through the
   *  same door a Grid cell reads through. `LayoutInput.barLabelFor`'s only caller. */
  #labelFor(entry: Entry): string {
    return resolveBarLabelText(
      entry,
      this.#frameSettings.barLabels,
      this.variantFor(entry).barLabels,
      this.#barLabelPorts,
      this.#columnBind(),
    );
  }

  /** The `FormatContext` a Grid column, a bar label, and `dataset.formatFieldValue` all format
   *  through. A caller building its own Formatter call takes this instead of assembling a second
   *  copy. */
  get formatContext(): FormatContext {
    const bind = this.#columnBind();
    return createFormatContext(bind.timeZone, bind.locale);
  }

  get capabilities(): Capabilities {
    return this.#capabilityRules;
  }

  /** Live: re-resolves the capability table immediately. It then re-derives the two
   *  resolved affordance ids off the current hover and selection. A stricter rule takes effect
   *  without waiting for the next pointer move. */
  set capabilities(next: Capabilities) {
    this.#capabilityRules = next;
    this.#refreshCapabilities();
  }

  /** Writes one gesture's rule and leaves every other rule standing. It replaces the value
   *  it holds with a copy, so the object a consumer assigned is never mutated (`plans/02` §2). */
  setCapabilityRule<K extends keyof Capabilities>(capability: K, rule: NonNullable<Capabilities[K]>): void {
    this.#capabilityRules = { ...this.#capabilityRules, [capability]: rule };
    this.#refreshCapabilities();
  }

  /** Drops this Gantt's own rule for one gesture. A variant's own `capabilities` and the library
   *  table answer that gesture again. Clearing a gesture that carries no rule changes nothing. */
  clearCapabilityRule(capability: keyof Capabilities): void {
    if (this.#capabilityRules[capability] === undefined) return;
    const next = { ...this.#capabilityRules };
    delete next[capability];
    this.#capabilityRules = next;
    this.#refreshCapabilities();
  }

  /** `EntrySelection`'s one ports object (#230 round 4, ADR 0025) — the shell's own state, behind the
   *  closures `EntrySelectionPorts` names. `confirm`/`announce` reuse the shell's own
   *  `#proposeChange`/`#events`, so a Selection change is one more line in `ProposableChange`, not a
   *  second veto path. `paint` writes the backend's own state and re-derives hover/gesture
   *  affordances from it — the same pair every direct `#selection` write used to make by hand. */
  #entrySelectionPorts(): EntrySelectionPorts {
    return {
      plannedRows: () => this.#layout.plannedRows(),
      rowIdForEntry: (id) => this.#layout.rowIdForEntry(id),
      canGesture: (capability, id) => this.#canGesture(capability, id),
      confirm: (change, apply) =>
        this.#proposeChange('beforeSelectionChange', 'selectionChange', change, apply),
      announce: (change) => this.#emit('selectionChange', change),
      paint: (entryIds) => {
        this.#interactionState.selectedEntryIds = entryIds;
        this.#refreshAffordances();
      },
    };
  }

  /** The one place `resolveCapabilities` is called. The constructor, `set
   *  capabilities` and `set variants` all re-derive from here, rather than repeating the call. */
  #resolveCapabilities(): ResolvedCapabilities {
    return resolveCapabilities({
      capabilities: this.#capabilityRules,
      fieldFor: (key) => this.#options.dataset.field(key),
      variantCapabilitiesFor: (entry) => this.#registrations.variants.resolveFor(entry).capabilities,
      editableOf: (id, key) => this.#options.dataset.editableOf(id, key),
      placeableOf: this.#options.placeableOf,
    });
  }

  /** `set capabilities` and a variant registration's register/dispose pair both change an input
   *  `#resolveCapabilities` reads. So both re-resolve the capability table and re-derive the
   *  affordance ids the same way (#154). This method writes that once, instead of three times. The
   *  constructor's own first resolve (above) runs before `#refreshAffordances` has anything to
   *  refresh, so it calls `#resolveCapabilities()` directly and skips this. */
  #refreshCapabilities(): void {
    this.#capabilities = this.#resolveCapabilities();
    this.#refreshAffordances();
  }

  /** Reversed by #489: what a drag snaps to right now — this Gantt's own setting when it
   *  states one, else `'none'`. A consumer who never states `gantt.snap` gets free dragging; a
   *  preset no longer switches snapping on by itself. A gesture resolves `'tick'` against the
   *  preset it is measuring. */
  get snap(): SnapSetting {
    return this.#snap ?? 'none';
  }

  /** Live. The next drag reads it; nothing repaints. `undefined` turns snapping off again.
   *  A concrete `{ unit, increment }` is checked here. A bad unit or a non-advancing increment
   *  throws on assignment. Otherwise it would surface two gestures later, inside a drag (#201).
   *  `isTimeUnit` lets a caller check the unit before it reaches this setter. A custom `SnapRule`
   *  function is not checked here — the consumer's own rule decides. */
  set snap(next: SnapSetting | undefined) {
    if (next !== undefined && next !== 'tick' && next !== 'none' && typeof next !== 'function') {
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

  /** Live: the next wheel or key reads the new flags; no remount. */
  set viewportGestures(next: ViewportGestures) {
    this.#viewportGestures = next;
    this.#resolvedViewportGestures = resolveViewportGestures(next);
  }

  get pointerActivation(): PointerActivation {
    return this.#pointerActivation;
  }

  /** Live (#434): the next click or double-click reads the new option. The `dblclick` listener is
   *  always attached, and this alone gates it — the same shape `viewportGestures`'s resolved flags
   *  gate an already-attached wheel handler. */
  set pointerActivation(next: PointerActivation) {
    this.#pointerActivation = next;
  }

  get convenienceChords(): ConvenienceChords {
    return this.#convenienceChords;
  }

  /** Live (#262): the next keystroke reads the new flags; no remount. */
  set convenienceChords(next: ConvenienceChords) {
    this.#convenienceChords = next;
    this.#resolvedConvenienceChords = resolveConvenienceChords(next);
  }

  /** The live `CommandContext` builder.
   *
   *  `entry` is the first selected entry, or `undefined` when nothing is selected. `target` names
   *  what real keyboard focus sits on right now, one of the five `TargetKind`s.
   *
   *  A keyboard chord has no right-clicked node to reconcile against the Selection. So `target`'s
   *  `entryIds` names the Selection directly, for every kind but `'header'` and `'splitter'` (#212).
   *  `when`/`run` then read `ctx.target.entryIds` exactly as a mouse invocation does.
   *  `api/gantt.ts`'s injected `buildCommandContext` fills `dataset`/`gantt` — `view/` may not
   *  name either type.
   *
   *  A `wiring` with no `buildCommandContext` makes every command's context an empty object, for a
   *  test that drives the shell alone. That is fine. No core command reads `ctx.dataset`/`ctx.gantt`
   *  without first checking `ctx.entry`/`ctx.target`, and no such test runs a command that needs
   *  them. */
  #buildCommandContext(): CommandContext<unknown> {
    const entryIds = this.#entrySelection.entryIds;
    const id = entryIds[0];
    const entry = id !== undefined ? this.#options.dataset.entries.get(id) : undefined;
    // Real DOM focus is the single source of truth for "what is the target of
    // this chord". `view/roving-focus.ts` moves focus onto the exact node a chord acts on —
    // a row, a cell, a bar, a header cell, or the splitter.
    const focused = this.#rovingFocus.focusedElement();
    const domTarget = focused !== undefined ? this.#dom.targetUnder(focused) : undefined;
    // #199/#212: no node holds focus (an empty pane) — fall back to the Selection alone.
    const target =
      domTarget === undefined
        ? entryIds.length > 0
          ? { kind: 'bar' as const, entryIds }
          : undefined
        : this.#targetFromDom(domTarget, entryIds);
    // `view/` may not name `CommandContextOf`'s api-level fields (`dataset: Dataset`, `gantt`).
    // So this cast trusts `api/gantt.ts`'s injected `buildCommandContext` to fill
    // them. `buildPluginContext` above already gets the same trust for `PluginContext`.
    return (this.#options.wiring.buildCommandContext ?? (() => ({})))({
      ...(entry !== undefined ? { entry, variant: this.variantFor(entry).name } : {}),
      ...(target !== undefined ? { target } : {}),
    }) as CommandContext<unknown>;
  }

  /** The `CommandTarget` a resolved `DomTarget` names. `'header'` and `'splitter'`
   *  stand for no Entry, so both name empty sets, matching `DomTarget`'s own contract. Every other
   *  kind names the current Selection. A keyboard chord has no separate "clicked" thing to reconcile
   *  the Selection against (this file's own doc comment above). */
  #targetFromDom(domTarget: DomTarget, entryIds: readonly EntryId[]) {
    // Each arm returns an object literal with its own `kind` literal, never `domTarget.kind` read
    // straight through. That keeps the inferred return type the exact union `CommandTarget` names.
    // Widening `kind` to plain `TargetKind` would lose that precision.
    switch (domTarget.kind) {
      case 'header': {
        const field = domTarget.field;
        return field !== undefined
          ? { kind: 'header' as const, field, entryIds: [] }
          : { kind: 'bar' as const, entryIds };
      }
      case 'splitter':
        return { kind: 'splitter' as const, entryIds: [] };
      case 'row':
        return { kind: 'row' as const, entryIds };
      case 'gridCell':
        return domTarget.field !== undefined
          ? { kind: 'gridCell' as const, field: domTarget.field, entryIds }
          : { kind: 'gridCell' as const, entryIds };
      case 'bar':
        return { kind: 'bar' as const, entryIds };
    }
  }

  /** The shell verbs `core-commands.ts`'s catalog calls, closing over this shell's own
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
      selectAll: () => this.#entrySelection.propose(this.#entrySelection.selectableEntriesInRowOrder()),
      clearSelection: () => this.#entrySelection.propose([]),
      hasSelection: () => this.#entrySelection.entryIds.length > 0,
      keyboardPanEnabled: () => this.#resolvedViewportGestures.keyboardPan,
      nothingSelected: () => this.#entrySelection.entryIds.length === 0,
      selectNextEntry: () => this.#entrySelection.step(1),
      selectPreviousEntry: () => this.#entrySelection.step(-1),
      canActivateFocused: () => this.#focusedActivationTarget() !== undefined,
      activateFocused: () => {
        const target = this.#focusedActivationTarget();
        if (target !== undefined) this.#activateEntry(target.entry, 'key', target.kind);
      },
      canClearDates: (id) => this.#canClearDates(id),
      clearDates: (id) => {
        this.#options.dataset.entries.update(id, { start: undefined, end: undefined });
      },
      pageDown: () => this.#panBy(0, this.#viewport.visible.height),
      pageUp: () => this.#panBy(0, -this.#viewport.visible.height),
      panToStart: () => this.#viewport.scroll.x.panTo(0),
      panToEnd: () => this.#viewport.scroll.x.panTo(this.#viewport.scroll.x.state.max),
      panRight: () => this.#panBy(this.#viewport.preset.preferredTickWidthPx, 0),
      panLeft: () => this.#panBy(-this.#viewport.preset.preferredTickWidthPx, 0),
      panDown: () => this.#panBy(0, this.#frameSettings.rowHeight),
      panUp: () => this.#panBy(0, -this.#frameSettings.rowHeight),
      // Same gate as the pointer gesture's `isResizable` above — a locked Gantt refuses the
      // keyboard resize chord (Shift+Arrow) too, off the same authored resolution.
      isColumnResizable: (key) => this.#gridResizable && this.#columnChrome.isResizable(key),
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
      selectOnFocus: (hit) => this.#entrySelection.propose(this.#entrySelection.selectableEntriesOf(hit)),
      setFocusedColumn: (field) => this.#columnChrome.setFocusedColumn(field),
      revealRow: (index) => {
        const y = this.#layout.rowTop(index);
        this.#viewport.reveal({
          x: this.#viewport.scroll.x.state.position,
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
      invalidateBars: () => this.#layout.invalidateFrom(0),
      readPixelProperty: (property, policy) => readPixelProperty(this.#container, property, policy),
      datasetLocale: () => this.#options.dataset.locale,
    };
  }

  /** What the constructor's own options say about the next frame. An unset option is spread away
   *  rather than assigned, because a key present with `undefined` means "clear this setting". That
   *  is not what an omitted option asks for. */
  #initialFrameSettings(options: GanttShellOptions): FrameSettingsPatch {
    return {
      locale: options.locale,
      barRenderer: options.barRenderer,
      gridCellRenderer: options.gridCellRenderer,
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
      lastPaintedBar: (id) => this.#lastBarById.get(barId(id)),
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

  /** Which cell real keyboard focus sits on, if any. This runs the same `DomTarget`
   *  resolution `#buildCommandContext` runs for a chord, read here for `ctx.view.focusedCell()`
   *  instead. `Enter` is `inline-editing.ts`'s first caller: it retired the "open the first editable
   *  column" stand-in the day roving focus shipped a real per-cell answer. */
  #focusedCell(): { entryId: EntryId; field: FieldKey } | undefined {
    const focused = this.#rovingFocus.focusedElement();
    const target = focused !== undefined ? this.#dom.targetUnder(focused) : undefined;
    if (target?.kind !== 'gridCell' || target.entry === undefined || target.field === undefined) {
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
      invalidateBars: () => this.#layout.invalidateFrom(0),
      refreshCapabilities: () => this.#refreshCapabilities(),
      refreshVariantStyles: () => this.#variantStyles.refresh(),
      registerGridColumn: (column, pluginId) => this.#columnChrome.registerPluginColumn(column, pluginId),
    };
  }

  /** Where a `DoubleVariantMatch` is reported (ADR 0018). Two plugins' rules both matched one
   *  Entry. The newest paints and the older draws nothing. This names both, so the consumer sees
   *  which two plugins overlap. The library never arbitrates — the consumer chose the plugins.
   *
   *  One report per pair of variants, not one per hover. `variantFor` runs on every hover change,
   *  and the same two plugins collide on every Entry they both own. The first collision is the news.
   *
   *  Not behind `isDevMode()`, for the reason the `'scale-options-ignored'` warning already found.
   *  That flag resolves when the *library* is built. A dev-mode gate would therefore delete this
   *  line from every consumer's build, and the warning would never fire for anybody. The
   *  `console.warn` fallback runs only when nothing is subscribed to `error`. */
  #reportDoubleMatch(): ReportDoubleMatch {
    const reported = new Set<string>();
    return ({ entryId, painted, ignored }) => {
      const pair = `${painted.variant}|${ignored.variant}`;
      if (reported.has(pair)) return;
      reported.add(pair);
      const by = (registration: RegisteredVariant): string =>
        registration.pluginId === undefined
          ? `'${registration.variant}'`
          : `'${registration.variant}' (${registration.pluginId})`;
      const message =
        `Two variant rules both cover entry '${entryId}': ${by(painted)} and ${by(ignored)}. ` +
        `The newest registered rule paints; ${by(ignored)} draws nothing on the entries they share.`;
      this.#raiseError(
        { code: 'variant-matched-twice', message, severity: 'warning', by: 'core', entryId },
        () => console.warn(`FreeGantt: ${message}`),
      );
    };
  }

  /** Where an `UnknownFieldMatch` is reported. A `when` names a key no Field declares, so
   *  the rule matches no row — a typo, or a plugin key the Dataset never declared. The frame keeps
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
        `It matches no row. Declare the field on the Dataset, or correct the key.`;
      this.#raiseError(
        { code: 'unknown-variant-field', message, severity: 'warning', by: 'core', field: key },
        () => console.warn(`FreeGantt: ${message}`),
      );
    };
  }

  /** Where a shadowed `barRenderer` is reported (#448). `#paintFor`'s ladder reaches `barRenderer`
   *  only when the resolved variant has no `paint` of its own. When every Entry in the Dataset
   *  already resolves to a variant that paints, `barRenderer` never runs, and nothing said why.
   *
   *  Checked once per assignment, against the whole Dataset's Entries — `render()` already holds
   *  `dataset.entries.all` — never against one frame's windowed rows. A frame can hold only
   *  variant-painted rows while other rows sit off-window. That answers "did this frame paint with
   *  it", not "does this renderer ever paint". A scroll must not read as the second question.
   *
   *  The `WeakSet` is keyed on the renderer function itself. A scroll, a hover, or a variant added
   *  or removed re-renders with the same function, and checks nothing twice. Assigning a new
   *  function is a new assignment, and gets its own check. An empty Dataset answers nothing, so it
   *  is never recorded as checked — the check runs again once an Entry exists to ask about.
   *
   *  Not behind `isDevMode()`, for the reason the `'scale-options-ignored'` warning already found. */
  #createBarRendererShadowedReport(): (renderer: BarRenderer, entries: readonly Entry[]) => void {
    const checked = new WeakSet<BarRenderer>();
    return (renderer, entries) => {
      if (entries.length === 0 || checked.has(renderer)) return;
      checked.add(renderer);
      const everyEntryHasItsOwnPaint = entries.every((entry) => this.variantFor(entry).paint !== undefined);
      if (!everyEntryHasItsOwnPaint) return;
      const message =
        `'barRenderer' painted no bars: every entry resolved to a variant with its own 'paint', ` +
        `and a variant outranks the Gantt-wide renderer. Remove a variant's 'paint', or move this ` +
        `renderer into the variants that need it.`;
      this.#raiseError({ code: 'bar-renderer-shadowed', message, severity: 'warning', by: 'core' }, () =>
        console.warn(`FreeGantt: ${message}`),
      );
    };
  }

  /** Where an `UnknownRowSourceField` is reported, beside `UnknownFieldMatch`. A
   *  `childrenAsSegments` rule names a key no Field declares, so it matches no row — a typo, or a
   *  plugin key the Dataset never declared. Unlike a variant, `childrenAsSegments` is not one of
   *  several named rules, so it has no rule name to print. The message names the config key instead.
   *
   *  `compileEntryRule`'s own dedupe holds for one row pass; this Set holds across every frame this
   *  Gantt renders. `resolveEntriesSource` recompiles the rule on every `render()`, and row-source
   *  config rarely changes, but a stale key must not spam a report per frame. */
  #reportUnknownRowSourceField(): (key: FieldKey) => void {
    const reported = new Set<FieldKey>();
    return (key) => {
      if (reported.has(key)) return;
      reported.add(key);
      const message =
        `'childrenAsSegments' matches on field '${key}', and no Field declares it. ` +
        `It matches no row. Declare the field on the Dataset, or correct the key.`;
      this.#raiseError(
        { code: 'unknown-row-source-field', message, severity: 'warning', by: 'core', field: key },
        () => console.warn(`FreeGantt: ${message}`),
      );
    };
  }

  /** Where an unknown bar-label Field is reported (#421). `barLabels.field` — the Gantt's own,
   *  or an `EntryVariant`'s — names a key no Field declares, once merged (`mergeBarLabels`). Both
   *  are live. `resolveBarLabelText` runs inside `render()`'s own rAF callback. A throw there
   *  reaches no consumer, so it reports and carries on; the bar prints no label.
   *
   *  One report per field key, not one per bar per frame: this Set holds across every frame this
   *  Gantt renders. `#reportUnknownRowSourceField` already holds the same shape for its own key. */
  #reportUnknownBarLabelField(): (field: FieldKey) => void {
    const reported = new Set<FieldKey>();
    return (field) => {
      if (reported.has(field)) return;
      reported.add(field);
      const message =
        `'barLabels' names field '${field}', and no Field declares it. ` +
        `No label prints for the bars it covers. Declare the field on the Dataset, or correct the key.`;
      this.#raiseError(
        { code: 'unknown-bar-label-field', message, severity: 'warning', by: 'core', field },
        () => console.warn(`FreeGantt: ${message}`),
      );
    };
  }

  /** Page/Home/End/arrow pan binds here, alongside the eleven other core commands
   *  registered through `core-commands.ts` — a plugin can override any of them. The old
   *  standalone `attachKeyboardNavigation` (`view/keyboard-navigation.ts`) is superseded by this;
   *  this shell no longer calls it. */
  /** ADR 0012: a Delete on a bar un-dates the Entry that bar draws, so this asks whether those dates
   *  are the Entry's own to clear. A rolling-up parent's are not — the Rollup writes them (ADR 0013)
   *  — and an Entry holding no date has nothing to clear. Both answer `false`, and the Delete passes
   *  over the bar instead of throwing out of a keypress. Only the dates the Entry actually holds are
   *  asked about: a half-dated descendant clears the one it has. */
  #canClearDates(id: EntryId): boolean {
    const entry = this.#options.dataset.entries.get(id);
    if (entry === undefined) return false;
    if (entry.start === undefined && entry.end === undefined) return false;
    const writable = (field: 'start' | 'end'): boolean =>
      entry[field] === undefined || this.#capabilities.canWrite(entry, field).ok;
    return writable('start') && writable('end');
  }

  #registerCoreCommands(): void {
    registerCoreCommands(this.#commandRegistry, this.#coreCommandPorts());

    const bind = (chord: string, command: string): void => {
      this.#keymap.register({ chord, command });
    };
    // #262: a convenience chord carries one extra `when` no obligation chord needs — whether
    // `Gantt.convenienceChords` still turns this command's own chord on. WCAG 2.1.1 keeps
    // every obligation chord below on `bind` instead, with no way to silence it. The gate touches
    // only the chord: the command itself stays reachable through `commands.run(id)` either way.
    const bindConvenience = (chord: string, command: ConvenienceCommandId): void => {
      this.#keymap.register({ chord, command, when: () => this.#resolvedConvenienceChords[command] });
    };
    // roving focus (`view/roving-focus.ts`) now owns the plain arrows, Home/End
    // and Page Up/Down in both panes. A grid-pane arrow moves focus between rows and cells. A
    // timeline-pane arrow nudges the focused bar instead (`interaction/keyboard-editing.ts`).
    // Panning gets no plain chord at all, because moving focus already scrolls the target into
    // view. Horizontal panning survives as an explicit, Gantt-wide fallback on
    // `Alt+ArrowLeft`/`Alt+ArrowRight`. Vertical panning gets none, since a focused row is always
    // already visible. `Mod+Home`/`Mod+End` are the same fallback for the whole time axis. That
    // differs from the grid pane's own `Home`/`End`, which jump to the first and last row.
    // Convenience (#262): `panToDate` reaches the same spot without the chord.
    bindConvenience('Alt+ArrowRight', 'freegantt.panRight');
    bindConvenience('Alt+ArrowLeft', 'freegantt.panLeft');
    bindConvenience('Mod+Home', 'freegantt.panToStart');
    bindConvenience('Mod+End', 'freegantt.panToEnd');
    // keyboard zoom did not exist before this slice (S3.7 shipped only the
    // ctrl/⌘+wheel pointer gesture). `Mod+=`/`Mod+-` mirror the browser's own page-zoom chords;
    // `Mod+0` mirrors the browser's own reset-zoom chord, repurposed here for "pan to today".
    // Convenience (#262): `zoomIn`/`zoomOut`/`panToToday` are public methods too.
    bindConvenience('Mod+=', 'freegantt.zoomIn');
    bindConvenience('Mod+-', 'freegantt.zoomOut');
    bindConvenience('Mod+0', 'freegantt.panToToday');
    // Convenience (#262): `gantt.selectedEntryIds = ...` selects everything without the chord.
    bindConvenience('Mod+A', 'freegantt.selectAll');
    // Obligation (#262): WCAG 2.1.1 — the only keyboard path that clears the Selection.
    bind('Escape', 'freegantt.clearSelection');
    // #119: the whole-Gantt undo/redo chord. `captureInEditable` stays at its default `false`
    // (same gate `Delete` below relies on), so an `<input>`'s own native undo keeps this chord.
    // Convenience (#262): Undo/Redo has a button; `dataset.undo()`/`redo()` has a method.
    bindConvenience('Mod+Z', 'freegantt.undo');
    bindConvenience('Mod+Shift+Z', 'freegantt.redo');
    // `resizeColumnWider`/`moveColumnRight` and their pair share a chord
    // with `panRight`/`panLeft` above. `Keymap.resolve()`'s newest-first order checks
    // these two first. Their own `when` refuses unless a header cell is focused, so an unfocused
    // header falls through to the plain pan bound above it.
    // Obligation (#262): WCAG 2.1.1 — the only keyboard path to resize or reorder a
    // column. `convenienceChords` cannot silence these even while it silences the pan above.
    bind('Shift+ArrowRight', 'freegantt.resizeColumnWider');
    bind('Shift+ArrowLeft', 'freegantt.resizeColumnNarrower');
    bind('Alt+ArrowRight', 'freegantt.moveColumnRight');
    bind('Alt+ArrowLeft', 'freegantt.moveColumnLeft');
    // #212, ADR 0010, ADR 0025: a row can draw several bars, one Entry each. So a keyboard user
    // needs a way to move the Selection from one bar of a row to the next. `interaction/
    // keyboard-editing.ts` leaves a modified arrow alone, so this chord never also nudges the entry
    // it just reselected.
    // Obligation (#262): WCAG 2.1.1 — the only keyboard path to a second bar on a row.
    bind('Mod+ArrowRight', 'freegantt.selectNextEntry');
    bind('Mod+ArrowLeft', 'freegantt.selectPreviousEntry');
    // #212, ADR 0010: the same command the right-click menu offers. `captureInEditable` stays at
    // its default `false` — Keymap's own gate. So a cell editor's `<input>` and mid-IME composition
    // both refuse the chord, the same way every other core binding already does.
    // Convenience (#262): a bar's Delete un-dates through `entries.update`, a row's through
    // `entries.remove()` — both public. An app that owns its own Delete may take the chord back.
    bindConvenience('Delete', 'freegantt.deleteSelection');
    // #434: the fallback for `Enter`. `inlineEditing()`'s own binding to the same chord is
    // registered later (a plugin installs after `#registerCoreCommands` runs), so it is newer and
    // gets first refusal. Its `when` declines outside a focused, writable cell. The
    // resolver then falls through to this one, whose own `when` asks `canActivateFocused()`.
    // Obligation (#262): a click activates too, and WCAG 2.1.1 requires a keyboard path for every
    // pointer capability. `Enter` is the only one this capability has, so it stays unconditional.
    bind('Enter', 'freegantt.activateEntry');
  }

  #panBy(dx: number, dy: number): void {
    const x = this.#viewport.scroll.x.state.position;
    const y = this.#viewport.scroll.y.state.position;
    this.#viewport.batch(() => {
      this.#viewport.scroll.x.panTo(x + dx);
      this.#viewport.scroll.y.panTo(y + dy);
    });
  }

  /** The one capability resolution, shared by the pointer path (`canSelect` above), the keyboard path
   *  (S3.5) and the affordance ids below. Never asked twice for the same gesture (I14). `edge`
   *  (#142) narrows a `'resize'` question to one handle; every other capability ignores it. */
  #canGesture(capability: GestureCapability, id: EntryId, edge?: 'start' | 'end'): boolean {
    const entry = this.#options.dataset.entries.get(id);
    return entry !== undefined && this.#capabilities.can(capability, entry, edge);
  }

  /** #434: the Entry a pointer hit stands for, for `EntryGestureContext.activation`. A bar names its
   *  own Entry; a row names its subject, the row's first Entry (the same subject a `DomTarget` reads
   *  for a row). `undefined` for a grouping header row, or a bar whose Entry is gone. Names *which*
   *  Entry only; `interaction/` still asks `can('activate', entry)` itself (I14). */
  #subjectEntryOf(hit: EntryHit): Entry | undefined {
    if (hit.kind === 'bar') return this.#entryFor(hit.barId);
    const id = this.#layout.entryIdsForRow(hit.rowId)[0];
    return id === undefined ? undefined : this.#options.dataset.entries.get(id);
  }

  /** #434: fires `entryActivate`. No veto and no `before*` pair (activation mutates nothing) — the
   *  one place this event actually reaches the bus, for every cause. */
  #activateEntry(entry: Entry, cause: EntryActivate['cause'], target: TargetKind): void {
    this.#emit('entryActivate', { entry, cause, target });
  }

  /** #434: `EntryGestureContext.activation.activateFromClick` — gates a click's own activation on
   *  `#pointerActivation`. `'dblclick'` mode makes click stop being a trigger at all: its opt-in
   *  *replaces* click, it does not add `'dblclick'` alongside it. So this never fires there.
   *  `'click'` mode (default) still fires only once per physical double-click. The browser sends
   *  two `click` events before one `dblclick`, and `detail` is their own click count. `>= 2` names
   *  the second one, already accounted for by the first click's own activation. */
  #activateFromClick(entry: Entry, detail: number, target: 'bar' | 'row'): void {
    if (this.#pointerActivation !== 'click' || detail >= 2) return;
    this.#activateEntry(entry, 'click', target);
  }

  /** #434, I14: the row, bar, or grid cell real keyboard focus sits on right now, and its own
   *  Entry, when the `activate` capability allows it. A grid cell counts too: `freegantt.activateEntry`
   *  is the `Enter` fallback. It only ever runs where `inlineEditing()`'s own
   *  `freegantt.editFocusedCell` declined — an unwritable cell, or no editing feature installed at
   *  all. Shared by `canActivateFocused`/`activateFocused` (`CoreCommandPorts`): the `when` and the
   *  `run` of `freegantt.activateEntry` ask this the same way, rather than resolve focus twice for
   *  one keystroke. */
  #focusedActivationTarget(): { entry: Entry; kind: TargetKind } | undefined {
    const focused = this.#rovingFocus.focusedElement();
    const domTarget = focused !== undefined ? this.#dom.targetUnder(focused) : undefined;
    if (domTarget === undefined || domTarget.entry === undefined) return undefined;
    if (!this.#isActivatableTargetKind(domTarget.kind)) return undefined;
    if (!this.#canGesture('activate', domTarget.entry.id)) return undefined;
    return { entry: domTarget.entry, kind: domTarget.kind };
  }

  /** #434: which `TargetKind`s a hit may activate — a row, a bar, or a grid cell, never a header or
   *  the splitter. One predicate for both the `dblclick` listener's allow-list and
   *  `#focusedActivationTarget`'s deny-list, so the two stop being two lists that could drift. */
  #isActivatableTargetKind(kind: TargetKind): boolean {
    return kind === 'row' || kind === 'bar' || kind === 'gridCell';
  }

  /** #434: does `freegantt.editFocusedCell` take this cell? `Enter`'s own Keymap resolution already
   *  asks the same question before falling through to `freegantt.activateEntry`
   *  (`extensions/keymap.ts`'s `resolve()`). Asked directly here, because the `dblclick` listener has
   *  no keymap resolving for it. One command's `when` answers both. A plugin that changes what
   *  "takes" a cell changes the pointer path and the key path together. The pointer path never
   *  re-derives `canWrite` on its own, so it never drifts from what the command actually decides. */
  #editorTakesFocusedCell(): boolean {
    const command = this.#commandRegistry.find('freegantt.editFocusedCell');
    return command?.when?.(this.#buildCommandContext()) ?? false;
  }

  #setHovered(next: BarId | undefined): void {
    if (this.#hoveredBarId === next) return;
    this.#hoveredBarId = next;
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
    if (this.#hoveredBarId === undefined) return undefined;
    return this.#layout.rowIdForEntry(entryIdOfBar(this.#hoveredBarId));
  }

  /** Resolves `hoveredBarId`/`movableBarId`/`resizableEntryId` from the current hover and
   *  selection, writes them into the one long-lived `InteractionState`, and applies. Called whenever
   *  any of the three inputs change — never per pointer move beyond that (I5). `exactOptionalPropertyTypes`
   *  makes "clear" a `delete`, not an `= undefined` assignment (`#setOptional` below; finding 7). */
  #refreshAffordances(): void {
    const sole = this.#entrySelection.soleEntry();
    const ids = projectAffordances({
      hoveredBarId: this.#hoveredBarId,
      soleSelectedEntryId: sole,
      barIdsForEntry: (id) => this.#layout.barIdsForEntry(id),
      canGesture: (capability, id, edge) => this.#canGesture(capability, id, edge),
    });
    setOptional(this.#interactionState, 'hoveredBarId', ids.hoveredBarId);
    setOptional(this.#interactionState, 'hoveredRowId', this.#hoveredRow());
    setOptional(this.#interactionState, 'movableBarId', ids.movableBarId);
    setOptional(this.#interactionState, 'resizableEntryId', ids.resizableEntryId);
    setOptional(this.#interactionState, 'resizableEdges', ids.resizableEdges);
    this.#backend.applyState(this.#interactionState);
  }

  #entryFor(barId: BarId): Entry | undefined {
    return this.#options.dataset.entries.get(entryIdOfBar(barId));
  }

  /** Review H3: `GridCellRendererContext.fieldValue`. `entry.read(key)` is the one read that answers a
   *  core, `props`-addressed or `compute` Field alike (ADR 0011, ADR 0017). It shares the memo
   *  `column.format` already uses, so a renderer branching on a number never parses `value` back.
   *  A row with no Entry (a grouping header, a custom row) has no Field value to read. */
  #fieldValueForCell(entry: Entry | undefined, key: FieldKey): unknown {
    return entry?.read(key);
  }

  get theme(): Theme {
    return this.#theme;
  }

  /** Live. `'auto'` writes no attribute, letting `prefers-color-scheme` (or an
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

  /** #394: the getter above is always correct. But nothing tells this Gantt to look again after a
   *  consumer re-parents its container — no `data-fg-theme` attribute changed, so
   *  `#themePinObserver` never wakes. A consumer that just moved the container calls this method to
   *  say so. It re-resolves now, and fires `themeChange` exactly when the answer actually moved —
   *  the same rule every other cause already follows. Returns the resolved answer, so a caller does
   *  not need a separate `resolvedTheme` read after. */
  checkResolvedTheme(): ResolvedTheme {
    this.#syncResolvedTheme();
    return this.resolvedTheme;
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

  /** Live: the one name a screen reader reads for this Gantt. `PaneLayout` owns
   *  where it lands — the container names the widget, the timeline pane names its region. */
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

  get gridResizable(): boolean {
    return this.#gridResizable;
  }

  /** Live (#432). Toggles the splitter's attachment and re-binds columns, so both affordances
   *  reflect the new answer on the very next frame — see `#applyGridResizable`. */
  set gridResizable(resizable: boolean) {
    if (resizable === this.#gridResizable) return;
    this.#gridResizable = resizable;
    this.#applyGridResizable();
    this.#bindColumns();
    this.#frames.request();
  }

  /** #432: the one place that reads `#gridResizable` — `SplitterAttachment.setEnabled` owns
   *  every DOM/ARIA consequence of the answer. Called once from the constructor and once from every
   *  `gridResizable` write after that. So the constructor-locked path and a live lock always land in
   *  the same DOM state. */
  #applyGridResizable(): void {
    this.#splitterAttachment.setEnabled(this.#gridResizable);
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

  /** Live — delegates straight to `Viewport.visibleSpan` (issue #461). */
  get visibleSpan(): TimeSpan {
    return this.#viewport.visibleSpan;
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

  /** An id that names an Entry reveals the union of every Bar that Entry draws (ADR 0010, ADR 0025,
   *  #212).
   *  It asks `FrameLayout` for the row's Bars, and `barSpan` for each Bar's own x/width off the
   *  bound `TimeScale`. The box is included (#295), so a `diamond()` row reveals its true glyph
   *  width. That is the same formula `computeFrame` paints bars from, so the two can never drift
   *  apart. It then hands the resulting `Rect` to `Viewport.reveal`. When nothing
   *  paints the named target, its own dates are the target instead (`fallbackSpanBar`), so reveal
   *  never becomes a no-op.
   *  Throws `RevealTargetNotFoundError` for an id the dataset does not hold (#227). A collapsed
   *  ancestor expands before any Bar is read. `FrameLayout` answers Bars from the post-collapse
   *  plan, so a row collapse hid answers empty. A still-hidden row (filter) keeps the current y —
   *  it does not jump to 0.
   *  A plain `string` is a legal id here — it resolves by asking the store, never by reading the
   *  brand. */
  reveal(id: EntryId | string): void {
    const entries = this.#options.dataset.entries;
    const entry = entries.get(id);
    if (entry === undefined) throw new RevealTargetNotFoundError(id, 'reveal');
    // A non-spanning Entry draws no bar (`spansTime`, ADR 0012), so there is no x/width to
    // reveal. Only the row still shows (#232-adjacent gap surfaced by Build 1, no existing rule
    // covered it).
    if (!spansTime(entry)) return this.#revealRow(entry.id);
    return this.#revealEntrySpan(entry.id, entry.start, entry.end);
  }

  /** Reveals a row with no bar to target — the vertical position only. The horizontal scroll
   *  stays exactly where it was (#232-adjacent gap, ADR 0012, Build 1). */
  #revealRow(ownerId: EntryId): void {
    const rowIndex = this.#expandAndFindRow(ownerId);
    const x = this.#viewport.scroll.x.state.position;
    const y = rowIndex >= 0 ? this.#layout.rowTop(rowIndex) : this.#viewport.scroll.y.state.position;
    // `width: 0` at the current x reads as "already visible" to `Viewport.reveal`. This moves
    // only y — the same no-op-on-x idiom `#rovingFocusPorts`'s own `revealRow` above already uses.
    this.#viewport.reveal({ x, y, width: 0, height: this.#frameSettings.rowHeight });
  }

  /** Reveals the whole Entry: the union of the painted extents of every Bar it draws (#295). An
   *  ordinary bar draws one Bar over the entry's own span, so this reduces to today's behaviour.
   *  A `diamond()` row's fixed box is read the same way, box included. An entry that draws no Bar
   *  at all falls back to the entry's own span, so reveal never becomes a no-op. */
  #revealEntrySpan(ownerId: EntryId, start: Instant, end: Instant): void {
    const rowIndex = this.#expandAndFindRow(ownerId);
    const bars = this.#layout.barsForEntry(ownerId);
    const scale = this.#viewport.timeScale;
    const minBarWidthPx = this.#frameSettings.minBarWidthPx;
    // `unionSpan` answers `undefined` when every produced Bar was dropped by `barSpan` (#436).
    // An entry entirely past the range end still needs a target. This falls back to its own
    // dates, the same stand-in `fallbackSpanBar` already gives an entry with no Bar at all.
    const union = bars.length > 0 ? unionSpan(bars, scale, minBarWidthPx) : undefined;
    const { x, width } = union ?? barSpan(fallbackSpanBar(ownerId, start, end), scale, minBarWidthPx);
    this.#revealRect(rowIndex, x, width);
  }

  /** Expands this entry's collapsed ancestors, and flushes the pending frame. Every caller does
   *  this before it reads `FrameLayout` about the entry (#295). `barsForEntry` answers from the
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
    const y = rowIndex >= 0 ? this.#layout.rowTop(rowIndex) : this.#viewport.scroll.y.state.position;
    this.#viewport.reveal({ x, y, width, height: this.#frameSettings.rowHeight });
  }

  /** Every plugin registration seam returns a `Disposer` that removes exactly its own registration
   *  (I2); `on` is that seam for a Gantt event. */
  on<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): Disposer {
    return this.#events.on(name, handler);
  }

  off<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#events.off(name, handler);
  }

  /** Live: assignment diffs by `id` against what is already installed. A plugin present in
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

  /** Adds one plugin to the installed set. It sets up that plugin alone and leaves every
   *  other one untouched. An id that is already installed throws `DuplicatePluginIdError`. */
  installPlugin(plugin: ShellPlugin<unknown>): void {
    this.plugins = [...this.#chromePlugins, plugin];
  }

  /** Disposes one installed plugin, by id, and leaves every other one running. An id
   *  nothing installs throws `PluginNotInstalledError` — a Dataset plugin's id included, because
   *  the Dataset owns that one (ADR 0019). */
  uninstallPlugin(id: PluginId): void {
    const next = this.#chromePlugins.filter((plugin) => plugin.id !== id);
    if (next.length === this.#chromePlugins.length) throw new PluginNotInstalledError(id);
    this.plugins = next;
  }

  /** `Gantt.commands`'s own backing registry — read-only, the registry object itself
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
      visibleSpan: this.#viewport.visibleSpan,
    });
  }

  #bindColumns(): void {
    const bound = resolveGanttFields(
      this.#options.dataset,
      // The consumer's own columns plus every plugin-registered one it does not
      // already name — `ctx.view.registerGridColumn`'s own effect reaches rendering here.
      this.#columnChrome.effectiveInput(),
      this.#columnBind(),
    );
    // Stays the consumer's own authored resolution, lock or no lock. `#renderedColumns()` and
    // the resize-gesture gate below apply `#gridResizable` where the resolution is *read*. A
    // rewrite stored here would leak into `gridColumnsChange`'s `from` as a `resizable` flip the
    // consumer never made.
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
    this.#splitterAttachment.syncAria();
  }

  /** What `render()` paints, as opposed to what `ColumnChrome` stores. Locked, every column
   *  paints `resizable: false` — the grip disappears (`data-resizable-off`, `styles.ts`) — without
   *  touching the authored resolution `gridColumnsChange` reports from. The lock lifting repaints
   *  the real, unmodified answer on the very next frame. */
  #renderedColumns(): readonly ResolvedColumn[] {
    const resolved = this.#columnChrome.resolvedColumns;
    return this.#gridResizable ? resolved : resolved.map((column) => ({ ...column, resizable: false }));
  }

  #columnBind(): ResolveColumnsBind {
    // #139: `defaultColumnWidth` makes a column fixed-width unless it names a `flex` of its own.
    // `ColumnChrome` owns both column-width knobs, so both are read off the container the same way.
    const bind: ResolveColumnsBind = {
      timeZone: this.#options.dataset.timeZone,
      defaultColumnWidth: this.#columnChrome.defaultWidthPx(),
    };
    const locale = this.#frameSettings.effectiveLocale;
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
   *  pane's own client box, with no gutter to subtract. The grid pane's width never
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
    this.#viewportHandle.setPaneSize({
      width: this.#paneBox.width,
      height: this.#rowsViewportHeight(),
    });
  }

  #rowsViewportHeight(): number {
    return Math.max(0, this.#paneBox.height - this.#paneLayout.measureHeaderHeight());
  }

  /** What `FrameLayout.ensureRowPlan` needs to answer the row tree right now, built the same way
   *  `render()` builds its half of a `LayoutInput` (#424). Cheap to call on every row-tree read: a
   *  field here that has not changed since the last plan costs an identity check, not a replan. */
  #rowPlanInput(): RowPlanInput {
    // #167: `FrameSettings.rowPlanSettings()` is the one place the public `rowSource` setting
    // translates into `LayoutInput`'s `rows`/`fieldCompares`/`fieldContext`. `toLayoutInput` reads
    // the same method, so this can never re-derive its own answer and drift from that one.
    const rowPlan = this.#frameSettings.rowPlanSettings();
    return {
      entries: this.#options.dataset.entries.all,
      datasetRevision: this.#options.dataset.datasetRevision,
      rows: rowPlan.rows,
      fieldCompares: rowPlan.fieldCompares,
      fieldContext: rowPlan.fieldContext,
      entryRulePorts: this.#entryRulePorts,
      collapsed: this.#treeCollapse.ids,
    };
  }

  render(): void {
    // #448: checked here, not in `#paintFor`. The question is "does this renderer ever paint",
    // answered against every Entry the Dataset holds. It is not "did this frame's own windowed
    // rows reach it" — a scroll would answer that differently frame to frame.
    if (this.#frameSettings.barRenderer !== undefined) {
      this.#reportBarRendererShadowed(this.#frameSettings.barRenderer, this.#options.dataset.entries.all);
    }
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
        columns: this.#renderedColumns(),
        collapsed: this.#treeCollapse.ids,
        variants: this.#registrations.variants,
        decorationProviders: this.#registrations.decorationProviders(),
        datasetRevision: this.#options.dataset.datasetRevision,
        entryRulePorts: this.#entryRulePorts,
        // #421 C5: fresh every frame, never cached on the Bar — `barLabels: 'repaint'`
        // (`frame-settings.ts`'s own `INVALIDATION` table) is what this resolver honours.
        barLabelFor: (entry) => this.#labelFor(entry),
      }),
    );
    // Which pattern the grid pane announces, and how big it says it is. Both are
    // facts about the whole row set, so they are read here rather than per row. Only the windowed
    // rows reach `render/dom` at all (I3).
    this.#paneLayout.gridPattern = nestsRows(this.#frameSettings.rowSource) ? 'treegrid' : 'grid';
    this.#paneLayout.setGridSize(frame.rowCount, frame.columns.length);
    this.#backend.sync(frame);
    this.#lastBarById.clear();
    for (const bar of frame.bars) this.#lastBarById.set(bar.id, bar);
    // The grid pane's spacer mirrors the header's own band count. So both panes resolve
    // their header height from the same `--fg-band-height` expression, and cannot drift.
    // A changed band stack is a changed header height, and the rows' viewport is the pane box minus
    // that. So this re-derives the viewport here, rather than waiting for the next pane resize.
    if (this.#paneLayout.setHeaderBandCount(frame.header.bands.length)) this.#applyRowsViewportSize();
    this.#contentSize = { width: frame.contentWidth, height: frame.contentHeight };
    this.#viewportHandle.setContentSize(this.#contentSize);
    // #440: does a neighbour share our axis? If so this pane holds its width steady, so the two
    // agree about how far right they can go. Re-checked here because a second Gantt may bind the
    // axis long after this one mounted.
    this.#scrollAttachment.reserveScrollbarGutter();
    this.#scrollAttachment.writePosition();
    // #126: independent of the timeline's content width above. The grid pane's own horizontal
    // scroller reaches fixed-width columns that overflow `gridWidth`, unrelated to the time axis.
    this.#paneLayout.contentWidth = gridContentWidth(
      this.#columnChrome.resolvedColumns,
      this.#paneLayout.gridWidth,
    );
    // This runs after the backend syncs the DOM to this frame, not before. A row
    // or bar the sweep wants to focus must already exist as a node.
    this.#rovingFocus.syncAfterRender();
  }

  destroy(): void {
    if (this.#destroyed) return;
    // #272/#273: a held gesture's Promise can otherwise outlive this Gantt, settling into a shell
    // with nothing left to paint or write through. It settles a pending answer rather than
    // releasing a resource, which is why it is the one line outside `#teardown` and stays first.
    this.#gesturePipeline.discardHeldGesture();
    this.#teardown.disposeAll();
    this.#destroyed = true;
  }
}
