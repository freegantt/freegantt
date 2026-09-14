# Interface: GridColumnBase

Defined in: model/field.ts:52

Every `GridColumn` key except its sizing. Split out so the sizing pair (`width`/`flex`) can join
 it as an exclusive union — here, and in `Field.column` below, each of which drops a different
 subset of these keys (#249).

## Properties

### align?

> `optional` **align?**: [`ColumnAlign`](../type-aliases/ColumnAlign.md)

Defined in: model/field.ts:55

***

### cellRenderer?

> `optional` **cellRenderer?**: [`ColumnCellRenderer`](../type-aliases/ColumnCellRenderer.md)

Defined in: model/field.ts:57

S5.7 — per-column, more specific than `GanttOptions.cellRenderer` (D-S5-11).

***

### field

> **field**: [`FieldKey`](../type-aliases/FieldKey.md)

Defined in: model/field.ts:53

***

### header?

> `optional` **header?**: `string`

Defined in: model/field.ts:54

***

### hidden?

> `optional` **hidden?**: `boolean`

Defined in: model/field.ts:67

D-S5-34. `true` keeps this column declared but off the screen. The column holds its place in
 `gridColumns`, its `width`, and its position in the order, so showing it again puts it back
 where it was. It leaves the grid, `ctx.view.resolvedColumns()`, and the resize and reorder
 gestures. Default `false`. `gantt.hideGridColumn(field)` writes this key without a restatement
 of the whole list.

***

### movable?

> `optional` **movable?**: `boolean`

Defined in: model/field.ts:61

Default `true`. A pinned column refuses the reorder drag and the move chord.

***

### resizable?

> `optional` **resizable?**: `boolean`

Defined in: model/field.ts:59

Default `true`. A fixed column refuses the resize drag and the resize chord.

***

### tooltip?

> `optional` **tooltip?**: `boolean`

Defined in: model/field.ts:70

D-S5-13 — `true` adds this column's header and formatted value to the default bar tooltip.
 Default `false`.
