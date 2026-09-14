# Type Alias: Field\<TValue\>

> **Field**\<`TValue`\> = \{ `column?`: `Omit`\<[`GridColumnBase`](../interfaces/GridColumnBase.md), `"field"` \| `"cellRenderer"` \| `"hidden"`\> & [`GridColumnSizing`](GridColumnSizing.md); `editable?`: [`FieldEditable`](FieldEditable.md) \| `boolean`; `inputType?`: `"text"` \| `"number"` \| `"email"` \| `"tel"` \| `"url"`; `key`: [`FieldKey`](FieldKey.md); `rollUp?`: [`AggregatorName`](AggregatorName.md); `type?`: [`FieldTypeName`](FieldTypeName.md); `compare?`: `number`; `distribute?`: [`EntryEdits`](EntryEdits.md) \| `undefined`; `equals?`: `boolean`; `formatValue?`: `string`; `parseValue?`: `TValue` \| `undefined`; \} \| \{ `column?`: `Omit`\<[`GridColumnBase`](../interfaces/GridColumnBase.md), `"field"` \| `"cellRenderer"` \| `"hidden"`\> & [`GridColumnSizing`](GridColumnSizing.md); `distribute?`: `never`; `editable?`: `never`; `equals?`: `never`; `inputType?`: `never`; `key`: [`FieldKey`](FieldKey.md); `parseValue?`: `never`; `rollUp?`: `never`; `type?`: [`FieldTypeName`](FieldTypeName.md); `compare?`: `number`; `compute`: `TValue` \| `undefined`; `formatValue?`: `string`; \}

Defined in: model/field.ts:108

