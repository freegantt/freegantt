// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own shell and state so two Gantt instances on one page are fully independent.

import { GanttShell } from '../view/index.js';
import type {
  GanttEventHandler,
  GanttEventMap,
  GridWidth,
  Capabilities,
  ResolvedTheme,
  Theme,
  ViewportGestures,
  PointerActivation,
} from '../view/index.js';
import { TimeScaleModel, pickDefined, resolveRowSource } from '../layout/index.js';
import type {
  PresetRef,
  ScrollAxes,
  SnapSetting,
  TimeScaleFit,
  ViewPreset,
  RowSource,
  ResolvedRowSource,
  RowFilter,
  RowSort,
  Overscan,
} from '../layout/index.js';
import type { DateLine, DateLineLabelPlacement } from '../layout/index.js';
import type {
  BarLabels,
  BarRenderer,
  GridCellRenderer,
  HeaderRenderer,
  TooltipRenderer,
  EntryVariant,
  ResolvedVariant,
} from '../layout/index.js';
import type {
  Entry,
  EntryEdit,
  EntryId,
  FieldKey,
  GridColumnInput,
  Instant,
  InstantInput,
  PluginId,
  ProposedEdit,
  RowId,
  ProposedEdits,
  TimeSpan,
} from '../model/index.js';
import { CustomRowSourceNotFilterableOrSortableError, PluginSetupError } from '../model/index.js';
import { attemptMutation } from './attempt-mutation.js';
import { now, toInstant } from '../time/index.js';
import { extraEditsFor, fieldRegistryRevisionFor, type Dataset } from './dataset.js';
import type { ChromePluginOf, DataPluginOf, PluginOf } from './plugin.js';
import type { PluginContextOf } from './plugin-context.js';
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

/** Unwraps a storage-shaped `ProposedEdit` (a resolved gesture draft) back into the flat `EntryEdit`
 *  shape `entries.update()` takes — the one legal way to feed an already-resolved edit through the
 *  public write door now that `ProposedEdit` is branded and no longer assignable to `EntryEdit` (ADR
 *  0011, decision 22). Every declared `props` key flattens back onto the top level, the same shape a
 *  caller would have authored by hand; `__brand`/`proposedKeys` drop, and `entries.update()` derives
 *  its own `proposedKeys` fresh from the keys this produces — an `Instant` is a valid `InstantInput`,
 *  so re-normalizing an already-resolved edit is a no-op. */
function entryEditFromProposedEdit<TProps>(edit: ProposedEdit<TProps>): EntryEdit<TProps> {
  const { __brand: _brand, props, proposedKeys: _proposedKeys, ...envelope } = edit;
  return { ...envelope, ...props };
}

