// model/ is types + brand/id helpers only — zero runtime beyond this, zero dependencies (plans/01 §1.1).
// A Field is what a value is; a Grid column is where a Gantt shows it (ADR 0005, plans/01 §2.6).

import type { EntryId } from './ids.js';
import type { StoredEntry } from './stored-entry.js';
import type { Entry } from './entry.js';
import type { CoreFieldKey, CoreFieldValue, CoreFieldValues, FieldKey, FieldValue } from './field-key.js';

export type { CoreFieldKey, CoreFieldValue, CoreFieldValues, FieldKey, FieldValue };
import type { ElementDescription } from './render.js';

export type AggregatorName = 'min' | 'max' | 'sum' | 'count' | 'none' | (string & {});
/** `'entryId'` (#425) names a reference to another Entry by id — `parentId`'s own type. It ships no
 *  `parseValue`, so the inline editor declines any Field of this type, whatever `editable` says. */
export type FieldTypeName =
  'text' | 'number' | 'percent' | 'date' | 'duration' | 'boolean' | 'entryId' | (string & {});

/** How far a Field's value may change (ADR 0015, amended by ADR 0033). One key, two thresholds: the
 *  grid writes it only at `'anywhere'`, and `entries.update()` writes it at anything but `'never'`.
 *
 *  - `'anywhere'` — the cell editor opens, a drag writes it, and `update()` writes it. The default.
 *  - `'api'` — `update()` writes it; no gesture does. A value the app owns and the user does not
 *    type. No capability rule reopens it — `capabilities.edit` and a variant's own `edit` only
 *    narrow an `'anywhere'` Field.
 *  - `'never'` — a lock. `update()` throws `FieldNotEditableError`.
 *
 *  `true` and `false` are input-only aliases for `'anywhere'` and `'never'`, the same way
 *  `InstantInput` takes a string and stores an `Instant`. After ingest the stored Field holds this
 *  enum, so `dataset.fields.all` reads one word back. */
export type FieldEditable = 'never' | 'api' | 'anywhere';

/** What a per-column `columnRenderer` receives (S5.7). Narrower than the Gantt-wide
 *  `GridCellRenderer` (`layout/renderer.ts`): a per-column renderer already knows which column it paints
 *  — the consumer wrote it right there in the same `GridColumn` — so it needs no `column` argument to
 *  branch on, and no `row` either (the sample reads only `value`/`entry`). This also keeps
 *  `GridColumn` a `model/` type with zero dependencies (`model-is-leaf`): the Gantt-wide `GridCellRenderer`
 *  lives in `layout/` because its context names `FrameRow`/`ResolvedColumn`, and `model/` may not
 *  import `layout/`.
 *
 *  `TValue` is the column's own Field value. A renderer from `createGridColumnHelper` reads
 *  `fieldValue` as that type. A plain column object keeps the default, `unknown`. */
export interface ColumnRendererContext<TValue = unknown> {
  /** Undefined for a row with no backing Entry — a group or custom row. */
  entry?: Entry | undefined;
  /** What the grid paints: this column's Field value, through the Field's own `formatValue`. */
  value: string;
  /** The same Field value before formatting — what `entry.read(field)` answers (review H3). One vocabulary with the Gantt-wide `GridCellRendererContext`.
   *  Undefined on a row with no Entry, and on an Entry with no value for this Field. */
  fieldValue: TValue | undefined;
}
export type ColumnRenderer<TValue = unknown> = (
  ctx: ColumnRendererContext<TValue>,
) => ElementDescription | undefined;

/** What a per-column `headerRenderer` receives. It names the column's Field and its header text.
 *  The renderer already knows its column, so it gets no column object. That keeps `GridColumn` a
 *  `model/` type with zero dependencies, the same way `ColumnRendererContext` does. */
export interface ColumnHeaderRendererContext {
  field: FieldKey;
  /** The header text of this column. It stays the accessible name of the header cell. */
  header: string;
}
/** `undefined` keeps the library's own header for this one column. */
export type ColumnHeaderRenderer = (ctx: ColumnHeaderRendererContext) => ElementDescription | undefined;

/** What a toggle column's `onToggle` receives: the Entry, the Field, and the value a default toggle
 *  would write. */
