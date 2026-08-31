// view/ — Gantt shell, the composition root that wires the grid pane, splitter, timeline pane and
// viewport binding together (plans/01 §8.2-8.3, S1.8).

import {
  barSpan,
  FrameLayout,
  ScrollModel,
  TimeScaleModel,
  Viewport,
  DEFAULT_TICK_BOX_FLOOR_PX,
} from '../layout/index.js';
import type {
  DateLineSpec,
  Overscan,
  PresetRef,
  ResolvedColumn,
  TimeScaleFit,
  ViewportHandle,
  ViewPreset,
} from '../layout/index.js';

import { createDomBackend } from '../render/dom/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { PaneLayout } from './pane-layout.js';
import type { Panes } from './pane-layout.js';
import { attachSplitter } from './splitter.js';
import type { SplitterAttachment } from './splitter.js';
import { EventBus } from './event-bus.js';
import type { AsyncCancelableEvent, GanttEventHandler, GanttEventMap } from './event-bus.js';
import { attachScroll } from './scroll-attachment.js';
import type { ScrollAttachment } from './scroll-attachment.js';
import { attachPaneSize } from './pane-size-attachment.js';
import type { PaneSizeAttachment } from './pane-size-attachment.js';
import { attachWheelNavigation } from './wheel-navigation.js';
import type { WheelNavigationAttachment } from './wheel-navigation.js';
import { attachKeyboardNavigation } from './keyboard-navigation.js';
import type { KeyboardNavigationAttachment } from './keyboard-navigation.js';
import { resolveViewportGestures } from './viewport-gestures.js';
import type { ViewportGestures } from './viewport-gestures.js';
import { ensureBaseStyles } from './styles.js';
import type { InteractionState, RenderBackend } from '../render/backend.js';
import { EntryNotFoundError, ContainerNotFoundError, entryId, itemId } from '../model/index.js';
import type {
  Dataset,
  Entry,
  EntryEdits,
  EntryId,
  GridColumnInput,
  ItemId,
  Instant,
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
import { DEFAULT_GRID_COLUMNS, bindGanttFields } from './grid-columns.js';

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
 *  `rowOrder`/`entryFor`/`can` only, not `hitTest`/`setHovered`, but there is no value in a second,
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
  #keyboardNavigation: KeyboardNavigationAttachment | undefined;
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
  /** `id:0` today (segments are not yet laid out as separate items, `layout/frame.ts`), rebuilt every
   *  render from `frame.bars` so this stays correct the moment segments do land — the shell reads the
   *  frame it already computed rather than re-deriving item ids of its own (D-S3-10). */
  #itemEntryIds = new Map<ItemId, EntryId>();
  /** The single rAF owner (B10, D-S2-15): every render request past construction goes through
   *  this, so N mutations in one tick become one frame. */
  #frames = new FrameScheduler(() => this.render());
  #events = new EventBus<GanttEventMap, AsyncCancelableEvent>();
  #destroyed = false;
  /** This Gantt's layout pass. It keeps the row-height index alive across renders (#47) — the shell
   * states what to draw and holds no layout bookkeeping of its own. */
  #layout = new FrameLayout();
  #rowHeight: number = DEFAULT_ROW_HEIGHT;
  #tickBoxFloorPx: number = DEFAULT_TICK_BOX_FLOOR_PX;
  #options: GanttShellOptions;
  /** True until pane-size wiring completes. `Viewport.bind()` notifies the newcomer synchronously
   * per D-S1.5-4 (once for scale, once for scroll) — those calls land before pane size is wired, so
   * they are not real renders yet and are dropped while this is true. */
  #wiring = true;
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

  constructor(options: GanttShellOptions) {
    this.#options = options;
    this.#container = resolveContainer(options.container);
    // S1.10, D-S1.10-8: must exist before PaneLayout builds the classed elements the stylesheet
    // targets, or there's a one-frame flash of unstyled content.
    ensureBaseStyles(this.#container.ownerDocument);
    this.#paneLayout = new PaneLayout({
      container: this.#container,
      ...(options.gridWidth !== undefined ? { gridWidth: options.gridWidth } : {}),
    });
    this.#panes = this.#paneLayout.panes;

    const hasOwnOptions =
      options.preset !== undefined || options.range !== undefined || options.fit !== undefined;
    const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV ?? false;
    if (options.scale && hasOwnOptions && isDev) {
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

    // The timeline pane is the single native scroller (D-D, D-S1.8-1); the grid pane follows it by
    // transform, in render/dom's sync(). Constructed before either bind (Viewport's fan-in,
    // D-S1.7-1), so this field is never undefined during a render.
    this.#scrollAttachment = attachScroll(this.#panes.timeline, this.#viewport);

    // bind() fires its own onChange synchronously, once per sub-model (D-S1.5-4: bind always
    // notifies the newcomer) — before this call returns and #viewportHandle is assigned. Those
    // premature calls are dropped by #wiring; the deliberate first render below runs once
    // everything, including the initial pane-size measurement, is wired.
    this.#viewportHandle = this.#viewport.bind(
      { entries: options.dataset.entries.all, timeZone: options.dataset.timeZone },
      () => {
        if (this.#wiring) return;
        this.#frames.request();
        this.#emitNavigationChange();
      },
    );
    // The whole of this shell's dependency on data change (D-S2-20): push the fresh snapshot into
    // the bound viewport and request a frame — the changeset mechanism's own fan-out, not a second
    // reactivity path (#33's `setEntries()` warning is against a *public* one; see dataset-change-
    // subscription.ts).
    this.#datasetChanges = subscribeToDatasetChanges(options.dataset, () => {
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
    this.#splitterAttachment = attachSplitter(this.#panes.splitter, {
      readGridWidth: () => this.#paneLayout.gridWidth,
      previewGridWidth: (px) => {
        this.#paneLayout.gridWidth = px;
      },
      commitGridWidth: (px) => this.#commitGridWidth(px),
    });
    this.#interactions = options.interactions ?? {};
    this.#viewportGestures = options.viewportGestures ?? {};
    this.#resolvedViewportGestures = resolveViewportGestures(this.#viewportGestures);
    this.#capabilities = resolveCapabilities(this.#interactions, (kind) =>
      this.#options.dataset.isRollUpKind(kind),
    );
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
      hitTest: (x, y) => {
        const hit = this.#backend.hitTest(x, y);
        if (!hit) return undefined;
        return hit.edge !== undefined ? { itemId: hit.itemId, edge: hit.edge } : { itemId: hit.itemId };
      },
      entryFor: (item) => this.#entryFor(item),
      can: (capability, entry) => this.#capabilities.can(capability, entry),
      rowOrder: () => this.#options.dataset.entries.all.map((e) => e.id),
      selection: {
        get: () => this.#selection,
        propose: (next) => this.#proposeSelection(next),
      },
      setHovered: (item) => this.#setHovered(item),
      contentXAtPaneOffset: (offsetX) => offsetX + this.#viewport.scroll.state.position.x,
      session: (grabbed, gesture) => this.#gesturePipeline.session(grabbed, gesture),
    };
    this.#entryGestures = options.entryGestures?.(this.#panes.timeline, this.#container, gestureContext);
    this.#keyboardEditing = options.keyboardEditing?.(this.#container, gestureContext);
    this.#wheelNavigation = attachWheelNavigation(this.#panes.timeline, {
      wheelZoomEnabled: () => this.#resolvedViewportGestures.wheelZoom,
      wheelPanEnabled: () => this.#resolvedViewportGestures.wheelPan,
      zoomIn: (offsetX) => this.zoomIn(offsetX),
      zoomOut: (offsetX) => this.zoomOut(offsetX),
      panBy: (dx, dy) => this.#panBy(dx, dy),
    });
    this.#keyboardNavigation = attachKeyboardNavigation(this.#container, {
      keyboardPanEnabled: () => this.#resolvedViewportGestures.keyboardPan,
      hasSelection: () => this.#selection.length > 0,
      panBy: (dx, dy) => this.#panBy(dx, dy),
      panTo: (to) => this.#viewport.scroll.panTo(to),
      arrowStepX: () => this.#viewport.preset.preferredTickWidthPx,
      arrowStepY: () => this.#rowHeight,
      pageStepY: () => this.#viewport.visible.height,
      scrollMaxX: () => this.#viewport.scroll.state.max.x,
    });
    this.#wiring = false;
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

  #proposeSelection(next: readonly EntryId[]): void {
    const from = this.#selection;
    if (from.length === next.length && from.every((id, i) => id === next[i])) return;
    if (this.#events.emit('beforeSelectionChange', { from, to: next }) === false) return;
    this.#selection = next;
    this.#interactionState.selectedItemIds = next.map((id) => itemId(id));
    // D-S3-6: resizableItemId falls back to the single selected entry when nothing is hovered, so a
    // selection change can move the handles even with the pointer sitting still.
    this.#refreshAffordances();
    this.#events.emit('selectionChange', { from, to: next });
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
      itemEntryIds: this.#itemEntryIds,
      canGesture: (capability, id) => this.#canGesture(capability, id),
    });
    setOptional(this.#interactionState, 'hoveredItemId', ids.hoveredItemId);
    setOptional(this.#interactionState, 'movableItemId', ids.movableItemId);
    setOptional(this.#interactionState, 'resizableItemId', ids.resizableItemId);
    this.#backend.applyState(this.#interactionState);
  }

  #entryFor(item: ItemId): Entry | undefined {
    const id = this.#itemEntryIds.get(item);
    return id !== undefined ? this.#options.dataset.entries.get(id) : undefined;
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
    if (!this.#wiring) this.#emitNavigationChange();
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
    if (align === 'center') {
      this.#viewport.panToInstant(at, align);
      return;
    }
    const x = this.#viewport.timeScale.xForInstant(at) - this.#todayLineMarginPx(at);
    this.#viewport.scroll.panTo({ x });
  }

  /** Px width of `todayLineMarginTicks` ticks of the CURRENT preset, evaluated at `at` — calendar
   *  ticks (day/week/month) vary in duration (DST, month length), so this is a live read off
   *  `timeScale`/`preset`, never a cached constant. */
  #todayLineMarginPx(at: Instant): number {
    const preset = this.#viewport.preset;
    return this.#viewport.timeScale.widthForDuration(
      { unit: preset.tickUnit, value: preset.tickIncrement * this.#todayLineMarginTicks },
      at,
    );
  }

  /** Finds the entry's row via the bound dataset, asks `FrameLayout` for its top and `barSpan` for
   * its x/width off the bound `TimeScale` — the same formula `computeFrame` builds bars from, so the
   * two can never drift apart — and hands the resulting `Rect` to `Viewport.reveal` (S1.9, D-S1.9-6).
   * Throws `EntryNotFoundError` for an id the dataset has no entry for. */
  reveal(entryId: EntryId): void {
    const entries = this.#options.dataset.entries.all;
    const index = entries.findIndex((e) => e.id === entryId);
    if (index === -1) throw new EntryNotFoundError(entryId, 'reveal');
    const entry = entries[index]!;
    const { x, width } = barSpan(entry, this.#viewport.timeScale);
    this.#viewport.reveal({ x, y: this.#layout.rowTop(index), width, height: this.#rowHeight });
  }

  on<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#events.on(name, handler);
  }

  off<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#events.off(name, handler);
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
    this.#resolvedColumns = bindGanttFields(this.#options.dataset, this.#gridColumnInput, bind).columns;
  }

  #commitGridWidth(px: number): void {
    const from = this.#paneLayout.gridWidth;
    const to = px;
    if (this.#events.emit('beforeGridWidthChange', { from, to }) === false) {
      this.#paneLayout.gridWidth = from; // veto: the boundary goes back (D-S1.8-3)
      return;
    }
    this.#paneLayout.gridWidth = to;
    this.#events.emit('gridWidthChange', { from, to });
  }

  /** One measurement, pushed to everything it feeds (#8, #49): `--fg-row-height`, `--fg-tick-box-floor`,
   *  and the pane size all change for the same reason — the timeline pane was just resized — so they
   *  are re-read on the same signal instead of going stale. `size` is the timeline pane's own client
   *  box; no gutter to subtract (S1.8, D-S1.8-2) — the grid pane's width never overlapped it in the
   *  first place. */
  #applyPaneMeasurement(size: Size): void {
    this.#rowHeight = readPixelProperty(this.#container, ROW_HEIGHT_PROPERTY, ROW_HEIGHT_POLICY);
    this.#tickBoxFloorPx = readPixelProperty(this.#container, TICK_BOX_FLOOR_PROPERTY, TICK_BOX_FLOOR_POLICY);
    this.#viewportHandle.setPaneSize(size);
  }

  render(): void {
    const frame = this.#layout.computeFrame({
      entries: this.#options.dataset.entries.all,
      scale: this.#viewport.timeScale,
      preset: this.#viewport.preset,
      visible: this.#viewport.visible,
      overscan: this.#viewport.overscan,
      rowHeight: this.#rowHeight,
      tickBoxFloorPx: this.#tickBoxFloorPx,
      revision: this.#revision++,
      locale: this.#locale,
      todayLine: this.#todayLine,
      dateLines: this.#dateLines,
      columns: this.#resolvedColumns,
    });
    this.#backend.sync(frame);
    // D-S3-10: rebuilt every render from the frame layout just computed — item ids are deterministic
    // (`itemId`, plans/01 §2.4) but this is the one place that already walks every mounted bar.
    this.#itemEntryIds.clear();
    for (const bar of frame.bars) this.#itemEntryIds.set(bar.id, bar.entryId);
    // D-S1.12-9: the grid pane's spacer mirrors the header's own band count, so both panes resolve
    // their header height from the same `--fg-band-height` expression and cannot drift.
    this.#paneLayout.setHeaderBandCount(frame.header.bands.length);
    this.#contentSize = { width: frame.contentWidth, height: frame.contentHeight };
    this.#viewportHandle.setContentSize(this.#contentSize);
    this.#scrollAttachment.writePosition();
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#frames.cancel();
    this.#entryGestures?.detach();
    this.#keyboardEditing?.detach();
    this.#wheelNavigation?.detach();
    this.#keyboardNavigation?.detach();
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
