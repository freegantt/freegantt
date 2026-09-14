# Interface: CellRendererContext

Defined in: layout/renderer.ts:40

## Properties

### column

> **column**: [`ResolvedColumn`](ResolvedColumn.md)

Defined in: layout/renderer.ts:44

***

### entry?

> `optional` **entry?**: [`Entry`](Entry.md)\<`Record`\<`string`, `unknown`\>\>

Defined in: layout/renderer.ts:42

Undefined for a row with no backing Entry — a group or custom row (`layout/rows`).

***

### fieldValue

> **fieldValue**: `unknown`

Defined in: layout/renderer.ts:50

The same Field value before formatting — what `entry.read(column.field)` answers, for every
 Field source alike (review H3). A renderer that branches on magnitude reads
 this; one that paints text reads `value`. `undefined` on a row with no Entry.

***

### row

> **row**: [`FrameRow`](FrameRow.md)

Defined in: layout/renderer.ts:43

***

### value

> **value**: `string`

Defined in: layout/renderer.ts:46

What the grid paints: the column's Field value, through the Field's own `formatValue`.