export interface ColumnToggleContext {
  entry: Entry;
  field: FieldKey;
  /** The opposite of the value the cell shows now. An empty cell reads as `false`, so this is `true`. */
  nextValue: boolean;
  /** Tells `entryEdit` listeners that this switch wrote. Call it once, after your own write, also
   *  after an async write such as a confirm dialog. It reads `from` (the value `beforeEntryEdit`
   *  saw) and `to` (the value the Entry holds now), so it takes no argument. It announces even when
   *  `to` equals `from`, as the built-in editor does. A second call does nothing. It does nothing
   *  after the Entry leaves the Dataset. The default write announces for you. A custom `onToggle`
   *  that never calls this helper leaves `entryEdit` listeners blind to the switch. */
  announceEdit: () => void;
}

/** How a toggle column looks and acts. The column's Field is `type: 'boolean'`.
 *
 *  A user switches the value with one click, or with `Space` or `Enter` on the focused cell. The
 *  cell opens no editor. The Field's `editable`, the lock rule, `capabilities.edit` and
 *  `beforeChange` decide whether the toggle acts. A closed toggle draws its value and does nothing. */
export interface ColumnToggle {
  /** What the cell draws when the value is `true`. Default: a checked box. */
  on?: ElementDescription;
  /** What the cell draws when the value is `false` or empty. Default: an empty box. */
  off?: ElementDescription;
  /** Replaces the default write. Runs only when the toggle is open. Write through the public API,
   *  for example `dataset.entries.update(entry.id, { done: nextValue })`, or write nothing. The write meets the same
   *  gates. The library fires `beforeEntryEdit` before this call. The default write announces
   *  `entryEdit` itself. Your write does not. Call `ctx.announceEdit()` after it, or `entryEdit`
   *  listeners never see the switch. */
  onToggle?: (ctx: ColumnToggleContext) => void;
}

/** Where a cell's text and header sit within the column's width. Default `'start'`. */
export type ColumnAlign = 'start' | 'center' | 'end';

/** Every `GridColumn` key except its sizing. Split out so the sizing pair (`width`/`flex`) can join
 *  it as an exclusive union — here, and in `Field.column` below, each of which drops a different
 *  subset of these keys (#249). */
export interface GridColumnBase {
  field: FieldKey;
  header?: string;
  align?: ColumnAlign;
  /** S5.7 — per-column, more specific than `GanttOptions.gridCellRenderer`. */
  columnRenderer?: ColumnRenderer;
  /** Paints this column's header cell. It wins over the Gantt-wide `headerRenderer` for this column.
   *  The renderer may return only an icon or an inline SVG (`{ html: '<svg …>' }`). The library adds the
   *  `header` string as visually hidden text beside the output, so it stays the accessible name. */
  headerRenderer?: ColumnHeaderRenderer;
  /** Makes a `boolean` Field's cell a toggle. `true` takes the default look and the default write.
   *  Any other Field type throws `ToggleFieldNotBooleanError` where the column is declared. */
  toggle?: true | ColumnToggle;
  /** Default `true`. A fixed column refuses the resize drag and the resize chord. */
  resizable?: boolean;
  /** Default `true`. A pinned column refuses the reorder drag and the move chord. */
  movable?: boolean;
  /** `true` keeps this column declared but off the screen. The column holds its place in
   *  `gridColumns`, its `width`, and its position in the order, so showing it again puts it back
   *  where it was. It leaves the grid, `ctx.view.resolvedColumns()`, and the resize and reorder
   *  gestures. Default `false`. `gantt.hideGridColumn(field)` writes this key without a restatement
   *  of the whole list. */
  hidden?: boolean;
  /** `true` adds this column's header and formatted value to the default bar tooltip.
   *  Default `false`. `tooltip: true` on an image column shows the stored URL unless the Field's
   *  `formatValue` returns a caption. */
  tooltip?: boolean;
}

/** A Grid column states a width or a flex, never both (#249): a column that names one answers "how
 *  wide" on its own, and a column naming neither is fixed-width by default (`view/grid-columns.ts`'s
 *  `DEFAULT_COLUMN_WIDTH_PX`). `exactOptionalPropertyTypes` is on, so `flex: undefined` alongside a
 *  named `width` is still rejected — only *omitting* the other key satisfies `?: never`. */