export interface GanttOptionsBase<TProps = unknown> {
  /** Element or CSS selector (plans/02 §2) — resolved by GanttShell; a selector matching nothing
   * throws (#38). */
  container: HTMLElement | string;
  /** The Dataset this Gantt reads and writes, for its whole life. It binds `TProps`:
   *  a Gantt built on a `Dataset<{ team: string }, { cost: number }>` hands that same typed
   *  Dataset back from `gantt.dataset`, so a page never carries the pair by hand (#226). */
  dataset: Dataset<TProps>;
  /** Bound scroll axes (D9, D-S6-1) — pass the same `ScrollAxis` as `x` (or `y`) to two Gantt
   * instances to sync that direction; omit a direction to keep it private. Independent of
   * `scale`/`preset`/`range`/`fit`: a Gantt may share its scroll position, its scale, both, or
   * neither. */
  scroll?: ScrollAxes;
  /** Live. The grid pane's width in px (S1.8), or `'fitColumns'` (#157) to sit it on its columns'
   *  own right edge and keep it there as the columns change. Reads back in px either way. Default:
   *  `--fg-grid-pane-width`, fallback 160. Never wider than the columns (#139); a splitter drag
   *  turns `'fitColumns'` back into the width it was dragged to. */
  gridWidth?: GridWidth;
  /** Live (#127). The floor a splitter drag clamps `gridWidth` to. Default `40` — wide enough for
   *  one narrow column, so a drag cannot take the pane to nothing by accident. It bounds the drag
   *  only: an explicit `gridWidth = 0` still collapses the grid pane on purpose. */
  minGridWidth?: number;
  /** Live (#432). Default `true`: the splitter drags, and a column paints its resizer grip
   *  whenever its own `resizable` (default `true`) says so. `false` locks the whole grid pane —
   *  the splitter no longer drags and shows no resize cursor, and no column paints a grip, no
   *  matter what its own `resizable` says. Neither `beforeGridWidthChange` nor
   *  `beforeGridColumnsChange` fires for a gesture that can no longer arm: this is a lock, not a
   *  veto. A programmatic write still lands — `gantt.gridWidth = 240`, `gantt.gridColumns = […]` —
   *  the same way `capabilities.move: false` never stops a Dataset write. This is what keeps a
   *  `gridWidth: 'fitColumns'` pane from turning into a fixed px width on a stray drag. */
  gridResizable?: boolean;
  /** Live (plans/02, "The culling buffer (`overscan`)"). The culling buffer around the visible window: `verticalRows` whole rows
   *  above and below, `horizontalPx` px left and right of the timeline pane. A row or a bar inside
   *  the buffer stays mounted while it is one scroll step from view, so a small scroll never shows a
   *  bare frame. Default `{ verticalRows: 2, horizontalPx: 128 }`. */
  overscan?: Overscan;
  /** Live (S1.10). Default `'auto'`: follows the nearest ancestor's `data-fg-theme` pin, else
   *  `prefers-color-scheme`. ADR 0029: an app with its own dark-mode signal pushes the answer —
   *  `gantt.theme = isDark ? 'dark' : 'light'` in its own toggle — or pins `data-fg-theme` on a
   *  wrapper once. The library never asks the app; it only reads what the app writes. */
  theme?: Theme;
  /** Live (S1.10). Default `'Gantt'`; sets `aria-label` on the container. */
  a11yLabel?: string;
  /** Live (S1.12, D-S1.12-12). `undefined` = the runtime default. Feeds header labels and
   *  screen-reader dates alike, with no bar remount. */
  locale?: Intl.LocalesArgument;
  /** Live (S1.12/S1.13, D-S1.12-14, D-S1.13-4). Default `true`: reads the clock on each render, so
   *  the line moves on the next render, not on a clock tick. It goes stale on a page left open past
   *  midnight until something else repaints. An app that wants a live line reassigns this on its own
   *  timer, e.g. `setInterval(() => { gantt.todayLine = new Date(); }, 60_000)`, held in a plugin's
   *  `ctx.disposables`. `false`: off, no clock read. An `InstantInput` pins it with no clock read at
   *  all. To keep today visible, pan with `panToToday()` or grow `range`. */
  todayLine?: boolean | InstantInput;
  /** Live (S1.13, D-S1.13-4). Default `[]`. Extra Date lines beside the today wrapper —
   *  status/as-of dates, sprint or holiday markers, project start/finish. No id: index-keyed, like
   *  Header bands. The wrapper's own line never gets a Date line label; give one of these a `label` instead. */
  dateLines?: readonly DateLineInput[];
  /** Live (#318 follow-up to #225). Where a Date line's own label paints, relative to the sticky
   *  header. `'belowHeader'` (the default) anchors below the header, clear of its ticks — the
   *  shape #225 shipped. It can still meet a bar: the header stays put while the timeline pane
   *  scrolls, so whichever row's bar is scrolled to the top sits right under it.
   *  `'inHeader'` anchors inside the header instead, where no row can ever scroll under it,
   *  at the cost of #225's own ticks collision when the label's x lands on one. A `number` is a px
   *  offset from the header's own top edge, for a caller who wants neither shorthand. */
  dateLineLabelPlacement?: DateLineLabelPlacement;
  /** Live. How many of the current preset's own ticks `panToToday()` leaves between the pane's left
   *  edge and where it lands `align: 'start'` (the default) — the **Today line margin** (CONTEXT.md).
   *  Default `2`; `0` restores the old flush landing. No effect on `align: 'center'`. */
  todayLineMarginTicks?: number;
  /** The ordered set `zoomIn`/`zoomOut` step through, finest first (S1.12, D-S1.12-5). Live.
   *  Default: the shipped nine-rung set. */
  zoomPresets?: readonly PresetRef[];
  /** Live (S3, D-S3-10; ADR 0010, ADR 0025, #212, #421). Entry ids, loose on the way in;
   *  assignment runs the same cancelable sequence a click runs. Default `[]`. */
  selectedEntryIds?: readonly (EntryId | string)[];
  /** Live (S3, D-S3-9). A gesture rule is a boolean or a per-entry predicate; `edit` takes the cell
   *  and may answer "no opinion" (#256). Both sit over the per-kind default
   *  table. Default `{}`: every gesture resolves off the default table alone. Assignment replaces
   *  the whole config; `gantt.setCapabilityRule`/`clearCapabilityRule` write one rule (D-S5-35). */
  capabilities?: Capabilities;
  /** Live (#434). Default `'click'`: `entryActivate` fires on a plain click of a bar or a row's own
   *  background. `'dblclick'` replaces click as the pointer trigger: a single click only selects,
   *  and a double-click activates once. On a grid cell, `'dblclick'` activates only a cell
   *  `capabilities` refuses to write — a writable cell's double-click stays `inlineEditing()`'s own
   *  (the same editable-cell-wins precedence `Enter` already gives the editor). */
  pointerActivation?: PointerActivation;
  /** Live (D-S3-24). What a drag and a keyboard nudge snap to: `{ unit, increment }`, `'tick'` for
   *  one tick of whatever preset is showing, or `'none'`. Omitted, the showing preset's own `snap`
   *  decides — which is `'tick'` for every shipped preset. */
  snap?: SnapSetting;
  /** Live (S3.7, D-S3-14). Wheel zoom, shift+wheel pan, and keyboard pan. Default `{}`: every
   *  viewport gesture is on. `false` turns them all off. Does not gate `zoomBy` / `panToDate`. */
  viewportGestures?: ViewportGestures;
  /** Live (S4.3, D-S4-12). Field keys in display order, plus per-Gantt overrides. Default `['name']`. */
  gridColumns?: readonly GridColumnInput[];
  /** Live (S4.6, D-S4-21). Default `{ source: 'entries', tree: true }`. */
  rowSource?: RowSource;
  /** Live (S4.6, D-S4-22). Collapsed row ids, loose on the way in. Default `[]`. */
  collapsed?: readonly (RowId | string)[];
  /** Live (J1). Where the default bar label paints — ignored once `barRenderer`'s output takes over
   *  a bar's content. Short form is a `BarLabelPolicy` (see its own doc for the five values);
   *  default `'fitBar'`. */
  barLabels?: BarLabels;
  /** Live (S5.4, D-S5-11). Customization ladder level 3 (`plans/02` §4). One function, over every
   *  bar **no variant paints**. `undefined` returned from it keeps the library's own bar output.
   *
   *  A rule that names the rows it covers answers first, and the library's own summary rule is such
   *  a rule (`J40`, `J61`). So this never paints a row with children, which the library paints as a
   *  summary. To paint those too, claim them with a rule of your own:
   *  `variants: [{ name: 'summary', when: (entry) => entry.hasChildren, paint }]` — a consumer's
   *  rule outranks the library's.
   *
   *  To paint one kind of row and leave the rest alone, write a variant instead: `variants: [{ name,
   *  when, paint }]` (ADR 0018). That is what the retired per-kind map form was for, and a variant
   *  says which rows it covers in the same object. */
  barRenderer?: BarRenderer;
  /** Live (ADR 0018). One variant is one object: `when` says which rows wear it, `items` what shape
   *  it draws, `paint` how it looks, and `can` what you can do to it.
   *
   *  ```ts
   *  variants: [{ name: 'milestone', when: { milestone: true }, paint: milestoneBar, can: { resize: false } }]
   *  ```
   *
   *  Nothing stores a variant. It is a rule, resolved per Gantt, so two Gantts on one Dataset may
   *  paint the same row differently (I2). To pin one named row, write the data — declare a Field,
   *  `update(id, { milestone: true })`, and let `when` read it back.
   *
   *  The rules here win over every plugin's, whatever order the plugins installed in, and both win
   *  over core's own `parent`/`leaf`. Of two rules on this list that both answer yes for one row,
   *  the later one wins. Default `[]`. */
  variants?: readonly EntryVariant<TProps>[];
  /** Live (S5.4, D-S5-11). Gantt-wide; a per-column `GridColumn.columnRenderer` (S5.7) wins over this
   *  for its own column. `ctx.column.field` lets one function branch per column. */
  gridCellRenderer?: GridCellRenderer;
  /** Live (S5.4, D-S5-11). Grid column header chrome (S5.7 paints through it). */
  headerRenderer?: HeaderRenderer;
  /** Live (S5.4, D-S5-11). Replaces a tooltip's body (S5.5's `tooltips()` feature). */
  tooltipRenderer?: TooltipRenderer;
  /** Live (S5.1, D-S5-1, D-S5-3, #404). Values a consumer imports (`tooltips()`, `contextMenu({...})`),
   *  never names in a table. Assignment diffs by `id`, then by object identity: a new `id` sets up, a
   *  missing one disposes, the same object is left alone, and a fresh object under an installed `id`
   *  replaces that occupant — so one assignment reconfigures a plugin. Default `[]`.
   *  `gantt.installPlugin`/`uninstallPlugin` add or drop one plugin without restating the set
   *  (D-S5-36).
   *
   *  ADR 0019: chrome only. A plugin with a `data` half declares a Field or claims the edit hook, and
   *  both must be in place before the Dataset's first Rollup — so it installs on the `Dataset`
   *  instead. `data?: never` on this arm is what stops the wrong one compiling here. */
  plugins?: readonly ChromePlugin<TProps>[];
}

