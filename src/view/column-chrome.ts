// view/ — grid-column chrome: resolving `gridColumns` against the dataset's declared Fields, the
// live resize/reorder preview paint, and the one commit sequence a pointer drag, a reorder drop, and
// a plain `gantt.gridColumns = […]` assignment all share (S5.7, D-S5-18). Split out of `GanttShell`
// so column-chrome behaviour is reviewable and testable on its own — `GanttShell` is the only caller,
// closing over its own private state through `ColumnChromePorts` the same way `core-commands.ts`
// closes over `CoreCommandPorts` (D-S5-6's precedent) and `interaction/column-gestures.ts` closes
// over `ColumnGestureContext` (this file's own `column-gesture-context.ts` sibling).

import type { Dataset, Disposer, FieldKey, GridColumn, GridColumnInput, PluginId } from '../model/index.js';
import { UnknownGridColumnError } from '../model/index.js';
import type { ResolvedColumn } from '../layout/index.js';
import { createRegistrationTable } from '../layout/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { cssEscapeAttr } from '../render/dom/css-escape.js';
import type { ColumnReorderPreview } from './column-gesture-context.js';
import { DEFAULT_COLUMN_WIDTH_PX, isHidden, resolveGanttFields, toGridColumn } from './grid-columns.js';
import type { ResolveColumnsBind } from './grid-columns.js';

const MIN_COLUMN_WIDTH_PROPERTY = '--fg-column-min-width';
const DEFAULT_MIN_COLUMN_WIDTH = 40;
const MIN_COLUMN_WIDTH_POLICY = { fallback: DEFAULT_MIN_COLUMN_WIDTH, accepts: 'positive' } as const;
const COLUMN_WIDTH_PROPERTY = '--fg-column-width';
const COLUMN_WIDTH_POLICY = { fallback: DEFAULT_COLUMN_WIDTH_PX, accepts: 'positive' } as const;
/** One `Shift+Arrow` step (D-S5-18's keyboard parity) and the on-screen width read back when a flex
 *  column (no explicit `width`) has never been resized. */
const COLUMN_RESIZE_STEP_PX = 16;
const DEFAULT_COLUMN_WIDTH_FALLBACK_PX = 120;

/** What `ColumnChrome` calls back into `GanttShell` for — the shared machinery every other
 *  cancelable Gantt-state change already goes through (`#proposeChange`, `#interactionState`,
 *  `#frames`), so this module never owns any of it directly. */
export interface ColumnChromePorts {
  /** `dataset.field`/`dataset.fields`/`dataset.timeZone` — as much of `Dataset` as resolving columns
   *  needs, re-read on every resolve/commit rather than cached (D-S4-12: always the live dataset). */
  dataset(): Pick<Dataset, 'field' | 'fields' | 'timeZone'>;
  columnBind(): ResolveColumnsBind;
  /** Live paint only, no event, no commit — mirrors `SplitterContext.previewGridWidth`.
   *  `undefined` clears the preview. */
  paintColumnResizePreview(preview: { columnKey: string; widthPx: number } | undefined): void;
  /** Live paint only: the grabbed header cell's follow transform plus the drop indicator, which move
   *  together. `undefined` parks both. */
  paintColumnReorderPreview(
    preview: { columnKey: string; offsetPx: number; beforeColumnKey: string | null } | undefined,
  ): void;
  /** Queues a real frame — the only way a live paint's DOM override (`data-fixed`, inline width)
   *  gets undone by the real geometry a `render()` computes (D-S5-18: "a veto restores the state the
   *  drag started from"). */
  requestFrame(): void;
  /** Recomputes whatever else a `gridColumns` change feeds besides `ColumnChrome`'s own
   *  `resolvedColumns` — `GanttShell#bindColumns()`'s `fieldCompares`/`fieldContext`. */
  rebindFields(): void;
  /** Runs the one `beforeGridColumnsChange` → apply → `gridColumnsChange` sequence
   *  `GanttShell#proposeChange` already owns for every other cancelable Gantt-state change. */
  proposeColumnsChange(from: readonly GridColumn[], to: readonly GridColumn[], apply: () => void): boolean;
}

