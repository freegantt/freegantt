# Interface: RowSourceCommon

Defined in: layout/rows/row-source.ts:20

Shared by every row source that walks Entries directly — `'custom'` resolves its own rows, so it
 does not take these (D-S4-21).

## Extended by

- [`EntriesRowSource`](EntriesRowSource.md)
- [`GroupRowSource`](GroupRowSource.md)

## Properties

### filter?

> `optional` **filter?**: [`RowFilter`](../type-aliases/RowFilter.md)

Defined in: layout/rows/row-source.ts:21

***

### filterPolicy?

> `optional` **filterPolicy?**: [`FilterPolicy`](../type-aliases/FilterPolicy.md)

Defined in: layout/rows/row-source.ts:23

***

### sort?

> `optional` **sort?**: [`RowSort`](RowSort.md)

Defined in: layout/rows/row-source.ts:22
