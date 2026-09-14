# Interface: Item

Defined in: layout/items/item.ts:25

## Properties

### box?

> `readonly` `optional` **box?**: [`FixedBarBox`](FixedBarBox.md)

Defined in: layout/items/item.ts:50

A painted box the time scale does not size, or `undefined` for an ordinary span-and-floor box.
 A marker that must hold its size at every zoom — `diamond()`'s glyph is the shipped case —
 states it here.

 Not centred on the entry's own start — `barSpan` (`layout/frame.ts`) centres a *floored* span
 on its own midpoint (ADR 0022 Q7), and `'center'` follows that same rule so the two never
 disagree. The two answer the same question only when `start === end`.

 `barSpan` honours this ahead of the span-and-floor path, and `render/` stamps
 `data-span="fixed"`. `fixedWidthItem` is the producer that sets it. `readonly` (F16): the box
 a producer hoists is shared across every Item it builds, so a write through one Item's `box`
 would silently reach every other Item that producer ever returns.

***

### end

> **end**: [`Instant`](../type-aliases/Instant.md)

Defined in: layout/items/item.ts:34

***

### entryId

> **entryId**: [`EntryId`](../type-aliases/EntryId.md)

Defined in: layout/items/item.ts:27

***

### id

> **id**: [`ItemId`](../type-aliases/ItemId.md)

Defined in: layout/items/item.ts:26

***

### label

> **label**: `string`

Defined in: layout/items/item.ts:32

***

### segmentId?

> `optional` **segmentId?**: [`SegmentId`](../type-aliases/SegmentId.md)

Defined in: layout/items/item.ts:37

The one Segment this Item draws (#212, ADR 0010) — set only when the Item stands for a real
 Segment of the Entry, never for an Item that draws the Entry's whole span (`wholeEntryItem`).

***

### start

> **start**: [`Instant`](../type-aliases/Instant.md)

Defined in: layout/items/item.ts:33

***

### variant

> **variant**: `string`

Defined in: layout/items/item.ts:31

The variant this Item draws as — the `data-variant` a consumer styles, and the key the paint
 and the capability seams resolve through (ADR 0018). A plain `string`: core never branches on
 the name, and nothing stores one.