`TValue` checks `equals`/`compare`/`formatValue`/`parseValue` against each other only where a
 `Field` is declared — `FieldRegistry`, `DatasetOptions.fields` and `FieldLookup` all hold bare
 `Field` (`Field<unknown>`), so nothing downstream of declaration re-checks it (ADR 0005, #141
 item #4). This is deliberate, not a gap: the registry is heterogeneous and string-keyed by
 design, and closing it over a compile-time schema would be a different library.

 **The union is exclusive** (ADR 0011): a stored Field may roll up and may be edited; a `compute`
 Field may do neither, and runs on every row, a rolling-up parent included. `compute` is the
 discriminant — `'compute' in field` is the one test the registry's `hasSomewhereToWrite` and the
 write resolver both ask. Declaring a key does not create it: carrying a value is free, and a Field
 exists only because the library has a job to do with it — a sort, a format, a rollup, an editor, a
 column.

## Type Parameters

### TValue

`TValue` = `unknown`

## Union Members

### Type Literal

\{ `column?`: `Omit`\<[`GridColumnBase`](../interfaces/GridColumnBase.md), `"field"` \| `"cellRenderer"` \| `"hidden"`\> & [`GridColumnSizing`](GridColumnSizing.md); `editable?`: [`FieldEditable`](FieldEditable.md) \| `boolean`; `inputType?`: `"text"` \| `"number"` \| `"email"` \| `"tel"` \| `"url"`; `key`: [`FieldKey`](FieldKey.md); `rollUp?`: [`AggregatorName`](AggregatorName.md); `type?`: [`FieldTypeName`](FieldTypeName.md); `compare?`: `number`; `distribute?`: [`EntryEdits`](EntryEdits.md) \| `undefined`; `equals?`: `boolean`; `formatValue?`: `string`; `parseValue?`: `TValue` \| `undefined`; \}

#### column?

> `optional` **column?**: `Omit`\<[`GridColumnBase`](../interfaces/GridColumnBase.md), `"field"` \| `"cellRenderer"` \| `"hidden"`\> & [`GridColumnSizing`](GridColumnSizing.md)

D-S5-17: `cellRenderer` sits on the Gantt's `GridColumn`, never here — `data/` never holds a
 renderer, so this default set excludes it. `hidden` is excluded for a different reason
 (D-S5-34): a Field default of `hidden: true` would make a Gantt that names the column show
 nothing. Which columns a view shows is the Gantt's question, never the Field's.
 `Omit<GridColumn, …>` would flatten the sizing union and let a Field default name both `width`
 and `flex` (#249) — so this type is built from `GridColumnBase` directly, joined back to
 `GridColumnSizing`, the same exclusive pair `GridColumn` itself carries.

#### editable?

> `optional` **editable?**: [`FieldEditable`](FieldEditable.md) \| `boolean`

Where this Field's value may change (ADR 0015). **One key, two thresholds** — the grid
 writes it only at `'anywhere'`, and `entries.update()` writes it at anything but `'never'`.
 That is I14: the inline cell editor (S5.8), bar drag-resize for `start`/`end` (#142) and the
 API door all read this one key, and never disagree about it.

 - `'anywhere'` — the cell editor opens, a drag writes it, and `update()` writes it.
 - `'api'` — `update()` writes it; the grid cell is dead. A value the app owns and the user
   does not type.
 - `'never'` — a lock. `update()` throws `FieldNotEditableError`.

 **Absent means `'anywhere'`.** `true` and `false` are input-only aliases for `'anywhere'`
 and `'never'`; after ingest the stored Field holds the enum, so `dataset.fields.all` reads
 it back as one.

 A lock is not a wall around the data. Create, ingest and History replay still write a
 `'never'` Field — it names what a *caller* may write, not what the library may.

 A core Field (`start`, `name`, ...) is declared by the library and cannot be redeclared, so a
 consumer overrides only this key on one through `DatasetOptions.fields`/`ctx.fields.register`
 — `field-registry.ts`'s `CORE_FIELD_OVERRIDABLE_KEYS` names the one key that merge accepts;
 naming any other key on a core Field's key throws (`IllegalCoreFieldOverrideError`).
 `dataset.setFieldEditable(key, editable)` changes it after setup; nothing else may.

#### inputType?

> `optional` **inputType?**: `"text"` \| `"number"` \| `"email"` \| `"tel"` \| `"url"`

S5.8+: the generic inline editor's `<input type>` attribute. Default `'text'`. A
 native HTML affordance only (a number stepper, a numeric mobile keyboard, `tel`/`email`
 validation) — it does not change how a value is read back; pair it with `parseValue` when the
 stored value is not itself a string (a `'number'` input's `.value` is still a string). Has no
 effect on a `type: 'date'` Field — that never reaches the generic editor, routing through the
 `dateInput` seam instead (D-S5-20). For a full widget swap, not just the native input type, veto
 with `beforeEntryEdit` and mount your own control.

#### key

> **key**: [`FieldKey`](FieldKey.md)

#### rollUp?

> `optional` **rollUp?**: [`AggregatorName`](AggregatorName.md)

Name only — a function does not serialize (ADR 0005).

#### type?

> `optional` **type?**: [`FieldTypeName`](FieldTypeName.md)

#### compare()?

> `optional` **compare**(`a`, `b`): `number`

##### Parameters

###### a

`TValue` \| `undefined`

###### b

`TValue` \| `undefined`

##### Returns

`number`

#### distribute()?

> `optional` **distribute**(`value`, `parent`, `ctx`): [`EntryEdits`](EntryEdits.md) \| `undefined`

What a write to this Field on a **rolling-up parent** means (ADR 0013 amendment). Absent,
 and that cell is read-only — refused standalone and refused inside `dataset.transaction()`
 alike, because permission follows the thing written, never the call that wrapped it.

 Written out as a method rather than as `FieldDistributor<TValue>`, for the reason `equals`
 and `compare` are: `TValue` sits in a parameter here, so a property would make
 `Field<number>` stop being assignable to `Field<unknown>`, and the registry holds bare
 `Field`. `FieldDistributor` is the type a consumer writes one against.

##### Parameters

###### value

`TValue` \| `undefined`

###### parent

[`StoredEntry`](../interfaces/StoredEntry.md)

###### ctx

[`RollUpContext`](../interfaces/RollUpContext.md)

##### Returns

[`EntryEdits`](EntryEdits.md) \| `undefined`

#### equals()?

> `optional` **equals**(`a`, `b`): `boolean`

##### Parameters

###### a

`TValue` \| `undefined`

###### b

`TValue` \| `undefined`

##### Returns

`boolean`

#### formatValue()?

> `optional` **formatValue**(`value`, `ctx`, `entry`): `string`

`entry` is the row this value came from. `FormatContext` is built once per `resolveColumns`
 and reused for every cell, so a per-entry value cannot live there without rebuilding it per
 cell — a formatter that needs the Entry declares this third parameter instead; every other
 formatter still assigns with two, or one (#240).

##### Parameters

###### value

`TValue` \| `undefined`

###### ctx

[`FormatContext`](../interfaces/FormatContext.md)

###### entry

[`Entry`](../interfaces/Entry.md)

##### Returns

`string`

#### parseValue()?

> `optional` **parseValue**(`text`, `ctx`, `entry`): `TValue` \| `undefined`

S5.8, D-S5-20, issue #137 F12: reads what the user typed into the inline editor's `<input>`
 back into a stored value. `undefined` means the text names no value — the editor stays open in
 the invalid state and commits nothing. `formatValue` is not invertible in general (a
 currency-formatted `"€1.234,56"` cannot be parsed back without knowing the format that produced
 it), so the library ships no guessed default: with no `parseValue`, `type: 'text'` (or no `type`
 at all) reads and writes the raw string, and every other named `type` refuses to open the
 editor rather than parse wrong. A `type: 'date'` Field never reaches this — `inlineEditing()`
 routes it through the `dateInput` seam instead (D-S5-20).

##### Parameters

###### text

`string`

###### ctx

[`FieldContext`](../interfaces/FieldContext.md)

###### entry

[`Entry`](../interfaces/Entry.md)

##### Returns

`TValue` \| `undefined`

***

### Type Literal

\{ `column?`: `Omit`\<[`GridColumnBase`](../interfaces/GridColumnBase.md), `"field"` \| `"cellRenderer"` \| `"hidden"`\> & [`GridColumnSizing`](GridColumnSizing.md); `distribute?`: `never`; `editable?`: `never`; `equals?`: `never`; `inputType?`: `never`; `key`: [`FieldKey`](FieldKey.md); `parseValue?`: `never`; `rollUp?`: `never`; `type?`: [`FieldTypeName`](FieldTypeName.md); `compare?`: `number`; `compute`: `TValue` \| `undefined`; `formatValue?`: `string`; \}

#### column?

> `optional` **column?**: `Omit`\<[`GridColumnBase`](../interfaces/GridColumnBase.md), `"field"` \| `"cellRenderer"` \| `"hidden"`\> & [`GridColumnSizing`](GridColumnSizing.md)

#### distribute?

> `optional` **distribute?**: `never`

A `compute` Field has no cell to write, so it has no write to distribute.

#### editable?

> `optional` **editable?**: `never`

#### equals?

> `optional` **equals?**: `never`

#### inputType?

> `optional` **inputType?**: `never`

#### key

> **key**: [`FieldKey`](FieldKey.md)

#### parseValue?

> `optional` **parseValue?**: `never`

#### rollUp?

> `optional` **rollUp?**: `never`

#### type?

> `optional` **type?**: [`FieldTypeName`](FieldTypeName.md)

#### compare()?

> `optional` **compare**(`a`, `b`): `number`

##### Parameters

###### a

`TValue` \| `undefined`

###### b

`TValue` \| `undefined`

##### Returns

`number`

#### compute()

> **compute**(`entry`, `ctx`): `TValue` \| `undefined`

Runs on **every** row a read touches, a rolling-up parent included (ADR 0011, decision 10):
 read a stored value off `entry`, and read a Field — a core key, `duration`, or another
 Field's own `compute` arm — through `ctx.read(key)`. A computed value may also depend on
 the tree: `ctx.children()` (#214). `entry` is a `StoredEntry` because the row may be
 hypothetical — a post-edit row, or a Rollup's effective child.
 Named `compute`, not `get`: `get` already names three unrelated jobs in this codebase.

##### Parameters

###### entry

[`StoredEntry`](../interfaces/StoredEntry.md)

###### ctx

[`ComputeContext`](../interfaces/ComputeContext.md)

##### Returns

`TValue` \| `undefined`

#### formatValue()?

> `optional` **formatValue**(`value`, `ctx`, `entry`): `string`

##### Parameters

###### value

`TValue` \| `undefined`

###### ctx

[`FormatContext`](../interfaces/FormatContext.md)

###### entry

[`Entry`](../interfaces/Entry.md)

##### Returns

`string`
