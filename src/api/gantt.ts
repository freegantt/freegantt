// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own shell and state so two Gantt instances on one page are fully independent.

import { GanttShell } from '../view/index.js';
import type {
  CapabilityRule,
  GanttEventHandler,
  GanttEventMap,
  GridWidth,
  Interactions,
  Theme,
  ViewportGestures,
} from '../view/index.js';
import { ScrollModel, TimeScaleModel, pickDefined, resolveRowSource } from '../layout/index.js';
import type {
  PresetRef,
  SnapSetting,
  TimeScaleFit,
  ViewPreset,
  RowSource,
  ResolvedRowSource,
} from '../layout/index.js';
import type { DateLine } from '../layout/index.js';
import type {
  BarRenderer,
  CellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  RendererByKind,
} from '../layout/index.js';
import type {
  Entry,
  EntryId,
  FieldKey,
  GridColumnInput,
  Instant,
  InstantInput,
  PluginId,
  RowId,
  SegmentId,
  StoredEdits,
  TimeSpan,
} from '../model/index.js';
import { attemptMutation } from './attempt-mutation.js';
import { now, toInstant } from '../time/index.js';
import { extraEditsFor, type Dataset } from './dataset.js';
import type { GanttPluginOf, PluginContextOf } from './plugin.js';
import type {
  CommandOf,
  CommandContextOf,
  CommandRegistryOf,
  KeyBindingOf,
  CommandTarget,
  ActedOn,
} from './command.js';
// api/ is the composition root that reaches interaction/ in (plans/01 §1: `API --> INT`,
// `plans/s3-direct-manipulation/README.md` §0) — `view/` cannot, so `GanttShell` takes this by
// constructor injection rather than importing it itself (see `AttachEntryGestures` in gantt-shell.ts).
import { attachEntryGestures, attachKeyboardEditing, attachColumnGestures } from '../interaction/index.js';

/** Public, loose. What `GanttOptions.dateLines` and `Gantt.dateLines` both take (S1.13, D-S1.13-2). */
export interface DateLineInput {
  placeAt: InstantInput;
  label?: string;
  className?: string;
}