export type GridColumnSizing = { width?: number; flex?: never } | { width?: never; flex?: number };

/** Presentation only. Never carries an aggregate — `data/` never holds a renderer, and no reader of
 *  this Dataset ever sees one. */
export type GridColumn = GridColumnBase & GridColumnSizing;

/** What a consumer writes: a Field key, or a column object. */
export type GridColumnInput = FieldKey | GridColumn;

/** One resolved Grid column's tooltip line: `header`, the column's header text, paired with
 *  `value`, an entry's formatted value for that column. A `model/` type — the same
 *  reason `ElementDescription` lives here — because both `api/plugin-context.ts`'s public
 *  `resolveTooltipColumns` and `view/gantt-shell.ts`'s implementation need it, and `view/` may not
 *  import `api/` (view-boundary, plans/01 §1). `api/plugin-context.ts` re-exports it as plugin vocabulary. */
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
      /** A string looks up the type table. An object is the bundle — `{ key: 'cost',
       *  type: currency({ code: 'EUR' }) }`. After merge, a string name stays; an inline bundle
       *  does not leave a function object on `type`. */
      type?: FieldTypeName | FieldType<TValue>;
      /** Name only — a function does not serialize (ADR 0005). */
      rollUp?: AggregatorName;
      /** Where this Field's value may change (ADR 0015, amended by ADR 0033). **One key, two
       *  thresholds** — the grid writes it only at `'anywhere'`, and `entries.update()` writes it at
       *  anything but `'never'`. That is I14: the inline cell editor (S5.8), bar drag-resize for
       *  `start`/`end` (#142) and the API door all read this one key, and never disagree about it.
       *
       *  - `'anywhere'` — the cell editor opens, a drag writes it, and `update()` writes it.
       *  - `'api'` — `update()` writes it; no gesture does. `capabilities.edit` and a variant's own
       *    `edit` only narrow an `'anywhere'` Field, so neither reopens this one.
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
       *  consumer overrides only this key on one through `DatasetOptions.fields` or a plugin's own
       *  `fields` — `field-registry.ts`'s `CORE_FIELD_OVERRIDABLE_KEYS` names the keys merge accepts;
       *  naming any other key on a core Field's key throws (`IllegalCoreFieldOverrideError`).
       *  `dataset.setFieldEditable(key, editable)` changes it after setup; nothing else may. */
      editable?: FieldEditable | boolean;
      // `compute` is genuinely absent here, not `compute?: never`: `'compute' in field` is the
      // discriminant `hasSomewhereToWrite` and the write resolver both ask, and TypeScript's `in`
      // narrowing only excludes an arm that never declares the key at all — a `never`-typed optional
      // key still counts as declared, and the check would stop narrowing at all.
      equals?(a: TValue | undefined, b: TValue | undefined): boolean;
      compare?(a: TValue | undefined, b: TValue | undefined): number;
      /** `entry` is the row this value came from. `FormatContext` is built once per `resolveColumns`
       *  and reused for every cell, so a per-entry value cannot live there without rebuilding it per
       *  cell — a formatter that needs the Entry declares this third parameter instead; every other
       *  formatter still assigns with two, or one (#240). A consumer declaration naming a core Field's
       *  key overrides this on any core Field, the same door `editable` uses
       *  (`field-registry.ts`'s `CORE_FIELD_OVERRIDABLE_KEYS`, #577). */
      formatValue?(value: TValue | undefined, ctx: FormatContext, entry: Entry): string;
      /** S5.8, issue #137: reads what the user typed into the inline editor's `<input>`
       *  back into a stored value. `undefined` means the text names no value — the editor stays open in
       *  the invalid state and commits nothing. `formatValue` is not invertible in general (a
       *  currency-formatted `"€1.234,56"` cannot be parsed back without knowing the format that produced
       *  it), so the library ships no guessed default: with no `parseValue`, `type: 'text'` (or no `type`
       *  at all) reads and writes the raw string, and every other named `type` refuses to open the
       *  editor rather than parse wrong. A `type: 'date'` Field never reaches this — `inlineEditing()`
       *  routes it through the `dateInput` seam instead. */
      parseValue?(text: string, ctx: FieldContext, entry: Entry): TValue | undefined;
      /** S5.8+: the generic inline editor's `<input type>` attribute. Default `'text'`. A
       *  native HTML affordance only (a number stepper, a numeric mobile keyboard, `tel`/`email`
       *  validation) — it does not change how a value is read back; pair it with `parseValue` when the
       *  stored value is not itself a string (a `'number'` input's `.value` is still a string).
       *  `'checkbox'` is the one exception: the editor reads and writes its `.checked` state
       *  instead of `.value`, so a `boolean` Field takes no `parseValue`. Has no effect on a `type:
       *  'date'` Field — that never reaches the generic editor, routing through the `dateInput` seam
       *  instead. For a full widget swap, not just the native input type, veto with
       *  `beforeEntryEdit` and mount your own control. */
      inputType?: 'text' | 'number' | 'email' | 'tel' | 'url' | 'checkbox';
      /** `columnRenderer`, `headerRenderer` and `toggle` sit on the Gantt's `GridColumn`, never here —
       *  `data/` never holds a renderer or a callback, so this default set excludes them. `hidden` is excluded for a different reason.
       *  A Field default of `hidden: true` would make a Gantt that names the column show
       *  nothing. Which columns a view shows is the Gantt's question, never the Field's.
       *  `Omit<GridColumn, …>` would flatten the sizing union and let a Field default name both `width`
       *  and `flex` (#249) — so this type is built from `GridColumnBase` directly, joined back to
       *  `GridColumnSizing`, the same exclusive pair `GridColumn` itself carries. */
      column?: Omit<GridColumnBase, 'field' | 'columnRenderer' | 'headerRenderer' | 'toggle' | 'hidden'> &
        GridColumnSizing;
    }
  | {
      key: FieldKey;
      type?: FieldTypeName | FieldType<TValue>;
      rollUp?: never;
      editable?: never;
      /** Runs on **every** row a read touches, a rolling-up parent included (ADR 0011, decision 10):
       *  read a stored value off `entry`, and read a Field — a core key, or another Field's own
       *  `compute` arm — through `ctx.read(key)`. A computed value may also depend on
       *  the tree: `ctx.children(entry)`, `ctx.descendants(entry)`, `ctx.leaves(entry)` or
       *  `ctx.hasChildren(entry)` (#214, #466). `entry` is a `StoredEntry` because the row may be
       *  hypothetical — a post-edit row, or a Rollup's effective child.
       *  Named `compute`, not `get`: `get` already names three unrelated jobs in this codebase. */
      compute(entry: StoredEntry, ctx: ComputeContext): TValue | undefined;
      compare?(a: TValue | undefined, b: TValue | undefined): number;
      formatValue?(value: TValue | undefined, ctx: FormatContext, entry: Entry): string;
      column?: Omit<GridColumnBase, 'field' | 'columnRenderer' | 'headerRenderer' | 'toggle' | 'hidden'> &
        GridColumnSizing;
      // Declared `never` (never abbreviated away, unlike the ADR's shorthand comment) so a caller
      // holding a bare `Field` can read `field.equals`/`.parseValue`/`.inputType` without narrowing
      // the union first — the same reason `rollUp`/`editable`/`compute` cross-declare above.
      equals?: never;
      parseValue?: never;
      inputType?: never;
    };

