# Function: ignoreSegments()

> **ignoreSegments**(`entry`, `variant`): readonly [`Item`](../interfaces/Item.md)[]

Defined in: layout/items/item.ts:161

Always one Item, over the entry's whole span — the shape `summary()` states explicitly. A
 summary is one rail whatever the Segments do (ADR 0023). The one-line wrapper that turns
 `wholeEntryItem`'s single Item into an `ItemProducer`'s array, so `items: ignoreSegments` reads
 as a plain assignment, the same shape `followSegments` takes.

 Call: `variants: [{ name: 'summary', when: (e) => e.hasChildren, items: ignoreSegments }]` —
 "the summary variant's items: always one item."

## Parameters

### entry

[`Entry`](../interfaces/Entry.md)

### variant

`string`

## Returns

readonly [`Item`](../interfaces/Item.md)[]