/** Two ways to set the time axis, made mutually exclusive at the type level (issue #84 — the prior shape
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

export type GanttOptions<TProps = unknown> = GanttOptionsBase<TProps> & GanttScaleOptions;

/** ADR 0019, `Q4`: the second line of defence. `GanttOptions.plugins` takes `ChromePlugin` alone, so
 *  a plugin with a `data` half is already a red squiggle in an editor. This catches the caller the
 *  compiler never met — plain JavaScript, a list built at runtime, a `Plugin` a helper widened. A
 *  library refuses in both languages it is read in.
 *
 *  It raises `PluginSetupError`, the error a failed install already raises. No new type ships, and
 *  the message says where the plugin goes instead. */
function assertChromeOnly<TProps>(plugins: readonly ChromePlugin<TProps>[]): readonly ChromePlugin<TProps>[] {
  for (const plugin of plugins) {
    if (typeof (plugin as { data?: unknown }).data === 'function') {
      throw PluginSetupError.wrongInstallSite(plugin.id);
    }
  }
  return plugins;
}

/** S5.1, D-S5-1, ADR 0019: the plugin shapes and `PluginContext`, bound to this class. See
 *  `api/plugin.ts`'s file header for why the generic forms live there and the binding happens here.
 *  This file is the one that sees both `Gantt` and `Dataset`. So all four names bind here, the
 *  Dataset-installed ones included. These are the types a plugin author actually writes, and
 *  `api/index.ts` re-exports them alongside the generic `*Of` shapes. */
export type PluginContext<TProps = unknown> = PluginContextOf<Gantt<TProps>, Dataset<TProps>>;
export type ChromePlugin<TProps = unknown> = ChromePluginOf<PluginContext<TProps>>;
export type DataPlugin<TProps = unknown> = DataPluginOf<PluginContext<TProps>, Dataset<TProps>>;
export type Plugin<TProps = unknown> = PluginOf<PluginContext<TProps>, Dataset<TProps>>;

/** S5.2, D-S5-6: `Command`/`CommandContext`/`CommandRegistry`/`KeyBinding` bound to this class — see
 *  `api/command.ts`'s file header for why the generic form lives there and the binding happens here.
 *  This is the shape a plugin author, or a `gantt.commands`/`gantt.commands.run(id)` caller, actually
 *  sees; `api/index.ts` re-exports these bound names alongside the generic `*Of` shapes. */
