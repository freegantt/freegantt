// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// A Field is what a value is; a Grid column is where a Gantt shows it (ADR 0005, plans/01 §2.6).

import type { Duration } from './time.js';
import type { Entry, EntryEdits } from './entry.js';
import type { ElementDescription } from './render.js';

/** The shipped subset — keys of `Entry` except `id` and `props`. The comparator exhaustiveness check
 *  stays over this set (ADR 0005 §28). `props` omits alongside this, or neither does (ADR 0011):
 *  change one and not the other, and `read(id, 'props')` types as the whole bag while the registry
 *  refuses the key at runtime. */
export type CoreFieldKey = keyof Omit<Entry, 'id' | 'props'>;

/** A Field's name, and the changeset's `field`. Open by construction (D-S2-26, ADR 0005). */
export type FieldKey = CoreFieldKey | (string & {});

/** What each shipped Field reads as: the `Entry` keys (minus `props`, ADR 0011's one reserved key),
 *  plus `duration` — the one core Field that computes its value and owns no `Entry` key
 *  (`data/fields/core-fields.ts`). The typed way to a consumer's own `props` is
 *  `entries.get(id)?.props`. */
export interface CoreFieldValues extends Omit<Entry, 'id' | 'props'> {
  /** `end - start`, computed on read (`CORE_FIELDS`) — the one core Field with no `Entry` key. */
  duration: Duration;
}

/** A core Field's value, and `unknown` for every other key. This is all a `FieldContext` can
 *  promise: it flows into `layout/` and `view/`, and threading a consumer's field map through those
 *  layers is the option ADR 0005 rejected. */
export type CoreFieldValue<K extends FieldKey> = K extends keyof CoreFieldValues
  ? CoreFieldValues[K]
  : unknown;

/** A Field's value on a Dataset that declared `TProps` — what `entries.fieldValue` answers. A core
 *  key reads as its shipped type, a declared key as the type the consumer wrote, and any other key
 *  as `unknown`. One generic types both `entry.props` and this (ADR 0011); `TProps` stops at the
 *  Dataset (ADR 0005). */
export type FieldValue<TProps, K extends FieldKey> = K extends keyof CoreFieldValues
  ? CoreFieldValues[K]
  : K extends keyof TProps
    ? TProps[K]
    : unknown;

export type AggregatorName = 'min' | 'max' | 'sum' | 'count' | 'none' | (string & {});
export type FieldTypeName = string & {};

/** How far a Field's value may change (ADR 0015). One key, two thresholds: the grid writes it only
 *  at `'anywhere'`, and `entries.update()` writes it at anything but `'never'`.
 *
 *  - `'anywhere'` — the cell editor opens, a drag writes it, and `update()` writes it. The default.
 *  - `'api'` — `update()` writes it; the grid cell is dead. A value the app owns and the user does
 *    not type.
 *  - `'never'` — a lock. `update()` throws `FieldNotEditableError`.
 *
 *  `true` and `false` are input-only aliases for `'anywhere'` and `'never'`, the same way
 *  `InstantInput` takes a string and stores an `Instant`. After ingest the stored Field holds this
 *  enum, so `dataset.fields.all` reads one word back. */
