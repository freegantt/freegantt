// view/ — grid-column chrome: resolving `gridColumns` against the dataset's declared Fields, the
// live resize/reorder preview paint, and the one commit sequence a pointer drag, a reorder drop, and
// a plain `gantt.gridColumns = […]` assignment all share (S5.7, D-S5-18). Split out of `GanttShell`
// so column-chrome behaviour is reviewable and testable on its own — `GanttShell` is the only caller,
// closing over its own private state through `ColumnChromePorts` the same way `core-commands.ts`
// closes over `CoreCommandPorts` (D-S5-6's precedent) and `interaction/column-gestures.ts` closes
// over `ColumnGestureContext` (this file's own `column-gesture-context.ts` sibling).

import type { Dataset, Disposer, FieldKey, GridColumn, GridColumnInput } from '../model/index.js';
import type { ResolvedColumn } from '../layout/index.js';
import { createRegistrationTable } from '../layout/index.js';
import { readPixelProperty } from '../render/dom/pixel-property.js';
import { cssEscapeAttr } from '../render/dom/css-escape.js';
import type { ColumnReorderPreview } from './column-gesture-context.js';
import { resolveGanttFields, toGridColumn } from './grid-columns.js';
import type { ResolveColumnsBind } from './grid-columns.js';

const MIN_COLUMN_WIDTH_PROPERTY = '--fg-column-min-width';
const DEFAULT_MIN_COLUMN_WIDTH = 40;
const MIN_COLUMN_WIDTH_POLICY = { fallback: DEFAULT_MIN_COLUMN_WIDTH, accepts: 'positive' } as const;
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
}

/** One instance per Gantt (I2), owned by `GanttShell` alongside its other view state — never shared,
 *  never a module-level singleton. */
export class ColumnChrome {
  readonly #container: HTMLElement;
  readonly #ports: ColumnChromePorts;
  #gridColumnInput: readonly GridColumnInput[];
  /** S5.9, D-S5-21: `ctx.view.registerGridColumn` — one column per field (#147, #154), appended
   *  after the consumer's own `gridColumnInput` by `effectiveInput()`, in registration order, never
   *  stored into `gridColumnInput` itself (the public `gridColumns` getter stays the consumer's own
   *  authored list; a plugin column reaches the getter only once a resize/reorder/plain assignment
   *  commits it, the same "config beats a plugin" posture `barRenderer`/`cellRenderer` already take).
   *  Two plugins registering the same field stack on one key: the newest registration wins, and
   *  disposing one never disturbs the other's. */
  #pluginColumns = createRegistrationTable<FieldKey, PluginColumnRegistration>();
  #resolvedColumns: readonly ResolvedColumn[] = [];
  #focusedHeaderColumnKey: FieldKey | undefined;

  constructor(container: HTMLElement, ports: ColumnChromePorts, initialInput: readonly GridColumnInput[]) {
    this.#container = container;
    this.#ports = ports;
    this.#gridColumnInput = initialInput;
  }

  get gridColumnInput(): readonly GridColumnInput[] {
    return this.#gridColumnInput;
  }

