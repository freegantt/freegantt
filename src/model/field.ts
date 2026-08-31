// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// A Field is what a value is; a Grid column is where a Gantt shows it (ADR 0005, plans/01 §2.6).

import type { Duration } from './time.js';
import type { Entry } from './entry.js';

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

/** Presentation only. Never carries an aggregate. `cellRenderer` and `editable` arrive in S5. */
export interface GridColumn {
  field: FieldKey;
  header?: string;
  width?: number;
  flex?: number;
  align?: 'start' | 'end';
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
 *  `ctx.field`; a consumer Aggregator reads any declared key through the same `ctx.read`. */
export interface RollUpContext extends FieldContext {
  readonly field: FieldKey;
}

/** Registered by name, never passed inline. `undefined` means no opinion — keep the stored value. */
export type Aggregator<TValue = unknown> = (
  children: readonly Entry[],
  parent: Entry,
  ctx: RollUpContext,
) => TValue | undefined;
