# Interface: FrameRow

Defined in: layout/frame-row.ts:8

## Properties

### cells

> **cells**: readonly `string`[]

Defined in: layout/frame-row.ts:20

One library-formatted string per configured grid column, in column order (ADR 0005).

***

### depth

> **depth**: `number`

Defined in: layout/frame-row.ts:14

***

### entryIds

> **entryIds**: readonly [`EntryId`](../type-aliases/EntryId.md)[]

Defined in: layout/frame-row.ts:27

Every Entry this row owns, in the order the row source gave them (#185). Empty for a header
 row (D-S4-23) and for a custom row with none. A row click selects all of them.

 The first one is the row's *subject*: what `cellsForRow` formats `cells` from, and what a
 `cellRenderer` resolves its `entry` context from (S5.4, D-S5-11). "The Entries this row owns"
 and "the Entry this row's cells describe" are two jobs, and only the second one is singular.

***

### expandable

> **expandable**: `boolean`

Defined in: layout/frame-row.ts:15

***

### expanded

> **expanded**: `boolean`

Defined in: layout/frame-row.ts:16

***

### height

> **height**: `number`

Defined in: layout/frame-row.ts:13

***

### id

> **id**: [`RowId`](../type-aliases/RowId.md)

Defined in: layout/frame-row.ts:9

***

### index

> **index**: `number`

Defined in: layout/frame-row.ts:11

***

### kind

> **kind**: [`PlannedRowKind`](../type-aliases/PlannedRowKind.md)

Defined in: layout/frame-row.ts:10

***

### matched?

> `optional` **matched?**: `boolean`

Defined in: layout/frame-row.ts:18

`false` when the row was kept only because a descendant matched the filter.

***

### segmentIds

> **segmentIds**: readonly [`SegmentId`](../type-aliases/SegmentId.md)[]

Defined in: layout/frame-row.ts:31

Every Segment this row's Entries own, in the same order (#212, ADR 0010, #230 R5) — the set a
 row click selects, and what `render/dom` diffs against the Selection to decide the row's own
 paint. Empty for a header row, same rule as `entryIds`.

***

### top

> **top**: `number`

Defined in: layout/frame-row.ts:12