/** A stored-Field bundle applied by name (construction's `fieldTypes` option, `type: 'percent'`) or inline
 *  (`type: currency({ code: 'EUR' })`) to many Fields — `key`, `type` and the
 *  `compute`/`rollUp`/`editable` discriminants left out. Written directly rather than derived from
 *  `Field` with `Omit`: `Omit` does not distribute over a union, so it would collapse to the two
 *  arms' *common* keys and drop `equals`/`parseValue`/`inputType` — `percent` (`field-types.ts`)
 *  needs `parseValue` and `inputType` on its own bundle. */
export interface FieldType<TValue = unknown> {
  /** A Field naming this type may still override it — `{ key: 'cost', type: 'money',
   *  rollUp: 'none' }` opts one Field on a shared type out. */
  rollUp?: AggregatorName;
  /** Read `Field.editable` for the three states. A Field naming this type may override it. */
  editable?: FieldEditable | boolean;
  equals?(a: TValue | undefined, b: TValue | undefined): boolean;
  compare?(a: TValue | undefined, b: TValue | undefined): number;
  formatValue?(value: TValue | undefined, ctx: FormatContext, entry: Entry): string;
  parseValue?(text: string, ctx: FieldContext, entry: Entry): TValue | undefined;
  inputType?: 'text' | 'number' | 'email' | 'tel' | 'url' | 'checkbox';
  column?: Omit<GridColumnBase, 'field' | 'columnRenderer' | 'headerRenderer' | 'toggle' | 'hidden'> &
    GridColumnSizing;
}

