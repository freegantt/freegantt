# Interface: ColumnCellRendererContext

Defined in: model/field.ts:36

What a per-column `cellRenderer` receives (S5.7, D-S5-17). Narrower than the Gantt-wide
 `CellRenderer` (`layout/renderer.ts`): a per-column renderer already knows which column it paints
 — the consumer wrote it right there in the same `GridColumn` — so it needs no `column` argument to
 branch on, and no `row` either (the sample in D-S5-17 reads only `value`/`entry`). This also keeps
 `GridColumn` a `model/` type with zero dependencies (`model-is-leaf`): the Gantt-wide `CellRenderer`
 lives in `layout/` because its context names `FrameRow`/`ResolvedColumn`, and `model/` may not
 import `layout/`.

## Properties

### entry?

> `optional` **entry?**: [`Entry`](Entry.md)\<`Record`\<`string`, `unknown`\>\>

Defined in: model/field.ts:38

Undefined for a row with no backing Entry — a group or custom row.

***

### fieldValue

> **fieldValue**: `unknown`

Defined in: model/field.ts:42

The same Field value before formatting — what `entry.read(field)` answers (review H3). One vocabulary with the Gantt-wide `CellRendererContext`.

***

### value

> **value**: `string`

Defined in: model/field.ts:40

What the grid paints: this column's Field value, through the Field's own `formatValue`.