export interface GanttOptionsBase<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> {
  /** Element or CSS selector (plans/02 §2) — resolved by GanttShell; a selector matching nothing
   * throws (#38). */
  container: HTMLElement | string;
  /** The Dataset this Gantt reads and writes, for its whole life. It binds `TMeta`/`TFields`:
   *  a Gantt built on a `Dataset<{ team: string }, { cost: number }>` hands that same typed
   *  Dataset back from `gantt.dataset`, so a page never carries the pair by hand (#226). */
  dataset: Dataset<TMeta, TFields>;
  /** Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
   * Independent of `scale`/`preset`/`range`/`fit`: a Gantt may share its scroll position, its axis,
   * both, or neither. */
  scroll?: ScrollModel;
  /** Live. The grid pane's width in px (S1.8), or `'fitColumns'` (#157) to sit it on its columns'
   *  own right edge and keep it there as the columns change. Reads back in px either way. Default:
   *  `--fg-grid-pane-width`, fallback 160. Never wider than the columns (#139); a splitter drag
   *  turns `'fitColumns'` back into the width it was dragged to. */
  gridWidth?: GridWidth;
  /** Live (#127). The floor a splitter drag clamps `gridWidth` to. Default `40` — wide enough for
   *  one narrow column, so a drag cannot take the pane to nothing by accident. It bounds the drag
   *  only: an explicit `gridWidth = 0` still collapses the grid pane on purpose. */
  minGridWidth?: number;
  /** Live (S1.10). Default `'auto'`: follows `prefers-color-scheme`. */
  theme?: Theme;
  /** Live (S1.10). Default `'Gantt'`; sets `aria-label` on the container. */
  a11yLabel?: string;
  /** Live (S1.12, D-S1.12-12). `undefined` = the runtime default. Feeds header labels and
   *  screen-reader dates alike, with no bar remount. */
  locale?: Intl.LocalesArgument;
  /** Live (S1.12/S1.13, D-S1.12-14, D-S1.13-4). Default `true`: `now()`. `false`: off. An instant
   *  pins it with no clock read. To keep today visible, pan with `panToToday()` or grow `range`. */
  todayLine?: boolean | InstantInput;
  /** Live (S1.13, D-S1.13-4). Default `[]`. Extra Date lines beside the today wrapper —
   *  status/as-of dates, sprint or holiday markers, project start/finish. No id: index-keyed, like
   *  Header bands. The wrapper's own line never gets a Date line label; give one of these a `label` instead. */
  dateLines?: readonly DateLineInput[];
  /** Live. How many of the current preset's own ticks `panToToday()` leaves between the pane's left
   *  edge and where it lands `align: 'start'` (the default) — the **Today line margin** (CONTEXT.md).
   *  Default `2`; `0` restores the old flush landing. No effect on `align: 'center'`. */
  todayLineMarginTicks?: number;
  /** The ordered set `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). Live.
   *  Default: the shipped nine-rung set. */
  zoomPresets?: readonly PresetRef[];
  /** Live (S3, D-S3-10; ADR 0010, #212). Segment ids, loose on the way in; assignment runs the same
   *  cancelable sequence a click runs. Default `[]`. */
  selectedSegmentIds?: readonly (SegmentId | string)[];
  /** Live (S3, D-S3-9). Per-gesture, boolean or per-entry predicate, over the per-kind default
   *  table. Default `{}`: every gesture resolves off the default table alone. Assignment replaces
   *  the whole config; `gantt.setCapabilityRule`/`clearCapabilityRule` write one gesture (D-S5-35). */
  interactions?: Interactions;
  /** Live (D-S3-24). What a drag and a keyboard nudge snap to: `{ unit, increment }`, `'tick'` for
   *  one tick of whatever preset is showing, or `'none'`. Omitted, the showing preset's own `snap`
   *  decides — which is `'tick'` for every shipped preset. */
  snap?: SnapSetting;
  /** Live (S3.7, D-S3-14). Wheel zoom, shift+wheel pan, and keyboard pan. Default `{}`: every
   *  viewport gesture is on. `false` turns them all off. Does not gate `zoomBy` / `panToDate`. */
  viewportGestures?: ViewportGestures;
  /** Live (S4.3, D-S4-12). Field keys in display order, plus per-Gantt overrides. Default `['name']`. */
  gridColumns?: readonly GridColumnInput[];
  /** Live (S4.6, D-S4-21). Default `{ source: 'entries', tree: false }`. */
  rowSource?: RowSource;
  /** Live (S4.6, D-S4-22). Collapsed row ids, loose on the way in. Default `[]`. */
  collapsed?: readonly (RowId | string)[];
  /** Live (S5.4, D-S5-11/12). Customization ladder level 3 (`plans/02` §4). A function, or a
   *  per-kind map — `{ milestone: (…) => …, '*': (…) => … }` — so the common case needs no
   *  branching. `undefined` returned from either form keeps the library's own bar output. */
  barRenderer?: BarRenderer | RendererByKind;
  /** Live (S5.4, D-S5-11). Gantt-wide; a per-column `GridColumn.cellRenderer` (S5.7) wins over this
   *  for its own column. `ctx.column.field` lets one function branch per column. */
  cellRenderer?: CellRenderer;
  /** Live (S5.4, D-S5-11). Grid column header chrome (S5.7 paints through it). */
  headerRenderer?: HeaderRenderer;
  /** Live (S5.4, D-S5-11). Replaces a tooltip's body (S5.5's `tooltips()` feature). */
  tooltipRenderer?: TooltipRenderer;
  /** Live (S5.1, D-S5-1, D-S5-3). Values a consumer imports (`tooltips()`, `contextMenu({...})`),
   *  never names in a table. Assignment diffs by `id`: a plugin present before and after is left
   *  alone, even when the new array holds a fresh object for that `id` — same id, new object is
   *  ignored (a dev build warns; production stays silent). Reconfigure with two assignments
   *  (remove, then add) or a distinct id. Default `[]`. `gantt.installPlugin`/`uninstallPlugin`
   *  add or drop one plugin without restating the set (D-S5-36). */
  plugins?: readonly GanttPlugin<TMeta, TFields>[];
}

/** Two ways to set the axis, made mutually exclusive at the type level (issue #84 — the prior shape
 * accepted both and silently ignored `preset`/`range`/`fit` in favor of `scale`, with only a warning
 * to say so). Sharing an axis and building a private one from `preset`/`range`/`fit` are not two knobs
 * for the same job; a caller states one or the other. */
export type GanttScaleOptions =
  | {
      /** Bound viewport object (D9, plans/02 §5) — pass the same instance to two Gantt instances to
       * x-sync them. */
      scale: TimeScaleModel;
      preset?: never;
      range?: never;
      fit?: never;
    }
  | {
      scale?: undefined;
      /** Build a private default `TimeScaleModel` (D-S1.9-9) sized to the dataset's entries. */
      preset?: PresetRef;
      /** Loose input (S1.12, D-S1.12-8), read through the dataset's zone at construction/assignment. */
      range?: 'fitDataset' | { start: InstantInput; end: InstantInput };
      fit?: TimeScaleFit;
    };