/** What `createFieldContext` and column resolve need — `FieldRegistry.get` and `dataset.field` both satisfy this. */
export type FieldLookup = {
  get(key: FieldKey): Field | undefined;
};

/** Ambient. One per Dataset, reused by every read — the zone, and nothing that belongs to one row
 *  (ADR 0017). `FormatContext` and `ComputeContext` both extend it, and `parseValue` receives it.
 *
 *  It does not take the consumer's field map: a `FieldContext` reaches `layout/` and `view/`, and
 *  making those layers generic over one consumer's fields is what ADR 0005 rejected. A row's own
 *  value reads off the row — `entry.read(key)`. */
export interface FieldContext {
  readonly timeZone: string;
}

/** What a `compute` Field runs inside. Built per pass, and two kinds of question live on it
 *  (ADR 0017, *What a hypothetical row reads with*, amended 2026-09-21 — #466). The amendment's
 *  rule 1 is why a structure question takes the row it asks about and a value question does not;
 *  rule 2 is the value/structure split itself.
 *
 *  A value question — `read(key)`, `hierarchyParentId()` — stays bound to the row the
 *  pass is computing: a bottom-up pass has written only what it has reached, so a value asked of any
 *  other row would answer with whatever that row held before this pass touched it.
 *
 *  A structure question — `children`, `descendants`, `leaves`, `hasChildren` — answers about *any*
 *  row the pass hands out, because structure is the same fact at every depth. Each of these four
 *  takes the row to ask about. One tree answers all four:
 *
 *  ```
 *  Depot
 *  ├── Van 1
 *  │   ├── Crate A
 *  │   └── Crate B
 *  └── Van 2
 *  ```
 *
 *  | Asked about `Depot` | Answer | In one phrase |
 *  |---|---|---|
 *  | `children(Depot)` | Van 1, Van 2 | one step down |
 *  | `descendants(Depot)` | Van 1, Van 2, Crate A, Crate B | all the way down |
 *  | `leaves(Depot)` | Van 2, Crate A, Crate B | the bottom rows only |
 *
 *  Van 1 is a descendant and is not a leaf, because Van 1 has children of its own. Van 2 is both.
 *  `hasChildren(Van 1)` is `true`; `hasChildren(Crate A)` is `false`.
 *
 *  `leaves(row)` includes `row` itself when `row` is a leaf: `leaves(Van 2)` is `[Van 2]`, not `[]`.
 *  `descendants(row)` never includes `row` — a row is not its own descendant, but it can be its own
 *  subtree's only leaf. `leaves(Van 2)` is `[Van 2]` while `descendants(Van 2)` is `[]`.
 *
 *  The row the pass holds may be one the store does not hold — a post-edit row, or a Rollup's
 *  effective child — which is why the pass answers these and `entry.read(key)`/`entry.children()`
 *  cannot: those read the store, and this row may not be in it yet.
 *
 *  Every *structure* member takes a row, so across those four rule 4 (ADR 0017, cost read off the
 *  parentheses) cannot tell a cheap read from a walk — all four carry parentheses either way. The
 *  value members take no row and still compute, so they carry parentheses for rule 4's own reason.
 *  Each member's own doc states its cost. */
