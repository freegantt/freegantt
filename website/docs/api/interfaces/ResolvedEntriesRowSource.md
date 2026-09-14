# Interface: ResolvedEntriesRowSource

Defined in: layout/rows/row-source.ts:65

Each resolved source extends the source a consumer authored, and narrows the keys it fills from
 optional to required (#248 S4-2). A consumer who omits `filterPolicy`/`tree` still reads a value
 back off `gantt.rowSource`.

## Extends

- [`EntriesRowSource`](EntriesRowSource.md)

## Properties

### filter?

> `optional` **filter?**: [`RowFilter`](../type-aliases/RowFilter.md)

Defined in: layout/rows/row-source.ts:21

#### Inherited from

[`EntriesRowSource`](EntriesRowSource.md).[`filter`](EntriesRowSource.md#filter)

***

### filterPolicy

> **filterPolicy**: [`FilterPolicy`](../type-aliases/FilterPolicy.md)

Defined in: layout/rows/row-source.ts:66

#### Overrides

[`EntriesRowSource`](EntriesRowSource.md).[`filterPolicy`](EntriesRowSource.md#filterpolicy)

***

### sort?

> `optional` **sort?**: [`RowSort`](RowSort.md)

Defined in: layout/rows/row-source.ts:22

#### Inherited from

[`EntriesRowSource`](EntriesRowSource.md).[`sort`](EntriesRowSource.md#sort)

***

### source

> **source**: `"entries"`

Defined in: layout/rows/row-source.ts:27

#### Inherited from

[`EntriesRowSource`](EntriesRowSource.md).[`source`](EntriesRowSource.md#source)

***

### tree

> **tree**: `boolean`

Defined in: layout/rows/row-source.ts:67

#### Overrides

[`EntriesRowSource`](EntriesRowSource.md).[`tree`](EntriesRowSource.md#tree)