export type GanttOptions<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = GanttOptionsBase<TMeta, TFields> & GanttScaleOptions;

/** S5.1, D-S5-1: `GanttPlugin`/`PluginContext` bound to this class — see `api/plugin.ts`'s file
 *  header for why the generic form lives there and the binding happens here. This is the type a
 *  plugin author actually sees: `api/index.ts` re-exports these bound names alongside the generic
 *  `GanttPluginOf`/`PluginContextOf` shapes. */
export type GanttPlugin<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = GanttPluginOf<Gantt<TMeta, TFields>, Dataset<TMeta, TFields>>;
export type PluginContext<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = PluginContextOf<Gantt<TMeta, TFields>, Dataset<TMeta, TFields>>;

/** S5.2, D-S5-6: `Command`/`CommandContext`/`CommandRegistry`/`KeyBinding` bound to this class — see
 *  `api/command.ts`'s file header for why the generic form lives there and the binding happens here.
 *  This is the shape a plugin author, or a `gantt.commands`/`gantt.commands.run(id)` caller, actually
 *  sees; `api/index.ts` re-exports these bound names alongside the generic `*Of` shapes. */
export type Command<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = CommandOf<Gantt<TMeta, TFields>, Dataset<TMeta, TFields>>;
export type CommandContext<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = CommandContextOf<Gantt<TMeta, TFields>, Dataset<TMeta, TFields>>;
export type CommandRegistry<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = CommandRegistryOf<Gantt<TMeta, TFields>, Dataset<TMeta, TFields>>;
export type KeyBinding<
  TMeta = unknown,
  TFields extends Record<string, unknown> = Record<string, unknown>,
> = KeyBindingOf<Gantt<TMeta, TFields>, Dataset<TMeta, TFields>>;
export type { ActedOn, CommandTarget };
// `dateLines`'s resolved read type (S4-1) — passed through so a caller who names `DateLine`
// explicitly imports it beside `DateLineInput`, its loose counterpart above.
export type { DateLine };

export class Gantt<TMeta = unknown, TFields extends Record<string, unknown> = Record<string, unknown>> {
  #shell: GanttShell;
  #dataset: Dataset<TMeta, TFields>;
  #destroyed = false;
  /** `rowSource`'s resolve cache (#248 S4-2), keyed on the authored object the setter last stored —
   *  not on the resolved value, which is rebuilt fresh and would never compare `===` to itself. */
  #rowSourceCache?: { authored: RowSource; resolved: ResolvedRowSource };

