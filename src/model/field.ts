// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// A Field is what a value is; a Grid column is where a Gantt shows it (ADR 0005, plans/01 §2.6).

import type { Duration } from './time.js';
import type { Entry } from './entry.js';
import type { ElementDescription } from './render.js';

/** The shipped subset — keys of `Entry` except `id`. The comparator exhaustiveness check stays over
 *  this set (ADR 0005 §28). */
export type CoreFieldKey = keyof Omit<Entry, 'id'>;

/** A Field's name, and the changeset's `field`. Open by construction (D-S2-26, ADR 0005). */
export type FieldKey = CoreFieldKey | (string & {});

/** What each shipped Field reads as: the `Entry` keys, plus `duration` — the one core Field that
 *  computes its value and owns no `Entry` key (`data/fields/core-fields.ts`). `meta` reads as
 *  `unknown` here even on a `Dataset<TMeta>`; the typed way to a consumer's own meta is
 *  `entries.get(id)?.meta`. */
export interface CoreFieldValues extends Omit<Entry, 'id'> {
  /** `end - start`, computed on read (`CORE_FIELDS`) — the one core Field with no `Entry` key. */
  duration: Duration;
}

/** A core Field's value, and `unknown` for every other key. This is all a `FieldContext` can
 *  promise: it flows into `layout/` and `view/`, and threading a consumer's field map through those
 *  layers is the option ADR 0005 rejected. */
export type CoreFieldValue<K extends FieldKey> = K extends keyof CoreFieldValues
  ? CoreFieldValues[K]
  : unknown;

/** A Field's value on a Dataset that declared `TFields` — what `entries.fieldValue` answers. A core
 *  key reads as its shipped type, a declared key as the type the consumer wrote, and any other key
 *  as `unknown`. `TFields` stops at the Dataset (ADR 0005). */
export type FieldValue<TFields, K extends FieldKey> = K extends keyof CoreFieldValues
  ? CoreFieldValues[K]
  : K extends keyof TFields
    ? TFields[K]
    : unknown;

export type AggregatorName = 'min' | 'max' | 'sum' | 'count' | 'none' | (string & {});
export type FieldTypeName = string & {};

/** Where the value lives. The choice decides whether a rolled-up parent value is stored. */
export type FieldSource =
  | { from: 'entry'; field: CoreFieldKey }
  | { from: 'meta'; key?: string }
  | { from: 'compute'; read(entry: Entry, ctx: FieldContext): unknown };

/** What a per-column `cellRenderer` receives (S5.7, D-S5-17). Narrower than the Gantt-wide
 *  `CellRenderer` (`layout/renderer.ts`): a per-column renderer already knows which column it paints
 *  — the consumer wrote it right there in the same `GridColumn` — so it needs no `column` argument to
 *  branch on, and no `row` either (the sample in D-S5-17 reads only `value`/`entry`). This also keeps
 *  `GridColumn` a `model/` type with zero dependencies (`model-is-leaf`): the Gantt-wide `CellRenderer`
 *  lives in `layout/` because its context names `FrameRow`/`ResolvedColumn`, and `model/` may not
 *  import `layout/`. */
export interface ColumnCellRendererContext {
  /** Undefined for a row with no backing Entry — a group or custom row. */
  entry?: Entry;
  /** What the grid paints: this column's Field value, through the Field's own `formatValue`. */
  value: string;
  /** The same Field value before formatting — what `dataset.entries.fieldValue(id, field)` answers
   *  (review H3). One vocabulary with the Gantt-wide `CellRendererContext`. */
  fieldValue: unknown;
}
export type ColumnCellRenderer = (ctx: ColumnCellRendererContext) => ElementDescription | undefined;

/** Where a cell's text and header sit within the column's width. Default `'start'`. */
export type ColumnAlign = 'start' | 'center' | 'end';

/** Every `GridColumn` key except its sizing. Split out so the sizing pair (`width`/`flex`) can join
 *  it as an exclusive union — here, in `Field.column` below, and in `SerializedField.column`
 *  (`model/document.ts`), each of which drops a different subset of these keys (#249). */