  /** S5.9, D-S5-21: the consumer's own `gridColumnInput`, plus every plugin-registered column
   *  whose `field` it does not already name, in registration order — what actually resolves and
   *  renders. A duplicate `field` is dropped from the plugin side: config beats a plugin.
   *  `#pluginColumns` already holds one column per field (#154) — the newest registration on a
   *  field wins, at that field's first-registration position — so no dedupe happens here. */
  effectiveInput(): readonly GridColumnInput[] {
    const baseKeys = new Set(this.#gridColumnInput.map(ColumnChrome.#fieldOf));
    const extras = this.#pluginColumns
      .active()
      .map((registration) => registration.column)
      .filter((column) => !baseKeys.has(ColumnChrome.#fieldOf(column)));
    return [...this.#gridColumnInput, ...extras];
  }

  /** S5.9, D-S5-21: `ctx.view.registerGridColumn`. Legal only while `setup` runs (D-S5-4), the same
   *  gate every other `register*` takes — enforced by the caller (`GanttShell`), not here. Returns a
   *  `Disposer` that removes it again, same lifetime a decoration provider gets. */
  registerPluginColumn(column: GridColumnInput): Disposer {
    const field = ColumnChrome.#fieldOf(column);
    const registration: PluginColumnRegistration = { column };
    const remove = this.#pluginColumns.register(field, registration);
    this.#ports.rebindFields();
    this.#ports.requestFrame();
    return () => {
      // A commit writes the whole of `effectiveInput()` into `#gridColumnInput` (D-S5-18: one commit
      // sequence, one write). Plugin columns go in too. So disposal must also strip the baked-in
      // copy, by field key. A resize rewrites the column object, so identity no longer matches once
      // baked in. One question decides it: does any live registration still ask for this field?
      // While one does, the field stays on screen, so the baked column — and the width the consumer
      // committed to it — stays too, whether the plugin leaving was the winner or a loser (#155).
      // Only the last registration on a field takes the column out with it.
      remove();
      const fieldIsAbandoned = this.#pluginColumns.get(field) === undefined;
      if (fieldIsAbandoned) {
        this.#gridColumnInput = this.#gridColumnInput.filter((c) => ColumnChrome.#fieldOf(c) !== field);
      }
      this.#ports.rebindFields();
      this.#ports.requestFrame();
    };
  }

  get resolvedColumns(): readonly ResolvedColumn[] {
    return this.#resolvedColumns;
  }

  get focusedHeaderColumnKey(): FieldKey | undefined {
    return this.#focusedHeaderColumnKey;
  }

  setFocusedColumn(columnKey: FieldKey | undefined): void {
    this.#focusedHeaderColumnKey = columnKey;
  }

  /** `GanttShell#bindColumns()` resolves `gridColumnInput` against the dataset itself — one
   *  `resolveGanttFields` call already covers its own `fieldCompares`/`fieldContext` too, so this
   *  module does not repeat that resolution; it just adopts the result. */
  setResolvedColumns(columns: readonly ResolvedColumn[]): void {
    this.#resolvedColumns = columns;
  }

  resolvedColumn(columnKey: FieldKey): ResolvedColumn | undefined {
    return this.#resolvedColumns.find((column) => column.key === columnKey);
  }

  /** `false` for a key `gridColumns` no longer resolves (B3: a stale `#focusedHeaderColumnKey` from
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

  #asGridColumns(input: readonly GridColumnInput[]): GridColumn[] {
    return input.map((item) => (typeof item === 'string' ? { field: item } : { ...item }));
  }

  static #fieldOf(item: GridColumnInput): FieldKey {
    return typeof item === 'string' ? item : item.field;
  }

  /** A resize/reorder gesture reaches every column actually on screen (S5.9: `effectiveInput()`
   *  includes a plugin-registered column), not only `gridColumnInput`'s own list. */
  #withWidth(columnKey: FieldKey, widthPx: number): readonly GridColumnInput[] {
    return this.#asGridColumns(this.effectiveInput()).map((column) =>
      column.field === columnKey ? { ...column, width: widthPx } : column,
    );
  }

  #reordered(columnKey: FieldKey, beforeColumnKey: FieldKey | null): readonly GridColumnInput[] {
    const columns = this.#asGridColumns(this.effectiveInput());
    const from = columns.findIndex((column) => column.field === columnKey);
    if (from === -1) return this.effectiveInput();
    const [moved] = columns.splice(from, 1);
    const to =
      beforeColumnKey === null
        ? columns.length
        : columns.findIndex((column) => column.field === beforeColumnKey);
    columns.splice(to === -1 ? columns.length : to, 0, moved!);
    return columns;
  }

  /** The one commit sequence D-S5-18 asks for: a resize drag, a reorder drop, and a plain
   *  `gantt.gridColumns = […]` assignment all resolve `nextInput` into the columns they would show and
   *  route through here. `from`/`to` are `GridColumn`s (`toGridColumn`), not the layout-only
   *  `ResolvedColumn` — a consumer keeps `to` in memory and passes it straight back as `gridColumns`. */
  commit(nextInput: readonly GridColumnInput[]): boolean {
    const nextResolved = resolveGanttFields(
      this.#ports.dataset(),
      nextInput,
      this.#ports.columnBind(),
    ).columns;
    const from = this.#resolvedColumns.map(toGridColumn);
    const to = nextResolved.map(toGridColumn);
    return this.#ports.proposeColumnsChange(from, to, () => {
      this.#gridColumnInput = nextInput;
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
    return this.commit(this.#withWidth(columnKey, widthPx));
  }

  commitReorder(columnKey: FieldKey, beforeColumnKey: FieldKey | null): boolean {
    return this.commit(this.#reordered(columnKey, beforeColumnKey));
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
    const keys = this.#resolvedColumns.map((column) => column.key);
    const i = keys.indexOf(columnKey);
    const j = i + direction;
    if (i === -1 || j < 0 || j >= keys.length) return;
    const beforeKey = direction === -1 ? keys[j]! : (keys[j + 1] ?? null);
    this.commitReorder(columnKey, beforeKey);
  }
}
