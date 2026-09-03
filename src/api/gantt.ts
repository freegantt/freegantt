// api/ is the only layer a consumer imports (plans/01 §1). No module-level singletons (I2) — every
// instance owns its own shell and state so two Gantt instances on one page are fully independent.

import { GanttShell } from '../view/index.js';
import type {
  GanttEventHandler,
  GanttEventMap,
  Interactions,
  Theme,
  ViewportGestures,
} from '../view/index.js';
import { ScrollModel, TimeScaleModel } from '../layout/index.js';
import type { PresetRef, TimeScaleFit, ViewPreset, RowSource } from '../layout/index.js';
import type { DateLineSpec } from '../layout/index.js';
import type {
  Entry,
  EntryEdits,
  EntryId,
  GridColumnInput,
  Instant,
  InstantInput,
  RowId,
  TimeSpan,
} from '../model/index.js';
import { attemptMutation } from './attempt-mutation.js';
import { now, toInstant } from '../time/index.js';
import type { Dataset } from './dataset.js';
import type { GanttPluginOf, PluginContextOf } from './plugin.js';
import type {
  CommandOf,
  CommandContextOf,
  CommandRegistryOf,
  KeyBindingOf,
  CommandTarget,
} from './command.js';
// api/ is the composition root that reaches interaction/ in (plans/01 §1: `API --> INT`,
// `plans/s3-direct-manipulation/README.md` §0) — `view/` cannot, so `GanttShell` takes this by
// constructor injection rather than importing it itself (see `AttachEntryGestures` in gantt-shell.ts).
import { attachEntryGestures, attachKeyboardEditing } from '../interaction/index.js';

/** Public, loose. What `GanttOptions.dateLines` and `Gantt.dateLines` both take (S1.13, D-S1.13-2). */
export interface DateLineInput {
  placeAt: InstantInput;
  label?: string;
  className?: string;
}

export interface GanttOptionsBase {
  /** Element or CSS selector (plans/02 §2) — resolved by GanttShell; a selector matching nothing
   * throws (#38). */
  container: HTMLElement | string;
  dataset: Dataset;
  /** Bound scroll object (D9) — pass the same instance to two Gantt instances to scroll-sync them.
   * Independent of `scale`/`preset`/`range`/`fit`: a Gantt may share its scroll position, its axis,
   * both, or neither. */
  scroll?: ScrollModel;
  /** Initial grid pane width in px (S1.8). Default: `--fg-grid-pane-width`, fallback 160. */
  gridWidth?: number;
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
  /** Live (S3, D-S3-10). Entry ids, loose on the way in; assignment runs the same cancelable
   *  sequence a click runs. Default `[]`. */
  selection?: readonly (EntryId | string)[];
  /** Live (S3, D-S3-9). Per-gesture, boolean or per-entry predicate, over the per-kind default
   *  table. Default `{}`: every gesture resolves off the default table alone. */
  interactions?: Interactions;
  /** Live (S3.7, D-S3-14). Wheel zoom, shift+wheel pan, and keyboard pan. Default `{}`: every
   *  viewport gesture is on. `false` turns them all off. Does not gate `zoomBy` / `panToDate`. */
  viewportGestures?: ViewportGestures;
  /** Live (S4.3, D-S4-12). Field keys in display order, plus per-Gantt overrides. Default `['name']`. */
  gridColumns?: readonly GridColumnInput[];
  /** Live (S4.6, D-S4-21). Default `{ source: 'entries', tree: false }`. */
  rowSource?: RowSource;
  /** Live (S4.6, D-S4-22). Collapsed row ids, loose on the way in. Default `[]`. */
  collapsed?: readonly (RowId | string)[];
  /** Live (S5.1, D-S5-1, D-S5-3). Values a consumer imports (`tooltips()`, `contextMenu({...})`),
   *  never names in a table. Assignment diffs by `id`: a plugin present before and after is left
   *  alone, even when the new array holds a fresh object for that `id` — same id, new object is
   *  ignored (a dev build warns; production stays silent). Reconfigure with two assignments
   *  (remove, then add) or a distinct id. Default `[]`. */
  plugins?: readonly GanttPlugin[];
}

