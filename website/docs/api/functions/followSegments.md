# Function: followSegments()

> **followSegments**(`entry`, `variant`): readonly [`Item`](../interfaces/Item.md)[]

Defined in: layout/items/item.ts:179

One Item per Segment, or one Item over the whole span when the Entry has none. The shape a
 variant with no `items` key gets (ADR 0023).

 Follows the data: a row authored in pieces draws its pieces, gaps included. A plain start/end
 row draws the one Item it has always drawn.

 Call: `variants: [{ name: 'phase', when: myRule, items: followSegments }]` — "the phase
 variant's items: one item per segment." Naming it explicitly only matters when a variant also
 overrides something else on `bar()`'s own object, and still wants to keep this shape. The
 registry already gives this shape to a variant that names no `items` at all.

 Fallback branch, reached only for a spanning Entry with no Segments of its own (the plain
 start/end case). Same load-bearing cast as `wholeEntryItem` — `produceItemsForRow` never calls
 this producer for a non-spanning Entry (ADR 0012, Build 1, J2).

## Parameters

### entry

[`Entry`](../interfaces/Entry.md)

### variant

`string`

## Returns

readonly [`Item`](../interfaces/Item.md)[]
