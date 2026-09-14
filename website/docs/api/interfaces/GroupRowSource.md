# Interface: GroupRowSource

Defined in: layout/rows/row-source.ts:31

Shared by every row source that walks Entries directly — `'custom'` resolves its own rows, so it
 does not take these (D-S4-21).

## Extends

- [`RowSourceCommon`](RowSourceCommon.md)

## Extended by

- [`ResolvedGroupRowSource`](ResolvedGroupRowSource.md)

## Properties

### filter?

> `optional` **filter?**: [`RowFilter`](../type-aliases/RowFilter.md)

Defined in: layout/rows/row-source.ts:21

#### Inherited from

[`RowSourceCommon`](RowSourceCommon.md).[`filter`](RowSourceCommon.md#filter)

***

### filterPolicy?

> `optional` **filterPolicy?**: [`FilterPolicy`](../type-aliases/FilterPolicy.md)

Defined in: layout/rows/row-source.ts:23

#### Inherited from

[`RowSourceCommon`](RowSourceCommon.md).[`filterPolicy`](RowSourceCommon.md#filterpolicy)

***

### sort?

> `optional` **sort?**: [`RowSort`](RowSort.md)

Defined in: layout/rows/row-source.ts:22

#### Inherited from

[`RowSourceCommon`](RowSourceCommon.md).[`sort`](RowSourceCommon.md#sort)

***

### source

> **source**: `"group"`

Defined in: layout/rows/row-source.ts:32

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