export interface ComputeContext extends FieldContext {
  /** Another Field on this same row — a core key, or another Field's `compute`. Bound to
   *  the row this pass is computing; not a structure question, so it takes no row (ADR 0017 amendment, rule 2). */
  read<K extends FieldKey>(key: K): CoreFieldValue<K> | undefined;
  /** One step down: `Depot` → Van 1, Van 2. One tree read, no allocation beyond the array returned.
   *
   *  Exactly one level, and that is load-bearing for a Rollup: a parent's value already aggregates
   *  its subtree when the bottom-up pass reaches it, so reaching past one level here would double
   *  count a grandchild both under its parent and again under its grandparent. `descendants` and
   *  `leaves` are how a consumer reaches past one level, under their own names. */
  children(row: StoredEntry): readonly StoredEntry[];
  /** All the way down, never `row` itself: `Depot` → Van 1, Van 2, Crate A, Crate B. A subtree walk,
   *  one tree read per node found. Mirrors `Entry.descendants()` on the live row; this is the pass's
   *  own tree instead of the store's. */
  descendants(row: StoredEntry): readonly StoredEntry[];
  /** The bottom rows of `row`'s subtree: `Depot` → Van 2, Crate A, Crate B. A leaf answers itself:
   *  `leaves(Van 2)` is `[Van 2]`, not `[]`, while `descendants(Van 2)` is `[]`. A subtree of one
   *  leaf has one leaf.
   *
   *  A subtree walk, one tree read per node found, same cost as `descendants`. A node whose fetched
   *  children list is empty is the leaf; this never asks `hasChildren` and never filters
   *  `descendants`'s result. */
  leaves(row: StoredEntry): readonly StoredEntry[];
  /** True when `row` derives (ADR 0013): `hasChildren(Van 1)` is `true`, `hasChildren(Crate A)` is
   *  `false`. The cost follows the binding, and there are three: the store reads a cached child index
   *  and never builds the list (`data/entry-store.ts`), a Rollup pass reads the length of the very
   *  list `children(row)` hands back, and the bare default derives it from `children(row)`. All three
   *  agree with `children(row).length > 0`, so a caller never has to know which one answered. Mirrors
   *  `Entry.hasChildren` on the live row, which is a property because it reads a cached index and
   *  allocates nothing (ADR 0017 rule 4). */
  hasChildren(row: StoredEntry): boolean;
  /** The tree's answer to this row's parent, through the checked hierarchy source (ADR 0020) — the
   *  same answer `entry.parent()?.id` gives, never `read('parentId')`'s stored value (ADR 0024).
   *  Bound to the row this pass is computing (ADR 0017 amendment, rule 2). */
  hierarchyParentId(): EntryId | undefined;
}

/** FieldContext plus a locale: this Gantt's, this Dataset's, or the one a caller passes to
 *  `dataset.formatFieldValue`. Built by `createFormatContext` — reused for every cell in between,
 *  which is why it extends the ambient half and never the per-pass one. */
export interface FormatContext extends FieldContext {
  readonly locale: Intl.LocalesArgument;
}

/** ComputeContext plus the Field currently rolling up. Shipped Aggregators (`sum`, `min`) read
 *  `ctx.field`; a consumer Aggregator names any declared key.
 *
 *  `values`/`numericValues` cover the common "one field off my children" case (issue #124) — they
 *  read the pass's own child list, never `parent.children()`, because a Rollup child carries the
 *  value this same bottom-up pass just gave it and the store does not (ADR 0017). */
export interface RollUpContext extends ComputeContext {
  readonly field: FieldKey;
  /** `key` read off each child, in order, defaulting to `ctx.field`. A child with no value is a
   *  hole (`undefined`). With no `key`, a consumer Field's own values stay `unknown`. `key` read
   *  off each child, typed by the key the way `ctx.read(key)` is — `ctx.values('duration')` is
   *  `readonly (Duration | undefined)[]`, and a consumer key stays `unknown`. */
  values(): readonly unknown[];
  values<K extends FieldKey>(key: K): readonly (CoreFieldValue<K> | undefined)[];
  /** Like `values`, but keeps only finite numbers — holes and non-numeric values drop, same rule
   *  shipped `sum`/`min`/`max` already follow. */
  numericValues(key?: FieldKey): readonly number[];
}

/** Registered by name, never passed inline. `undefined` means no opinion — keep the stored value. */
export type Aggregator<TValue = unknown> = (parent: StoredEntry, ctx: RollUpContext) => TValue | undefined;
