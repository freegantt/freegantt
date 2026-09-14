# Interface: FieldType\<TValue\>

Defined in: model/field.ts:213

A stored-Field bundle applied by name to many Fields (`registerType`) — `key`, `type` and the
 `compute`/`rollUp`/`editable` discriminants left out. Written directly rather than derived from
 `Field` with `Omit`: `Omit` does not distribute over a union, so it would collapse to the two
 arms' *common* keys and drop `equals`/`parseValue`/`inputType` — `percent` (`field-types.ts`)
 needs `parseValue` and `inputType` on its own bundle.

## Type Parameters

### TValue

`TValue` = `unknown`

## Properties

### column?

> `optional` **column?**: Omit\<GridColumnBase, "field" \| "cellRenderer" \| "hidden"\> & GridColumnSizing

Defined in: model/field.ts:228

***

### editable?

> `optional` **editable?**: `boolean` \| [`FieldEditable`](../type-aliases/FieldEditable.md)

Defined in: model/field.ts:218

Read `Field.editable` for the three states. A Field naming this type may override it.

***

### inputType?

> `optional` **inputType?**: `"number"` \| `"text"` \| `"email"` \| `"tel"` \| `"url"`

Defined in: model/field.ts:227

***

### rollUp?

> `optional` **rollUp?**: [`AggregatorName`](../type-aliases/AggregatorName.md)

Defined in: model/field.ts:216

A Field naming this type may still override it (D-S4-3) — `{ key: 'cost', type: 'money',
 rollUp: 'none' }` opts one Field on a shared type out.

## Methods

### compare()?

> `optional` **compare**(`a`, `b`): `number`

Defined in: model/field.ts:224

#### Parameters

##### a

`TValue` \| `undefined`

##### b

`TValue` \| `undefined`

#### Returns

`number`

***

### distribute()?

> `optional` **distribute**(`value`, `parent`, `ctx`): [`EntryEdits`](../type-aliases/EntryEdits.md) \| `undefined`

Defined in: model/field.ts:222

One distribution policy for every Field on this type — which is why `FieldDistributor` reads
 the Field key off `ctx.field` rather than closing over one. A method, not a property, for the
 variance reason `Field.distribute` states.

#### Parameters

##### value

`TValue` \| `undefined`

##### parent

[`StoredEntry`](StoredEntry.md)

##### ctx

[`RollUpContext`](RollUpContext.md)

#### Returns

[`EntryEdits`](../type-aliases/EntryEdits.md) \| `undefined`

***

### equals()?

> `optional` **equals**(`a`, `b`): `boolean`

Defined in: model/field.ts:223

#### Parameters

##### a

`TValue` \| `undefined`

##### b

`TValue` \| `undefined`

#### Returns

`boolean`

***

### formatValue()?

> `optional` **formatValue**(`value`, `ctx`, `entry`): `string`

Defined in: model/field.ts:225

#### Parameters

##### value

`TValue` \| `undefined`

##### ctx

[`FormatContext`](FormatContext.md)

##### entry

[`Entry`](Entry.md)

#### Returns

`string`

***

### parseValue()?

> `optional` **parseValue**(`text`, `ctx`, `entry`): `TValue` \| `undefined`

Defined in: model/field.ts:226

#### Parameters

##### text

`string`

##### ctx

[`FieldContext`](FieldContext.md)

##### entry

[`Entry`](Entry.md)

#### Returns

`TValue` \| `undefined`
