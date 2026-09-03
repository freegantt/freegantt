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
  value: string;
}
export type ColumnCellRenderer = (ctx: ColumnCellRendererContext) => ElementDescription | undefined;

/** Presentation only. Never carries an aggregate — `data/` never holds a renderer; `toJSON` never
 *  sees one (D-S5-17). */
export interface GridColumn {
  field: FieldKey;
  header?: string;
  width?: number;
  flex?: number;
  align?: 'start' | 'end';
  /** S5.7 — per-column, more specific than `GanttOptions.cellRenderer` (D-S5-11). */
  cellRenderer?: ColumnCellRenderer;
  /** S5.8 — this column's cells open the inline editor. Default `false`. Listed here because it
   *  shares the type (I11); S5.8 honours it. */
  editable?: boolean;
  /** Default `true`. A fixed column refuses the resize drag and the resize chord. */
  resizable?: boolean;
  /** Default `true`. A pinned column refuses the reorder drag and the move chord. */
  movable?: boolean;
}

/** What a consumer writes: a Field key, or a column object. */
export type GridColumnInput = FieldKey | GridColumn;

export interface Field<TValue = unknown> {
  key: FieldKey;
  type?: FieldTypeName;
  /** Default: `{ from: 'meta', key: this Field's key }` (D-S4-35). */
  source?: FieldSource;
  /** Name only — a function does not serialize (ADR 0005). */
  rollUp?: AggregatorName;
  equals?(a: TValue | undefined, b: TValue | undefined): boolean;
  compare?(a: TValue | undefined, b: TValue | undefined): number;
  formatValue?(value: TValue | undefined, ctx: FormatContext): string;
  column?: Omit<GridColumn, 'field'>;
}

/** A `Field` with `key` and `source` omitted — one bundle applied by name to many Fields. */
export type FieldType<TValue = unknown> = Omit<Field<TValue>, 'key' | 'source' | 'type'>;

/** What `createFieldContext` and column resolve need — `FieldRegistry.get` and `dataset.field` both satisfy this. */
export type FieldLookup = {
  get(key: FieldKey): Field | undefined;
};

/** Compute and store access. No locale — a headless Dataset does not format. */
export interface FieldContext {
  readonly timeZone: string;
  read<T>(entry: Entry, key: FieldKey): T | undefined;
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