export interface GridColumnFields {
  field: FieldKey;
  header?: string;
  align?: ColumnAlign;
  /** S5.7 — per-column, more specific than `GanttOptions.cellRenderer` (D-S5-11). */
  cellRenderer?: ColumnCellRenderer;
  /** S5.8 — this column's cells open the inline editor. Default `false`. Listed here because it
   *  shares the type (I11); S5.8 honours it. */
  editable?: boolean;
  /** Default `true`. A fixed column refuses the resize drag and the resize chord. */
  resizable?: boolean;
  /** Default `true`. A pinned column refuses the reorder drag and the move chord. */
  movable?: boolean;
  /** D-S5-34. `true` keeps this column declared but off the screen. The column holds its place in
   *  `gridColumns`, its `width`, and its position in the order, so showing it again puts it back
   *  where it was. It leaves the grid, `ctx.view.resolvedColumns()`, and the resize and reorder
   *  gestures. Default `false`. `gantt.hideGridColumn(field)` writes this key without a restatement
   *  of the whole list. */
  hidden?: boolean;
  /** D-S5-13 — `true` adds this column's header and formatted value to the default bar tooltip.
   *  Default `false`. */
  tooltip?: boolean;
}

/** A Grid column states a width or a flex, never both (#249): a column that names one answers "how
 *  wide" on its own, and a column naming neither is fixed-width by default (`view/grid-columns.ts`'s
 *  `DEFAULT_COLUMN_WIDTH_PX`). `exactOptionalPropertyTypes` is on, so `flex: undefined` alongside a
 *  named `width` is still rejected — only *omitting* the other key satisfies `?: never`. */
export type GridColumnSizing = { width?: number; flex?: never } | { width?: never; flex?: number };

/** Presentation only. Never carries an aggregate — `data/` never holds a renderer; `toJSON` never
 *  sees one (D-S5-17). */
export type GridColumn = GridColumnFields & GridColumnSizing;

/** What a consumer writes: a Field key, or a column object. */
export type GridColumnInput = FieldKey | GridColumn;

/** One resolved Grid column's tooltip line: `header`, the column's header text, paired with
 *  `value`, an entry's formatted value for that column (D-S5-13). A `model/` type — the same
 *  reason `ElementDescription` lives here — because both `api/plugin.ts`'s public
 *  `resolveTooltipColumns` and `view/gantt-shell.ts`'s implementation need it, and `view/` may not
 *  import `api/` (view-boundary, plans/01 §1). `api/plugin.ts` re-exports it as plugin vocabulary. */
export interface TooltipColumn {
  header: string;
  value: string;
}

/** `TValue` checks `equals`/`compare`/`formatValue`/`parseValue` against each other only where a
 *  `Field` is declared — `FieldRegistry`, `DatasetOptions.fields` and `FieldLookup` all hold bare
 *  `Field` (`Field<unknown>`), so nothing downstream of declaration re-checks it (ADR 0005, #141
 *  item #4). This is deliberate, not a gap: the registry is heterogeneous and string-keyed by
 *  design, and closing it over a compile-time schema would be a different library. */
