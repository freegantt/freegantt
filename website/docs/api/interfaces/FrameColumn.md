# Interface: FrameColumn

Defined in: layout/column.ts:15

Paint description for one Grid column. `format` stays on `ResolvedColumn` and never reaches a
 backend. `resizable`/`movable` do reach a backend (S5.7, D-S5-18) — they paint the resizer grip's
 visibility and the header cell's cursor, so they travel the same path `width`/`flex` already take
 from `ResolvedColumn` down through `columnsForFrame` (`layout/frame.ts`).

 `field` names the column, everywhere a column is named (D-S5-37, #194): a Field has a `key`, and
 a Grid column carries the `field` it shows. `render/dom` then uses that value as its own keyed
 paint key, which is a different job and keeps its own word.

## Extended by

- [`ResolvedColumn`](ResolvedColumn.md)

## Properties

### align

> **align**: [`ColumnAlign`](../type-aliases/ColumnAlign.md)

Defined in: layout/column.ts:20

***

### field

> **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: layout/column.ts:16

***

### flex?

> `optional` **flex?**: `number`

Defined in: layout/column.ts:19

***

### header

> **header**: `string`

Defined in: layout/column.ts:17

***

### movable?

> `optional` **movable?**: `boolean`

Defined in: layout/column.ts:22

***

### resizable?

> `optional` **resizable?**: `boolean`

Defined in: layout/column.ts:21

***

### width?

> `optional` **width?**: `number`

Defined in: layout/column.ts:18