export type FieldEditable = 'never' | 'api' | 'anywhere';

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
 *  it as an exclusive union — here, and in `Field.column` below, each of which drops a different
 *  subset of these keys (#249). */
export interface GridColumnBase {
  field: FieldKey;
  header?: string;
  align?: ColumnAlign;
  /** S5.7 — per-column, more specific than `GanttOptions.cellRenderer` (D-S5-11). */
  cellRenderer?: ColumnCellRenderer;
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

/** Presentation only. Never carries an aggregate — `data/` never holds a renderer, and no reader of
 *  this Dataset ever sees one (D-S5-17). */
export type GridColumn = GridColumnBase & GridColumnSizing;

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
 *  design, and closing it over a compile-time schema would be a different library.
 *
 *  **The union is exclusive** (ADR 0011): a stored Field may roll up and may be edited; a `compute`
 *  Field may do neither, and runs on every row, a rolling-up parent included. `compute` is the
 *  discriminant — `'compute' in field` is the one test the registry's `hasSomewhereToWrite` and the
 *  write resolver both ask. Declaring a key does not create it: carrying a value is free, and a Field
 *  exists only because the library has a job to do with it — a sort, a format, a rollup, an editor, a
 *  column. */
export type Field<TValue = unknown> =
  | {
      key: FieldKey;
      type?: FieldTypeName;
      /** Name only — a function does not serialize (ADR 0005). */
      rollUp?: AggregatorName;
      /** Where this Field's value may change (ADR 0015). **One key, two thresholds** — the grid
       *  writes it only at `'anywhere'`, and `entries.update()` writes it at anything but `'never'`.
       *  That is I14: the inline cell editor (S5.8), bar drag-resize for `start`/`end` (#142) and the
       *  API door all read this one key, and never disagree about it.
       *
       *  - `'anywhere'` — the cell editor opens, a drag writes it, and `update()` writes it.
       *  - `'api'` — `update()` writes it; the grid cell is dead. A value the app owns and the user
       *    does not type.
       *  - `'never'` — a lock. `update()` throws `FieldNotEditableError`.
       *
       *  **Absent means `'anywhere'`.** `true` and `false` are input-only aliases for `'anywhere'`
       *  and `'never'`; after ingest the stored Field holds the enum, so `dataset.fields.all` reads
       *  it back as one.
       *
       *  A lock is not a wall around the data. Create, ingest and History replay still write a
       *  `'never'` Field — it names what a *caller* may write, not what the library may.
       *
       *  A core Field (`start`, `name`, ...) is declared by the library and cannot be redeclared, so a
       *  consumer overrides only this key on one through `DatasetOptions.fields`/`ctx.fields.register`
       *  — `field-registry.ts`'s `CORE_FIELD_OVERRIDABLE_KEYS` names the one key that merge accepts;
       *  naming any other key on a core Field's key throws (`IllegalCoreFieldOverrideError`).
       *  `dataset.setFieldEditable(key, editable)` changes it after setup; nothing else may. */
      editable?: FieldEditable | boolean;
      /** What a write to this Field on a **rolling-up parent** means (ADR 0013 amendment). Absent,
       *  and that cell is read-only — refused standalone and refused inside `dataset.transaction()`
       *  alike, because permission follows the thing written, never the call that wrapped it.
       *
       *  Written out as a method rather than as `FieldDistributor<TValue>`, for the reason `equals`
       *  and `compare` are: `TValue` sits in a parameter here, so a property would make
       *  `Field<number>` stop being assignable to `Field<unknown>`, and the registry holds bare
       *  `Field`. `FieldDistributor` is the type a consumer writes one against. */
      distribute?(
        value: TValue | undefined,
        children: readonly Entry[],
        parent: Entry,
        ctx: RollUpContext,
      ): EntryEdits | undefined;
      // `compute` is genuinely absent here, not `compute?: never`: `'compute' in field` is the
      // discriminant `hasSomewhereToWrite` and the write resolver both ask, and TypeScript's `in`
      // narrowing only excludes an arm that never declares the key at all — a `never`-typed optional
      // key still counts as declared, and the check would stop narrowing at all.
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
       *  and `flex` (#249) — so this type is built from `GridColumnBase` directly, joined back to
       *  `GridColumnSizing`, the same exclusive pair `GridColumn` itself carries. */
      column?: Omit<GridColumnBase, 'field' | 'cellRenderer' | 'hidden'> & GridColumnSizing;
    }
  | {
      key: FieldKey;
      type?: FieldTypeName;
      rollUp?: never;
      editable?: never;
      /** Runs on **every** row a read touches, a rolling-up parent included (ADR 0011, decision 10):
       *  read a value through `entry.props`, and read a Field — a core key, `duration`, or another
       *  Field's own `compute` arm — through `ctx.read`. `entry.props` alone cannot reach those.
       *  Named `compute`, not `get`: `get` already names three unrelated jobs in this codebase. */
      compute(entry: Entry, ctx: FieldContext): TValue | undefined;
      compare?(a: TValue | undefined, b: TValue | undefined): number;
      formatValue?(value: TValue | undefined, ctx: FormatContext, entry: Entry): string;
      column?: Omit<GridColumnBase, 'field' | 'cellRenderer' | 'hidden'> & GridColumnSizing;
      // Declared `never` (never abbreviated away, unlike the ADR's shorthand comment) so a caller
      // holding a bare `Field` can read `field.equals`/`.parseValue`/`.inputType` without narrowing
      // the union first — the same reason `rollUp`/`editable`/`compute` cross-declare above.
      equals?: never;
      parseValue?: never;
      inputType?: never;
      /** A `compute` Field has no cell to write, so it has no write to distribute. */
      distribute?: never;
    };

/** A stored-Field bundle applied by name to many Fields (`registerType`) — `key`, `type` and the
 *  `compute`/`rollUp`/`editable` discriminants left out. Written directly rather than derived from
 *  `Field` with `Omit`: `Omit` does not distribute over a union, so it would collapse to the two
 *  arms' *common* keys and drop `equals`/`parseValue`/`inputType` — `percent` (`field-types.ts`)
 *  needs `parseValue` and `inputType` on its own bundle. */
export interface FieldType<TValue = unknown> {
  /** A Field naming this type may still override it (D-S4-3) — `{ key: 'cost', type: 'money',
   *  rollUp: 'none' }` opts one Field on a shared type out. */
  rollUp?: AggregatorName;
  /** Read `Field.editable` for the three states. A Field naming this type may override it. */
  editable?: FieldEditable | boolean;
  /** One distribution policy for every Field on this type — which is why `FieldDistributor` reads
   *  the Field key off `ctx.field` rather than closing over one. A method, not a property, for the
   *  variance reason `Field.distribute` states. */
  distribute?(
    value: TValue | undefined,
    children: readonly Entry[],
    parent: Entry,
    ctx: RollUpContext,
  ): EntryEdits | undefined;
  equals?(a: TValue | undefined, b: TValue | undefined): boolean;
  compare?(a: TValue | undefined, b: TValue | undefined): number;
  formatValue?(value: TValue | undefined, ctx: FormatContext, entry: Entry): string;
  parseValue?(text: string, ctx: FieldContext): TValue | undefined;
  inputType?: 'text' | 'number' | 'email' | 'tel' | 'url';
  column?: Omit<GridColumnBase, 'field' | 'cellRenderer' | 'hidden'> & GridColumnSizing;
}

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
  /** `undefined` iff `entry` does not span (ADR 0012) — an Entry with no `start`/`end` has no
   *  duration to state. */
  durationOf(entry: Entry): Duration | undefined;
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

/** What a write to a rolling-up parent's cell **means** (ADR 0013, amendment 2026-09-11). Read the
 *  Aggregator below backwards: the same three arguments, and the value the Aggregator produced comes
 *  back as the first one.
 *
 *  Declaring this is how a consumer names the distribution policy — split evenly, by duration, by
 *  current share. With no `distribute`, that cell is read-only and the write is refused from every
 *  direction, batched or not (`DerivedFieldNotWritableError`): the library ships no guessed default,
 *  because there is none to defend.
 *
 *  It writes the **children**, never the parent: nothing but the Rollup writes a rolling-up parent's
 *  cell, and the Rollup reads that cell back off what this returns. An edit aimed at the parent is
 *  refused. Each returned edit lands through the door it would have come in by, so a child that is
 *  itself a rolling-up parent distributes again, or refuses.
 *
 *  `undefined` — or an empty map — **declines**, and the write is refused with the same error an
 *  absent `distribute` gives. A policy with nothing to write is a policy that says no. */
export type FieldDistributor<TValue = unknown> = (
  value: TValue | undefined,
  children: readonly Entry[],
  parent: Entry,
  ctx: RollUpContext,
) => EntryEdits | undefined;

/** Registered by name, never passed inline. `undefined` means no opinion — keep the stored value. */
export type Aggregator<TValue = unknown> = (
  children: readonly Entry[],
  parent: Entry,
  ctx: RollUpContext,
) => TValue | undefined;