export interface Field<TValue = unknown> {
  key: FieldKey;
  type?: FieldTypeName;
  /** Default: `{ from: 'meta', key: this Field's key }` (D-S4-35). */
  source?: FieldSource;
  /** Name only — a function does not serialize (ADR 0005). */
  rollUp?: AggregatorName;
  equals?(a: TValue | undefined, b: TValue | undefined): boolean;
  compare?(a: TValue | undefined, b: TValue | undefined): number;
  /** `entry` is the row this value came from. `FormatContext` is built once per `resolveColumns`
   *  and reused for every cell, so a per-entry value cannot live there without rebuilding it per
   *  cell — a formatter that needs the Entry declares this third parameter instead; every other
   *  formatter still assigns with two, or one (#240). */
  formatValue?(value: TValue | undefined, ctx: FormatContext, entry: Entry): string;
  /** S5.8, D-S5-20, issue #137 F12: reads what the user typed into the inline editor's `<input>`
   *  back into a stored value. `undefined` means the text names no value — the editor stays open in
   *  the invalid state and commits nothing. `formatValue` is not invertible in general (a
   *  currency-formatted `"€1.234,56"` cannot be parsed back without knowing the format that produced
   *  it), so the library ships no guessed default: with no `parseValue`, `type: 'text'` (or no `type`
   *  at all) reads and writes the raw string, and every other named `type` refuses to open the
   *  editor rather than parse wrong. A `type: 'date'` Field never reaches this — `inlineEditing()`
   *  routes it through the `dateInput` seam instead (D-S5-20). */
  parseValue?(text: string, ctx: FieldContext): TValue | undefined;
  /** S5.8+: the generic inline editor's `<input type>` attribute. Default `'text'`. A
   *  native HTML affordance only (a number stepper, a numeric mobile keyboard, `tel`/`email`
   *  validation) — it does not change how a value is read back; pair it with `parseValue` when the
   *  stored value is not itself a string (a `'number'` input's `.value` is still a string). Has no
   *  effect on a `type: 'date'` Field — that never reaches the generic editor, routing through the
   *  `dateInput` seam instead (D-S5-20). For a full widget swap, not just the native input type, veto
   *  with `beforeEntryEdit` and mount your own control. */
  inputType?: 'text' | 'number' | 'email' | 'tel' | 'url';
  /** D-S5-17: `cellRenderer` sits on the Gantt's `GridColumn`, never here — `data/` never holds a
   *  renderer, so this default set excludes it. `hidden` is excluded for a different reason
   *  (D-S5-34): a Field default of `hidden: true` would make a Gantt that names the column show
   *  nothing. Which columns a view shows is the Gantt's question, never the Field's.
   *  `Omit<GridColumn, …>` would flatten the sizing union and let a Field default name both `width`
   *  and `flex` (#249) — so this type is built from `GridColumnFields` directly, joined back to
   *  `GridColumnSizing`, the same exclusive pair `GridColumn` itself carries. */
  column?: Omit<GridColumnFields, 'field' | 'cellRenderer' | 'hidden'> & GridColumnSizing;
}

/** A `Field` with `key` and `source` omitted — one bundle applied by name to many Fields. */
export type FieldType<TValue = unknown> = Omit<Field<TValue>, 'key' | 'source' | 'type'>;

/** What `createFieldContext` and column resolve need — `FieldRegistry.get` and `dataset.field` both satisfy this. */
export type FieldLookup = {
  get(key: FieldKey): Field | undefined;
};

/** Compute and store access. No locale — a headless Dataset does not format.
 *
 *  `read` types core keys and answers `unknown` for the rest. It does not take the consumer's field
 *  map: a `FieldContext` reaches `layout/` and `view/`, and making those layers generic over one
 *  consumer's fields is what ADR 0005 rejected. Read a declared key through
 *  `dataset.entries.fieldValue`, which the Dataset does type. */
export interface FieldContext {
  readonly timeZone: string;
  read<K extends FieldKey>(entry: Entry, key: K): CoreFieldValue<K> | undefined;
  durationOf(entry: Entry): Duration;
}

/** FieldContext plus this Gantt's locale. Built only at column-resolve time (D-S4-13). */
export interface FormatContext extends FieldContext {
  readonly locale: Intl.LocalesArgument;
}

/** FieldContext plus the Field currently rolling up. Shipped Aggregators (`sum`, `min`) read
 *  `ctx.field`; a consumer Aggregator reads any declared key through the same `ctx.read`.
 *
 *  `values`/`numericValues` cover the common "one field off my children" case (issue #124) — read
 *  `ctx.field` off each child in order. A multi-field or non-numeric Aggregator still reads each
 *  field it needs through `ctx.read` directly. */
export interface RollUpContext extends FieldContext {
  readonly field: FieldKey;
  /** `ctx.field` read off each child, in order. A child with no value is a hole (`undefined`). */
  values(children: readonly Entry[]): readonly unknown[];
  /** Like `values`, but keeps only finite numbers — holes and non-numeric values drop, same rule
   *  shipped `sum`/`min`/`max` already follow. */
  numericValues(children: readonly Entry[]): readonly number[];
}

/** Registered by name, never passed inline. `undefined` means no opinion — keep the stored value. */
export type Aggregator<TValue = unknown> = (
  children: readonly Entry[],
  parent: Entry,
  ctx: RollUpContext,
) => TValue | undefined;