/** One `registerPluginColumn` call, wrapped so the disposer can point at its own registration.
 *  Two plugins may pass the same `GridColumnInput` for one field — a shared `const`, or the bare
 *  string `'risk'` twice. A fresh cell per call keeps those two registrations distinct, the same
 *  way `createRegistrationTable` keeps its own per-registration cells (#154). */
interface PluginColumnRegistration {
  readonly column: GridColumnInput;
  readonly pluginId: PluginId;
}

/** One committed column and who declared it (D-S5-33, #162/#181). `declaredBy` absent means the
 *  consumer wrote it — in `gridColumns`, or in the options this Gantt was constructed with. Present
 *  names the plugin that registered it, which is what keeps a resized or reordered plugin column out
 *  of `gantt.gridColumns`, out of the `gridColumnsChange` payload, and out of what the consumer
 *  saves. Provenance travels with the declaration for the same reason a `PluginStore`'s rows sit
 *  under their owner's id (D-S5-24): the library must be able to tell the two apart later. */
interface ColumnDeclaration {
  readonly column: GridColumnInput;
  readonly declaredBy?: PluginId;
}

/** One instance per Gantt (I2), owned by `GanttShell` alongside its other view state — never shared,
 *  never a module-level singleton. */
export class ColumnChrome {
  readonly #container: HTMLElement;
  readonly #ports: ColumnChromePorts;
  /** Every committed column, in paint order, each carrying its declarer (D-S5-33). A commit rewrites
   *  this whole list — a plugin column included, so a resize or a reorder of one sticks for the rest
   *  of the session — and `authoredColumns` reads the consumer's half back out of it. */
  #declaredColumns: readonly ColumnDeclaration[];
  /** S5.9, D-S5-21: `ctx.view.registerGridColumn` — one column per field (#147, #154), appended
   *  after the consumer's own columns by `effectiveInput()`, in registration order. A duplicate field
   *  the consumer's own list already names is dropped, the same "config beats a plugin" posture
   *  `barRenderer`/`cellRenderer` already take. Two plugins registering the same field stack on one
   *  key: the newest registration wins, and disposing one never disturbs the other's. */
  #pluginColumns = createRegistrationTable<FieldKey, PluginColumnRegistration>();
  /** The resolved columns in paint order, and the same columns keyed for lookup. `#adoptColumns`
   *  writes both, and it is the only writer — one assignment can never leave the map stale. */
  #resolvedColumns: readonly ResolvedColumn[] = [];
  #columnByKey: ReadonlyMap<string, ResolvedColumn> = new Map();
  #focusedHeaderField: FieldKey | undefined;

  constructor(container: HTMLElement, ports: ColumnChromePorts, initialInput: readonly GridColumnInput[]) {
    this.#container = container;
    this.#ports = ports;
    this.#declaredColumns = initialInput.map((column) => ({ column }));
  }

  /** What `gantt.gridColumns` answers: the columns the consumer authored, and only those — before
   *  and after a resize, a reorder or any other commit (D-S5-33, #181). A plugin's column is the
   *  plugin's declaration, so it never appears here and never reaches what the consumer saves. */
  get authoredColumns(): readonly GridColumnInput[] {
    return this.#declaredColumns.filter(ColumnChrome.#isAuthored).map((declaration) => declaration.column);
  }