  constructor(options: GanttOptions<TMeta, TFields>) {
    this.#dataset = options.dataset;
    // The same Dataset, read at the erased width `view/` and `interaction/` work in — see
    // `commitEntryEdits` below, its one reader.
    const store: Dataset = options.dataset;
    this.#shell = new GanttShell({
      container: options.container,
      dataset: options.dataset,
      ...pickDefined(options, [
        'scroll',
        'gridWidth',
        'minGridWidth',
        'preset',
        'fit',
        'theme',
        'a11yLabel',
        'locale',
        'todayLineMarginTicks',
        'interactions',
        'snap',
        'viewportGestures',
        'gridColumns',
        'rowSource',
        'collapsed',
        'barRenderer',
        'cellRenderer',
        'headerRenderer',
        'tooltipRenderer',
      ]),
      ...(options.scale ? { scale: options.scale } : {}),
      ...(options.range !== undefined ? { range: this.#toRange(options.range) } : {}),
      ...(options.todayLine !== undefined ? { todayLine: this.#toTodayLine(options.todayLine) } : {}),
      ...(options.dateLines !== undefined ? { dateLines: this.#toDateLines(options.dateLines) } : {}),
      // Review P5: one member holds every seam that crosses the layer boundary. `view/` may not
      // import `interaction/`, and it may not name the api `Dataset` or the public `Gantt` façade
      // (D-S5-5), so this file supplies all seven.
      // S5.10, D-S5-23/D-S3-18: the drag preview ghosts whatever the installed extension hook would
      // add. Read live off the Dataset — every plugin composes onto that one occupant, so this stays
      // the identity function for a Dataset with no plugin installed. Preview only: the commit runs
      // the same occupant again, for real, inside the transaction.
      // `interaction/extender-preview.test.ts`'s "#167" case fails if this ever becomes a stored
      // value — it composes a second occupant after the shell exists, which no public route allows,
      // so `api/gantt.test.ts`'s "#186" suite cannot reach that case and does not claim to.
      extraEditsFor: (request) => extraEditsFor(options.dataset, request),
      wiring: {
        entryGestures: attachEntryGestures,
        keyboardEditing: attachKeyboardEditing,
        columnGestures: attachColumnGestures,
        // S3.3, D-S3-16: `GanttShell`'s own `dataset` option is `model/`'s narrow `Dataset`
        // interface ("a view never opens a transaction"). This class holds the full `api/Dataset`,
        // so a committed gesture draft reaches the store through here, not through the shell.
        // `store`, not `options.dataset`: a gesture draft is built in `view/`, which is permanently
        // monomorphic and carries `meta: unknown` (`api/dataset.ts`'s class note). So this write is
        // core writing back its own erased shape, and it says so by widening the Dataset once rather
        // than casting every edit into the caller's declared `TMeta`/`TFields`.
        commitEntryEdits: (edits: StoredEdits) =>
          attemptMutation(() => {
            store.transaction(() => {
              for (const [id, edit] of edits) store.entries.update(id, edit);
            });
          }),
        // S5.1, D-S5-1: this file binds the two members it alone has. `dataset` is the full
        // `api/Dataset` and `gantt` is `this`. See `api/plugin.ts`'s file header for why `view/` may
        // name neither. `this` is captured, not read: by the time a plugin's `setup()` runs, `#shell`
        // below is assigned — the `plugins` assignment after this call. `zoomPresets`/`selection`
        // already rely on that same ordering. Every other member arrives already grouped from
        // `view/plugin-ports.ts`, which owns the group a plugin reads it in. So a new seam is one
        // edit there, and a member in the wrong group no longer compiles.
        buildPluginContext: (parts): PluginContext<TMeta, TFields> => ({
          dataset: options.dataset,
          gantt: this,
          ...parts,
        }),
        buildCommandContext: (parts): CommandContext<TMeta, TFields> => ({
          dataset: options.dataset,
          gantt: this,
          ...parts,
        }),
        now,
      },
    });
    if (options.zoomPresets !== undefined) this.#shell.zoomPresets = options.zoomPresets;
    if (options.selectedSegmentIds !== undefined) this.#shell.selection = options.selectedSegmentIds;
    if (options.plugins !== undefined) this.#shell.plugins = options.plugins;
  }

  /** Reads a loose `range` through the dataset's zone (S1.12, D-S1.12-8) — the one place `Gantt`
   *  does date math of its own, and only by delegating to `time/toInstant` (CLAUDE.md: "api/ maps
   *  fields; it never does date math of its own"). */
  #toRange(r: 'fitDataset' | { start: InstantInput; end: InstantInput }): 'fitDataset' | TimeSpan {
    if (r === 'fitDataset') return r;
    const zone = this.#dataset.timeZone;
    return { start: toInstant(zone, r.start), end: toInstant(zone, r.end) };
  }

  /** Reads `todayLine`'s loose pinned form through the dataset's zone (S1.13, D-S1.13-4) — booleans
   *  pass through untouched, so `true`/`false` never take a clock read they don't need. */
  #toTodayLine(todayLine: boolean | InstantInput): boolean | Instant {
    if (typeof todayLine === 'boolean') return todayLine;
    return toInstant(this.#dataset.timeZone, todayLine);
  }

  /** `#toRange`'s counterpart for `dateLines` (S1.13, D-S1.13-2): one `toInstant` call per entry. */
  #toDateLines(lines: readonly DateLineInput[]): readonly DateLine[] {
    const zone = this.#dataset.timeZone;
    return lines.map((line) => {
      const spec: DateLine = { placeAt: toInstant(zone, line.placeAt) };
      if (line.label !== undefined) spec.label = line.label;
      if (line.className !== undefined) spec.className = line.className;
      return spec;
    });
  }

  /** The Dataset this Gantt was built on (#226). Call: `gantt.dataset.canUndo`, or
   *  `gantt.dataset.on('change', …)`. It carries the consumer's own `TMeta`/`TFields`, so a helper
   *  that needs both objects takes the Gantt alone — `mountGanttToolbar({ gantt, container })` —
   *  instead of taking the pair and trusting the caller to keep it matched.
   *
   *  Read-only on purpose. A Gantt binds its Dataset once, at construction: the shell seeds its
   *  viewport from those entries, subscribes to that Dataset's `change`, and hands it to every
   *  plugin and command context. Swapping it is a new capability — teardown and rebind of all of
   *  that — not a getter's mirror, so it stays out until something asks for it. Build a second
   *  Gantt instead. */
  get dataset(): Dataset<TMeta, TFields> {
    return this.#dataset;
  }

  get theme(): Theme {
    return this.#shell.theme;
  }

  set theme(value: Theme) {
    this.#shell.theme = value;
  }

  get a11yLabel(): string {
    return this.#shell.a11yLabel;
  }

  set a11yLabel(value: string) {
    this.#shell.a11yLabel = value;
  }

  get gridWidth(): number {
    return this.#shell.gridWidth;
  }

  /** Live. `'fitColumns'` stands until something else sets a width — a later assignment, or a
   *  splitter drag (#157). */
  set gridWidth(width: GridWidth) {
    this.#shell.gridWidth = width;
  }

  get minGridWidth(): number {
    return this.#shell.minGridWidth;
  }

  set minGridWidth(px: number) {
    this.#shell.minGridWidth = px;
  }

  get gridColumns(): readonly GridColumnInput[] {
    return this.#shell.gridColumns;
  }

  set gridColumns(columns: readonly GridColumnInput[]) {
    this.#shell.gridColumns = columns;
  }

  /** D-S5-34: which columns are hidden, by field key — what a column chooser reads to draw its own
   *  checkboxes. Reports the columns this Gantt was configured with, never a plugin's own. */
  get hiddenGridColumns(): readonly FieldKey[] {
    return this.#shell.hiddenGridColumns;
  }

  /** D-S5-34. Call: `gantt.hideGridColumn('cost')`. It takes one column off the screen. It leaves
   *  every other column alone, with the width and the order the user gave them. The caller restates
   *  no list and splices nothing back later. The hidden column stays in `gridColumns` as
   *  `{ field, hidden: true }`, so a saved list restores it hidden. It raises the same cancelable
   *  `beforeGridColumnsChange`/`gridColumnsChange` pair a resize raises. It throws
   *  `UnknownGridColumnError` when no declared column names the field. */
  hideGridColumn(field: FieldKey): void {
    this.#shell.hideGridColumn(field);
  }

  /** D-S5-34. Call: `gantt.showGridColumn('cost')`. Puts a hidden column back where it was, with the
   *  width it had. Showing a column that is already on screen changes nothing. */
  showGridColumn(field: FieldKey): void {
    this.#shell.showGridColumn(field);
  }

  /** Live (S5.4, D-S5-11/12). Assigning repaints every bar with no remount (I8). A `RendererByKind`
   *  map is a value, not a mutable object (#187): mutate the map you already assigned, assign it
   *  again, and nothing repaints. Assign a copy — `{ ...map, milestone: paint }`, `plans/02` §2. */
  get barRenderer(): BarRenderer | RendererByKind | undefined {
    return this.#shell.barRenderer;
  }

  set barRenderer(renderer: BarRenderer | RendererByKind | undefined) {
    this.#shell.barRenderer = renderer;
  }

  /** Live (S5.4, D-S5-11). Assigning repaints every cell with no remount (I8). */
  get cellRenderer(): CellRenderer | undefined {
    return this.#shell.cellRenderer;
  }

  set cellRenderer(renderer: CellRenderer | undefined) {
    this.#shell.cellRenderer = renderer;
  }

  /** Live (S5.4, D-S5-11). */
  get headerRenderer(): HeaderRenderer | undefined {
    return this.#shell.headerRenderer;
  }

  set headerRenderer(renderer: HeaderRenderer | undefined) {
    this.#shell.headerRenderer = renderer;
  }

  /** Live (S5.4, D-S5-11). */
  get tooltipRenderer(): TooltipRenderer | undefined {
    return this.#shell.tooltipRenderer;
  }

  set tooltipRenderer(renderer: TooltipRenderer | undefined) {
    this.#shell.tooltipRenderer = renderer;
  }

  /** Live (S4.6, D-S4-21). Assigning re-resolves rows with no remount. The config object is a value
   *  (#187): assign a copy after a change, not the object already held.
   *
   *  Reads back resolved (#248 S4-2): `heightMode`, `filterPolicy`, and `tree` (Entries sources)
   *  come back filled, never omitted — a reader never has to know `layout/`'s own defaults. The
   *  resolve runs here, cached against the setter's own authored object, so two reads with no write
   *  between them stay `===` and the setter keeps assigning the plain `RowSource` the shell already
   *  compares by identity (#187) — resolving inside that comparison would break it instead. */
  get rowSource(): ResolvedRowSource {
    const authored = this.#shell.rowSource;
    if (this.#rowSourceCache === undefined || this.#rowSourceCache.authored !== authored) {
      this.#rowSourceCache = { authored, resolved: resolveRowSource(authored) };
    }
    return this.#rowSourceCache.resolved;
  }

  /** Loose on the way in, same as every other setter (#248 S4-2): stores the `RowSource` exactly as
   *  authored, so the shell's own `Object.is` re-assignment check keeps comparing what the caller
   *  actually passed. */
  set rowSource(next: RowSource) {
    this.#shell.rowSource = next;
  }

  get collapsed(): readonly RowId[] {
    return this.#shell.collapsed;
  }

  set collapsed(ids: readonly (RowId | string)[]) {
    this.#shell.collapsed = ids;
  }

  collapse(id: RowId | string): void {
    this.#shell.collapse(id);
  }

  expand(id: RowId | string): void {
    this.#shell.expand(id);
  }

  toggleCollapse(id: RowId | string): void {
    this.#shell.toggleCollapse(id);
  }

  collapseAll(): void {
    this.#shell.collapseAll();
  }

  expandAll(): void {
    this.#shell.expandAll();
  }

  get preset(): ViewPreset {
    return this.#shell.preset;
  }

  set preset(ref: PresetRef) {
    this.#shell.preset = ref;
  }

  /** D-S3-24. What a drag snaps to right now: this Gantt's own setting when it states one, else the
   *  showing preset's, else `'tick'`. A gesture resolves `'tick'` against the preset it measures, so
   *  the answer follows a zoom without the caller writing anything. */
  get snap(): SnapSetting {
    return this.#shell.snap;
  }

  /** Live (D-S3-24). Call: `gantt.snap = { unit: 'day', increment: 2 }`. It states the snap for this
   *  Gantt, over whatever preset is showing, and it survives a zoom. `undefined` hands the answer
   *  back to the preset. The old spelling — `gantt.preset = { ...gantt.preset, snap }` — built a
   *  one-off copy of a shipped preset, and the next `zoomIn()` threw the snap away with it. */
  set snap(next: SnapSetting | undefined) {
    this.#shell.snap = next;
  }

  /** Getter returns the resolved `TimeSpan` — matching how `Dataset` reads `EntryInput` once at
   *  ingest (D-S1.12-8). */
  get range(): 'fitDataset' | TimeSpan {
    return this.#shell.range;
  }

  /** Loose input (S1.12, D-S1.12-8): a string, a `Date`, an epoch number or an `Instant` all work on
   *  `start`/`end`, read through the dataset's zone. */
  set range(r: 'fitDataset' | { start: InstantInput; end: InstantInput }) {
    this.#shell.range = this.#toRange(r);
  }

  get fit(): TimeScaleFit {
    return this.#shell.fit;
  }

  set fit(f: TimeScaleFit) {
    this.#shell.fit = f;
  }

  get locale(): Intl.LocalesArgument | undefined {
    return this.#shell.locale;
  }

  /** Live (S1.12, D-S1.12-12): every header label and every screen-reader date re-reads in the new
   *  locale, live, with no remount. */
  set locale(l: Intl.LocalesArgument | undefined) {
    this.#shell.locale = l;
  }

  /** Getter returns what was resolved (S1.13, D-S1.13-4, S4-1) — a `boolean` passes straight
   *  through; any other setting reads back the `Instant` it was pinned to, never the loose input. */
  get todayLine(): boolean | Instant {
    return this.#shell.todayLine;
  }

  /** Live (S1.12/S1.13, D-S1.12-14, D-S1.13-4). `true`/`false` pass straight through; any other
   *  `InstantInput` is read once through the dataset's zone and pins the line with no clock read. */
  set todayLine(on: boolean | InstantInput) {
    this.#shell.todayLine = this.#toTodayLine(on);
  }

  /** Getter returns what was resolved (S4-1), same precedent as `todayLine`/`range` above: every
   *  `placeAt` reads back an `Instant`, so `diffMs(gantt.dateLines[0].placeAt, now())` type-checks
   *  with no re-narrowing. */
  get dateLines(): readonly DateLine[] {
    return this.#shell.dateLines;
  }

  /** Live (S1.13, D-S1.13-4). Loose on the way in: every `placeAt` is read through the dataset's
   *  zone via `toInstant`. */
  set dateLines(lines: readonly DateLineInput[]) {
    this.#shell.dateLines = this.#toDateLines(lines);
  }

  get todayLineMarginTicks(): number {
    return this.#shell.todayLineMarginTicks;
  }

  /** Live. See `GanttOptions.todayLineMarginTicks`. */
  set todayLineMarginTicks(ticks: number) {
    this.#shell.todayLineMarginTicks = ticks;
  }

  /** The ordered set `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). Live. */
  get zoomPresets(): readonly ViewPreset[] {
    return this.#shell.zoomPresets;
  }

  set zoomPresets(refs: readonly PresetRef[]) {
    this.#shell.zoomPresets = refs;
  }

  /** The Selection itself (ADR 0010, #212) — which Segments a click, the keyboard, or an assignment
   *  selected. The pane a click lands in picks the unit: the timeline selects the Segment under the
   *  pointer, and the grid pane selects every Segment of every Entry the row owns. Loose in, branded
   *  out — the same asymmetry `dataset.entries.get/update/remove` already ship. Live: assignment runs
   *  the same cancelable `beforeSelectionChange` → `selectionChange` sequence a click runs. */
  get selectedSegmentIds(): readonly SegmentId[] {
    return this.#shell.selection;
  }

  set selectedSegmentIds(ids: readonly (SegmentId | string)[]) {
    this.#shell.selection = ids;
  }

  /** The Selection read as records rather than drawings (ADR 0010, #212) — the Entries the selected
   *  Segments belong to, deduped, in row order. Read-only: assign `selectedSegmentIds` to change what
   *  is selected, because a Segment is the unit the user actually points at. */
  get selectedEntryIds(): readonly EntryId[] {
    return this.#shell.selectedEntryIds;
  }

  /** The Selection as records — the bound dataset's `Entry` for each id in `selectedEntryIds`, in
   *  the same order. Re-reads the store on every access, so field edits show up without a selection
   *  change. An id that no longer exists in the store is skipped — for example after
   *  `dataset.entries.remove` left a stale id in the selection set. To change which entries are
   *  selected, assign `selectedSegmentIds`; this getter is read-only. */
  get selectedEntries(): readonly Entry[] {
    const entries: Entry[] = [];
    for (const id of this.selectedEntryIds) {
      const entry = this.#dataset.entries.get(id);
      if (entry !== undefined) entries.push(entry);
    }
    return entries;
  }

  /** Live (S3, D-S3-9): re-resolves immediately, so a stricter rule hides a handle or refuses a
   *  gesture without waiting for the next pointer move. */
  get interactions(): Interactions {
    return this.#shell.interactions;
  }

  set interactions(next: Interactions) {
    this.#shell.interactions = next;
  }

  /** D-S5-35. Call: `gantt.setCapabilityRule('resize', false)`. It writes the rule for one gesture
   *  and leaves the rules for the others exactly as they are. `gantt.interactions = { resize: false }`
   *  drops them instead. The rule is a boolean, or a predicate the resolver runs per entry —
   *  `gantt.setCapabilityRule('move', (entry) => entry.kind !== 'milestone')`. It re-resolves at
   *  once, so a stricter rule hides a handle without waiting for the next pointer move. */
  setCapabilityRule(capability: keyof Interactions, rule: CapabilityRule): void {
    this.#shell.setCapabilityRule(capability, rule);
  }

  /** D-S5-35. Call: `gantt.clearCapabilityRule('resize')`. It takes this Gantt's own rule off one
   *  gesture, so a plugin's kind defaults and the library's per-kind table answer it again. This is
   *  not `setCapabilityRule('resize', true)`: `true` is a rule of its own, and it would also make a
   *  rolled-up parent and a milestone resizable. Clearing a gesture that carries no rule does
   *  nothing. */
  clearCapabilityRule(capability: keyof Interactions): void {
    this.#shell.clearCapabilityRule(capability);
  }

  /** Live (S3.7, D-S3-14): the next wheel or key reads the new flags; no remount. */
  get viewportGestures(): ViewportGestures {
    return this.#shell.viewportGestures;
  }

  set viewportGestures(next: ViewportGestures) {
    this.#shell.viewportGestures = next;
  }

  get canZoomIn(): boolean {
    return this.#shell.canZoomIn;
  }

  get canZoomOut(): boolean {
    return this.#shell.canZoomOut;
  }

  /** Next finer entry of `zoomPresets`; no-op at the finest (S1.12, D-S1.12-6). `anchorX` defaults
   *  to pane centre. Steps the preset only — under `fit: 'pane'`, density stays pane-fill until the
   *  floor bites. */
  zoomIn(anchorX?: number): void {
    this.#shell.zoomIn(anchorX);
  }

  /** Next coarser entry of `zoomPresets`; no-op at the coarsest (S1.12, D-S1.12-6). */
  zoomOut(anchorX?: number): void {
    this.#shell.zoomOut(anchorX);
  }

  zoomTo(pxPerMs: number, anchorX?: number): void {
    this.#shell.zoomTo(pxPerMs, anchorX);
  }

  zoomBy(factor: number, anchorX?: number): void {
    this.#shell.zoomBy(factor, anchorX);
  }

  /** Resolves the density that makes `span` exactly fill the pane, then pans so `span.start` sits at
   *  the pane's left edge — both inside one batch, one notification (S1.12, D-S1.12-7). Floored, so
   *  a span too long to be legible fills the pane only as far as the floor allows. */
  zoomToSpan(span: { start: InstantInput; end: InstantInput }): void {
    const zone = this.#dataset.timeZone;
    this.#shell.zoomToSpan({ start: toInstant(zone, span.start), end: toInstant(zone, span.end) });
  }

  /** Pans so `date` sits at `align` within the pane (S1.12, D-S1.12-8). Loose input: a string, a
   *  `Date`, an epoch number or an `Instant` all work, read through the dataset's zone. */
  panToDate(date: InstantInput, align: 'start' | 'center' = 'start'): void {
    this.#shell.panToInstant(toInstant(this.#dataset.timeZone, date), align);
  }

  /** Pans to `now()` (`time/` owns the clock read, I10), leaving `todayLineMarginTicks`' worth of
   *  margin to the left at `align: 'start'` (the default) so the today line reads as "near the
   *  start" rather than sitting flush on the pane's own edge. `align: 'center'` is unaffected:
   *  already centred, a margin has nothing to add. Off the dataset's own range, `panTo`'s clamp
   *  (D-S1.5-2) lands at whichever edge is closest instead of throwing. */
  panToToday(align: 'start' | 'center' = 'start'): void {
    this.#shell.panToToday(now(), align);
  }

  /** An `EntryId` reveals that Entry's whole envelope; a `SegmentId` reveals that one Segment alone.
   *  An id the Dataset reads as neither throws `RevealTargetNotFoundError` (ADR 0010, #227). */
  reveal(id: EntryId | SegmentId): void {
    this.#shell.reveal(id);
  }

  /** Live (S5.1, D-S5-1, D-S5-3). See `GanttOptions.plugins`. */
  get plugins(): readonly GanttPlugin<TMeta, TFields>[] {
    return this.#shell.plugins;
  }

  set plugins(next: readonly GanttPlugin<TMeta, TFields>[]) {
    this.#shell.plugins = next;
  }

  /** D-S5-36. Call: `gantt.installPlugin(tooltips())`. It installs one plugin and leaves every
   *  plugin already running alone, so a caller never restates the installed set to add to it. A
   *  plugin whose `id` is already installed throws `DuplicatePluginIdError` — the assignment form
   *  ignores it and reports `plugin-reconfigure-dropped`, which is the silence this verb replaces. */
  installPlugin(plugin: GanttPlugin<TMeta, TFields>): void {
    this.#shell.installPlugin(plugin);
  }

  /** D-S5-36. Call: `gantt.hasPlugin('harness.logging')`. It answers whether that plugin is
   *  installed right now — what a toggle reads before it decides which verb to call. Identity is the
   *  `id`, so an object with an installed plugin's `id` answers `true`. */
  hasPlugin(plugin: GanttPlugin<TMeta, TFields> | PluginId): boolean {
    const id = typeof plugin === 'string' ? plugin : plugin.id;
    return this.#shell.plugins.some((installed) => installed.id === id);
  }

  /** D-S5-36. Call: `gantt.uninstallPlugin(popup)`, or `gantt.uninstallPlugin('harness.logging')`.
   *  It disposes that one plugin and leaves the rest running. Identity is the `id` in both forms,
   *  the same identity the assignment form diffs by (D-S5-3). A plugin nothing installs throws
   *  `PluginNotInstalledError`, so a misspelled id is not a silent no-op. */
  uninstallPlugin(plugin: GanttPlugin<TMeta, TFields> | PluginId): void {
    this.#shell.uninstallPlugin(typeof plugin === 'string' ? plugin : plugin.id);
  }

  /** S5.2, D-S5-6: the one command registry. `freegantt.*` is the core namespace — core registers
   *  its own commands (collapse/expand, zoom, pan, selection, undo/redo, and keyboard navigation)
   *  before any plugin, so a plugin's own registration always wins for a shared id (D-S5-7).
   *  `run(id)` silently no-ops when the command's `when` declines, the same posture as a disabled
   *  menu item. Read-only — `register` lives on the registry itself. */
  get commands(): CommandRegistry<TMeta, TFields> {
    return this.#shell.commands;
  }

  on<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#shell.on(name, handler);
  }

  off<K extends keyof GanttEventMap>(name: K, handler: GanttEventHandler<K>): void {
    this.#shell.off(name, handler);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#shell.destroy();
    this.#destroyed = true;
  }
}
