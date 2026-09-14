# Interface: EntriesRowSource

Defined in: layout/rows/row-source.ts:26

Shared by every row source that walks Entries directly — `'custom'` resolves its own rows, so it
 does not take these (D-S4-21).

## Extends

- [`RowSourceCommon`](RowSourceCommon.md)

## Extended by

- [`ResolvedEntriesRowSource`](ResolvedEntriesRowSource.md)

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

> **source**: `"entries"`

Defined in: layout/rows/row-source.ts:27

***

### tree?

> `optional` **tree?**: `boolean`

Defined in: layout/rows/row-source.ts:28