  /** D-S5-34: which of the consumer's own columns are hidden right now, by field key. The consumer's
   *  declarations only, the same rule `authoredColumns` above follows (D-S5-33). A plugin's column
   *  the consumer hid stays hidden, and stays the plugin's. So it is absent here, for the reason a
   *  resize of one reports no change in a `gridColumnsChange` payload. */
  get hiddenColumns(): readonly FieldKey[] {
    return this.#declaredColumns
      .filter((declaration) => ColumnChrome.#isAuthored(declaration) && isHidden(declaration.column))
      .map(ColumnChrome.#fieldOfDeclaration);
  }

  /** S5.9, D-S5-21: every committed column, plus every plugin-registered column whose `field` no
   *  committed column already names, in registration order — what actually resolves and renders.
   *  A duplicate `field` is dropped from the plugin side: config beats a plugin. `#pluginColumns`
   *  already holds one column per field (#154) — the newest registration on a field wins, at that
   *  field's first-registration position — so no dedupe happens here. */
  effectiveInput(): readonly GridColumnInput[] {
    return this.#effectiveDeclarations().map((declaration) => declaration.column);
  }

  /** The same list `effectiveInput()` returns, each column still carrying its declarer — what a
   *  resize and a reorder rewrite, so provenance survives the commit that follows. */
  #effectiveDeclarations(): readonly ColumnDeclaration[] {
    const committedKeys = new Set(this.#declaredColumns.map(ColumnChrome.#fieldOfDeclaration));
    const extras = this.#pluginColumns
      .active()
      .filter((registration) => !committedKeys.has(ColumnChrome.#fieldOf(registration.column)))
      .map((registration) => ({ column: registration.column, declaredBy: registration.pluginId }));
    return [...this.#declaredColumns, ...extras];
  }

  /** S5.9, D-S5-21: `ctx.view.registerGridColumn`. Legal only while `setup` runs (D-S5-4), the same
   *  gate every other `register*` takes — enforced by the caller (`GanttShell`), not here. Returns a
   *  `Disposer` that removes it again, same lifetime a decoration provider gets. */
  registerPluginColumn(column: GridColumnInput, pluginId: PluginId): Disposer {
    const field = ColumnChrome.#fieldOf(column);
    const registration: PluginColumnRegistration = { column, pluginId };
    const remove = this.#pluginColumns.register(field, registration);
    this.#ports.rebindFields();
    this.#ports.requestFrame();
    return () => {
      // A commit writes the whole of `#effectiveDeclarations()` back (D-S5-18: one commit sequence,
      // one write). Plugin columns go in too, so that a resize or a reorder of one sticks. So
      // disposal must also strip the committed copy, by field key: a resize rewrites the column
      // object, so identity no longer matches once committed. One question decides it: does any live
      // registration still ask for this field? While one does, the field stays on screen, so the
      // committed column — and the width the user gave it — stays too, whether the plugin leaving was
      // the winner or a loser (#155). Only the last registration on a field takes the column out.
      // A column the *consumer* authored for the same field is never touched: it is not this
      // plugin's to remove (D-S5-33).
      remove();
      const fieldIsAbandoned = this.#pluginColumns.get(field) === undefined;
      if (fieldIsAbandoned) {
        this.#declaredColumns = this.#declaredColumns.filter(
          (declaration) =>
            ColumnChrome.#isAuthored(declaration) || ColumnChrome.#fieldOfDeclaration(declaration) !== field,
        );
      }
      this.#ports.rebindFields();
      this.#ports.requestFrame();
    };
  }

  get resolvedColumns(): readonly ResolvedColumn[] {
    return this.#resolvedColumns;
  }

  get focusedHeaderField(): FieldKey | undefined {
    return this.#focusedHeaderField;
  }

  setFocusedColumn(columnKey: FieldKey | undefined): void {
    this.#focusedHeaderField = columnKey;
  }

  /** `GanttShell#bindColumns()` resolves `effectiveInput()` against the dataset itself — one
   *  `resolveGanttFields` call already covers its own `fieldCompares`/`fieldContext` too, so this
   *  module does not repeat that resolution; it just adopts the result. */
  setResolvedColumns(columns: readonly ResolvedColumn[]): void {
    this.#adoptColumns(columns);
  }

  /** A frame asks for a column once per painted cell and once per painted header, so the lookup is
   *  a map read, not a scan. Without it the render pass costs O(rows x columns x columns). */
  resolvedColumn(columnKey: FieldKey): ResolvedColumn | undefined {
    return this.#columnByKey.get(String(columnKey));
  }

  #adoptColumns(columns: readonly ResolvedColumn[]): void {
    this.#resolvedColumns = columns;
    this.#columnByKey = new Map(columns.map((column) => [String(column.field), column]));
  }

  /** `false` for a key `gridColumns` no longer resolves (B3: a stale `#focusedHeaderField` from
   *  before a `gridColumns` change must not still enable a resize chord); `resizable` unset on a
   *  resolved column still defaults `true` (D-S5-18). */
  isResizable(columnKey: FieldKey): boolean {
    const column = this.resolvedColumn(columnKey);
    return column === undefined ? false : (column.resizable ?? true);
  }

  isMovable(columnKey: FieldKey): boolean {
    const column = this.resolvedColumn(columnKey);
    return column === undefined ? false : (column.movable ?? true);
  }

  /** S5.7, D-S5-18: the same floor pattern `GanttShell#aboveMinGridWidth` applies to the splitter
   *  (#127), read live off the container so a stylesheet change takes effect on the very next drag. */
  minWidthPx(): number {
    return readPixelProperty(this.#container, MIN_COLUMN_WIDTH_PROPERTY, MIN_COLUMN_WIDTH_POLICY);
  }

  /** #139: the width a column takes when neither this Gantt's own column nor its Field names one —
   *  `--fg-column-width`, fallback 120, the same level-1 knob `--fg-column-min-width` above is.
   *  Read on every rebind (a `gridColumns` write, a plugin column registering), never per render:
   *  a theme change reaches the next resolve, and `getComputedStyle` stays off the frame path. */
  defaultWidthPx(): number {
    return readPixelProperty(this.#container, COLUMN_WIDTH_PROPERTY, COLUMN_WIDTH_POLICY);
  }

  /** A resolved column's own `width` when it has one (a column already resized, or authored fixed);
   *  otherwise the flex column's actual on-screen width, so the first keyboard resize starts from what
   *  the consumer currently sees rather than jumping to an arbitrary number. `getComputedStyle`, not
   *  `getBoundingClientRect` (`no-flow-layout-rows`, I9 — scoped to `src/view/**`, this file included):
   *  the header cell's own `box-sizing: border-box` width, not a row-height measurement.
   *  `DEFAULT_COLUMN_WIDTH_FALLBACK_PX` only covers a header cell not yet mounted (a test with no
   *  render pass). */
  currentWidthPx(columnKey: FieldKey): number {
    const column = this.resolvedColumn(columnKey);
    if (column?.width !== undefined) return column.width;
    const escaped = cssEscapeAttr(String(columnKey));
    const cell = this.#container.querySelector<HTMLElement>(`.fg-col-header[data-field="${escaped}"]`);
    if (cell === null) return DEFAULT_COLUMN_WIDTH_FALLBACK_PX;
    const px = parseFloat(getComputedStyle(cell).width);
    return Number.isFinite(px) ? px : DEFAULT_COLUMN_WIDTH_FALLBACK_PX;
  }

  /** Live paint only (S5.7, D-S5-18) — mirrors `previewGridWidth`'s posture (`SplitterContext`): no
   *  event, no commit, painted straight through `InteractionState` the same way a bar drag preview is. */
  previewWidth(columnKey: FieldKey, widthPx: number): void {
    this.#ports.paintColumnResizePreview({ columnKey: String(columnKey), widthPx });
  }

  /** Escape / a vetoed commit (D-S5-18): clears the live resize paint and queues a real frame, whose
   *  `render()` repaints the column from its actual resolved geometry — flex or fixed, whichever it
   *  was before the drag — the same restoration a landed commit already gets for free by queuing a
   *  frame of its own. */
  cancelResize(): void {
    this.#ports.paintColumnResizePreview(undefined);
    this.#ports.requestFrame();
  }

  /** Live paint only (S5.7, D-S5-18), the reorder twin of `previewWidth`: the grabbed header cell
   *  rides `offsetPx` and the drop indicator marks the target edge. */
  previewReorder(preview: ColumnReorderPreview): void {
    this.#ports.paintColumnReorderPreview({
      columnKey: String(preview.columnKey),
      offsetPx: preview.offsetPx,
      beforeColumnKey: preview.beforeColumnKey === null ? null : String(preview.beforeColumnKey),
    });
  }

  /** Escape / a vetoed commit (D-S5-18): parks the grabbed cell and clears the drop indicator. A
   *  reorder has no continuously-drawn geometry to restore the way a resize's width has — the paint
   *  only ever adds one transform and one attribute, and `undefined` removes both — so no
   *  `requestFrame()` is needed here. */
  cancelReorder(): void {
    this.#ports.paintColumnReorderPreview(undefined);
  }

  static #fieldOf(item: GridColumnInput): FieldKey {
    return typeof item === 'string' ? item : item.field;
  }

  static #fieldOfDeclaration(declaration: ColumnDeclaration): FieldKey {
    return ColumnChrome.#fieldOf(declaration.column);
  }

  static #isAuthored(declaration: ColumnDeclaration): boolean {
    return declaration.declaredBy === undefined;
  }