/** Two ways to set the axis, made mutually exclusive at the type level (issue #84 — the prior shape
 * accepted both and silently ignored `preset`/`range`/`fit` in favor of `scale`, with a dev-mode-only
 * warning). Sharing an axis and building a private one from `preset`/`range`/`fit` are not two knobs
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

export type GanttOptions = GanttOptionsBase & GanttScaleOptions;

/** S5.1, D-S5-1: `GanttPlugin`/`PluginContext` bound to this class — see `api/plugin.ts`'s file
 *  header for why the generic form lives there and the binding happens here. This is the type a
 *  plugin author actually sees: `api/index.ts` re-exports these bound names alongside the generic
 *  `GanttPluginOf`/`PluginContextOf` shapes. */
export type GanttPlugin = GanttPluginOf<Gantt>;
export type PluginContext = PluginContextOf<Gantt>;

/** S5.2, D-S5-6: `Command`/`CommandContext`/`CommandRegistry`/`KeyBinding` bound to this class — see
 *  `api/command.ts`'s file header for why the generic form lives there and the binding happens here.
 *  This is the shape a plugin author, or a `gantt.commands`/`gantt.commands.run(id)` caller, actually
 *  sees; `api/index.ts` re-exports these bound names alongside the generic `*Of` shapes. */
export type Command = CommandOf<Gantt>;
export type CommandContext = CommandContextOf<Gantt>;
export type CommandRegistry = CommandRegistryOf<Gantt>;
export type KeyBinding = KeyBindingOf<Gantt>;
export type { CommandTarget };

function pickDefined<T extends object, K extends keyof T>(
  options: T,
  keys: readonly K[],
): Partial<Pick<T, K>> {
  const picked: Partial<Pick<T, K>> = {};
  for (const key of keys) {
    const value = options[key];
    if (value !== undefined) picked[key] = value;
  }
  return picked;
}

export class Gantt {
  #shell: GanttShell;
  #dataset: Dataset;
  #destroyed = false;

