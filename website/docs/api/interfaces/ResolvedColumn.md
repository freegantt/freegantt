# Interface: ResolvedColumn

Defined in: layout/column.ts:29

Visible Grid column, bound with this Gantt's locale (D-S4-13). `resizable`/`movable` are optional
 — absent reads as the default `true` (S5.7, D-S5-18); a fixture that never mentions column chrome
 stays unchanged. `cellRenderer` stays optional too: undefined means "fall back to the Gantt-wide
 one" (D-S5-17).

## Extends

- [`FrameColumn`](FrameColumn.md)

## Properties

### align

> **align**: [`ColumnAlign`](../type-aliases/ColumnAlign.md)

Defined in: layout/column.ts:20

#### Inherited from

[`FrameColumn`](FrameColumn.md).[`align`](FrameColumn.md#align)

***

### cellRenderer?

> `optional` **cellRenderer?**: [`ColumnCellRenderer`](../type-aliases/ColumnCellRenderer.md)

Defined in: layout/column.ts:31

***

### field

> **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: layout/column.ts:16

#### Inherited from

[`FrameColumn`](FrameColumn.md).[`field`](FrameColumn.md#field)

***

### flex?

> `optional` **flex?**: `number`

Defined in: layout/column.ts:19

#### Inherited from

[`FrameColumn`](FrameColumn.md).[`flex`](FrameColumn.md#flex)

***

### header

> **header**: `string`

Defined in: layout/column.ts:17

#### Inherited from

[`FrameColumn`](FrameColumn.md).[`header`](FrameColumn.md#header)

***

### movable?

> `optional` **movable?**: `boolean`

Defined in: layout/column.ts:33

#### Overrides

[`FrameColumn`](FrameColumn.md).[`movable`](FrameColumn.md#movable)

***

### resizable?

> `optional` **resizable?**: `boolean`

Defined in: layout/column.ts:32

#### Overrides

[`FrameColumn`](FrameColumn.md).[`resizable`](FrameColumn.md#resizable)

***

### tooltip?

> `optional` **tooltip?**: `boolean`

Defined in: layout/column.ts:36

D-S5-13 — `true` marks this column for the default tooltip body. Not a paint concern, so it
 stays off `FrameColumn`.

***

### width?

> `optional` **width?**: `number`

Defined in: layout/column.ts:18

#### Inherited from

[`FrameColumn`](FrameColumn.md).[`width`](FrameColumn.md#width)

## Methods

### format()

> **format**(`entry`): `string`

Defined in: layout/column.ts:30

#### Parameters

##### entry

[`Entry`](Entry.md)

#### Returns

`string`