  /** The object form of one column, so a resize can write a `width` onto it. Only the column the
   *  gesture actually touched is widened: a bare `'name'` the consumer wrote stays a bare `'name'`
   *  in `gridColumns` unless the user resized that very column. */
  static #asGridColumn(item: GridColumnInput): GridColumn {
    return typeof item === 'string' ? { field: item } : { ...item };
  }

  /** A resize replaces `flex` with `width` (#249): a Grid column names one or the other, never both,
   *  so a flex column the user drags becomes fixed at the size the drag left it. `flex` is dropped on
   *  purpose here, not merged — a spread that kept it alongside the new `width` stops compiling under
   *  the exclusive sizing pair (a probe confirmed this), which is what catches a slip back to both. */
  static #resizedTo(item: GridColumnInput, widthPx: number): GridColumn {
    const { flex: _flex, ...withoutFlex } = ColumnChrome.#asGridColumn(item);
    return { ...withoutFlex, width: widthPx };
  }

  /** A resize/reorder gesture reaches every column actually on screen (S5.9: a plugin-registered
   *  column included), not only the consumer's own list. */
  #withWidth(columnKey: FieldKey, widthPx: number): readonly ColumnDeclaration[] {
    return this.#effectiveDeclarations().map((declaration) =>
      ColumnChrome.#fieldOfDeclaration(declaration) === columnKey
        ? { ...declaration, column: ColumnChrome.#resizedTo(declaration.column, widthPx) }
        : declaration,
    );
  }

  /** A reorder moves declarations, and rewrites none of them: the columns keep whatever form the
   *  consumer or the plugin gave them, and their declarers travel with them. */
  #reordered(columnKey: FieldKey, beforeColumnKey: FieldKey | null): readonly ColumnDeclaration[] {
    const declarations = [...this.#effectiveDeclarations()];
    const from = declarations.findIndex((d) => ColumnChrome.#fieldOfDeclaration(d) === columnKey);
    if (from === -1) return declarations;
    const [moved] = declarations.splice(from, 1);
    const to =
      beforeColumnKey === null
        ? declarations.length
        : declarations.findIndex((d) => ColumnChrome.#fieldOfDeclaration(d) === beforeColumnKey);
    declarations.splice(to === -1 ? declarations.length : to, 0, moved!);
    return declarations;
  }

  /** D-S5-34. Hiding rewrites one declaration and moves none of them. So the column keeps its width
   *  and its place in the order while it is off the screen. Showing removes the key again, rather
   *  than writing `hidden: false`. A column the consumer wrote as a bare `'name'` therefore reads
   *  back as a bare `'name'`. A resize takes the same care to rewrite only what it touched (#181). */
  static #withHiddenFlag(column: GridColumnInput, hidden: boolean): GridColumnInput {
    if (typeof column === 'string') return hidden ? { field: column, hidden: true } : column;
    if (hidden) return { ...column, hidden: true };
    const { hidden: _wasHidden, ...shown } = column;
    return shown;
  }

  /** A field no declaration carries is a mistake, not a silent no-op. Neither verb adds a column, so
   *  neither one has anything to act on. A hidden column stays declared, which is what lets a show
   *  always reach what a hide hid. */
  #withHidden(columnKey: FieldKey, hidden: boolean): readonly ColumnDeclaration[] {
    const declarations = this.#effectiveDeclarations();
    const names = (declaration: ColumnDeclaration): boolean =>
      ColumnChrome.#fieldOfDeclaration(declaration) === columnKey;
    if (!declarations.some(names)) throw new UnknownGridColumnError(String(columnKey));
    return declarations.map((declaration) =>
      names(declaration)
        ? { ...declaration, column: ColumnChrome.#withHiddenFlag(declaration.column, hidden) }
        : declaration,
    );
  }

  /** A plain `gantt.gridColumns = […]` assignment restates the consumer's whole authored list, so
   *  every column in it is the consumer's. Plugin columns keep whatever shape a commit already gave
   *  them and follow the authored list — the same place `effectiveInput()` puts one that has never
   *  been committed (D-S5-21: appended after the consumer's own). */
  #authoredThenPluginColumns(input: readonly GridColumnInput[]): readonly ColumnDeclaration[] {
    const assigned = new Set(input.map(ColumnChrome.#fieldOf));
    const pluginColumns = this.#declaredColumns.filter(
      (declaration) =>
        !ColumnChrome.#isAuthored(declaration) &&
        !assigned.has(ColumnChrome.#fieldOfDeclaration(declaration)),
    );
    return [...input.map((column) => ({ column })), ...pluginColumns];
  }

  /** The `from`/`to` a `gridColumnsChange` handler reads: the columns the consumer authored, and
   *  only those (D-S5-33), each paired with what it resolved to. A hidden column resolves to nothing
   *  (D-S5-34), so it reports its declaration instead. That declaration already carries
   *  `hidden: true`, and whatever width a resize wrote onto it. This keeps the documented save
   *  round-trip whole. A consumer who stores `to` and assigns it back gets the hidden column back,
   *  still hidden and still in its place. Dropping it here would turn "hidden" into "gone". */
  static #authoredPayload(
    declarations: readonly ColumnDeclaration[],
    resolved: readonly ResolvedColumn[],
  ): readonly GridColumn[] {
    const resolvedByKey = new Map(resolved.map((column) => [column.field, column]));
    return declarations.filter(ColumnChrome.#isAuthored).map((declaration) => {
      const painted = resolvedByKey.get(ColumnChrome.#fieldOfDeclaration(declaration));
      return painted === undefined ? ColumnChrome.#asGridColumn(declaration.column) : toGridColumn(painted);
    });
  }

  /** The one commit sequence D-S5-18 asks for: a plain `gantt.gridColumns = […]` assignment. Every
   *  column in `nextInput` is the consumer's own, which is what separates this entry point from the
   *  resize and reorder ones below (D-S5-33). */
  commit(nextInput: readonly GridColumnInput[]): boolean {
    return this.#commitDeclared(this.#authoredThenPluginColumns(nextInput));
  }

  /** Where a resize drag, a reorder drop and a plain assignment all meet (D-S5-18). `from`/`to` are
   *  `GridColumn`s (`toGridColumn`), not the layout-only `ResolvedColumn` — a consumer keeps `to` in
   *  memory and passes it straight back as `gridColumns` — and they carry the consumer's authored
   *  columns alone, so that round-trip can never save a column a plugin declared (#162, #181).
   *  Resizing a plugin column is therefore a commit whose payload shows no change: it repaints, and
   *  the consumer's own configuration is genuinely untouched. */
  #commitDeclared(next: readonly ColumnDeclaration[]): boolean {
    const nextResolved = resolveGanttFields(
      this.#ports.dataset(),
      next.map((declaration) => declaration.column),
      this.#ports.columnBind(),
    ).columns;
    const from = ColumnChrome.#authoredPayload(this.#declaredColumns, this.#resolvedColumns);
    const to = ColumnChrome.#authoredPayload(next, nextResolved);
    return this.#ports.proposeColumnsChange(from, to, () => {
      this.#declaredColumns = next;
      // A landed commit clears any live paint the drag that proposed it left behind — `render()`
      // (queued by `requestFrame()` below) repaints the real geometry anyway, but that runs on the
      // next frame, and a stale preview left in `InteractionState` would otherwise reapply itself
      // verbatim the next time something unrelated repaints before then.
      this.#ports.rebindFields();
      this.#ports.paintColumnResizePreview(undefined);
      this.#ports.paintColumnReorderPreview(undefined);
      this.#ports.requestFrame();
    });
  }

  /** Runs the commit sequence and returns whether it landed — the caller (a pointer drag, or a
   *  keyboard chord) restores its own preview when it did not (D-S5-18: "a veto restores the state
   *  the drag started from"). */
  commitWidth(columnKey: FieldKey, widthPx: number): boolean {
    return this.#commitDeclared(this.#withWidth(columnKey, widthPx));
  }

  commitReorder(columnKey: FieldKey, beforeColumnKey: FieldKey | null): boolean {
    return this.#commitDeclared(this.#reordered(columnKey, beforeColumnKey));
  }

  /** D-S5-34: `gantt.hideGridColumn(field)` and `gantt.showGridColumn(field)` land here. They take
   *  the same commit sequence a resize drag and a reorder drop take. So the
   *  `beforeGridColumnsChange` handler that guards every other column change cancels a hide too, and
   *  no second event pair exists for a consumer to learn. Hiding an already hidden column changes
   *  nothing, the same answer `gantt.gridColumns = sameList` gives. */
  commitHidden(columnKey: FieldKey, hidden: boolean): boolean {
    return this.#commitDeclared(this.#withHidden(columnKey, hidden));
  }

  /** `Shift+ArrowLeft`/`Shift+ArrowRight` (D-S5-18, D-S5-26) — the same `commitWidth` a resize
   *  drag's pointerup runs. */
  resizeStep(columnKey: FieldKey, direction: 1 | -1): void {
    const widthPx = Math.max(
      this.minWidthPx(),
      this.currentWidthPx(columnKey) + direction * COLUMN_RESIZE_STEP_PX,
    );
    this.commitWidth(columnKey, widthPx);
  }

  /** `Alt+ArrowLeft`/`Alt+ArrowRight` (D-S5-18, D-S5-26) — the same `commitReorder` a reorder
   *  drop runs. Already at that edge is a silent no-op, the same posture `zoomIn`/`zoomOut`'s own
   *  `when` guard takes for the opposite edge (there, gated in `core-commands.ts`; here, because the
   *  index math has nowhere left to point). */
  moveStep(columnKey: FieldKey, direction: 1 | -1): void {
    const keys = this.#resolvedColumns.map((column) => column.field);
    const i = keys.indexOf(columnKey);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= keys.length) return;
    const beforeKey = direction === -1 ? keys[j]! : (keys[j + 1] ?? null);
    this.commitReorder(columnKey, beforeKey);
  }
}