  constructor(options: GanttOptions) {
    this.#dataset = options.dataset;
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
        'viewportGestures',
        'gridColumns',
        'rowSource',
        'collapsed',
      ]),
      ...(options.scale ? { scale: options.scale } : {}),
      ...(options.range !== undefined ? { range: this.#toRange(options.range) } : {}),
      ...(options.todayLine !== undefined ? { todayLine: this.#toTodayLine(options.todayLine) } : {}),
      ...(options.dateLines !== undefined ? { dateLines: this.#toDateLines(options.dateLines) } : {}),
      entryGestures: attachEntryGestures,
      keyboardEditing: attachKeyboardEditing,
      // S3.3, D-S3-16: `GanttShell`'s own `dataset` option is `model/`'s narrow `Dataset` interface
      // ("a view never opens a transaction") — this class holds the full `api/Dataset`, so a
      // committed gesture draft reaches the store through here, not through the shell itself.
      commitEntryEdits: (edits: EntryEdits) =>
        attemptMutation(() => {
          options.dataset.transaction(() => {
            for (const [id, edit] of edits) options.dataset.entries.update(id, edit);
          });
        }),
      // S5.1, D-S5-1: the only place `dataset` (full `api/Dataset`) and `gantt` (`this`) can be
      // bound into a `PluginContext` — see `api/plugin.ts`'s file header. `this` is captured, not
      // read, here: by the time a plugin's `setup()` actually runs, `#shell` below is assigned (see
      // the `plugins` live-property assignment after this call), the same ordering `zoomPresets`/
      // `selection` already rely on.
      buildPluginContext: (parts): PluginContext => ({
        dataset: options.dataset,
        gantt: this,
        events: parts.events,
        disposables: parts.disposables,
        commands: parts.commands,
        interaction: { registerKeybinding: parts.registerKeybinding },
        view: { overlay: parts.overlay },
      }),
      buildCommandContext: (parts): CommandContext => ({
        dataset: options.dataset,
        gantt: this,
        ...parts,
      }),
      now,
    });
    if (options.zoomPresets !== undefined) this.#shell.zoomPresets = options.zoomPresets;
    if (options.selection !== undefined) this.#shell.selection = options.selection;
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
  #toDateLines(lines: readonly DateLineInput[]): readonly DateLineSpec[] {
    const zone = this.#dataset.timeZone;
    return lines.map((line) => {
      const spec: DateLineSpec = { placeAt: toInstant(zone, line.placeAt) };
      if (line.label !== undefined) spec.label = line.label;
      if (line.className !== undefined) spec.className = line.className;
      return spec;
    });
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

  set gridWidth(px: number) {
    this.#shell.gridWidth = px;
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

  /** Live (S4.6, D-S4-21). Assigning re-resolves rows with no remount. */
  get rowSource(): RowSource {
    return this.#shell.rowSource;
  }

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

  /** Getter returns what was resolved (S1.13, D-S1.13-4) — legal against `boolean | InstantInput`
   *  since `Instant` is one of `InstantInput`'s member types, `range`'s own precedent. */
  get todayLine(): boolean | InstantInput {
    return this.#shell.todayLine;
  }

  /** Live (S1.12/S1.13, D-S1.12-14, D-S1.13-4). `true`/`false` pass straight through; any other
   *  `InstantInput` is read once through the dataset's zone and pins the line with no clock read. */
  set todayLine(on: boolean | InstantInput) {
    this.#shell.todayLine = this.#toTodayLine(on);
  }

  /** Getter returns what was resolved, same precedent as `todayLine`/`range` above. */
  get dateLines(): readonly DateLineInput[] {
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

  /** Loose in, branded out — the same asymmetry `dataset.entries.get/update/remove` already ship
   *  (D-S3-10). Live: assignment runs the same cancelable `beforeSelectionChange` → `selectionChange`
   *  sequence a click runs. */
  get selection(): readonly EntryId[] {
    return this.#shell.selection;
  }

  set selection(ids: readonly (EntryId | string)[]) {
    this.#shell.selection = ids;
  }

  /** The bound dataset's `Entry` records for each id in `selection`, in the same order.
   *  Re-reads the store on every access, so field edits show up without a selection change. An id
   *  in `selection` that no longer exists in the store is skipped — for example after
   *  `dataset.entries.remove` left a stale id in the selection set. To change which entries are
   *  selected, assign `selection`; this getter is read-only. See README — `selection` vs
   *  `selectionEntries`. */
  get selectionEntries(): readonly Entry[] {
    const entries: Entry[] = [];
    for (const id of this.#shell.selection) {
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

  reveal(entryId: EntryId): void {
    this.#shell.reveal(entryId);
  }

  /** Live (S5.1, D-S5-1, D-S5-3). See `GanttOptions.plugins`. */
  get plugins(): readonly GanttPlugin[] {
    return this.#shell.plugins;
  }

  set plugins(next: readonly GanttPlugin[]) {
    this.#shell.plugins = next;
  }

  /** S5.2, D-S5-6: the one command registry. `freegantt.*` is the core namespace — core registers
   *  its own commands (collapse/expand, zoom, pan, selection, undo/redo, and keyboard navigation)
   *  before any plugin, so a plugin's own registration always wins for a shared id (D-S5-7).
   *  `run(id)` silently no-ops when the command's `when` declines, the same posture as a disabled
   *  menu item. Read-only — `register` lives on the registry itself. */
  get commands(): CommandRegistry {
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
