# Type Alias: SegmentId

> **SegmentId** = `string` & `object`

Defined in: model/ids.ts:8

Identity of one Segment, stable for as long as the Segment lives — the Selection holds these
 (#212, ADR 0010). An index would renumber on every removal: delete the middle Segment of three
 and a Selection holding index 2 lights the wrong bar, and the undo that restores it repeats the
 mistake.

## Type Declaration

### \_\_brand

> `readonly` **\_\_brand**: `"SegmentId"`
