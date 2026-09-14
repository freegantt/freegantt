# Interface: ResolvedGroupRowSource

Defined in: layout/rows/row-source.ts:70

Shared by every row source that walks Entries directly — `'custom'` resolves its own rows, so it
 does not take these (D-S4-21).

## Extends

- [`GroupRowSource`](GroupRowSource.md)

## Properties

### filter?

> `optional` **filter?**: [`RowFilter`](../type-aliases/RowFilter.md)

Defined in: layout/rows/row-source.ts:21

#### Inherited from

[`GroupRowSource`](GroupRowSource.md).[`filter`](GroupRowSource.md#filter)

***

### filterPolicy

> **filterPolicy**: [`FilterPolicy`](../type-aliases/FilterPolicy.md)

Defined in: layout/rows/row-source.ts:71

#### Overrides

[`GroupRowSource`](GroupRowSource.md).[`filterPolicy`](GroupRowSource.md#filterpolicy)

***

### sort?

> `optional` **sort?**: [`RowSort`](RowSort.md)

Defined in: layout/rows/row-source.ts:22

#### Inherited from

[`GroupRowSource`](GroupRowSource.md).[`sort`](GroupRowSource.md#sort)

***

### source

> **source**: `"group"`

Defined in: layout/rows/row-source.ts:32

#### Inherited from

[`GroupRowSource`](GroupRowSource.md).[`source`](GroupRowSource.md#source)

## Methods

### groupBy()

> **groupBy**(`entry`): `string`

Defined in: layout/rows/row-source.ts:34

Which group this row joins. Read the value off the row: `entry.read('team')`.

#### Parameters

##### entry

[`Entry`](Entry.md)

#### Returns

`string`

#### Inherited from

[`GroupRowSource`](GroupRowSource.md).[`groupBy`](GroupRowSource.md#groupby)