export type Command<TProps = unknown> = CommandOf<Gantt<TProps>, Dataset<TProps>>;
export type CommandContext<TProps = unknown> = CommandContextOf<Gantt<TProps>, Dataset<TProps>>;
export type CommandRegistry<TProps = unknown> = CommandRegistryOf<Gantt<TProps>, Dataset<TProps>>;
export type KeyBinding<TProps = unknown> = KeyBindingOf<Gantt<TProps>, Dataset<TProps>>;
export type { ActedOn, CommandTarget };
// `dateLines`'s resolved read type (S4-1) — passed through so a caller who names `DateLine`
// explicitly imports it beside `DateLineInput`, its loose counterpart above.
export type { DateLine };
// `dateLineLabelPlacement`'s own type (#318 follow-up), passed through the same way.
export type { DateLineLabelPlacement };

export class Gantt<TProps = unknown> {
  #shell: GanttShell;
  #dataset: Dataset<TProps>;
  #destroyed = false;
  /** `rowSource`'s resolve cache (#248 S4-2), keyed on the authored object the setter last stored —
   *  not on the resolved value, which is rebuilt fresh and would never compare `===` to itself. */
  #rowSourceCache?: { authored: RowSource; resolved: ResolvedRowSource };

  constructor(options: GanttOptions<TProps>) {
    this.#dataset = options.dataset;
    // The same Dataset, read at the erased width `view/` and `interaction/` work in — see
    // `commitEntryEdits` below, its one reader.
    const store: Dataset = options.dataset;
    // `buildPluginContext` and `buildCommandContext` (in `wiring` below) both answer "this Gantt's
    // `dataset` and `gantt`, plus whichever parts the caller supplies" — one fact, so it lives here
    // once rather than in two byte-identical arrow functions (#260).
    const withDatasetAndGantt = <TParts extends object>(parts: TParts) => ({
      dataset: options.dataset,
      gantt: this,
      ...parts,
    });
    this.#shell = new GanttShell({
      container: options.container,
      dataset: options.dataset,
      ...pickDefined(options, [
        'scroll',
        'gridWidth',
        'minGridWidth',
        'gridResizable',
        'overscan',
        'preset',
        'fit',
        'theme',
        'a11yLabel',
        'locale',
        'dateLineLabelPlacement',
        'todayLineMarginTicks',
        'capabilities',
        'pointerActivation',
        'snap',
        'viewportGestures',
        'gridColumns',
        'rowSource',
        'collapsed',
        'barLabels',
        'barRenderer',
        'gridCellRenderer',
        'headerRenderer',
        'tooltipRenderer',
        'zoomPresets',
      ]),
      ...(options.scale ? { scale: options.scale } : {}),
      ...(options.range !== undefined ? { range: this.#toRange(options.range) } : {}),
      ...(options.todayLine !== undefined ? { todayLine: this.#toTodayLine(options.todayLine) } : {}),
      ...(options.dateLines !== undefined ? { dateLines: this.#toDateLines(options.dateLines) } : {}),
      // N7: a constructor-supplied plugin/selection reaches frame 1 only if `GanttShell` installs
      // it before its own first paint — see that constructor's own comment just ahead of
      // `#frames.flush()`. `this` is captured, not read, so `ctx.gantt` is real by the time any
      // plugin's `setup()` runs even though `#shell` below is not yet assigned (same ordering note
      // `buildPluginContext` already carries).
      ...(options.selectedEntryIds !== undefined ? { selectedEntryIds: options.selectedEntryIds } : {}),
      // ADR 0018: one cast at the façade — see `set variants` below for why it is the only one.
      ...(options.variants !== undefined ? { variants: options.variants as readonly EntryVariant[] } : {}),
      // ADR 0019: the Dataset's own plugins ride along. Their `view` halves belong to every Gantt
      // bound to that Dataset, and one `requires` graph orders them together with this Gantt's own
      // chrome. A plugin with no `view` half joins the graph and runs nothing here.
      datasetPlugins: options.dataset.plugins,
      ...(options.plugins !== undefined ? { plugins: assertChromeOnly(options.plugins) } : {}),
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
      extraEditsFor: (draft) => extraEditsFor(options.dataset, draft),
      // #495, #414: read live off the Dataset, the same "closure over the friend function" shape
      // `extraEditsFor` above takes — `FrameLayout`'s row-plan cache reads it every `render()`.
      fieldRegistryRevision: () => fieldRegistryRevisionFor(options.dataset),
      wiring: {
        entryGestures: attachEntryGestures,
        keyboardEditing: attachKeyboardEditing,
        columnGestures: attachColumnGestures,
        // S3.3, D-S3-16: `GanttShell`'s own `dataset` option is `model/`'s narrow `Dataset`
        // interface ("a view never opens a transaction"). This class holds the full `api/Dataset`,
        // so a committed gesture draft reaches the store through here, not through the shell.
        // `store`, not `options.dataset`: a gesture draft is built in `view/`, which is permanently
        // monomorphic and carries `props: unknown` (`api/dataset.ts`'s class note). So this write is
        // core writing back its own erased shape, and it says so by widening the Dataset once rather
        // than casting every edit into the caller's declared `TProps`.
        commitEntryEdits: (edits: ProposedEdits) =>
          attemptMutation(() => {
            store.transaction(() => {
              for (const [id, edit] of edits) store.entries.update(id, entryEditFromProposedEdit(edit));
            });
          }),
        // S5.1, D-S5-1: this file binds the two members it alone has. `dataset` is the full
        // `api/Dataset` and `gantt` is `this`. See `api/plugin-context.ts`'s file header for why `view/` may
        // name neither. `this` is captured, not read (N7): a plugin's `setup()` runs *inside* the
        // `new GanttShell(...)` call above, before this constructor reaches its own closing brace,
        // so `#shell` is not yet assigned — but `ctx.gantt` only needs `this` to exist, not `#shell`
        // to be set, and nothing a plugin's `setup()` runs synchronously reads `#shell` (only
        // event handlers registered for later do). Every other member arrives already grouped from
        // `view/plugin-ports.ts`, which owns the group a plugin reads it in. So a new seam is one
        // edit there, and a member in the wrong group no longer compiles.
        buildPluginContext: (parts): PluginContext<TProps> => withDatasetAndGantt(parts),
        buildCommandContext: (parts): CommandContext<TProps> => withDatasetAndGantt(parts),
        now,
      },
    });
  }

  /** Reads a loose `range` through the dataset's zone (S1.12, D-S1.12-8) — the one place `Gantt`
   *  does date math of its own, and only by delegating to `time/toInstant` (CLAUDE.md: "api/ maps
   *  fields; it never does date math of its own"). */
  #toRange(r: 'fitDataset' | { start: InstantInput; end: InstantInput }): 'fitDataset' | TimeSpan {
    if (r === 'fitDataset') return r;
    const zone = this.#dataset.timeZone;
    return { start: toInstant(zone, r.start, 'gantt.range'), end: toInstant(zone, r.end, 'gantt.range') };
  }

  /** Reads `todayLine`'s loose pinned form through the dataset's zone (S1.13, D-S1.13-4) — booleans
   *  pass through untouched, so `true`/`false` never take a clock read they don't need. */
  #toTodayLine(todayLine: boolean | InstantInput): boolean | Instant {
    if (typeof todayLine === 'boolean') return todayLine;
    return toInstant(this.#dataset.timeZone, todayLine, 'gantt.todayLine');
  }

  /** `#toRange`'s counterpart for `dateLines` (S1.13, D-S1.13-2): one `toInstant` call per entry. */
  #toDateLines(lines: readonly DateLineInput[]): readonly DateLine[] {
    const zone = this.#dataset.timeZone;
    return lines.map((line) => {
      const spec: DateLine = { placeAt: toInstant(zone, line.placeAt, 'gantt.dateLines') };
      if (line.label !== undefined) spec.label = line.label;
      if (line.className !== undefined) spec.className = line.className;
      return spec;
    });
  }

  /** The Dataset this Gantt was built on (#226). Call: `gantt.dataset.canUndo`, or
   *  `gantt.dataset.on('change', …)`. It carries the consumer's own `TProps`, so a helper
   *  that needs both objects takes the Gantt alone — `mountGanttToolbar({ gantt, container })` —
   *  instead of taking the pair and trusting the caller to keep it matched.
   *
   *  Read-only on purpose. A Gantt binds its Dataset once, at construction: the shell seeds its
   *  viewport from those entries, subscribes to that Dataset's `change`, and hands it to every
   *  plugin and command context. Swapping it is a new capability — teardown and rebind of all of
   *  that — not a getter's mirror, so it stays out until something asks for it. Build a second
   *  Gantt instead. */
  get dataset(): Dataset<TProps> {
    return this.#dataset;
  }

  get theme(): Theme {
    return this.#shell.theme;
  }

  set theme(value: Theme) {
    this.#shell.theme = value;
  }

  /** #330. Never `'auto'` — the answer `theme` resolved to, once an ancestor's own pin (#271) or
   *  the OS actually settles it one way or the other. Computed on every read, never cached (#375), so
   *  it is always correct synchronously, including right after an ancestor's own pin changed. Fires
   *  `themeChange` when this answer moves — synchronously for a `theme` write or an OS flip, one task
   *  later for an ancestor's pin (`GanttEventMap`'s own doc on `themeChange`). */
  get resolvedTheme(): ResolvedTheme {
    return this.#shell.resolvedTheme;
  }

  /** #394. The getter above is always correct. But re-parenting this Gantt's own container under a
   *  differently-pinned wrapper fires no `themeChange` — no `data-fg-theme` attribute changed for
   *  the library to notice. Call this right after such a move: it re-resolves now and fires
   *  `themeChange` if the answer moved, and returns that answer either way. */
  checkResolvedTheme(): ResolvedTheme {
    return this.#shell.checkResolvedTheme();
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

  /** Live (#435). `gantt.overscan = { verticalRows: 4 }`. See the option's own doc for what the
   *  buffer holds mounted. */
  get overscan(): Overscan {
    return this.#shell.overscan;
  }

  set overscan(o: Overscan) {
    this.#shell.overscan = o;
  }

  /** Live (#432). `false` locks the splitter and every column's resizer grip; see the option's own
   *  doc for what "locks" means. */
  get gridResizable(): boolean {
    return this.#shell.gridResizable;
  }

  set gridResizable(resizable: boolean) {
    this.#shell.gridResizable = resizable;
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

  /** Live (J1). `gantt.barLabels = 'outside'`. Where the default bar label paints — ignored once
   *  `barRenderer`'s own output takes over a bar's content. Default `'fitBar'`. */
  get barLabels(): BarLabels {
    return this.#shell.barLabels;
  }

  set barLabels(value: BarLabels) {
    this.#shell.barLabels = value;
  }

  /** Live (S5.4, D-S5-11). Assigning repaints every bar with no remount (I8). */
  get barRenderer(): BarRenderer | undefined {
    return this.#shell.barRenderer;
  }

  set barRenderer(renderer: BarRenderer | undefined) {
    this.#shell.barRenderer = renderer;
  }

  /** Live (ADR 0018). Assigning replaces this Gantt's own variant list. Every row resolves its
   *  variant again, and a row whose rule no longer answers falls back to whatever wins next. A
   *  plugin's own variants stand, and they still lose to these.
   *
   *  A variant list is a value, not a mutable object (#187): push onto the array you already
   *  assigned and nothing repaints. Assign a copy — `[...gantt.variants, myVariant]`. */
  get variants(): readonly EntryVariant<TProps>[] {
    return this.#shell.variants as readonly EntryVariant<TProps>[];
  }

  set variants(next: readonly EntryVariant<TProps>[]) {
    // ADR 0018: one cast at the façade. `GanttOptions<TProps>` types every rule an app author
    // writes; the registry inside `view/` holds the erased shape, the same way `api/dataset.ts`
    // re-types the whole store for `TProps`.
    this.#shell.variants = next as readonly EntryVariant[];
  }

  /** The whole variant this Gantt resolved for one row (ADR 0018, ADR 0022 §3) — one door, and it
   *  answers the object, never a name a caller looks up again (`itemsFor`/`paintFor` do not exist;
   *  `variantOf` retired for the same reason, review finding F3). Call:
   *  `gantt.variantFor(entry).name`, or read `.paint`/`.can`/`.css` off the same answer.
   *
   *  Not `entry.variant`. An Entry belongs to a `Dataset`; a variant resolves per Gantt. I2 lets two
   *  Gantts on one Dataset paint the same row differently, so `entry.variant` would have to pick one
   *  answer and be wrong on the other Gantt.
   *
   *  The parameter keeps `TProps`; the answer does not (F18) — `ResolvedVariant`'s own doc says why. */
  variantFor(entry: Entry<TProps>): ResolvedVariant {
    return this.#shell.variantFor(entry);
  }

  /** Live (S5.4, D-S5-11). Assigning repaints every cell with no remount (I8). */
  get gridCellRenderer(): GridCellRenderer | undefined {
    return this.#shell.gridCellRenderer;
  }

  set gridCellRenderer(renderer: GridCellRenderer | undefined) {
    this.#shell.gridCellRenderer = renderer;
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
   *  Reads back resolved (#248 S4-2): `filterPolicy` and `tree` (Entries sources) come back
   *  filled, never omitted — a reader never has to know `layout/`'s own defaults. The
   *  resolve runs here, cached against the setter's own authored object, so two reads with no write
   *  between them stay `===` and the setter keeps assigning the plain `RowSource` the shell already
   *  compares by identity (#187) — resolving inside that comparison would break it instead.
   *
   *  **To change one setting, spread the value you read back** (#254). The resolved source extends the
   *  source you authored, so it assigns straight back with one key replaced. Pass `undefined` to turn
   *  a setting off:
   *
   *  ```ts
   *  const current = gantt.rowSource;
   *  if (current.source === 'entries') {
   *    gantt.rowSource = { ...current, sort: { field: 'name' } };  // sort on, filter kept
   *    gantt.rowSource = { ...current, sort: undefined };          // sort off, filter kept
   *  }
   *  ```
   *
   *  The `source` check is not ceremony. This getter returns a union of all three row sources, and a
   *  `'custom'` source carries no `filter`, `sort`, `filterPolicy` or `tree` (D-S4-21) — it resolves
   *  its own rows, so it has nothing for those keys to act on. Narrowing tells the compiler which of
   *  the three you hold. Read `nestsRows(gantt.rowSource)` when the question is whether rows nest.
   *
   *  Hold no local copy of a setting this getter answers. `gantt.rowSource.sort !== undefined` is the
   *  one source of truth for "is a sort on", and a second copy beside it can disagree. The one thing
   *  this getter cannot answer is a value captured *inside* a `filter` closure — the closure comes
   *  back, the value it closed over does not.
   *
   *  Worked example and the toolbar use case: `docs/07-row-source-updates.md`. */
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

  /** Call: `gantt.filterRows((entry) => entry.read('team') === 'core')` — "filter rows by this
   *  predicate, keep every other row-source setting." The shorthand for the read-back-and-spread
   *  pattern `docs/07-row-source-updates.md` teaches: reads `gantt.rowSource` back, replaces its
   *  `filter` key, and assigns the result, so a sort or a `childrenAsSegments` rule set through a
   *  different control survives untouched.
   *
   *  ```ts
   *  gantt.filterRows((entry) => entry.read('team') === 'core'); // filter on
   *  gantt.filterRows(undefined);                                // filter off, sort kept
   *  ```
   *
   *  Throws `CustomRowSourceNotFilterableOrSortableError` when `gantt.rowSource.source === 'custom'`
   *  — that source resolves its own rows through `resolve` and carries no `filter` key to replace
   *  (D-S4-21). Filter inside `resolve` instead. */
  filterRows(filter: RowFilter | undefined): void {
    const current = this.rowSource;
    if (current.source === 'custom')
      throw new CustomRowSourceNotFilterableOrSortableError('gantt.filterRows');
    this.rowSource = { ...current, filter };
  }

  /** Call: `gantt.sortRows({ field: 'name' })` — the same read-back-and-spread shorthand
   *  `filterRows` above takes, for `sort`. `gantt.sortRows(undefined)` turns sorting off and keeps
   *  the current filter. Throws `CustomRowSourceNotFilterableOrSortableError` on a `'custom'` source,
   *  for the same reason `filterRows` does. */
  sortRows(sort: RowSort | undefined): void {
    const current = this.rowSource;
    if (current.source === 'custom') throw new CustomRowSourceNotFilterableOrSortableError('gantt.sortRows');
    this.rowSource = { ...current, sort };
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
   *  ingest (D-S1.12-8).
   *
   *  This is the whole scrollable **content** extent, never the window. Read `visibleSpan` for what
   *  is on screen right now (issue #461). */
  get range(): 'fitDataset' | TimeSpan {
    return this.#shell.range;
  }

  /** Loose input (S1.12, D-S1.12-8): a string, a `Date`, an epoch number or an `Instant` all work on
   *  `start`/`end`, read through the dataset's zone. */
  set range(r: 'fitDataset' | { start: InstantInput; end: InstantInput }) {
    this.#shell.range = this.#toRange(r);
  }

  /** The time span on screen right now (issue #461). `range` is the whole scrollable **content**
   *  extent instead. A pan, a zoom, a pane resize or a splitter drag moves this and leaves `range`
   *  alone.
   *
   *  Half-open, `end` exclusive, like every other stored span. Clamped to the content extent,
   *  because there is no time outside the content. Pixel-derived: an edge lands where the pane's
   *  own edge lands, mid-tick, never snapped.
   *
   *  This excludes the overscan buffer. `DecorationContext.span` includes it on purpose
   *  (`layout/decoration.ts`), so that one reads wider. The two are not interchangeable. */
  get visibleSpan(): TimeSpan {
    return this.#shell.visibleSpan;
  }

  /** How dense the time axis is — see `TimeScaleFit`. Default `'pane'` fits the measured pane
   *  width. Every mode floors at the showing preset's `minTickWidthPx`: a range wider than the
   *  floor allows scrolls instead of compressing further. To see more, set a coarser `preset` — the
   *  library never picks one for you (#477). */
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

  get dateLineLabelPlacement(): DateLineLabelPlacement {
    return this.#shell.dateLineLabelPlacement;
  }

  /** Live. See `GanttOptions.dateLineLabelPlacement`. */
  set dateLineLabelPlacement(placement: DateLineLabelPlacement) {
    this.#shell.dateLineLabelPlacement = placement;
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

  /** The Selection itself (ADR 0010, ADR 0025, #212, #421) — which Entries a click, the keyboard, or
   *  an assignment selected. The pane a click lands in picks the unit: the timeline selects the
   *  Entry the clicked bar draws, and the grid pane selects every Entry the row owns. Loose in,
   *  branded out — the same asymmetry `dataset.entries.get/update/remove` already ship. Live:
   *  assignment runs the same cancelable `beforeSelectionChange` → `selectionChange` sequence a
   *  click runs. */
  get selectedEntryIds(): readonly EntryId[] {
    return this.#shell.selection;
  }

  set selectedEntryIds(ids: readonly (EntryId | string)[]) {
    this.#shell.selection = ids;
  }

  /** The Selection as records — the bound dataset's `Entry` for each id in `selectedEntryIds`, in
   *  the same order. Re-reads the store on every access, so field edits show up without a selection
   *  change. An id that no longer exists in the store is skipped — for example after
   *  `dataset.entries.remove` left a stale id in the selection set. To change which entries are
   *  selected, assign `selectedEntryIds`; this getter is read-only. */
  get selectedEntries(): readonly Entry<TProps>[] {
    const entries: Entry<TProps>[] = [];
    for (const id of this.selectedEntryIds) {
      const entry = this.#dataset.entries.get(id);
      if (entry !== undefined) entries.push(entry);
    }
    return entries;
  }

  /** Live (S3, D-S3-9): re-resolves immediately, so a stricter rule hides a handle or refuses a
   *  gesture without waiting for the next pointer move. */
  get capabilities(): Capabilities {
    return this.#shell.capabilities;
  }

  set capabilities(next: Capabilities) {
    this.#shell.capabilities = next;
  }

  /** D-S5-35. Call: `gantt.setCapabilityRule('resize', false)`. It writes the rule for one gesture
   *  and leaves the rules for the others exactly as they are. `gantt.capabilities = { resize: false }`
   *  drops them instead. A gesture rule is a boolean, or a predicate the resolver runs per entry —
   *  `gantt.setCapabilityRule('move', (entry) => entry.kind !== 'milestone')`. The `edit` rule is
   *  the one that takes a cell (#256): `gantt.setCapabilityRule('edit', (entry, field) => (field ===
   *  'end' ? false : undefined))`, where `undefined` leaves that cell to the rules below. It re-resolves at
   *  once, so a stricter rule hides a handle without waiting for the next pointer move. */
  setCapabilityRule<K extends keyof Capabilities>(capability: K, rule: NonNullable<Capabilities[K]>): void {
    this.#shell.setCapabilityRule(capability, rule);
  }

  /** D-S5-35. Call: `gantt.clearCapabilityRule('resize')`. It takes this Gantt's own rule off one
   *  gesture, so a plugin's kind defaults and the library's per-kind table answer it again. This is
   *  not `setCapabilityRule('resize', true)`: `true` is a rule of its own, and it would also make a
   *  rolled-up parent and a milestone resizable. Clearing a gesture that carries no rule does
   *  nothing. */
  clearCapabilityRule(capability: keyof Capabilities): void {
    this.#shell.clearCapabilityRule(capability);
  }

  /** Live (S3.7, D-S3-14): the next wheel or key reads the new flags; no remount. */
  get viewportGestures(): ViewportGestures {
    return this.#shell.viewportGestures;
  }

  set viewportGestures(next: ViewportGestures) {
    this.#shell.viewportGestures = next;
  }

  /** Live (#434): the next click or double-click reads the new option. */
  get pointerActivation(): PointerActivation {
    return this.#shell.pointerActivation;
  }

  set pointerActivation(next: PointerActivation) {
    this.#shell.pointerActivation = next;
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
    this.#shell.zoomToSpan({
      start: toInstant(zone, span.start, 'gantt.zoomToSpan'),
      end: toInstant(zone, span.end, 'gantt.zoomToSpan'),
    });
  }

  /** Pans so `date` sits at `align` within the pane (S1.12, D-S1.12-8). Loose input: a string, a
   *  `Date`, an epoch number or an `Instant` all work, read through the dataset's zone. */
  panToDate(date: InstantInput, align: 'start' | 'center' = 'start'): void {
    this.#shell.panToInstant(toInstant(this.#dataset.timeZone, date, 'gantt.panToDate'), align);
  }

  /** Pans to `now()` (`time/` owns the clock read, I10), leaving `todayLineMarginTicks`' worth of
   *  margin to the left at `align: 'start'` (the default) so the today line reads as "near the
   *  start" rather than sitting flush on the pane's own edge. `align: 'center'` is unaffected:
   *  already centred, a margin has nothing to add. Off the dataset's own range, `panTo`'s clamp
   *  (D-S1.5-2) lands at whichever edge is closest instead of throwing. */
  panToToday(align: 'start' | 'center' = 'start'): void {
    this.#shell.panToToday(now(), align);
  }

  /** Brings into view what this id draws (#295). An `EntryId` reveals every bar or marker that
   *  Entry paints right now, as one rectangle. A row that paints nothing at the named dates reveals
   *  those dates instead. An id the Dataset reads as neither throws `RevealTargetNotFoundError`
   *  (ADR 0010, #227). A plain `string` is legal. The Dataset resolves the reading; nothing reads
   *  the brand. */
  reveal(id: EntryId | string): void {
    this.#shell.reveal(id);
  }

  /** Live (S5.1, D-S5-1, D-S5-3, #404). See `GanttOptions.plugins`. Assigning diffs by `id`: a new
   *  `id` sets up, a missing one disposes, and a fresh object under an installed `id` replaces that
   *  occupant — so `gantt.plugins = [timeShading(next)]` applies the new rules. Handing back the
   *  same object (`[...gantt.plugins, extra]`) runs nothing again.
   *
   *  This Gantt's own chrome plugins, and
   *  only those: a plugin installed on the Dataset stays off this list, because this Gantt cannot
   *  drop it (ADR 0019). */
  get plugins(): readonly ChromePlugin<TProps>[] {
    return this.#shell.plugins as readonly ChromePlugin<TProps>[];
  }

  set plugins(next: readonly ChromePlugin<TProps>[]) {
    this.#shell.plugins = assertChromeOnly(next);
  }

  /** D-S5-36. Call: `gantt.installPlugin(tooltips())`. It installs one plugin and leaves every
   *  plugin already running alone, so a caller never restates the installed set to add to it. A
   *  plugin whose `id` is already installed throws `DuplicatePluginIdError`: this verb adds, and
   *  says so when there is nothing to add. To *change* an installed plugin's options, assign the
   *  list — `gantt.plugins = [timeShading(next)]` replaces the occupant of that `id` (#404). */
  installPlugin(plugin: ChromePlugin<TProps>): void {
    this.#shell.installPlugin(assertChromeOnly([plugin])[0]!);
  }

  /** D-S5-36. Call: `gantt.hasPlugin('harness.logging')`. It answers whether that plugin is
   *  installed right now — what a toggle reads before it decides which verb to call. Identity is the
   *  `id`, so an object with an installed plugin's `id` answers `true`. */
  hasPlugin(plugin: ChromePlugin<TProps> | PluginId): boolean {
    const id = typeof plugin === 'string' ? plugin : plugin.id;
    return this.#shell.plugins.some((installed) => installed.id === id);
  }

  /** D-S5-36. Call: `gantt.uninstallPlugin(popup)`, or `gantt.uninstallPlugin('harness.logging')`.
   *  It disposes that one plugin and leaves the rest running. Identity is the `id` in both forms,
   *  the same identity the assignment form diffs by (D-S5-3). A plugin nothing installs throws
   *  `PluginNotInstalledError`, so a misspelled id is not a silent no-op. */
  uninstallPlugin(plugin: ChromePlugin<TProps> | PluginId): void {
    this.#shell.uninstallPlugin(typeof plugin === 'string' ? plugin : plugin.id);
  }

  /** S5.2, D-S5-6: the one command registry. `freegantt.*` is the core namespace — core registers
   *  its own commands (collapse/expand, zoom, pan, selection, undo/redo, and keyboard navigation)
   *  before any plugin, so a plugin's own registration always wins for a shared id (D-S5-7).
   *  `run(id)` silently no-ops when the command's `when` declines, the same posture as a disabled
   *  menu item. Read-only — `register` lives on the registry itself. */
  get commands(): CommandRegistry<TProps> {
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
